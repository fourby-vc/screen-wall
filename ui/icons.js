// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One line-icon set for the whole panel (24×24, 1.8 stroke, drawn in the style of Lucide, ISC).
// Inline SVG, so nothing loads from outside and the strict CSP is untouched.

const PATHS = {
  sound:   'M11 5 6 9H2v6h4l5 4V5z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a10 10 0 0 1 0 14',
  mute:    'M11 5 6 9H2v6h4l5 4V5z|m22 9-6 6|m16 9 6 6',
  back:    'M19 12H5|m12 19-7-7 7-7',
  forward: 'M5 12h14|m12 5 7 7-7 7',
  home:    'm3 10.5 9-7.5 9 7.5|M5 9.5V21h14V9.5',
  undo:    'M9 14 4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  chevron: 'm6 9 6 6 6-6',
  more:    'M5 12h.01|M12 12h.01|M19 12h.01',
  edit:    'M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  copy:    'M8 8h12v12H8z|M4 16V4h12',
  close:   'M18 6 6 18|m6 6 12 12',
  plus:    'M12 5v14|M5 12h14',
  grip:    'M9 5h.01|M9 12h.01|M9 19h.01|M15 5h.01|M15 12h.01|M15 19h.01',
  reload:  'M21 12a9 9 0 1 1-2.6-6.4L21 8|M21 3v5h-5',
  show:    'M15 3h6v6|M10 14 21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  snap:    'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z'
};

// icon('sound') → inline <svg>. Decorative: give the button itself an aria-label or text.
export function icon(name, cls = '') {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d.split('|').map(p => `<path d="${p}"/>`).join('')}</svg>`;
}
