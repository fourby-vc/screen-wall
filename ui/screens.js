// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The four screen cards on the Wall page.

import { SLOTS, $, esc, store, send, favicon, guardTyping, toast } from './common.js';
import { slotsFor } from '../core/layouts.js';
import { hostOf } from '../core/sites.js';
import { safeUrl, LIMITS } from '../core/validate.js';
import { describePage } from '../core/pages.js';

let root;

export function mountScreens(el) {
  root = el;
  const render = guardTyping(root, draw);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.a === 'url') { e.preventDefault(); openTyped(e.target.closest('.screen')); }
  });
  return render;
}

function draw() {
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
        ${s ? `<button data-a="audio" class="icon-btn${sound ? ' on' : ''}" title="${sound ? 'This screen has sound' : 'Give this screen the sound'}">${sound ? '🔊' : '🔈'}</button>` : ''}
      </div>
      ${hidden ? '<div class="note">Hidden in this layout</div>' : ''}
      <div class="row">
        <input data-a="url" type="url" maxlength="${LIMITS.url}" placeholder="Paste a link" value="${esc(url)}">
        <button data-a="go">Open</button>
      </div>
      ${s ? navRow(s, url) : ''}
      ${s ? `
      <div class="row actions">
        <button data-a="front" title="Bring this window to the front">Show</button>
        <button data-a="reload">Reload</button>
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
        <button data-a="nav" data-how="back" class="icon-btn" title="Back in this screen" aria-label="Back in this screen">←</button>
        <button data-a="nav" data-how="forward" class="icon-btn" title="Forward in this screen" aria-label="Forward in this screen">→</button>
        <button data-a="nav" data-how="home" class="icon-btn" title="Return to the page this screen opened with" aria-label="Start page">⌂</button>
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
  const el = e.target.closest('[data-a]');
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
