// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Background service worker.
// Owns the four screens (Chrome popup windows): placement, sound, saved views, wall history (Back),
// keyboard shortcuts and the toolbar right-click menu. The panel talks to it with sendMessage.

import { SETTINGS_VERSION, migrate, newId } from './core/defaults.js';
import { computeRects, slotsFor } from './core/layouts.js';
import { siteForUrl } from './core/sites.js';
import { sameWall, pushSnapshot } from './core/history.js';
import { pushPage } from './core/pages.js';
import { safeUrl, clip, checkSettings, isSlot, isLayout, isId, LIMITS } from './core/validate.js';
import { YOUTUBE_ORIGINS, TIDY_CSS, isYouTube } from './core/youtube.js';

const SLOTS = [1, 2, 3, 4];
const MENU_VIEWS = 5; // Chrome allows 6 top-level items in the toolbar menu; one is "Open panel"

// ---------- storage ----------

async function getSettings() {
  const { settings, config } = await chrome.storage.local.get(['settings', 'config']);
  if (settings?.version === SETTINGS_VERSION) return migrate(settings);
  const fresh = migrate(settings || config); // first run, or an older "config" record
  await chrome.storage.local.set({ settings: fresh });
  if (config) await chrome.storage.local.remove('config');
  return fresh;
}

