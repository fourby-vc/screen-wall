// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Starts the public web demo with a filled wall: four films playing, sound on screen 1 and a few
// saved views. The films are Blender Studio open movies (CC BY) on YouTube, because streaming
// services can't play inside another website. The usual services stay in the site list after them.
// Runs after dev/mock-chrome.js and background.js, through the same messages the panel sends, so
// everything after this behaves like the real extension. Only used by dev/build-demo.py.

import { DEFAULT_SITES } from '../core/defaults.js';

const yt = id => `https://www.youtube.com/watch?v=${id}`;
const FILMS = [
  { id: 'film-bunny',   name: 'Big Buck Bunny',  url: yt('aqz-KE-bpKQ') },
  { id: 'film-sintel',  name: 'Sintel',          url: yt('eRsGyueVLvQ') },
  { id: 'film-steel',   name: 'Tears of Steel',  url: yt('R6MlUcmOul8') },
  { id: 'film-spring',  name: 'Spring',          url: yt('WhWc3b3KhnY') },
  { id: 'film-cosmos',  name: 'Cosmos Laundromat', url: yt('Y-rmzh0PI3c') },
  { id: 'film-charge',  name: 'Charge',          url: yt('UXqq0ZvbOnk') }
];
const SITES = [...FILMS, ...DEFAULT_SITES];

const site = id => SITES.find(s => s.id === id);
const target = id => { const s = site(id); return s && { url: s.url, name: s.name, siteId: s.id }; };
const screens = ids => Object.fromEntries(ids.map((id, i) => [i + 1, target(id)]).filter(([, t]) => t));
const send = msg => chrome.runtime.sendMessage(msg);

const VIEWS = [
  { name: 'Four films',      layout: 'grid', sound: 1, sites: ['film-bunny', 'film-sintel', 'film-steel', 'film-spring'] },
  { name: 'Big screen + 3',  layout: 'main', sound: 1, sites: ['film-cosmos', 'film-charge', 'film-bunny', 'film-sintel'] },
  { name: 'Side by side',    layout: 'pair', sound: 1, sites: ['film-steel', 'film-spring'] },
  { name: 'Sunday (needs your Chrome)', layout: 'grid', sound: 1, sites: ['youtubetv', 'peacock', 'paramount', 'espn'] }
];

(async () => {
  try {
    await send({ cmd: 'settings', patch: {
      sites: SITES,
      views: VIEWS.map((v, i) => ({ id: 'demo' + i, name: v.name, layout: v.layout, sound: v.sound, screens: screens(v.sites) }))
    } });
    const first = ['film-bunny', 'film-sintel', 'film-steel', 'film-spring'];
    for (let n = 1; n <= first.length; n++) await send({ cmd: 'open', slot: n, target: target(first[n - 1]) });
    await send({ cmd: 'audio', slot: 1 });
  } catch (e) {
    console.warn('Demo setup:', e);
  }
})();
