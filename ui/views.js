// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Saved views: one-click cards on the Wall page, plus the editor dialog.

import { SLOTS, $, esc, store, send, saveSettings, favicon, layoutIcon, shortcutFor, toast } from './common.js';
import { LAYOUTS, slotsFor } from '../core/layouts.js';
import { newId } from '../core/defaults.js';
import { normalizeUrl, siteForUrl, nameFromUrl } from '../core/sites.js';
import { safeUrl, clip, LIMITS } from '../core/validate.js';
import { icon } from './icons.js';

let root, dialog, draft = null;

export function mountViews(el, dialogEl) {
  root = el;
  dialog = dialogEl;
  root.addEventListener('click', onClick);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('change', onDialogChange);
  dialog.addEventListener('input', e => { if (draft && e.target.name === 'name') draft.name = e.target.value; });
  dialog.addEventListener('submit', onDialogSubmit);
  return draw;
}

const screenUrls = view => slotsFor(view.layout).map(n => view.screens?.[n]?.url).filter(Boolean);

function draw() {
  const views = store.settings.views;
  root.innerHTML = views.map((v, i) => {
    const key = i < 3 ? shortcutFor(`view-${i + 1}`) : '';
    const count = screenUrls(v).length;
    return `
    <div class="view-card" data-id="${esc(v.id)}">
      <button class="view-open" data-a="launch" title="Open this view">
        ${layoutIcon(v.layout, n => {
          const scr = v.screens?.[n];
          return (scr?.url ? favicon(scr.url, scr.name, 18) : '') + (v.sound === n && scr?.url ? `<i class="spk" title="Sound">${icon('sound')}</i>` : '');
        }, 'big')}
        <span class="view-name">${esc(v.name)}</span>
        <span class="view-meta">${count} screen${count === 1 ? '' : 's'}${key ? ` · <kbd>${esc(key)}</kbd>` : ''}</span>
      </button>
      <div class="view-tools">
        <button data-a="edit" class="icon-btn" title="Edit" aria-label="Edit view">${icon('edit')}</button>
        <button data-a="dup" class="icon-btn" title="Duplicate" aria-label="Duplicate view">${icon('copy')}</button>
        <button data-a="del" class="icon-btn danger" title="Delete" aria-label="Delete view">${icon('close')}</button>
      </div>
    </div>`;
  }).join('') + `
    <button class="view-card add" data-a="new"><span class="plus">${icon('plus')}</span><span>New view</span></button>
    ${views.length ? '' : `<p class="hint views-empty">Set up the wall the way you like it, then <b>Save wall as view</b>. Next time, one click opens every screen, the layout and the sound. Views also appear when you right-click the toolbar icon${shortcutFor('view-1') ? `, and ${esc(shortcutFor('view-1'))} opens the first one` : ''}.</p>`}`;
}

async function onClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const id = el.closest('.view-card')?.dataset.id;
  const view = store.settings.views.find(v => v.id === id);
  switch (el.dataset.a) {
    case 'launch':
      return send({ cmd: 'launchView', id });
    case 'new':  return openEditor(blankView());
    case 'edit': return openEditor(JSON.parse(JSON.stringify(view)));
    case 'dup':
      if (store.settings.views.length >= LIMITS.views) return toast(`You can save up to ${LIMITS.views} views.`);
      return saveSettings({ views: [...store.settings.views, { ...JSON.parse(JSON.stringify(view)), id: newId(), name: clip(view.name + ' (copy)', LIMITS.name) }] });
    case 'del':
      if (confirm(`Delete the view “${view.name}”?`)) saveSettings({ views: store.settings.views.filter(v => v.id !== id) });
  }
}

const blankView = () => ({ id: null, name: '', layout: store.settings.layout, screens: {}, sound: 1 });

// Prefill the editor from whatever is on the wall now.
export function saveWallAsView() {
  const screens = {};
  for (const n of SLOTS) {
    const s = store.slots[n];
    const url = safeUrl(store.tabs[n]?.url) || safeUrl(s?.url);
    if (s && url) screens[n] = { url, name: clip(s.name, LIMITS.name), siteId: s.siteId || null };
  }
  if (!Object.keys(screens).length) return toast('Open at least one screen first.');
  openEditor({
    id: null, name: '', layout: store.settings.layout, screens,
    sound: store.slots[store.audio] ? store.audio : Number(Object.keys(screens)[0])
  });
}

// ---------- editor ----------

function openEditor(view) {
  draft = view;
  drawEditor();
  dialog.showModal();
  $('input[name=name]', dialog)?.focus();
}

