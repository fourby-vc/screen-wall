// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// In-memory stand-in for the chrome.* APIs, so the real background.js and panel run together in an
// ordinary browser tab. Loaded by dev/serve.py before background.js. Never shipped to users.
//
// Inspect from the console: __mock.windows, __mock.tabs, __mock.menus, __mock.origins, __mock.css
// chrome.permissions and chrome.scripting cover only what Tidy YouTube uses: requests are granted, and
// __mock.css lists the tab ids that have the style sheet. There is deliberately no chrome.alarms or chrome.notifications.
(() => {
  const event = () => {
    const fns = [];
    return { addListener: f => fns.push(f), removeListener: f => fns.splice(fns.indexOf(f), 1), fire: (...a) => fns.map(f => f(...a)) };
  };
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const onChanged = event();
  const area = name => {
    const data = {};
    return {
      get: async keys => {
        const ks = keys == null ? Object.keys(data) : [].concat(keys);
        return Object.fromEntries(ks.filter(k => k in data).map(k => [k, clone(data[k])]));
      },
      set: async obj => {
        const changes = {};
        for (const k in obj) { changes[k] = { oldValue: data[k], newValue: clone(obj[k]) }; data[k] = clone(obj[k]); }
        setTimeout(() => onChanged.fire(changes, name));
      },
      remove: async keys => { [].concat(keys).forEach(k => delete data[k]); },
      _data: data
    };
  };

  const mock = { windows: {}, tabs: {}, menus: [], opened: [], origins: [], css: [] };
  window.__mock = mock;
  let nextId = 100;
  const title = url => { try { return 'Page at ' + new URL(url).hostname; } catch { return url; } };

  const msg = event();
  const go = (id, url) => {
    const t = mock.tabs[id];
    t.url = url; t.title = title(url);
    setTimeout(() => chrome.tabs.onUpdated.fire(id, { status: 'complete', url, title: t.title }, t), 50);
  };

  // Read the real locale file so the preview shows the current product name.
  const messages = (() => {
    try { const x = new XMLHttpRequest(); x.open('GET', '_locales/en/messages.json', false); x.send(); return JSON.parse(x.responseText); } catch { return {}; }
  })();

  window.chrome = {
    i18n: { getMessage: key => messages[key]?.message || '' },
    storage: { local: area('local'), session: area('session'), onChanged },
    runtime: {
      id: 'mock-extension',
      getURL: p => p,
      onMessage: msg,
      onInstalled: event(),
      onStartup: event(),
      getManifest: () => ({ version: '1.0.0' }),
      sendMessage: m => new Promise(res => msg.fire(m, { id: 'mock-extension' }, res))
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onRemoved: event(), onFocusChanged: event(),
      create: async o => {
        const id = nextId++, tid = nextId++;
        mock.tabs[tid] = { id: tid, windowId: id, url: o.url, title: title(o.url), muted: false, hist: [o.url], pos: 0 };
        mock.windows[id] = { id, type: o.type, left: o.left, top: o.top, width: o.width, height: o.height, state: 'normal' };
        setTimeout(() => chrome.tabs.onUpdated.fire(tid, { status: 'complete' }, mock.tabs[tid]), 50);
        return { id, tabs: [{ id: tid }] };
      },
      update: async (id, o) => { if (!mock.windows[id]) throw new Error('No window ' + id); Object.assign(mock.windows[id], o); return mock.windows[id]; },
      get: async id => { if (!mock.windows[id]) throw new Error('No window ' + id); return mock.windows[id]; },
      remove: async id => { delete mock.windows[id]; chrome.windows.onRemoved.fire(id); }
    },
    tabs: {
      onUpdated: event(),
      query: async () => [],
      create: async o => { mock.opened.push(o.url); return { id: nextId++ }; },
      get: async id => { if (!mock.tabs[id]) throw new Error('No tab ' + id); return mock.tabs[id]; },
      update: async (id, o) => {
        const t = mock.tabs[id];
        if (!t) throw new Error('No tab ' + id);
        if (o.url) { t.hist = [...t.hist.slice(0, t.pos + 1), o.url]; t.pos = t.hist.length - 1; go(id, o.url); }
        if ('muted' in o) t.muted = o.muted;
        return t;
      },
      reload: async () => {},
      // Each mock tab keeps its own back/forward list, like a real one.
      goBack: async id => { const t = mock.tabs[id]; if (!t || t.pos === 0) throw new Error('Cannot go back'); t.pos--; go(id, t.hist[t.pos]); },
      goForward: async id => { const t = mock.tabs[id]; if (!t || t.pos >= t.hist.length - 1) throw new Error('Cannot go forward'); t.pos++; go(id, t.hist[t.pos]); }
    },
    system: {
      display: {
        onDisplayChanged: event(),
        getInfo: async () => [
          { id: 'mac', name: 'Built-in Display', isPrimary: true, bounds: { width: 1920, height: 1080 }, workArea: { left: 0, top: 25, width: 1920, height: 1055 } },
          { id: 'proj', name: 'Projector', isPrimary: false, bounds: { width: 1920, height: 1080 }, workArea: { left: 1920, top: 0, width: 1920, height: 1080 } }
        ]
      }
    },
    permissions: {
      onRemoved: event(),
      contains: async ({ origins }) => origins.every(o => mock.origins.includes(o)),
      request: async ({ origins }) => { mock.origins = [...new Set([...mock.origins, ...origins])]; return true; },
      remove: async ({ origins }) => {
        mock.origins = mock.origins.filter(o => !origins.includes(o));
        setTimeout(() => chrome.permissions.onRemoved.fire({ origins }));
        return true;
      }
    },
    scripting: {
      insertCSS: async ({ target }) => { if (!mock.css.includes(target.tabId)) mock.css.push(target.tabId); },
      removeCSS: async ({ target }) => { mock.css = mock.css.filter(id => id !== target.tabId); }
    },
    action: { onClicked: event() },
    commands: {
      onCommand: event(),
      getAll: async () => [
        { name: 'open-panel', description: 'Open the control panel', shortcut: '⌥⇧D' },
        { name: 'cycle-audio', description: 'Move sound to the next screen', shortcut: '⌥⇧A' },
        { name: 'view-1', description: 'Open saved view 1', shortcut: '⌥⇧1' },
        { name: 'view-2', description: 'Open saved view 2', shortcut: '' },
        { name: 'view-3', description: 'Open saved view 3', shortcut: '' },
        { name: 'rearrange', description: 'Snap every screen back into the layout', shortcut: '' }
      ]
    },
    contextMenus: {
      onClicked: event(),
      removeAll: async () => { mock.menus = []; },
      create: o => { mock.menus.push(o); }
    }
  };
})();
