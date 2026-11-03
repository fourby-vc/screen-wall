// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The public web demo's pretend projector: draws the windows the extension would open, at the
// places it would put them, and plays YouTube videos in them. Reads the mocked windows and tabs
// (dev/mock-chrome.js), so layouts, swaps, Back and sound all show up here. Streaming services can't
// play inside another site, so their screens show a note instead. Only used by dev/build-demo.py.

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const mock = window.__mock;
let soundOn = false;           // nothing plays aloud until the visitor asks
const tiles = new Map();       // tabId -> { el, frame, url, muted }

function youTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === '/watch') return u.searchParams.get('v');
  } catch {}
  return null;
}

function embedUrl(id) {
  const p = new URLSearchParams({ autoplay: 1, mute: 1, loop: 1, playlist: id, controls: 0, rel: 0,
    playsinline: 1, enablejsapi: 1, origin: location.origin });
  return `${YT_ORIGIN}/embed/${id}?${p}`;
}

function tell(frame, func) {
  try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT_ORIGIN); } catch {}
}

function applySound(t) {
  if (!t.frame) return;
  const loud = soundOn && !t.muted;
  tell(t.frame, loud ? 'unMute' : 'mute');
  tell(t.frame, 'playVideo');
}

// Build the frame once, above the panel.
const wrap = document.createElement('section');
wrap.className = 'pretend';
wrap.setAttribute('aria-label', 'Pretend projector');
wrap.innerHTML = `
  <div class="pretend-head">
    <span class="pretend-label">Your projector <em>(pretend)</em></span>
    <button type="button" class="pretend-sound" aria-pressed="false">Turn sound on</button>
  </div>
  <div class="pretend-screen"><div class="pretend-empty">No screens open. Click a site's <b>1&nbsp;2&nbsp;3&nbsp;4</b> in the panel below.</div></div>
  <p class="pretend-note">Click a screen here or in the panel to move the sound. Videos play from YouTube. Streaming services play only in your own Chrome windows, signed in as you.</p>`;
(document.querySelector('.demo-banner') || document.body.firstElementChild).after(wrap);
const screenEl = wrap.querySelector('.pretend-screen');
const emptyEl = wrap.querySelector('.pretend-empty');
const soundBtn = wrap.querySelector('.pretend-sound');

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.textContent = soundOn ? 'Turn sound off' : 'Turn sound on';
  tiles.forEach(applySound);
});

// The display the wall is on: the one holding most window centres, else the projector.
function pickDisplay(displays, wins) {
  const holds = (d, w) => {
    const x = w.left + w.width / 2, y = w.top + w.height / 2, b = d.workArea;
    return x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height;
  };
  let best = displays.find(d => !d.isPrimary) || displays[0], most = -1;
  for (const d of displays) {
    const n = wins.filter(w => holds(d, w)).length;
    if (n > most) { most = n; best = d; }
  }
  return best;
}

let displays = [];
chrome.system.display.getInfo().then(d => { displays = d; });

async function render() {
  if (!displays.length) return;
  const { slots = {} } = await chrome.storage.session.get('slots');
  const slotOfTab = Object.fromEntries(Object.entries(slots).map(([n, s]) => [s.tabId, Number(n)]));
  const wins = Object.values(mock.windows);
  const d = pickDisplay(displays, wins);
  const area = d.workArea;
  screenEl.style.aspectRatio = `${area.width} / ${area.height}`;

  const seen = new Set();
  for (const tab of Object.values(mock.tabs)) {
    const w = mock.windows[tab.windowId];
    if (!w) continue;
    seen.add(tab.id);
    let t = tiles.get(tab.id);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'pretend-win';
      el.innerHTML = '<div class="pretend-bar"><span class="pretend-name"></span><span class="pretend-badge">Sound</span></div><div class="pretend-body"></div><button type="button" class="pretend-hit"></button>';
      el.querySelector('.pretend-hit').addEventListener('click', () => {
        const n = slotOfTabNow(tab.id);
        if (n) chrome.runtime.sendMessage({ cmd: 'audio', slot: n });
      });
      screenEl.appendChild(el);
      t = { el, frame: null, url: null, muted: true };
      tiles.set(tab.id, t);
    }
    // Position, as a share of the display.
    const pct = (v, total) => `${(v / total * 100).toFixed(3)}%`;
    Object.assign(t.el.style, {
      left: pct(w.left - area.left, area.width), top: pct(w.top - area.top, area.height),
      width: pct(w.width, area.width), height: pct(w.height, area.height)
    });
    // Content follows the tab's address.
    if (t.url !== tab.url) {
      t.url = tab.url;
      const body = t.el.querySelector('.pretend-body');
      const id = youTubeId(tab.url);
      body.textContent = '';
      t.frame = null;
      if (id) {
        const f = document.createElement('iframe');
        f.src = embedUrl(id);
        f.title = tab.title || 'Video';
        f.allow = 'autoplay; encrypted-media; picture-in-picture';
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.addEventListener('load', () => { applySound(t); setTimeout(() => applySound(t), 1200); });
        body.appendChild(f);
        t.frame = f;
      } else {
        let host = tab.url;
        try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
        body.innerHTML = '<div class="pretend-off"><b></b><span>Plays here in its own Chrome window, signed in as you.</span></div>';
        body.querySelector('b').textContent = host;
      }
    }
    const name = (slots[slotOfTab[tab.id]] || {}).name || tab.title || '';
    t.el.querySelector('.pretend-name').textContent = (slotOfTab[tab.id] ? slotOfTab[tab.id] + '  ' : '') + name;
    t.el.querySelector('.pretend-hit').setAttribute('aria-label', `Move the sound to screen ${slotOfTab[tab.id] || ''}`);
    if (t.muted !== tab.muted) { t.muted = tab.muted; applySound(t); }
    t.el.classList.toggle('has-sound', !tab.muted);
  }
  for (const [id, t] of tiles) if (!seen.has(id)) { t.el.remove(); tiles.delete(id); }
  emptyEl.hidden = tiles.size > 0;
  lastSlots = slotOfTab;
}

let lastSlots = {};
function slotOfTabNow(id) { return lastSlots[id]; }

setInterval(render, 300);
