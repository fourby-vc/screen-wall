// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings page: every option as a visual control. Changes save immediately.

import { esc, store, send, saveSettings, layoutIcon, toast, guardTyping } from './common.js';
import { LAYOUTS } from '../core/layouts.js';
import { APP_NAME, APP_SLUG } from '../core/brand.js';
import { parseBackup, LIMITS } from '../core/validate.js';
import { YOUTUBE_ORIGINS } from '../core/youtube.js';

let root;

export function mountSettings(el) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', e => {
    if (e.target.dataset.k === 'gap') e.target.nextElementSibling.textContent = `${e.target.value}px`;
  });
  return guardTyping(root, draw);
}

const toggle = (key, checked, label, help) => `
  <label class="toggle-row">
    <span><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span>
    <span class="switch"><input type="checkbox" data-k="${key}"${checked ? ' checked' : ''}><span></span></span>
  </label>`;

function draw() {
  const s = store.settings;

  root.innerHTML = `
  <div class="settings">
    <section class="card">
      <h2>Wall</h2>
      <p class="hint">Choose the display for the wall from the menu at the top of the Wall page.</p>
      <div class="setting column">
        <span><b>Layout</b><small>How the screens are arranged.</small></span>
        <div class="layout-choices">
          ${LAYOUTS.map(l => `<button type="button" data-layout="${l.id}" class="layout-choice${l.id === s.layout ? ' on' : ''}" title="${esc(l.hint)}">${layoutIcon(l.id, n => `<em>${l.id === 'focus' ? '' : n}</em>`)}<span>${esc(l.label)}</span></button>`).join('')}
        </div>
      </div>
      <div class="setting">
        <span><b>Gap between screens</b><small>A thin gap makes the screens easier to tell apart.</small></span>
        <span class="range"><input type="range" min="0" max="24" step="2" data-k="gap" value="${esc(s.gap)}"><output>${esc(s.gap)}px</output></span>
      </div>
    </section>

    <section class="card">
      <h2>Sound</h2>
      ${toggle('audioFollowsFocus', s.audioFollowsFocus, 'Sound follows click', 'Clicking a screen gives it the sound and mutes the others.')}
    </section>

    <section class="card">
      <h2>YouTube</h2>
      ${toggle('tidyYouTube', s.tidyYouTube, 'Tidy YouTube', 'On a video page, hide YouTube’s top bar and let the video fill the screen. Only affects youtube.com on the wall’s screens, not YouTube TV or your other tabs. Chrome asks for youtube.com access when you turn it on; turning it off gives that access back.')}
    </section>

    <section class="card">
      <h2>Keyboard shortcuts</h2>
      <div class="shortcuts">
        ${store.commands.filter(c => c.description).map(c => `<div class="shortcut"><span>${esc(c.description)}</span><kbd class="${c.shortcut ? '' : 'unset'}">${esc(c.shortcut || 'Not set')}</kbd></div>`).join('') || '<p class="hint">Shortcuts appear here once the extension is installed.</p>'}
      </div>
      <button data-a="shortcuts">Change shortcuts</button>
    </section>

    <section class="card">
      <h2>About</h2>
      <div class="setting">
        <span><b>${esc(APP_NAME)} ${esc(chrome.runtime.getManifest?.().version || '')}</b><small>Nothing you do here leaves your computer: no accounts, no tracking, no data collection.</small></span>
      </div>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p class="hint">Sites, saved views and settings in one file. Use it to move to another computer.</p>
      <div class="row">
        <button data-a="export">Export</button>
        <button data-a="import">Import</button>
        <span class="spacer"></span>
        <button data-a="reset" class="ghost danger">Reset everything</button>
      </div>
    </section>
  </div>`;
}

async function onClick(e) {
  const layoutBtn = e.target.closest('[data-layout]');
  if (layoutBtn) return send({ cmd: 'layout', layout: layoutBtn.dataset.layout });

  const a = e.target.closest('button[data-a]')?.dataset.a;
  if (a === 'import') return pickBackup();
  if (a === 'shortcuts') chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  if (a === 'export') {
    const blob = new Blob([JSON.stringify(store.settings, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${APP_SLUG}-settings.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (a === 'reset' && confirm('Reset sites, saved views and every setting to the defaults?')) {
    await send({ cmd: 'reset' });
    toast('Everything is back to the defaults.');
  }
}

async function onChange(e) {
  const t = e.target;

  const k = t.dataset.k;
  if (!k) return;
  // Ask for youtube.com access first (needs this click). Turning off is handled by the background,
  // which removes the style sheet from the screens and then gives the access back.
  if (k === 'tidyYouTube' && t.checked) {
    const granted = await chrome.permissions.request({ origins: YOUTUBE_ORIGINS }).catch(() => false);
    if (!granted) { t.checked = false; return toast('Tidy YouTube needs youtube.com access to work.'); }
  }
  const value = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value || null;
  saveSettings({ [k]: value }, k === 'gap');
}

// The file input is created on demand rather than rendered into the page. The page redraws whenever a
// screen's title changes, and a redraw while the file picker was open would swallow the chosen file.
function pickBackup() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => { if (input.files[0]) importBackup(input.files[0]); });
  input.click();
}

async function importBackup(file) {
  // The file is untrusted: size cap, then a strict schema check (core/validate.js) before anything is replaced.
  if (file.size > LIMITS.backupBytes) return toast('Couldn’t import that file: it is larger than 1 MB.');
  let r;
  try { r = parseBackup(await file.text()); } catch { r = { ok: false, error: 'The file could not be read' }; }
  if (!r.ok) return toast(`Couldn’t import that file: ${r.error}.`);
  const { sites, views } = r.summary;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (!confirm(`Replace your current sites, saved views and settings with this backup?\n\n${plural(sites, 'site')} and ${plural(views, 'saved view')}.`)) return;
  const ok = await send({ cmd: 'import', settings: r.settings });
  if (ok !== undefined) toast('Settings imported.');
}
