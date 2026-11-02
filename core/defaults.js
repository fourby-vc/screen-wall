// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings shape, defaults and migration. Pure module: no chrome.* calls, so Node can test it.

import { repairSettings, SETTINGS_VERSION } from './validate.js';

// Settings from older versions are upgraded on load; fields the current version doesn't use are dropped.
export { SETTINGS_VERSION };

export const newId = () => Math.random().toString(36).slice(2, 10);

// New installs start with these. An existing user's saved list is never replaced or extended.
export const DEFAULT_SITES = [
  { id: 'youtubetv', name: 'YouTube TV',  url: 'https://tv.youtube.com/live' },
  { id: 'peacock',   name: 'Peacock',     url: 'https://www.peacocktv.com/' },
  { id: 'paramount', name: 'Paramount+',  url: 'https://www.paramountplus.com/live-tv/' },
  { id: 'prime',     name: 'Prime Video', url: 'https://www.amazon.com/gp/video/storefront' },
  { id: 'espn',      name: 'ESPN',        url: 'https://www.espn.com/watch/' },
  { id: 'foxone',    name: 'Fox One',     url: 'https://www.foxone.com/' },
  { id: 'netflix',   name: 'Netflix',     url: 'https://www.netflix.com/' },
  { id: 'hbomax',    name: 'HBO Max',     url: 'https://play.hbomax.com/' },
  { id: 'disney',    name: 'Disney+',     url: 'https://www.disneyplus.com/' },
  { id: 'hulu',      name: 'Hulu',        url: 'https://www.hulu.com/' },
  { id: 'appletv',   name: 'Apple TV',    url: 'https://tv.apple.com/' },
  { id: 'fubo',      name: 'Fubo',        url: 'https://www.fubo.tv/' },
  { id: 'sling',     name: 'Sling TV',    url: 'https://watch.sling.com/' },
  { id: 'dazn',      name: 'DAZN',        url: 'https://www.dazn.com/' },
  { id: 'nflplus',   name: 'NFL+',        url: 'https://www.nfl.com/plus/' },
  { id: 'youtube',   name: 'YouTube',     url: 'https://www.youtube.com/' },
  { id: 'tubi',      name: 'Tubi',        url: 'https://tubitv.com/' },
  { id: 'twitch',    name: 'Twitch',      url: 'https://www.twitch.tv/' }
];

export const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  layout: 'grid',          // see core/layouts.js
  displayId: null,         // monitor for the wall; null = second display if present
  gap: 0,                  // pixels between screens
  audioFollowsFocus: true, // clicking a screen moves the sound to it
  tidyYouTube: false,      // YouTube videos fill their screen (needs youtube.com access, asked for when turned on)
  sites: DEFAULT_SITES,
  views: []                // saved views: { id, name, layout, screens: {1: {url, name, siteId}}, sound }
};

const clone = v => JSON.parse(JSON.stringify(v));

// Accepts nothing (first run), any earlier settings version, or the original v1 config, and returns
// valid current settings. Keys the current version doesn't use are dropped.
export function migrate(raw) {
  const d = clone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return d;
  return clean(raw.version >= 2 ? raw : fromV1(raw), d);
}

function clean(raw, d) {
  const out = { ...d };
  for (const k of Object.keys(d)) if (k !== 'version' && raw[k] !== undefined) out[k] = raw[k];
  out.sites = Array.isArray(raw.sites) ? raw.sites.map(x => (x && typeof x === 'object' ? (({ sub, ...rest }) => rest)(x) : x)) : d.sites;
  out.views = Array.isArray(raw.views) ? raw.views.map(v => (v && typeof v === 'object' ? (({ fill, schedule, ...rest }) => rest)(v) : v)) : [];
  // Whatever is stored passes the same checks as an import; entries that fail are dropped.
  const ok = repairSettings({ ...out, version: SETTINGS_VERSION });
  return {
    ...d, ...ok,
    sites: ok.sites || d.sites,
    views: ok.views || [],
    version: SETTINGS_VERSION
  };
}

// v1: services (name/url/color) and presets (screens keyed 1–4). Other v1 fields are not carried over.
function fromV1(raw) {
  const sites = (raw.services || []).map(s => ({ id: slug(s.name) || newId(), name: s.name, url: s.url }));
  const byName = Object.fromEntries(sites.map(s => [s.name, s.id]));
  const views = (raw.presets || []).map(p => ({
    id: newId(), name: p.name, layout: p.layout || 'grid', sound: 1,
    screens: Object.fromEntries(Object.entries(p.screens || {}).map(([n, s]) =>
      [n, { url: s.url, name: s.label || s.service || '', siteId: byName[s.service] || null }]))
  }));
  return {
    layout: raw.layout,
    displayId: raw.displayId ?? null,
    gap: raw.gap ?? 0,
    audioFollowsFocus: raw.audioFollowsFocus ?? true,
    sites: sites.length ? sites : undefined,
    views
  };
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '');
}