// Every change is checked against the settings schema (core/validate.js) before it is stored.
async function setSettings(patch) {
  const checked = checkSettings(patch, { partial: true });
  if (!checked.ok) throw new Error(checked.error);
  patch = checked.value;
  const cur = await getSettings();
  const next = { ...cur, ...patch, version: SETTINGS_VERSION };
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function getState() {
  const { slots = {}, audio = 1 } = await chrome.storage.session.get(['slots', 'audio']);
  return { slots, audio };
}
const saveSlots = slots => chrome.storage.session.set({ slots });

// Forget screens whose window was closed while the worker was asleep.
async function liveSlots() {
  const { slots } = await getState();
  let changed = false;
  for (const n of Object.keys(slots)) {
    try { await chrome.windows.get(slots[n].windowId); } catch { delete slots[n]; changed = true; }
  }
  if (changed) await saveSlots(slots);
  return slots;
}

// One command at a time, so quick clicks can't race.
let queue = Promise.resolve();
const run = fn => (queue = queue.then(fn, fn));

// ---------- layout ----------

async function getDisplay(settings) {
  const displays = await chrome.system.display.getInfo();
  return displays.find(d => d.id === settings.displayId)
      || displays.find(d => !d.isPrimary)
      || displays[0];
}

async function rectsNow() {
  const settings = await getSettings();
  const { audio } = await getState();
  const display = await getDisplay(settings);
  return {
    current: computeRects(settings.layout, display.workArea, settings.gap, audio),
    fallback: computeRects('grid', display.workArea, settings.gap, audio)
  };
}

async function arrange() {
  const slots = await liveSlots();
  const { current } = await rectsNow();
  for (const n of SLOTS) {
    const s = slots[n];
    if (!s) continue;
    if (!current[n]) {
      await chrome.windows.update(s.windowId, { state: 'minimized' });
    } else {
      await chrome.windows.update(s.windowId, { state: 'normal' });
      await chrome.windows.update(s.windowId, current[n]);
    }
  }
}

// ---------- screens ----------

// record: snapshot the wall first if this replaces what the screen shows.
// keepIfSame: leave the page alone when the screen already shows that address (used by restores).
async function openInSlot(n, target, { rearrange = true, record = true, keepIfSame = false } = {}) {
  if (!isSlot(n)) throw new Error('Unknown screen');
  // Only http(s) pages ever reach chrome.windows.create / chrome.tabs.update.
  const url = safeUrl(target?.url);
  if (!url) throw new Error('Only http and https links can be opened.');
  const name = clip(target.name, LIMITS.name);
  const label = clip(target.label, LIMITS.label);
  const siteId = isId(target.siteId) ? target.siteId : null;
  if (record) await recordBefore(now => (now.screens[n] ? { ...now, screens: { ...now.screens, [n]: { url, label } } } : now));
  const settings = await getSettings();
  const slots = await liveSlots();
  const site = siteId ? settings.sites.find(s => s.id === siteId) : siteForUrl(settings.sites, url);
  const entry = { url, name: name || site?.name || '', siteId: site?.id || null, label };
  const existing = slots[n];
  if (existing) {
    const same = keepIfSame && (await liveUrl(existing)) === url;
    if (!same) await chrome.tabs.update(existing.tabId, { url });
    slots[n] = { ...existing, ...entry };
  } else {
    const { current, fallback } = await rectsNow();
    const rect = current[n] || fallback[n];
    const win = await chrome.windows.create({ url, type: 'popup', focused: false, ...rect });
    await chrome.windows.update(win.id, rect); // macOS sometimes ignores the first placement
    slots[n] = { windowId: win.id, tabId: win.tabs[0].id, ...entry };
  }
  await saveSlots(slots);
  await applyAudio();
  if (rearrange) await arrange();
}

async function closeSlot(n, { record = true } = {}) {
  const slots = await liveSlots();
  if (!slots[n]) return;
  if (record) await recordBefore();
  const id = slots[n].windowId;
  delete slots[n];
  await saveSlots(slots);
  await chrome.windows.remove(id).catch(() => {});
}

async function swapSlots(a, b) {
  const slots = await liveSlots();
  const { audio } = await getState();
  [slots[a], slots[b]] = [slots[b], slots[a]];
  for (const n of [a, b]) if (!slots[n]) delete slots[n];
  await saveSlots(slots);
  if (audio === a || audio === b) await chrome.storage.session.set({ audio: audio === a ? b : a }); // sound follows the page
  await arrange();
}

// ---------- sound ----------

async function applyAudio() {
  const { slots, audio } = await getState();
  for (const n of SLOTS) {
    if (slots[n]) await chrome.tabs.update(slots[n].tabId, { muted: n !== audio }).catch(() => {});
  }
}

async function setAudio(n) {
  await chrome.storage.session.set({ audio: n });
  await applyAudio();
  if ((await getSettings()).layout === 'focus') await arrange();
}

async function cycleAudio() {
  const slots = await liveSlots();
  const open = SLOTS.filter(n => slots[n]);
  if (!open.length) return;
  const { audio } = await getState();
  await setAudio(open[(open.indexOf(audio) + 1) % open.length]);
}

async function muteAll() {
  await chrome.storage.session.set({ audio: 0 });
  await applyAudio();
}

// ---------- history (Back) ----------

// The page a screen shows now; falls back to the address it was opened with.
async function liveUrl(slot) {
  const tab = await chrome.tabs.get(slot.tabId).catch(() => null);
  return safeUrl(tab?.url || tab?.pendingUrl || '') || slot.url;
}

async function currentWall() {
  const settings = await getSettings();
  const slots = await liveSlots();
  const { audio } = await getState();
  const screens = {};
  for (const n of SLOTS) {
    const s = slots[n];
    if (s) screens[n] = { url: await liveUrl(s), name: s.name || '', siteId: s.siteId || null, label: s.label || '' };
  }
  return { layout: settings.layout, sound: audio, screens };
}

async function getHistory() {
  const { history = [] } = await chrome.storage.session.get('history');
  return history;
}

const stamp = wall => ({ id: newId(), at: Date.now(), ...wall });

// Snapshot the wall before a change. predict(now) returns the wall the change would leave;
// when that matches what's there now, nothing is recorded.
async function recordBefore(predict) {
  const now = await currentWall();
  if (predict && sameWall(now, predict(now))) return;
  const history = await getHistory();
  const next = pushSnapshot(history, stamp(now));
  if (next !== history) await chrome.storage.session.set({ history: next });
}

// Puts a wall (a snapshot or a saved view) on screen. onlyUsed closes screens the layout hides.
async function applyWall(wall, { onlyUsed = false } = {}) {
  await setSettings({ layout: wall.layout });
  const used = onlyUsed ? slotsFor(wall.layout) : SLOTS;
  for (const n of SLOTS) {
    const scr = wall.screens?.[n];
    if (used.includes(n) && scr?.url) await openInSlot(n, scr, { rearrange: false, record: false, keepIfSame: true });
    else await closeSlot(n, { record: false });
  }
  await chrome.storage.session.set({ audio: wall.sound ?? 1 });
  await applyAudio();
  await arrange();
}

// Restores a snapshot (the newest when id is empty). The wall it replaces becomes the newest entry,
// so a restore can itself be undone.
async function restore(id) {
  const now = await currentWall();
  let history = await getHistory();
  if (!id) while (history.length && sameWall(history[history.length - 1], now)) history = history.slice(0, -1);
  const i = id ? history.findIndex(h => h.id === id) : history.length - 1;
  if (i < 0) { await chrome.storage.session.set({ history }); return; }
  const target = history[i];
  let rest = history.filter((_, j) => j !== i);
  if (!sameWall(now, target)) rest = pushSnapshot(rest, stamp(now));
  await chrome.storage.session.set({ history: rest });
  await applyWall(target);
}

// ---------- saved views ----------

function wallFromView(view) {
  const screens = {};
  for (const n of slotsFor(view.layout)) {
    const scr = view.screens?.[n];
    if (scr?.url) screens[n] = { url: scr.url, name: scr.name || '', siteId: scr.siteId || null, label: '' };
  }
  const sound = screens[view.sound] ? view.sound : Number(Object.keys(screens)[0]) || 1;
  return { layout: view.layout, sound, screens };
}

async function launchView(viewId) {
  const view = (await getSettings()).views.find(v => v.id === viewId);
  if (!view) return;
  const target = wallFromView(view);
  await recordBefore(() => target);
  await applyWall(target, { onlyUsed: true });
}

// ---------- panel, menu, shortcuts ----------

// hash picks a page, e.g. '#settings'.
async function openPanel(hash = '') {
  const url = chrome.runtime.getURL('dashboard.html');
  const [tab] = await chrome.tabs.query({ url }); // Chrome ignores the #hash when matching
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(tab.id, hash ? { active: true, url: url + hash } : { active: true });
  } else {
    await chrome.windows.create({ url: url + hash, type: 'normal', width: 1360, height: 900, focused: true });
  }
}

