// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Starts the public web demo with a filled wall: four example screens, sound on screen 1 and a few
// saved views. Runs after dev/mock-chrome.js and background.js, through the same messages the panel
// sends, so everything after this behaves like the real extension. Only used by dev/build-demo.sh.

import { SITE_CATALOG } from '../core/defaults.js';

const site = id => SITE_CATALOG.find(s => s.id === id);
const target = id => { const s = site(id); return s && { url: s.url, name: s.name, siteId: s.id }; };
const screens = ids => Object.fromEntries(ids.map((id, i) => [i + 1, target(id)]).filter(([, t]) => t));
const send = msg => chrome.runtime.sendMessage(msg);

const VIEWS = [
  { name: 'Sunday afternoon', layout: 'grid',  sound: 1, sites: ['paramount', 'youtubetv', 'foxone', 'nflplus'] },
  { name: 'Big game + 3',     layout: 'main',  sound: 1, sites: ['peacock', 'espn', 'youtubetv', 'prime'] },
  { name: 'Two side by side', layout: 'pair',  sound: 1, sites: ['youtube', 'twitch'] }
];

(async () => {
  try {
    await send({ cmd: 'settings', patch: {
      views: VIEWS.map((v, i) => ({ id: 'demo' + i, name: v.name, layout: v.layout, sound: v.sound, screens: screens(v.sites) }))
    } });
    const first = ['youtubetv', 'peacock', 'paramount', 'espn'];
    for (let n = 1; n <= first.length; n++) await send({ cmd: 'open', slot: n, target: target(first[n - 1]) });
    await send({ cmd: 'audio', slot: 1 });
  } catch (e) {
    console.warn('Demo setup:', e);
  }
})();
