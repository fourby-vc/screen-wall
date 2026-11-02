// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One-off tips shown in the panel's toast.
//
// Tidy YouTube tip: when a youtube.com page is on a screen and Tidy YouTube is off, offer to turn it on.
// Chrome only lets us ask for youtube.com access during a click, which is why this is a toast with a
// button rather than something the background does. Each screen tab is offered once; "Don't ask again"
// stops it for good (kept in this panel's localStorage, so the settings format doesn't change).

import { SLOTS, store, toast, pref, saveSettings } from './common.js';
import { isYouTube, YOUTUBE_ORIGINS } from '../core/youtube.js';

const OFFERED = 'tidyTipOffered'; // screen tab ids already offered, newest last
const readOffered = () => { try { return JSON.parse(pref.get(OFFERED, '[]')); } catch { return []; } };

export function tidyTip() {
  if (!store.settings || store.settings.tidyYouTube || pref.get('tidyTip') === 'off') return;
  const offered = readOffered();
  const fresh = SLOTS.filter(n => {
    const s = store.slots[n];
    return s && !offered.includes(s.tabId) && isYouTube(store.tabs[n]?.url || s.url);
  });
  if (!fresh.length) return;
  pref.set(OFFERED, JSON.stringify([...offered, ...fresh.map(n => store.slots[n].tabId)].slice(-20)));
  const where = fresh.length === 1 ? `screen ${fresh[0]}` : `screens ${fresh.join(' and ')}`;
  toast(`YouTube is on ${where}. Turn on Tidy YouTube so videos fill the screen?`, [
    { label: 'Turn on', run: turnOn },
    { label: 'Don’t ask again', run: () => { pref.set('tidyTip', 'off'); toast('Tidy YouTube is in Settings if you want it later.'); } }
  ]);
}

function turnOn() {
  // Must be the first thing in the click, or Chrome refuses to show the access prompt.
  chrome.permissions.request({ origins: YOUTUBE_ORIGINS }).then(granted => {
    if (!granted) return toast('Tidy YouTube needs youtube.com access to work.');
    saveSettings({ tidyYouTube: true });
    toast('Tidy YouTube is on. You can turn it off in Settings.');
  }).catch(() => toast('Tidy YouTube needs youtube.com access to work.'));
}