async function buildMenus() {
  const settings = await getSettings();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'panel', title: 'Open control panel', contexts: ['action'] });
  settings.views.slice(0, MENU_VIEWS).forEach(v =>
    chrome.contextMenus.create({ id: 'view:' + v.id, title: `Open view: ${clip(v.name, LIMITS.name)}`, contexts: ['action'] }));
}

chrome.runtime.onInstalled.addListener(({ reason }) => run(async () => {
  await getSettings();
  await buildMenus();
  if (reason === 'update') await chrome.storage.local.remove(['usage', 'installedAt']); // clear keys older versions stored
  if (reason === 'install') {
    await openPanel();
  }
}));
chrome.runtime.onStartup?.addListener(() => run(buildMenus));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  run(buildMenus);
  if (changes.settings.oldValue?.tidyYouTube !== changes.settings.newValue?.tidyYouTube) run(tidyAll);
});

chrome.action.onClicked.addListener(() => run(openPanel));

chrome.contextMenus.onClicked.addListener(info => run(async () => {
  if (info.menuItemId === 'panel') return openPanel();
  if (String(info.menuItemId).startsWith('view:')) return launchView(String(info.menuItemId).slice(5));
}));

chrome.commands.onCommand.addListener(cmd => run(async () => {
  if (cmd === 'open-panel') return openPanel();
  if (cmd === 'cycle-audio') return cycleAudio();
  if (cmd === 'rearrange') return arrange();
  let m = cmd.match(/^audio-(\d)$/);
  if (m) return setAudio(Number(m[1]));
  m = cmd.match(/^view-(\d)$/);
  if (m) {
    const view = (await getSettings()).views[Number(m[1]) - 1];
    if (view) return launchView(view.id);
  }
}));

chrome.windows.onRemoved.addListener(windowId => run(async () => {
  const { slots } = await getState();
  const n = Object.keys(slots).find(k => slots[k].windowId === windowId);
  if (n) { delete slots[n]; await saveSlots(slots); }
  await prunePages(slots);
}));

// ---------- recent pages per screen ----------
// Each screen's tab keeps a short list of the pages it showed (core/pages.js), so the panel can offer
// Back, Forward, Start page and a Pages menu for that screen. Only the screen windows are tracked.

async function logPage(tabId, tab) {
  const { slots = {}, pages = {} } = await chrome.storage.session.get(['slots', 'pages']);
  if (!Object.values(slots).some(s => s.tabId === tabId)) return;
  const next = pushPage(pages[tabId], { url: tab.url, title: tab.title });
  if (next === pages[tabId]) return;
  await chrome.storage.session.set({ pages: { ...pages, [tabId]: next } });
}

async function prunePages(slots) {
  const { pages = {} } = await chrome.storage.session.get('pages');
  const live = new Set(Object.values(slots).map(s => String(s.tabId)));
  const kept = Object.fromEntries(Object.entries(pages).filter(([id]) => live.has(id)));
  if (Object.keys(kept).length !== Object.keys(pages).length) await chrome.storage.session.set({ pages: kept });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.title || info.status === 'complete') run(() => logPage(tabId, tab));
  if (info.status) tidyTab(tabId, tab.url || tab.pendingUrl); // each full page load needs the style sheet again
});

// ---------- Tidy YouTube ----------
// Only a style sheet (core/youtube.js), only on www.youtube.com, only in the wall's own screens, and only
// while the setting is on and the person has granted youtube.com access. No script is ever injected.

const hasYouTubeAccess = () => chrome.permissions.contains({ origins: YOUTUBE_ORIGINS }).catch(() => false);

async function tidyTab(tabId, url, on) {
  if (!isYouTube(url)) return;
  const { slots = {} } = await chrome.storage.session.get('slots');
  if (!Object.values(slots).some(s => s.tabId === tabId)) return;
  if (on === undefined) on = (await getSettings()).tidyYouTube && (await hasYouTubeAccess());
  const target = { tabId };
  if (on) await chrome.scripting.insertCSS({ target, css: TIDY_CSS }).catch(() => {});
  else await chrome.scripting.removeCSS({ target, css: TIDY_CSS }).catch(() => {});
}

