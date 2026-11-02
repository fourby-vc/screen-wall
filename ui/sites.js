// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Site list: favicon + name + 1–4 buttons; edit mode adds rename, delete and drag-to-reorder.

import { SLOTS, $, esc, store, send, saveSettings, favicon, toast, guardTyping } from './common.js';
import { newId } from '../core/defaults.js';
import { hostOf, nameFromUrl, siteForUrl } from '../core/sites.js';
import { safeUrl, clip, LIMITS } from '../core/validate.js';

let root, editing = false, editId = null, dragId = null;

export function mountSites(el) {
  root = el;
  const render = guardTyping(root, draw);
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('dragstart', e => {
    const li = e.target.closest('.site');
    if (!li || !editing) return;
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragend', () => { dragId = null; root.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
  root.addEventListener('dragover', e => {
    const li = e.target.closest('.site');
    if (!li || !dragId) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    root.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  root.addEventListener('drop', e => {
    const li = e.target.closest('.site');
    if (!li || !dragId) return;
    e.preventDefault();
    const after = li.classList.contains('drop-after');
    const sites = store.settings.sites.slice();
    const moving = sites.splice(sites.findIndex(s => s.id === dragId), 1)[0];
    let at = sites.findIndex(s => s.id === li.dataset.id);
    if (after) at += 1;
    sites.splice(at, 0, moving);
    saveSettings({ sites });
  });
  return render;
}

// Which screen is currently showing a given site.
const screensShowing = site => SLOTS.filter(n => {
  const url = store.tabs[n]?.url || store.slots[n]?.url;
  return store.slots[n] && (siteForUrl(store.settings.sites, url)?.id ?? store.slots[n].siteId) === site.id;
});

function draw() {
  const sites = store.settings.sites;
  root.innerHTML = `
    <div class="panel-head">
      <span class="hint">${editing ? 'Drag to reorder. Changes save as you go.' : 'Click a number to open that site on a screen.'}</span>
      <button data-a="toggle-edit" class="${editing ? 'on' : 'ghost'}">${editing ? 'Done' : 'Edit list'}</button>
    </div>
    <ul class="sites">
      ${sites.map(site => site.id === editId ? editRow(site) : row(site)).join('') || '<li class="hint">No sites yet. Add one below.</li>'}
    </ul>
    <form class="add-site" data-form="add">
      <input name="url" type="text" maxlength="${LIMITS.url}" placeholder="Add a site: paste its address" autocomplete="off" required>
      <input name="name" type="text" maxlength="${LIMITS.name}" placeholder="Name (optional)" autocomplete="off">
      <button type="submit">Add</button>
    </form>
    ${sites.length > 15 ? '<p class="hint">Tip: 10–15 sites keeps the list quick to scan.</p>' : ''}`;
}

function row(site) {
  const showing = screensShowing(site);
  return `
  <li class="site" data-id="${esc(site.id)}" draggable="${editing}">
    ${editing ? '<span class="handle" title="Drag to reorder">⋮⋮</span>' : ''}
    ${favicon(site.url, site.name, 22)}
    <div class="site-name"><b>${esc(site.name)}</b><small>${esc(hostOf(site.url))}</small></div>
    ${editing ? `
      <button data-a="edit" class="icon-btn" title="Edit">✎</button>
      <button data-a="delete" class="icon-btn danger" title="Delete">✕</button>`
    : `<div class="send">${SLOTS.map(n => {
        const cls = showing.includes(n) ? 'current' : store.slots[n] ? '' : 'free';
        return `<button data-a="open" data-slot="${n}" class="${cls}" title="Open ${esc(site.name)} on screen ${n}">${n}</button>`;
      }).join('')}</div>`}
  </li>`;
}

function editRow(site) {
  return `
  <li class="site editing" data-id="${esc(site.id)}">
    <form class="edit-site" data-form="edit">
      <input name="name" type="text" maxlength="${LIMITS.name}" value="${esc(site.name)}" placeholder="Name" required>
      <input name="url" type="text" maxlength="${LIMITS.url}" value="${esc(site.url)}" placeholder="Address" required>
      <button type="submit">Save</button>
      <button type="button" data-a="cancel" class="ghost">Cancel</button>
    </form>
  </li>`;
}

async function onClick(e) {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const id = el.closest('.site')?.dataset.id;
  const site = store.settings.sites.find(s => s.id === id);
  switch (el.dataset.a) {
    case 'toggle-edit': editing = !editing; editId = null; return draw();
    case 'edit':   editId = id; draw(); return $('input[name=name]', root)?.focus();
    case 'cancel': editId = null; return draw();
    case 'delete':
      if (!confirm(`Remove ${site.name} from your list?`)) return;
      return saveSettings({ sites: store.settings.sites.filter(s => s.id !== id) });
    case 'open':
      return send({ cmd: 'open', slot: Number(el.dataset.slot), target: { url: site.url, siteId: site.id } });
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  document.activeElement?.blur(); // let the list redraw once saved
  const url = safeUrl(form.elements.namedItem('url').value);
  if (!url) return toast('That address doesn’t look right. Only http and https links work.');
  const name = clip(form.elements.namedItem('name').value, LIMITS.name) || nameFromUrl(url);
  if (form.dataset.form === 'add') {
    if (store.settings.sites.length >= LIMITS.sites) return toast(`The list holds up to ${LIMITS.sites} sites.`);
    await saveSettings({ sites: [...store.settings.sites, { id: newId(), name, url }] });
    form.reset();
  } else {
    const id = form.closest('.site').dataset.id;
    editId = null;
    await saveSettings({ sites: store.settings.sites.map(s => (s.id === id ? { ...s, name, url } : s)) });
  }
}
