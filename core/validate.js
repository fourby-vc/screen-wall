// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Input validation: safe URLs, length limits and the settings/backup schema. Pure module, no chrome.*.
// Everything that can reach chrome.windows.create, chrome.tabs.update/create or the page goes through here.

import { LAYOUTS } from './layouts.js';

// Version of the settings shape.
export const SETTINGS_VERSION = 1;

export const LIMITS = {
  url: 2048,
  name: 60,        // site and view names
  label: 80,
  title: 120,     // page titles kept in a screen's recent-pages list
  id: 40,
  sites: 100,
  views: 50,
  displayId: 64,
  backupBytes: 1024 * 1024
};

const LAYOUT_IDS = LAYOUTS.map(l => l.id);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SETTINGS_KEYS = ['version', 'layout', 'displayId', 'gap', 'audioFollowsFocus', 'tidyYouTube', 'sites', 'views'];

// Returns a normalized http(s) URL, or '' when the input is anything else.
// Bare addresses ("espn.com", "example.com:8080") get https://. Any other scheme (javascript:, data:,
// file:, chrome:, chrome-extension:, blob:, about: ...) is rejected, as are embedded user:password.
export function safeUrl(input) {
  if (typeof input !== 'string') return '';
  const s = input.trim();
  if (!s || s.length > LIMITS.url || /[\u0000-\u001f\u007f]/.test(s)) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  const hostPort = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(s);
  let candidate = s;
  if (scheme && !hostPort) {
    if (!/^https?$/i.test(scheme[1])) return '';
  } else {
    candidate = 'https://' + s;
  }
  let u;
  try { u = new URL(candidate); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  if (!u.hostname || u.username || u.password) return '';
  return u.href.length > LIMITS.url ? '' : u.href;
}

export const isSafeUrl = u => typeof u === 'string' && safeUrl(u) !== '';

// Trims and cuts a display string to `max` characters.
export const clip = (v, max) => String(v ?? '').trim().slice(0, max);

export const isId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) && !BAD_KEYS.has(v);
export const isSlot = n => Number.isInteger(n) && n >= 1 && n <= 4;
export const isLayout = id => LAYOUT_IDS.includes(id);

// ---------- schema ----------

class Invalid extends Error {}
const fail = msg => { throw new Invalid(msg); };

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function keysOnly(obj, allowed, where) {
  if (!isPlain(obj)) fail(`${where} must be an object`);
  for (const k of Object.keys(obj)) {
    if (BAD_KEYS.has(k)) fail(`${where} has a forbidden key "${k}"`);
    if (!allowed.includes(k)) fail(`${where} has an unknown key "${clip(k, 30)}"`);
  }
}

function str(v, max, where, { required = false } = {}) {
  if (typeof v !== 'string') fail(`${where} must be text`);
  const s = v.trim();
  if (required && !s) fail(`${where} is empty`);
  if (s.length > max) fail(`${where} is longer than ${max} characters`);
  return s;
}

function url(v, where) {
  const u = safeUrl(v);
  if (!u) fail(`${where} is not an http or https link`);
  return u;
}

function site(raw, i) {
  const w = `Site ${i + 1}`;
  keysOnly(raw, ['id', 'name', 'url'], w);
  if (!isId(raw.id)) fail(`${w} has an invalid id`);
  const out = { id: raw.id, name: str(raw.name, LIMITS.name, `${w} name`, { required: true }), url: url(raw.url, `${w} address`) };
  return out;
}

function view(raw, i) {
  const w = `View ${i + 1}`;
  keysOnly(raw, ['id', 'name', 'layout', 'sound', 'screens'], w);
  if (!isId(raw.id)) fail(`${w} has an invalid id`);
  if (!isLayout(raw.layout)) fail(`${w} layout is unknown`);
  if (!Number.isInteger(raw.sound) || raw.sound < 0 || raw.sound > 4) fail(`${w} sound screen must be 0–4`);
  keysOnly(raw.screens, ['1', '2', '3', '4'], `${w} screens`);
  const screens = {};
  for (const [n, scr] of Object.entries(raw.screens)) screens[n] = screen(scr, `${w} screen ${n}`);
  return { id: raw.id, name: str(raw.name, LIMITS.name, `${w} name`, { required: true }), layout: raw.layout, sound: raw.sound, screens };
}

