// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The screens on the Wall page, in two views:
//   Wall: a map of the display in the real layout. Click a screen for sound, drag to swap or drop a site.
//   Edit: one card per screen with its link box, Back/Forward, recent pages and Swap.

import { SLOTS, $, esc, store, send, favicon, guardTyping, toast, pref, hue, DRAG } from './common.js';
import { slotsFor, getLayout } from '../core/layouts.js';
import { hostOf } from '../core/sites.js';
import { safeUrl, LIMITS } from '../core/validate.js';
import { describePage } from '../core/pages.js';
import { icon } from './icons.js';

let root;
let mode = pref.get('screenMode', 'wall') === 'edit' ? 'edit' : 'wall';
let dragging = false, missed = false; // don't redraw under a drag; catch up when it ends

export function mountScreens(el, modeSwitch) {
  root = el;
  const guarded = guardTyping(root, draw);
  const render = () => (dragging ? (missed = true) : guarded());
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.a === 'url') { e.preventDefault(); openTyped(e.target.closest('.screen')); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tv')) { e.preventDefault(); e.target.click(); }
  });
  modeSwitch.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b && b.dataset.mode !== mode) setMode(b.dataset.mode);
  });
  mountDrops();
  // 1–4 move the sound, like the screens' own number badges. Ignored while typing or with modifier keys.
  document.addEventListener('keydown', e => {
    if (!/^[1-4]$/.test(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, select, textarea, dialog, [contenteditable]') || root.closest('[hidden]')) return;
    const n = Number(e.key);
    if (store.slots[n] && store.audio !== n) send({ cmd: 'audio', slot: n });
  });
  return render;
}

function setMode(m, focusSlot) {
  mode = m;
  pref.set('screenMode', m);
  draw();
  if (!focusSlot) return;
  const input = $(`.screen[data-slot="${focusSlot}"] input[data-a=url]`, root);
  input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  input?.focus();
  input?.select();
}

function draw() {
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === mode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  });
  root.classList.toggle('as-map', mode === 'wall');
  if (mode === 'wall') return drawMap();
  drawCards();
}

// ---------- Wall view ----------

// The display the wall goes on, picked the same way the background does.
function wallDisplay() {
  const ds = store.displays;
  return ds.find(d => d.id === store.settings.displayId) || ds.find(d => !d.isPrimary) || ds[0];
}

// Where screen n sits, as fractions of the display, or null if this layout doesn't show it.
// Single shows whichever screen has the sound.
function rectFor(layoutId, n, soundSlot) {
  const layout = getLayout(layoutId);
  if (layout.id === 'focus') return n === soundSlot ? layout.tiles[1] : null;
  return layout.tiles[n] || null;
}

function drawMap() {
  const layoutId = store.settings.layout;
  const soundSlot = store.audio || 1;
  const display = wallDisplay();
  const area = display?.workArea || display?.bounds;
  const ratio = area ? `${area.width} / ${area.height}` : '16 / 9';
  const shown = SLOTS.map(n => [n, rectFor(layoutId, n, soundSlot)]).filter(([, r]) => r);
  const offWall = SLOTS.filter(n => store.slots[n] && !rectFor(layoutId, n, soundSlot));
  const a = store.slots[store.audio];
  const playing = a ? a.label || a.name || hostOf(store.tabs[store.audio]?.url || a.url) : '';
  root.innerHTML = `
    <div class="stage-frame">
      <div class="stage" style="aspect-ratio:${ratio}">${shown.map(([n, r]) => tile(n, r)).join('')}</div>
      <div class="map-status">
        ${a ? `<span class="on-air"><span class="dot"></span>Sound on <b>${store.audio}</b> · ${esc(playing)}</span>`
            : `<span class="on-air">${!Object.keys(store.slots).length ? 'No screens open yet. Click a number next to a site to start.'
                : store.audio ? 'No sound: the screen with sound is empty. Click a screen to give it the sound.' : 'All screens muted. Click a screen to give it the sound.'}</span>`}
        <span>${esc(getLayout(layoutId).label)} on ${esc(display?.name || 'your display')}</span>
        <span class="keys">Click a screen for sound · <kbd>1</kbd>–<kbd>4</kbd></span>
      </div>
    </div>
    ${offWall.length ? `<div class="off-wall"><span>Open but not in this layout:</span>${offWall.map(n => {
      const s = store.slots[n], url = store.tabs[n]?.url || s.url;
      return `<button data-a="${layoutId === 'focus' ? 'audio' : 'edit'}" data-slot="${n}" class="chip" title="${layoutId === 'focus' ? 'Show this screen with sound' : 'Edit this screen'}">${favicon(url, s.name, 18)}${n} · ${esc(s.name || hostOf(url))}</button>`;
    }).join('')}</div>` : ''}`;
}