function drawEditor() {
  const sites = store.settings.sites;
  const used = slotsFor(draft.layout);
  dialog.innerHTML = `
  <form method="dialog" class="editor">
    <h3>${draft.id ? 'Edit view' : 'New view'}</h3>
    <label class="field-block">Name
      <input name="name" type="text" maxlength="${LIMITS.name}" value="${esc(draft.name)}" placeholder="e.g. NFL Sunday" required>
    </label>
    <div class="field-block">Layout
      <div class="layout-choices">
        ${LAYOUTS.map(l => `<button type="button" data-layout="${l.id}" class="layout-choice${l.id === draft.layout ? ' on' : ''}" title="${esc(l.hint)}">${layoutIcon(l.id, n => `<em>${l.id === 'focus' ? '' : n}</em>`)}<span>${esc(l.label)}</span></button>`).join('')}
      </div>
      ${draft.layout === 'focus' ? '<p class="hint">Single shows only the screen with sound; switch sound to flip between them.</p>' : ''}
    </div>
    <div class="field-block">Screens
      <div class="screen-rows">
        ${used.map(n => {
          const scr = draft.screens[n] || {};
          const site = scr.siteId ? sites.find(s => s.id === scr.siteId) : (scr.url ? siteForUrl(sites, scr.url) : null);
          const isCustom = !!scr.custom || (!!scr.url && (!site || normalizeUrl(site.url) !== normalizeUrl(scr.url)));
          const value = isCustom ? '__custom' : !scr.url ? '' : site.id;
          return `
          <div class="screen-row" data-n="${n}">
            <span class="num">${n}</span>
            ${favicon(scr.url, scr.name || site?.name, 20)}
            <select data-f="site" aria-label="Site for screen ${n}">
              <option value="">Empty</option>
              ${sites.map(s => `<option value="${esc(s.id)}"${value === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
              <option value="__custom"${value === '__custom' ? ' selected' : ''}>Other link…</option>
            </select>
            <input data-f="url" type="text" maxlength="${LIMITS.url}" placeholder="Paste a link" value="${esc(isCustom ? scr.url : '')}" ${isCustom ? '' : 'hidden'}>
            <label class="radio" title="This screen gets the sound"><input type="radio" name="sound" value="${n}"${draft.sound === n ? ' checked' : ''}> ${icon('sound')}</label>
          </div>`;
        }).join('')}
      </div>
      <p class="hint">Tip: point live TV at a channel or guide page. Game pages change every week.</p>
    </div>
    <div class="dialog-actions">
      <button type="button" data-a="cancel" class="ghost">Cancel</button>
      <button type="submit" class="primary">Save view</button>
    </div>
  </form>`;
}

function onDialogClick(e) {
  const layoutBtn = e.target.closest('[data-layout]');
  if (layoutBtn) { draft.layout = layoutBtn.dataset.layout; return drawEditor(); }
  if (e.target.closest('[data-a=cancel]')) { draft = null; dialog.close(); }
}

function onDialogChange(e) {
  const t = e.target;
  if (t.name === 'sound') draft.sound = Number(t.value);
  const row = t.closest('.screen-row');
  if (!row) return;
  const n = Number(row.dataset.n);
  if (t.dataset.f === 'site') {
    if (t.value === '') delete draft.screens[n];
    else if (t.value === '__custom') draft.screens[n] = { url: '', name: '', siteId: null, custom: true };
    else {
      const s = store.settings.sites.find(x => x.id === t.value);
      draft.screens[n] = { url: s.url, name: s.name, siteId: s.id };
    }
    drawEditor();
    if (t.value === '__custom') $(`.screen-row[data-n="${n}"] input[data-f=url]`, dialog)?.focus();
  }
  if (t.dataset.f === 'url') {
    const url = safeUrl(t.value);
    if (!url) { draft.screens[n] = { url: '', name: '', siteId: null, custom: true }; if (t.value.trim()) toast('Only http and https links work.'); return; }
    const site = siteForUrl(store.settings.sites, url);
    draft.screens[n] = { url, name: site?.name || nameFromUrl(url), siteId: null, custom: true };
  }
}

async function onDialogSubmit(e) {
  e.preventDefault();
  const form = e.target;
  draft.name = clip(form.elements.namedItem('name').value, LIMITS.name);
  const used = slotsFor(draft.layout);
  const screens = Object.fromEntries(used.filter(n => draft.screens[n]?.url).map(n => {
    const { custom, ...scr } = draft.screens[n]; // editor-only flag
    return [n, scr];
  }));
  if (!draft.name) return toast('Give the view a name.');
  if (!Object.keys(screens).length) return toast('Pick a site for at least one screen.');
  const view = { ...draft, screens, sound: screens[draft.sound] ? draft.sound : Number(Object.keys(screens)[0]) };
  const views = store.settings.views;
  if (view.id) await saveSettings({ views: views.map(v => (v.id === view.id ? view : v)) });
  else {
    if (views.length >= LIMITS.views) return toast(`You can save up to ${LIMITS.views} views.`);
    await saveSettings({ views: [...views, { ...view, id: newId() }] });
  }
  draft = null;
  dialog.close();
}
