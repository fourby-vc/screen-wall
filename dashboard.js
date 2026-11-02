// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Control panel: wires the page together. Window work happens in background.js.

import { $, esc, store, subscribe, notify, send, saveSettings, layoutIcon,
  loadSettings, loadState, loadEnvironment, pref } from './ui/common.js';
import { LAYOUTS, getLayout } from './core/layouts.js';
import { describeSnapshot } from './core/history.js';
import { APP_NAME } from './core/brand.js';
import { mountScreens } from './ui/screens.js';
import { mountSites } from './ui/sites.js';
import { mountViews, saveWallAsView } from './ui/views.js';
import { mountSettings } from './ui/settings.js';
import { icon } from './ui/icons.js';
import { tidyTip } from './ui/tips.js';

const renderScreens = mountScreens($('#screens'), $('#screenMode'));
const renderSites = mountSites($('#side-sites'));
const renderViews = mountViews($('#views'), $('#viewEditor'));
const renderSettings = mountSettings($('#page-settings'));

$('#appName').textContent = APP_NAME;
document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
document.title = APP_NAME;

const PAGES = ['wall', 'settings'];
// A link like dashboard.html#settings picks the page.
const hashPage = () => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : null);
let page = hashPage() || pref.get('page', 'wall');
if (!PAGES.includes(page)) page = 'wall';

// ---------- header ----------

function renderBar() {
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  document.querySelectorAll('.wall-only').forEach(el => (el.hidden = page !== 'wall'));
  $('#page-wall').hidden = page !== 'wall';
  $('#page-settings').hidden = page !== 'settings';
  $('#layoutPicker').innerHTML = LAYOUTS.map(l =>
    `<button data-layout="${l.id}" class="${l.id === store.settings.layout ? 'on' : ''}" title="${esc(l.label)}: ${esc(l.hint)}">${layoutIcon(l.id)}</button>`).join('');
  renderDisplays();
  renderHistory();
}

function renderDisplays() {
  const sel = $('#displayPick');
  if (document.activeElement === sel) return; // don't rebuild an open menu
  const id = store.settings.displayId;
  const known = store.displays.some(d => d.id === id);
  sel.innerHTML = `<option value="">Auto display</option>` + store.displays.map(d =>
    `<option value="${esc(d.id)}"${d.id === id ? ' selected' : ''}>${esc(d.name || 'Display')} · ${d.bounds.width}×${d.bounds.height}${d.isPrimary ? ' (main)' : ''}</option>`).join('') +
    (id && !known ? `<option value="${esc(id)}" selected>Disconnected display</option>` : '');
  sel.title = 'Display the wall goes on. Auto picks the second display if there is one.';
}

let menuOpen = false;

function renderHistory() {
  const list = store.history.slice().reverse(); // newest first
  $('#back').disabled = !list.length;
  $('#historyBtn').disabled = !list.length;
  if (!list.length) menuOpen = false;
  $('#historyBtn').setAttribute('aria-expanded', String(menuOpen));
  const menu = $('#historyMenu');
  menu.hidden = !menuOpen;
  menu.innerHTML = list.map(h => {
    const text = describeSnapshot(h);
    return `<button data-snap="${esc(h.id)}" title="${esc(`${text} (${getLayout(h.layout).label})`)}">${esc(text)}</button>`;
  }).join('') + '<p class="hint">Opening a view or replacing a screen saves the wall here first. Cleared when Chrome quits.</p>';
}

function renderAll() {
  renderBar();
  renderViews();
  renderScreens();
  renderSites();
  if (page === 'settings') renderSettings();
  tidyTip();
}
subscribe(renderAll);

document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-page]');
  if (!b) return;
  page = b.dataset.page;
  pref.set('page', page);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  renderAll();
});
window.addEventListener('hashchange', () => {
  const p = hashPage();
  if (p && p !== page) { page = p; pref.set('page', page); renderAll(); }
});
$('#layoutPicker').addEventListener('click', e => {
  const b = e.target.closest('[data-layout]');
  if (b) send({ cmd: 'layout', layout: b.dataset.layout });
});
$('#displayPick').addEventListener('change', e => {
  saveSettings({ displayId: e.target.value || null }, true);
  e.target.blur();
});
$('#back').addEventListener('click', () => { menuOpen = false; renderHistory(); send({ cmd: 'back' }); });
$('#historyBtn').addEventListener('click', () => { menuOpen = !menuOpen; renderHistory(); });
$('#historyMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-snap]');
  if (!b) return;
  menuOpen = false;
  renderHistory();
  send({ cmd: 'restore', id: b.dataset.snap });
});
document.addEventListener('click', e => {
  if (menuOpen && !e.target.closest('.history')) { menuOpen = false; renderHistory(); }
  if (moreOpen && !e.target.closest('.more')) setMore(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menuOpen) { menuOpen = false; renderHistory(); $('#historyBtn').focus(); }
  if (e.key === 'Escape' && moreOpen) { setMore(false); $('#moreBtn').focus(); }
});

// ⋯ menu: Snap, Mute all, Close all. Close all needs a second click, so one slip can't clear the wall.
let moreOpen = false, confirmClose = false;
function setMore(open) {
  moreOpen = open;
  confirmClose = false;
  $('#moreMenu').hidden = !open;
  $('#moreBtn').setAttribute('aria-expanded', String(open));
  $('#closeAll').classList.remove('confirm');
  const count = Object.keys(store.slots).length;
  $('#closeAll').disabled = !count;
  $('#closeAllLabel').textContent = 'Close all screens';
  if (open) $('#moreMenu button:not(:disabled)')?.focus();
}
$('#moreBtn').addEventListener('click', () => setMore(!moreOpen));
$('#arrange').addEventListener('click', () => { setMore(false); send({ cmd: 'arrange' }); });
$('#muteAll').addEventListener('click', () => { setMore(false); send({ cmd: 'muteAll' }); });
$('#closeAll').addEventListener('click', () => {
  if (!confirmClose) {
    const count = Object.keys(store.slots).length;
    confirmClose = true;
    $('#closeAll').classList.add('confirm');
    $('#closeAllLabel').textContent = `Click again to close ${count} screen${count === 1 ? '' : 's'}`;
    return;
  }
  setMore(false);
  send({ cmd: 'closeAll' });
});
$('#saveWall').addEventListener('click', saveWallAsView);

// ---------- live updates ----------

let stateTimer;
const refreshState = () => {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(async () => { await loadState(); notify(); }, 150);
};

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) { await loadSettings(); notify(); }
  if (area === 'session') refreshState();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if ((info.title || info.url) && Object.values(store.slots).some(s => s.tabId === tabId)) refreshState();
});
const refreshEnv = async () => { await loadEnvironment(); notify(); };
chrome.system.display.onDisplayChanged?.addListener(refreshEnv);
window.addEventListener('focus', refreshEnv); // picks up shortcut changes made in chrome://extensions

(async function init() {
  await loadSettings();
  await Promise.all([loadState(), loadEnvironment()]);
  renderAll();
})();