function tile(n, [x, y, w, h]) {
  const pos = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
  const s = store.slots[n];
  if (!s) {
    return `<div class="tv-cell" style="${pos}"><div class="tv empty" data-slot="${n}" tabindex="0" role="button" aria-label="Screen ${n} is empty. Edit it to add a link.">
      <span class="tv-num">${n}</span>
      <div class="tv-empty"><b>Screen ${n} is empty</b><span>Drop a site here, or click to paste a link</span></div>
    </div></div>`;
  }
  const tab = store.tabs[n] || {};
  const url = tab.url || s.url;
  const name = s.name || hostOf(url);
  const title = s.label || tab.title || 'Loading…';
  const sound = store.audio === n;
  return `<div class="tv-cell" style="${pos}">
    <div class="tv${sound ? ' sound' : ''}" data-slot="${n}" style="--h:${hue(name)}" draggable="true" tabindex="0" role="button" aria-pressed="${sound}"
      aria-label="Screen ${n}, ${esc(name)}. ${sound ? 'Has the sound.' : 'Click to give it the sound.'}" title="${sound ? 'This screen has the sound' : 'Click to give this screen the sound. Drag onto another screen to swap.'}">
      <div class="tv-top">
        <span class="tv-num">${n}</span>
        <div class="tv-name"><b>${esc(name)}</b><span>${esc(title)}</span></div>
        <div class="tv-tools">
          <button data-a="edit" title="Edit link, history and swap" aria-label="Edit screen ${n}">${icon('edit')}</button>
          <button data-a="reload" title="Reload" aria-label="Reload screen ${n}">${icon('reload')}</button>
          <button data-a="front" title="Bring this window to the front" aria-label="Show screen ${n}">${icon('show')}</button>
          <button data-a="close" title="Close this screen" aria-label="Close screen ${n}">${icon('close')}</button>
        </div>
      </div>
      <div class="tv-mid">${favicon(url, name, 40)}</div>
      <div class="tv-bottom">${sound
        ? `<span class="pill on"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>Sound</span>`
        : `<span class="pill">${icon('mute')}</span><span class="tv-hint">Click for sound</span>`}</div>
    </div>
  </div>`;
}

