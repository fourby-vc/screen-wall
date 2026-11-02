// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Wall layouts. Each tile is [x, y, width, height] as fractions of the display, so the same data
// places real windows and draws the little diagrams in the panel.

export const LAYOUTS = [
  { id: 'focus', label: 'Single',       hint: 'The screen with sound, full size',
    tiles: { 1: [0, 0, 1, 1] } },             // tile 1 stands for "whichever screen has sound"
  { id: 'pair',  label: 'Side by side', hint: 'Screens 1 and 2',
    tiles: { 1: [0, 0, 1 / 2, 1], 2: [1 / 2, 0, 1 / 2, 1] } },
  { id: 'main2', label: '1 + 2',        hint: 'One large screen and two small',
    tiles: { 1: [0, 0, 2 / 3, 1], 2: [2 / 3, 0, 1 / 3, 1 / 2], 3: [2 / 3, 1 / 2, 1 / 3, 1 / 2] } },
  { id: 'grid',  label: '2 × 2',        hint: 'Four equal screens',
    tiles: { 1: [0, 0, 1 / 2, 1 / 2], 2: [1 / 2, 0, 1 / 2, 1 / 2], 3: [0, 1 / 2, 1 / 2, 1 / 2], 4: [1 / 2, 1 / 2, 1 / 2, 1 / 2] } },
  { id: 'main',  label: '1 + 3',        hint: 'One large screen and three small',
    tiles: { 1: [0, 0, 2 / 3, 1], 2: [2 / 3, 0, 1 / 3, 1 / 3], 3: [2 / 3, 1 / 3, 1 / 3, 1 / 3], 4: [2 / 3, 2 / 3, 1 / 3, 1 / 3] } }
];

export const getLayout = id => LAYOUTS.find(l => l.id === id) || LAYOUTS.find(l => l.id === 'grid');

// Screens a layout shows. "Single" can show any one screen, so treat all four as usable.
export const slotsFor = id => (id === 'focus' ? [1, 2, 3, 4] : Object.keys(getLayout(id).tiles).map(Number));

// Pixel rect per screen for a display work area, or null for screens the layout hides.
export function computeRects(layoutId, area, gap = 0, soundSlot = 1) {
  const layout = getLayout(layoutId);
  const out = { 1: null, 2: null, 3: null, 4: null };
  const place = ([x, y, w, h]) => {
    const half = gap / 2;
    const left = area.left + x * area.width + (x > 0 ? half : 0);
    const right = area.left + (x + w) * area.width - (x + w < 1 ? half : 0);
    const top = area.top + y * area.height + (y > 0 ? half : 0);
    const bottom = area.top + (y + h) * area.height - (y + h < 1 ? half : 0);
    return { left: Math.round(left), top: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
  };
  if (layout.id === 'focus') {
    out[soundSlot >= 1 && soundSlot <= 4 ? soundSlot : 1] = place(layout.tiles[1]);
    return out;
  }
  for (const [n, tile] of Object.entries(layout.tiles)) out[n] = place(tile);
  return out;
}
