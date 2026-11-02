// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Shared panel helpers: the state store, messaging, favicons, layout diagrams, toasts.

import { getLayout } from '../core/layouts.js';
import { APP_NAME } from '../core/brand.js';
import { DEMO, demoAllows } from './demo.js';
import { safeUrl } from '../core/validate.js';

export const SLOTS = [1, 2, 3, 4];

export const $ = (s, root = document) => root.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- store ----------

export const store = {
  settings: null,
  slots: {},      // screen number → { windowId, tabId, url, name, siteId, label }
  audio: 1,       // screen with sound (0 = all muted)
  tabs: {},       // screen number → { title, url } of what the window shows now
  displays: [],
  commands: [],
  history: [],    // wall snapshots for Back, oldest first (see core/history.js)
  pages: {}       // screen tab id → recent pages, oldest first (see core/pages.js)
};

const listeners = new Set();
export const subscribe = fn => listeners.add(fn);
export const notify = () => listeners.forEach(fn => fn());

export async function send(msg) {
  if (DEMO && !demoAllows(msg)) { toast('Demo mode: nothing opens or saves.'); return undefined; }
  const r = await chrome.runtime.sendMessage(msg);
  if (!r?.ok) { console.warn(APP_NAME + ':', r?.error); toast(r?.error || 'Something went wrong'); }
  return r?.result;
}

export const saveSettings = (patch, rearrange = false) => send({ cmd: 'settings', patch, rearrange });

export async function loadSettings() { store.settings = await send({ cmd: 'getSettings' }); }

export async function loadState() {
  const { slots = {}, audio = 1, history = [], pages = {} } = await chrome.storage.session.get(['slots', 'audio', 'history', 'pages']);
  Object.assign(store, { slots, audio, history, pages });
  store.tabs = {};
  for (const n of SLOTS) {
    if (!slots[n]) continue;
    try { const t = await chrome.tabs.get(slots[n].tabId); store.tabs[n] = { title: t.title, url: t.url || t.pendingUrl }; } catch {}
  }
}

export async function loadEnvironment() {
  store.displays = await chrome.system.display.getInfo();
  store.commands = (await chrome.commands?.getAll?.()) || [];
}

export const shortcutFor = name => store.commands.find(c => c.name === name)?.shortcut || '';

// ---------- visuals ----------

// Only ever built from a validated http(s) page address.
export function faviconUrl(pageUrl, size = 32) {
  const page = safeUrl(pageUrl);
  if (!page) return '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'), location.href);
  u.searchParams.set('pageUrl', page);
  u.searchParams.set('size', String(size));
  return u.href;
}

export const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function favicon(pageUrl, name = '', size = 20) {
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  const src = faviconUrl(pageUrl);
  if (!src) return `<span class="fav letter" style="--s:${Number(size)}px;--h:${hue(name)}">${esc(letter)}</span>`;
  return `<span class="fav" style="--s:${size}px;--h:${hue(name)}"><img src="${esc(src)}" alt="" data-letter="${esc(letter)}"></span>`;
}

// Swap broken favicons for a letter badge (inline onerror isn't allowed in extension pages).
document.addEventListener('error', e => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.dataset.letter) {
    const span = img.parentElement;
    span.classList.add('letter');
    span.textContent = img.dataset.letter;
  }
}, true);

// Mini layout drawing. tile(n) returns inner HTML for screen n's tile.
export function layoutIcon(layoutId, tile = () => '', cls = '') {
  const layout = getLayout(layoutId);
  return `<span class="layout-icon ${cls}">${Object.entries(layout.tiles).map(([n, [x, y, w, h]]) =>
    `<span class="tile" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%">${tile(Number(n))}</span>`).join('')}</span>`;
}

// Drag-and-drop payload types: a site from the list, or a screen from the wall.
export const DRAG = { site: 'application/x-screen-wall-site', slot: 'application/x-screen-wall-slot' };

// A short message at the bottom of the page. actions: [{ label, run }] adds buttons and keeps it up longer.
// run() is called inside the click, so it may ask Chrome for a permission.
let toastTimer;
export function toast(text, actions = []) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  const msg = document.createElement('span');
  msg.textContent = text;
  el.replaceChildren(msg);
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.addEventListener('click', () => { el.classList.remove('show'); a.run(); });
    el.append(b);
  }
  el.classList.toggle('has-actions', actions.length > 0);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), actions.length ? 12000 : 3500);
}

export const pref = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};

// Skip a redraw while the user is typing inside root; redraw when they leave the field.
export function guardTyping(root, render) {
  let pending = false;
  root.addEventListener('focusout', () => setTimeout(() => {
    if (pending && !root.contains(document.activeElement)) { pending = false; render(); }
  }, 0));
  return () => {
    const a = document.activeElement;
    if (a && root.contains(a) && a.matches('input[type=text], input[type=url], input[type=number], input[type=date], input:not([type]), textarea')) { pending = true; return; }
    render();
  };
}
