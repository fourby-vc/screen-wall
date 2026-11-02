// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Recent pages per screen: the list behind each screen's Pages menu. Pure module, no chrome.*.
// The worker keeps one list per screen window's tab in chrome.storage.session (cleared when Chrome quits).

import { safeUrl, clip, LIMITS } from './validate.js';

export const PAGES_MAX = 15;

// Returns the list with this page added as the newest entry, or the same list when nothing changed.
// A title update for the page already on top replaces its title instead of adding an entry.
// Only http(s) addresses are kept; anything else (error pages, about:blank) is ignored.
export function pushPage(list = [], { url, title } = {}, now = Date.now()) {
  const safe = safeUrl(url);
  if (!safe) return list;
  const name = clip(title, LIMITS.title);
  const top = list[list.length - 1];
  if (top && top.url === safe) {
    if (!name || name === top.title) return list;
    return [...list.slice(0, -1), { ...top, title: name }];
  }
  // Revisiting a page moves it to the top rather than listing it twice.
  return [...list.filter(p => p.url !== safe), { url: safe, title: name, at: now }].slice(-PAGES_MAX);
}

// Short address for a menu: host without "www." plus the path, query dropped, trimmed to `max`.
export function shortAddress(url, max = 48) {
  let text;
  try { const u = new URL(url); text = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname); }
  catch { text = String(url || ''); }
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Menu text for one entry: title and short address, so pages that share a title stay distinct.
export function describePage(p) {
  const where = shortAddress(p.url);
  return p.title ? `${p.title} · ${where}` : where;
}