async function tidyAll() {
  const settings = await getSettings();
  const access = await hasYouTubeAccess();
  // A backup can carry the setting turned on without the access behind it; keep the switch honest.
  if (settings.tidyYouTube && !access) return setSettings({ tidyYouTube: false });
  const slots = await liveSlots();
  for (const s of Object.values(slots)) {
    const tab = await chrome.tabs.get(s.tabId).catch(() => null);
    if (tab) await tidyTab(s.tabId, tab.url || tab.pendingUrl, settings.tidyYouTube);
  }
  // Turned off: the style sheet is gone from every screen, so give the youtube.com access back.
  if (!settings.tidyYouTube && access) await chrome.permissions.remove({ origins: YOUTUBE_ORIGINS }).catch(() => {});
}

// Access removed from chrome://extensions turns the setting off too.
chrome.permissions.onRemoved.addListener(({ origins = [] }) => {
  if (origins.some(o => YOUTUBE_ORIGINS.includes(o))) run(() => setSettings({ tidyYouTube: false }));
});

// Back and Forward act on the screen's own tab history. Chrome throws when there's nowhere to go.
async function navigate(slot, how, url) {
  const s = (await liveSlots())[slot];
  if (!s) return false;
  if (how === 'back') return chrome.tabs.goBack(s.tabId).then(() => true, () => false);
  if (how === 'forward') return chrome.tabs.goForward(s.tabId).then(() => true, () => false);
  // Start page: the page the screen was opened with. Page: only one already in this screen's list.
  let target = '';
  if (how === 'home') target = safeUrl(s.url);
  if (how === 'page') {
    const { pages = {} } = await chrome.storage.session.get('pages');
    const want = safeUrl(url);
    if (want && (pages[s.tabId] || []).some(p => p.url === want)) target = want;
  }
  if (!target) return false;
  await chrome.tabs.update(s.tabId, { url: target });
  return true;
}

chrome.windows.onFocusChanged.addListener(windowId => run(async () => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const settings = await getSettings();
  if (!settings.audioFollowsFocus || settings.layout === 'focus') return;
  const { slots, audio } = await getState();
  const n = Number(Object.keys(slots).find(k => slots[k].windowId === windowId));
  if (n && n !== audio) await setAudio(n);
}));

// Only this extension's own pages may send commands. There is no externally_connectable, so other
// extensions and web pages can't reach this listener anyway; the id check is a second guard.
const slotArg = n => { if (!isSlot(n)) throw new Error('Unknown screen'); return n; };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender?.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
  run(async () => {
    switch (msg.cmd) {
      case 'getSettings': return getSettings();
      case 'settings':    { const s = await setSettings(msg.patch); if (msg.rearrange) await arrange(); return s; }
      case 'reset':       await chrome.storage.local.set({ settings: migrate(null) }); return;
      case 'import': {
        const checked = checkSettings(msg.settings);
        if (!checked.ok) throw new Error(checked.error);
        await chrome.storage.local.set({ settings: migrate({ ...checked.value, version: SETTINGS_VERSION }) });
        return true;
      }
      case 'open':        return openInSlot(slotArg(msg.slot), msg.target);
      case 'close':       return closeSlot(slotArg(msg.slot));
      case 'closeAll':    await recordBefore(now => ({ ...now, screens: {} })); for (const n of SLOTS) await closeSlot(n, { record: false }); return;
      case 'arrange':     return arrange();
      case 'layout':      if (!isLayout(msg.layout)) throw new Error('Unknown layout'); await recordBefore(now => ({ ...now, layout: msg.layout })); await setSettings({ layout: msg.layout }); return arrange();
      case 'audio':       return setAudio(slotArg(msg.slot));
      case 'muteAll':     return muteAll();
      case 'swap':        return swapSlots(slotArg(msg.a), slotArg(msg.b));
      case 'nav':         if (!['back', 'forward', 'home', 'page'].includes(msg.how)) throw new Error('Unknown navigation'); return navigate(slotArg(msg.slot), msg.how, msg.url);
      case 'reload':      { const s = (await liveSlots())[slotArg(msg.slot)]; if (s) await chrome.tabs.reload(s.tabId); return; }
      case 'front':       { const s = (await liveSlots())[slotArg(msg.slot)]; if (s) await chrome.windows.update(s.windowId, { focused: true, state: 'normal' }); return; }
      case 'launchView':  return launchView(msg.id);
      case 'back':        return restore(null);
      case 'restore':     return restore(msg.id);
      case 'openPanel':   return openPanel();
      default: throw new Error('Unknown command');
    }
  }).then(result => reply({ ok: true, result }), err => reply({ ok: false, error: String(err) }));
  return true; // reply arrives asynchronously
});