function screen(raw, w) {
  keysOnly(raw, ['url', 'name', 'siteId', 'label'], w);
  const out = { url: url(raw.url, `${w} address`), name: raw.name === undefined ? '' : str(raw.name, LIMITS.name, `${w} name`), siteId: null };
  if (raw.siteId !== undefined && raw.siteId !== null) { if (!isId(raw.siteId)) fail(`${w} site id is invalid`); out.siteId = raw.siteId; }
  if (raw.label !== undefined && raw.label !== '') out.label = str(raw.label, LIMITS.label, `${w} label`);
  return out;
}

function list(v, max, what, each) {
  if (!Array.isArray(v)) fail(`${what} must be a list`);
  if (v.length > max) fail(`Too many ${what} (${v.length}; the most is ${max})`);
  const out = v.map(each);
  const ids = new Set(out.map(x => x.id));
  if (ids.size !== out.length) fail(`Two ${what} share the same id`);
  return out;
}

const FIELDS = {
  version: v => { if (v !== SETTINGS_VERSION) fail('Unsupported settings version'); return v; },
  layout: v => { if (!isLayout(v)) fail('Layout is unknown'); return v; },
  displayId: v => (v === null ? null : str(v, LIMITS.displayId, 'Display id')),
  gap: v => { if (!Number.isInteger(v) || v < 0 || v > 24) fail('Gap must be a whole number from 0 to 24'); return v; },
  audioFollowsFocus: v => { if (typeof v !== 'boolean') fail('"Sound follows click" must be true or false'); return v; },
  tidyYouTube: v => { if (typeof v !== 'boolean') fail('"Tidy YouTube" must be true or false'); return v; },
  sites: v => list(v, LIMITS.sites, 'sites', site),
  views: v => list(v, LIMITS.views, 'views', view)
};

// Checks a settings object (or, with partial, a patch of some of its keys).
// Returns { ok: true, value } with a fresh copy built from known keys only, or { ok: false, error }.
export function checkSettings(raw, { partial = false } = {}) {
  try {
    keysOnly(raw, SETTINGS_KEYS, partial ? 'Settings change' : 'Backup');
    if (!partial && raw.sites === undefined) fail('Backup has no site list');
    const value = {};
    for (const k of SETTINGS_KEYS) if (raw[k] !== undefined) value[k] = FIELDS[k](raw[k]);
    return { ok: true, value };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    return { ok: false, error: 'The settings could not be read' };
  }
}

// Same checks, but drops what fails instead of rejecting (used on data already in storage, so one
// bad stored entry can't lock the user out). Returns only the keys that pass.
export function repairSettings(raw) {
  if (!isPlain(raw)) return {};
  const out = {};
  for (const k of SETTINGS_KEYS) {
    if (raw[k] === undefined) continue;
    if (k === 'sites' || k === 'views') {
      if (!Array.isArray(raw[k])) continue;
      const each = k === 'sites' ? site : view;
      const seen = new Set();
      out[k] = [];
      raw[k].forEach((x, i) => {
        try { const v = each(x, i); if (!seen.has(v.id)) { seen.add(v.id); out[k].push(v); } } catch {}
      });
      out[k] = out[k].slice(0, k === 'sites' ? LIMITS.sites : LIMITS.views);
      continue;
    }
    try { out[k] = FIELDS[k](raw[k]); } catch {}
  }
  return out;
}

// Parses and checks a backup file's text. Returns { ok, settings, summary } or { ok: false, error }.
// True if any object key at any depth is __proto__, constructor or prototype (or the file nests absurdly deep).
function hasBadKey(v, depth = 0) {
  if (depth > 20) return true;
  if (!v || typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.some(x => hasBadKey(x, depth + 1));
  return Object.keys(v).some(k => BAD_KEYS.has(k) || hasBadKey(v[k], depth + 1));
}

export function parseBackup(text) {
  if (typeof text !== 'string') return { ok: false, error: 'The file could not be read' };
  if (text.length > LIMITS.backupBytes) return { ok: false, error: 'The file is larger than 1 MB' };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'The file is not valid JSON' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'The file is not a backup from this extension' };
  if (hasBadKey(data)) return { ok: false, error: 'The file contains a key that is not allowed' };
  const r = checkSettings(data);
  if (!r.ok) return r;
  const s = r.value;
  return {
    ok: true,
    settings: { ...s, version: SETTINGS_VERSION },
    summary: { sites: s.sites.length, views: (s.views || []).length }
  };
}
