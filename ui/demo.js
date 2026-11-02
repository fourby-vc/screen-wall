// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Demo mode for store screenshots: open dashboard.html?demo
// Fills the panel with example sites on the screens, saved views and a short history, in memory
// only. Nothing is saved and no windows open. Sites come from your list (so favicons are real), or from
// the built-in catalog when you've removed them or they aren't in the starter list.

import { SITE_CATALOG } from '../core/defaults.js';

export const DEMO = new URLSearchParams(location.search).has('demo');

const SCREENS = ['youtubetv', 'peacock', 'paramount', 'espn'];

const VIEWS = [
  { name: 'NFL Sunday',       layout: 'grid',  sound: 1, sites: ['paramount', 'youtubetv', 'foxone', 'nflplus'] },
  { name: 'Sunday Night',     layout: 'main',  sound: 1, sites: ['peacock', 'espn', 'youtubetv', 'prime'] },
  { name: 'Premier League',   layout: 'pair',  sound: 2, sites: ['peacock', 'youtubetv'] },
  { name: 'College Saturday', layout: 'main2', sound: 1, sites: ['espn', 'youtubetv', 'foxone'] }
];

// Example history entries: [minutes ago, layout, site ids].
const HISTORY = [
  [95, 'pair', ['netflix', 'hulu']],
  [40, 'main2', ['espn', 'youtubetv', 'foxone']]
];

// Overwrites the in-memory store after every real load.
export function applyDemo(store) {
  const site = id => store.settings.sites.find(s => s.id === id) || SITE_CATALOG.find(s => s.id === id);
  store.slots = {};
  store.tabs = {};
  SCREENS.forEach((id, i) => {
    const s = site(id);
    if (!s) return;
    const n = i + 1;
    store.slots[n] = { windowId: -n, tabId: -n, url: s.url, name: s.name, siteId: s.id, label: '' };
    store.tabs[n] = { title: s.name, url: s.url };
  });
  store.audio = 1;
  const screensOf = ids => Object.fromEntries(ids.map((id, j) => [j + 1, site(id)]).filter(([, s]) => s)
    .map(([n, s]) => [n, { url: s.url, name: s.name, siteId: s.id, label: '' }]));
  store.pages = {};
  SCREENS.forEach((id, i) => {
    const s = site(id);
    if (s) store.pages[-(i + 1)] = [{ url: s.url, title: s.name, at: Date.now() - 25 * 60000 }];
  });
  store.history = HISTORY.map(([min, layout, ids], i) => ({ id: 'demoh' + i, at: Date.now() - min * 60000, layout, sound: 1, screens: screensOf(ids) }));
  store.settings = {
    ...store.settings,
    layout: 'grid',
    views: VIEWS.map((v, i) => ({ id: 'demo' + i, name: v.name, layout: v.layout, sound: v.sound, screens: screensOf(v.sites) }))
  };
}

// Commands that would open windows or change settings do nothing in demo mode.
export const demoAllows = msg => msg.cmd === 'getSettings';