// Sites dropped on a screen open there; a screen dropped on another swaps them. Works in both views.
function mountDrops() {
  const target = e => e.target.closest?.('[data-slot]:is(.tv, .screen)');
  const ours = e => [...e.dataTransfer.types].some(t => t === DRAG.site || t === DRAG.slot);
  const clear = () => root.querySelectorAll('.drop, .lifted').forEach(x => x.classList.remove('drop', 'lifted'));
  root.addEventListener('dragstart', e => {
    const tv = e.target.closest?.('.tv[draggable=true]');
    if (!tv) return;
    dragging = true;
    tv.classList.add('lifted');
    e.dataTransfer.setData(DRAG.slot, tv.dataset.slot);
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragend', () => {
    dragging = false;
    clear();
    if (missed) { missed = false; draw(); }
  });
  root.addEventListener('dragover', e => {
    const t = target(e);
    if (!t || !ours(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG.site) ? 'copy' : 'move';
    root.querySelectorAll('.drop').forEach(x => x !== t && x.classList.remove('drop'));
    t.classList.add('drop');
  });
  root.addEventListener('dragleave', e => {
    const t = target(e);
    if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop');
  });
  root.addEventListener('drop', e => {
    const t = target(e);
    if (!t || !ours(e)) return;
    e.preventDefault();
    clear();
    const n = Number(t.dataset.slot);
    const siteId = e.dataTransfer.getData(DRAG.site);
    const from = Number(e.dataTransfer.getData(DRAG.slot));
    if (siteId) {
      const site = store.settings.sites.find(x => x.id === siteId);
      if (site) send({ cmd: 'open', slot: n, target: { url: site.url, siteId: site.id } });
    } else if (from && from !== n) {
      send({ cmd: 'swap', a: from, b: n });
    }
  });
}

// ---------- Edit view ----------

function drawCards() {
  const used = slotsFor(store.settings.layout);
  root.innerHTML = SLOTS.map(n => {
    const s = store.slots[n];
    const tab = store.tabs[n] || {};
    const sound = s && store.audio === n;
    const url = tab.url || s?.url || '';
    const headline = s ? (s.label || tab.title || s.name || 'Loading…') : 'Empty';
    const sub = s ? [s.name, s.label ? tab.title : hostOf(url)].filter(Boolean).join(' · ') : 'Pick a site from the list, or paste a link';
    const hidden = s && !used.includes(n);
    return `
    <div class="screen${s ? '' : ' empty'}${sound ? ' sound' : ''}" data-slot="${n}">
      <div class="screen-head">
        <span class="num">${n}</span>
        ${s ? favicon(url, s.name, 22) : ''}
        <div class="now"><b title="${esc(headline)}">${esc(headline)}</b><span>${esc(sub)}</span></div>
        ${s ? `<button data-a="audio" class="icon-btn${sound ? ' on' : ''}" title="${sound ? 'This screen has sound' : 'Give this screen the sound'}" aria-label="${sound ? 'This screen has sound' : 'Give this screen the sound'}" aria-pressed="${sound}">${icon(sound ? 'sound' : 'mute')}</button>` : ''}
      </div>
      ${hidden ? '<div class="note">Hidden in this layout</div>' : ''}
      <div class="row">
        <input data-a="url" type="url" maxlength="${LIMITS.url}" placeholder="Paste a link" value="${esc(url)}">
        <button data-a="go">Open</button>
      </div>
      ${s ? navRow(s, url) : ''}
      ${s ? `
      <div class="row actions">
        <button data-a="front" title="Bring this window to the front">${icon('show')}Show</button>
        <button data-a="reload">${icon('reload')}Reload</button>
        <select data-a="swap" aria-label="Swap with another screen"><option value="">Swap…</option>${SLOTS.filter(m => m !== n).map(m => `<option value="${m}">With ${m}</option>`).join('')}</select>
        <button data-a="close" class="ghost danger">Close</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

// Back, Forward, Start page and the screen's recent pages (newest first; the current page is marked).
function navRow(s, current) {
  const list = (store.pages[s.tabId] || []).slice().reverse();
  const options = list.map(p => {
    const time = new Date(p.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const here = p.url === current;
    return `<option value="${esc(p.url)}"${here ? ' disabled' : ''}>${here ? '• ' : ''}${esc(describePage(p))} · ${esc(time)}</option>`;
  }).join('');
  return `
      <div class="row nav">
        <button data-a="nav" data-how="back" class="icon-btn" title="Back in this screen" aria-label="Back in this screen">${icon('back')}</button>
        <button data-a="nav" data-how="forward" class="icon-btn" title="Forward in this screen" aria-label="Forward in this screen">${icon('forward')}</button>
        <button data-a="nav" data-how="home" class="icon-btn" title="Return to the page this screen opened with" aria-label="Start page">${icon('home')}</button>
        <select data-a="pages" aria-label="Recent pages on this screen"${list.length ? '' : ' disabled'}>
          <option value="">${list.length ? `Recent pages (${list.length})` : 'No pages yet'}</option>${options}
        </select>
      </div>`;
}

async function openTyped(card) {
  const input = $('input[data-a=url]', card);
  const raw = input.value.trim();
  input.blur(); // let the card redraw with the new page
  if (!raw) return;
  const url = safeUrl(raw);
  if (!url) return toast('Only http and https links can be opened.');
  send({ cmd: 'open', slot: Number(card.dataset.slot), target: { url } });
}

async function onClick(e) {
  const tv = e.target.closest('.tv');
  const action = e.target.closest('[data-a]');
  if (tv) {
    const n = Number(tv.dataset.slot);
    const a = action?.dataset.a;
    if (!store.slots[n] || a === 'edit') return setMode('edit', n);
    if (a) return send({ cmd: a, slot: n });
    if (store.audio !== n) send({ cmd: 'audio', slot: n });
    return;
  }
  if (action?.classList.contains('chip')) {
    const n = Number(action.dataset.slot);
    return action.dataset.a === 'edit' ? setMode('edit', n) : send({ cmd: 'audio', slot: n });
  }
  const el = action;
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const card = el.closest('.screen');
  const slot = Number(card.dataset.slot);
  switch (el.dataset.a) {
    case 'go':     return openTyped(card);
    case 'nav': {
      const how = el.dataset.how;
      const moved = await send({ cmd: 'nav', slot, how });
      if (moved === false) toast(how === 'forward' ? 'Nothing to go forward to on this screen.' : how === 'back' ? 'Nothing to go back to on this screen.' : 'This screen has no start page.');
      return;
    }
    case 'audio':  return send({ cmd: 'audio', slot });
    case 'front':  return send({ cmd: 'front', slot });
    case 'reload': return send({ cmd: 'reload', slot });
    case 'close':  return send({ cmd: 'close', slot });
  }
}

function onChange(e) {
  if (e.target.dataset.a === 'pages' && e.target.value) {
    send({ cmd: 'nav', slot: Number(e.target.closest('.screen').dataset.slot), how: 'page', url: e.target.value });
    return;
  }
  if (e.target.dataset.a === 'swap' && e.target.value) {
    send({ cmd: 'swap', a: Number(e.target.closest('.screen').dataset.slot), b: Number(e.target.value) });
  }
}
