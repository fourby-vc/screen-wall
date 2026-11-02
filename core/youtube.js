// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Tidy YouTube: a style sheet for www.youtube.com on the wall's screens only. On a video page it hides
// YouTube's top bar and lets the player fill the window; every other YouTube page is left alone.
// Pure module: no chrome.* calls, so Node can test it.

// Asked for at runtime when the setting is turned on (manifest optional_host_permissions).
// YouTube TV (tv.youtube.com) is a different site and never matches.
export const YOUTUBE_ORIGINS = ['https://www.youtube.com/*'];

export function isYouTube(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.youtube.com';
  } catch { return false; }
}

// YouTube is a single-page app: ytd-watch-flexy stays in the page after you leave a video but gets
// [hidden], so every rule is keyed to a visible watch page. Dialogs (z-index 2201+) still show on top.
const W = 'ytd-watch-flexy:not([hidden])';
export const TIDY_CSS = `
html:has(${W}) #masthead-container { display: none !important; }
html:has(${W}), html:has(${W}) body { overflow: hidden !important; }
${W} #movie_player {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  z-index: 2000 !important; background: #000 !important;
}
${W} #movie_player .html5-video-container { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
${W} #movie_player video.html5-main-video {
  width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important;
}
${W} #movie_player .ytp-chrome-bottom { width: calc(100% - 24px) !important; left: 12px !important; }
`;
