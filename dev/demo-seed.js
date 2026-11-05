// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Starts the public web demo with a filled wall: four demo videos playing (from the fourby YouTube
// channel), sound on screen 1 and a few saved views. They're YouTube videos because streaming
// services can't play inside another website. The usual services stay in the site list after them.
// Runs after dev/mock-chrome.js and background.js, through the same messages the panel sends, so
// everything after this behaves like the real extension. Only used by dev/build-demo.py.

import { DEFAULT_SITES } from '../core/defaults.js';

const yt = id => `https://www.youtube.com/watch?v=${id}`;
const VIDEOS = [
  { id: 'demo-1', name: 'Demo 1', url: yt('ZaCXDhj2owA') },
  { id: 'demo-2', name: 'Demo 2', url: yt('jjIuWBB1Dlo') },
  { id: 'demo-3', name: 'Demo 3', url: yt('H3gg79wLHHw') },
  { id: 'demo-4', name: 'Demo 4', url: yt('K2tACyNhdKQ') }
];
const SITES = [...VIDEOS, ...DEFAULT_SITES];

const site = id => SITES.find(s => s.id === id);
const target = id => { const s = site(id); return s && { url: s.url, name: s.name, siteId: s.id }; };
const screens = ids => Object.fromEntries(ids.map((id, i) => [i + 1, target(id)]).filter(([, t]) => t));
const send = msg => chrome.runtime.sendMessage(msg);

const VIEWS = [
  { name: 'All four',        layout: 'grid', sound: 1, sites: ['demo-1', 'demo-2', 'demo-3', 'demo-4'] },
  { name: 'Big screen + 3',  layout: 'main', sound: 1, sites: ['demo-2', 'demo-1', 'demo-3', 'demo-4'] },
  { name: 'Side by side',    layout: 'pair', sound: 1, sites: ['demo-3', 'demo-4'] },
  { name: 'Sunday (needs your Chrome)', layout: 'grid', sound: 1, sites: ['youtubetv', 'peacock', 'paramount', 'espn'] }
];

(async () => {
  try {
    await send({ cmd: 'settings', patch: {
      sites: SITES,
      views: VIEWS.map((v, i) => ({ id: 'demo' + i, name: v.name, layout: v.layout, sound: v.sound, screens: screens(v.sites) }))
    } });
    const first = ['demo-1', 'demo-2', 'demo-3', 'demo-4'];
    for (let n = 1; n <= first.length; n++) await send({ cmd: 'open', slot: n, target: target(first[n - 1]) });
    await send({ cmd: 'audio', slot: 1 });
  } catch (e) {
    console.warn('Demo setup:', e);
  }
})();
