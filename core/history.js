// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Wall history for the Back button. A snapshot is
//   { id, at, layout, sound, screens: { 1: { url, name, siteId, label } } }
// The worker keeps the newest HISTORY_MAX in chrome.storage.session, oldest first. Pure module.

export const HISTORY_MAX = 10;

const SLOTS = [1, 2, 3, 4];

const screenKey = s => (s?.url ? `${s.url}\u0000${s.label || ''}` : '');

// True when two walls show the same pages with the same layout and sound.
export function sameWall(a, b) {
  if (!a || !b || a.layout !== b.layout || (a.sound || 0) !== (b.sound || 0)) return false;
  return SLOTS.every(n => screenKey(a.screens?.[n]) === screenKey(b.screens?.[n]));
}

export const isEmptyWall = w => !SLOTS.some(n => w?.screens?.[n]?.url);

// Adds `snap` as the newest entry, unless it matches the newest entry already there.
export function pushSnapshot(list, snap, max = HISTORY_MAX) {
  const prev = list[list.length - 1];
  if (prev && sameWall(prev, snap)) return list;
  return [...list, snap].slice(-max);
}

// "2:14 PM · Peacock, YouTube TV"
export function describeSnapshot(snap, locale) {
  const time = new Date(snap.at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const names = SLOTS.map(n => snap.screens?.[n]).filter(s => s?.url).map(s => s.label || s.name || hostOf(s.url));
  return `${time} · ${names.length ? names.join(', ') : 'Empty wall'}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
