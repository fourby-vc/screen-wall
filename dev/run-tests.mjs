// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Unit checks for the pure modules. Run: node dev/run-tests.mjs
import assert from 'node:assert/strict';
import { computeRects, slotsFor, LAYOUTS } from '../core/layouts.js';
import { baseDomain, normalizeUrl, siteForUrl, nameFromUrl } from '../core/sites.js';
import { migrate, DEFAULT_SETTINGS, SETTINGS_VERSION, SITE_CATALOG, STARTER_IDS } from '../core/defaults.js';
import { sameWall, pushSnapshot, describeSnapshot, isEmptyWall, HISTORY_MAX } from '../core/history.js';
import { safeUrl, checkSettings, parseBackup, repairSettings, LIMITS } from '../core/validate.js';
import { pushPage, describePage, PAGES_MAX } from '../core/pages.js';
import { isYouTube, TIDY_CSS, YOUTUBE_ORIGINS } from '../core/youtube.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

const area = { left: 1920, top: 0, width: 1920, height: 1080 };

test('2×2 fills the display in quarters', () => {
  const r = computeRects('grid', area, 0);
  assert.deepEqual(r[1], { left: 1920, top: 0, width: 960, height: 540 });
  assert.deepEqual(r[4], { left: 2880, top: 540, width: 960, height: 540 });
});

test('gap leaves space only between screens, not at the edges', () => {
  const r = computeRects('grid', area, 10);
  assert.equal(r[1].left, 1920);
  assert.equal(r[1].width, 955);
  assert.equal(r[2].left, 2885);
  assert.equal(r[2].left + r[2].width, 3840);
});

test('1 + 3 puts a two-thirds screen on the left', () => {
  const r = computeRects('main', area, 0);
  assert.deepEqual(r[1], { left: 1920, top: 0, width: 1280, height: 1080 });
  assert.deepEqual(r[3], { left: 3200, top: 360, width: 640, height: 360 });
});

test('1 + 2 hides screen 4', () => {
  const r = computeRects('main2', area, 0);
  assert.equal(r[4], null);
  assert.deepEqual(slotsFor('main2'), [1, 2, 3]);
});

test('Single shows only the screen with sound', () => {
  const r = computeRects('focus', area, 0, 3);
  assert.deepEqual(r[3], { left: 1920, top: 0, width: 1920, height: 1080 });
  assert.equal(r[1], null);
});

test('every layout tile stays inside the display', () => {
  for (const l of LAYOUTS) for (const [x, y, w, h] of Object.values(l.tiles)) {
    assert.ok(x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001, l.id);
  }
});

test('base domains, including two-part country suffixes', () => {
  assert.equal(baseDomain('a.b.example.com'), 'example.com');
  assert.equal(baseDomain('www.bbc.co.uk'), 'bbc.co.uk');
});

test('URL helpers', () => {
  assert.equal(normalizeUrl('espn.com'), 'https://espn.com');
  assert.equal(nameFromUrl('https://www.peacocktv.com/'), 'Peacocktv');
  const sites = DEFAULT_SETTINGS.sites;
  assert.equal(siteForUrl(sites, 'https://www.youtube.com/watch?v=x').id, 'youtube');
  assert.equal(siteForUrl(sites, 'https://tv.youtube.com/watch/abc').id, 'youtubetv');
  assert.equal(siteForUrl(sites, 'https://player.peacocktv.com/x').id, 'peacock');
  assert.equal(siteForUrl(sites, 'https://example.org/'), null);
});

test('first run gets defaults', () => {
  const s = migrate(undefined);
  assert.equal(s.version, SETTINGS_VERSION);
  assert.equal(s.sites.length, DEFAULT_SETTINGS.sites.length);
  assert.notEqual(s.sites, DEFAULT_SETTINGS.sites, 'must be a copy');
});

test('site catalog: unique ids, https home pages; starter list is a short subset of it', () => {
  const ids = SITE_CATALOG.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SITE_CATALOG) assert.match(s.url, /^https:\/\/[^/]+\//, s.id);
  for (const id of ['hbomax', 'disney', 'hulu', 'fubo', 'sling', 'dazn', 'tubi']) assert.ok(ids.includes(id), id);
  assert.equal(siteForUrl(SITE_CATALOG, 'https://play.hbomax.com/page/x').id, 'hbomax');
  assert.deepEqual(DEFAULT_SETTINGS.sites.map(s => s.id), STARTER_IDS);
  assert.ok(STARTER_IDS.length <= 10, 'starter list stays short');
  for (const s of DEFAULT_SETTINGS.sites) assert.ok(s, 'every starter id is in the catalog');
});

test('v2 settings: values kept, saved site list left alone, removed features dropped', () => {
  const mine = [{ id: 'a', name: 'A', url: 'https://a.com/', sub: { price: 5 } }];
  const v2 = {
    version: 2, layout: 'main', gap: 4, displayId: 'proj', sites: mine, autoFill: true,
    games: { enabled: false, leagues: ['nfl'], rules: [{ match: 'cbs', siteId: 'a' }], fallbackSiteId: 'a' },
    views: [{ id: 'v', name: 'Sunday', layout: 'grid', sound: 2, fill: true,
      schedule: { enabled: true, days: [0], time: '12:55' }, screens: { 1: { url: 'https://a.com/', name: 'A', siteId: 'a' } } }]
  };
  const s = migrate(v2);
  assert.equal(s.version, SETTINGS_VERSION);
  assert.equal(s.layout, 'main');
  assert.equal(s.gap, 4);
  assert.equal(s.displayId, 'proj');
  assert.deepEqual(s.sites, [{ id: 'a', name: 'A', url: 'https://a.com/' }], 'no new default sites added; old subscription data dropped');
  assert.equal('autoFill' in s, false);
  assert.equal('games' in s, false);
  assert.deepEqual(s.views, [{ id: 'v', name: 'Sunday', layout: 'grid', sound: 2, screens: { 1: { url: 'https://a.com/', name: 'A', siteId: 'a' } } }]);
  assert.equal('subscriptions' in s, false);
});

test('v3 settings lose subscription data; everything else is kept', () => {
  const v3 = { version: 3, layout: 'pair', sites: [{ id: 'a', name: 'A', url: 'https://a.com/', sub: { price: 9, cycle: 'monthly' } }],
    subscriptions: { remindDaysBefore: 3, currency: 'USD' }, views: [] };
  const s = migrate(v3);
  assert.equal(s.version, SETTINGS_VERSION);
  assert.equal(s.layout, 'pair');
  assert.deepEqual(s.sites, [{ id: 'a', name: 'A', url: 'https://a.com/' }]);
  assert.equal('subscriptions' in s, false);
});

test('current settings pass through unchanged; unknown keys dropped', () => {
  const cur = { ...migrate(null), layout: 'pair', stray: 1 };
  const s = migrate(cur);
  assert.equal(s.layout, 'pair');
  assert.equal('stray' in s, false);
  assert.deepEqual(migrate(s), s, 'migrating twice changes nothing');
});

test('v1 config migrates: services → sites, presets → views; rules are dropped', () => {
  const v1 = {
    layout: 'grid', gap: 6,
    services: [{ name: 'YouTube TV', url: 'https://tv.youtube.com/live', color: '#f00' }, { name: 'Paramount+', url: 'https://www.paramountplus.com/', color: '#00f' }],
    rules: [{ match: 'cbs', service: 'Paramount+' }, { match: '*', service: 'YouTube TV' }],
    presets: [{ name: 'Sunday', layout: 'main', screens: { 1: { url: 'https://tv.youtube.com/live', service: 'YouTube TV', label: 'BAL @ BUF' } } }]
  };
  const s = migrate(v1);
  assert.equal(s.version, SETTINGS_VERSION);
  assert.equal(s.gap, 6);
  assert.deepEqual(s.sites.map(x => x.id), ['youtubetv', 'paramountplus']);
  assert.equal('games' in s, false);
  assert.equal('rules' in s, false);
  assert.equal(s.views[0].name, 'Sunday');
  assert.equal(s.views[0].layout, 'main');
  assert.equal('fill' in s.views[0], false);
  assert.equal(s.views[0].screens[1].siteId, 'youtubetv');
});

test('v1 config with no services keeps the default sites', () => {
  const s = migrate({ layout: 'pair', presets: [] });
  assert.equal(s.layout, 'pair');
  assert.equal(s.sites.length, DEFAULT_SETTINGS.sites.length);
});

const wall = (layout, urls, sound = 1) => ({
  layout, sound,
  screens: Object.fromEntries(urls.map((u, i) => [i + 1, u && { url: u, name: 'S' + (i + 1), siteId: null, label: '' }]).filter(([, v]) => v))
});

test('history: same pages, layout and sound count as the same wall', () => {
  const a = wall('grid', ['https://a.com/', 'https://b.com/']);
  assert.ok(sameWall(a, { ...wall('grid', ['https://a.com/', 'https://b.com/']), id: 'x', at: 1 }));
  assert.ok(!sameWall(a, wall('main', ['https://a.com/', 'https://b.com/'])), 'layout');
  assert.ok(!sameWall(a, wall('grid', ['https://a.com/', 'https://b.com/'], 2)), 'sound');
  assert.ok(!sameWall(a, wall('grid', ['https://b.com/', 'https://a.com/'])), 'order');
  assert.ok(!sameWall(a, wall('grid', ['https://a.com/'])), 'one screen fewer');
  assert.ok(isEmptyWall(wall('grid', [])));
});

test('history: no duplicate of the newest entry, and only the last 10 kept', () => {
  let list = [];
  list = pushSnapshot(list, { id: '1', at: 1, ...wall('grid', ['https://a.com/']) });
  const same = pushSnapshot(list, { id: '2', at: 2, ...wall('grid', ['https://a.com/']) });
  assert.equal(same, list, 'unchanged list returned as-is');
  for (let i = 0; i < 15; i++) list = pushSnapshot(list, { id: 'n' + i, at: i, ...wall('grid', [`https://s${i}.com/`]) });
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list.at(-1).id, 'n14');
  assert.equal(list[0].id, 'n5');
});

test('history: menu text lists the time and the screens in order', () => {
  const at = new Date(2026, 10, 1, 14, 14).getTime();
  const snap = { at, layout: 'grid', sound: 1, screens: { 1: { url: 'https://www.peacocktv.com/', name: 'Peacock' }, 3: { url: 'https://tv.youtube.com/live', name: 'YouTube TV' }, 4: { url: 'https://www.example.org/x', name: '' } } };
  assert.match(describeSnapshot(snap, 'en-US'), /^2:14\sPM · Peacock, YouTube TV, example\.org$/);
  assert.match(describeSnapshot({ at, layout: 'grid', screens: {} }, 'en-US'), /· Empty wall$/);
});

// ---------- validation (core/validate.js) ----------

test('safeUrl: http(s) and bare addresses pass, normalized', () => {
  assert.equal(safeUrl('espn.com'), 'https://espn.com/');
  assert.equal(safeUrl('  https://tv.youtube.com/live  '), 'https://tv.youtube.com/live');
  assert.equal(safeUrl('http://example.org/a?b=1#c'), 'http://example.org/a?b=1#c');
  assert.equal(safeUrl('example.com:8080/x'), 'https://example.com:8080/x');
  assert.equal(safeUrl('HTTPS://EXAMPLE.COM'), 'https://example.com/');
});

test('safeUrl: every other scheme, credentials, junk and overlong input are rejected', () => {
  const bad = ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript://%0aalert(1)', 'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'chrome://settings', 'chrome-extension://abc/x.html',
    'about:blank', 'blob:https://a.com/x', 'vbscript:x', 'view-source:https://a.com', 'ftp://a.com', 'mailto:a@b.c',
    'https://user:pw@a.com/', 'https://', '', '   ', null, undefined, 42, {}, 'https://a.com/' + 'x'.repeat(LIMITS.url)];
  for (const u of bad) assert.equal(safeUrl(u), '', String(u).slice(0, 40));
});

const goodBackup = () => ({
  version: SETTINGS_VERSION, layout: 'grid', displayId: 'proj', gap: 4, audioFollowsFocus: true,
  sites: [
    { id: 'a', name: 'Alpha', url: 'https://a.com/' },
    { id: 'b', name: 'Beta', url: 'https://b.com/' }
  ],
  views: [{ id: 'v1', name: 'Sunday', layout: 'pair', sound: 1, screens: { 1: { url: 'https://a.com/', name: 'Alpha', siteId: 'a' }, 2: { url: 'https://b.com/x', name: '', siteId: null } } }]
});

test('backup: a valid export round-trips unchanged, with a summary', () => {
  const text = JSON.stringify(goodBackup());
  const r = parseBackup(text);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.summary, { sites: 2, views: 1 });
  assert.deepEqual(r.settings, goodBackup());
  assert.deepEqual(migrate(r.settings), { ...migrate(null), ...goodBackup() }, 'stored as-is');
  assert.ok(parseBackup(JSON.stringify(migrate(null))).ok, 'a fresh install exports a valid backup');
});

test('backup: not JSON, too large, or not an object is rejected', () => {
  assert.match(parseBackup('{nope').error, /not valid JSON/);
  assert.match(parseBackup(' '.repeat(LIMITS.backupBytes + 1)).error, /larger than 1 MB/);
  for (const t of ['null', '[]', '"x"', '7']) assert.equal(parseBackup(t).ok, false, t);
  assert.match(parseBackup('{}').error, /no site list/);
});

const rejects = (mutate, pattern, label) => {
  const b = goodBackup();
  mutate(b);
  const r = parseBackup(typeof b === 'string' ? b : JSON.stringify(b));
  assert.equal(r.ok, false, label);
  if (pattern) assert.match(r.error, pattern, label);
};

test('backup: unsafe URLs anywhere are rejected', () => {
  rejects(b => { b.sites[0].url = 'javascript:alert(1)'; }, /Site 1 address/, 'site url');
  rejects(b => { b.views[0].screens[1].url = 'chrome://settings'; }, /View 1 screen 1 address/, 'view url');
  rejects(b => { b.views[0].screens[2].url = 'file:///etc/passwd'; }, /address/, 'file url');
});

test('backup: prototype-pollution keys are rejected at any depth', () => {
  for (const json of [
    '{"__proto__":{"polluted":1},"sites":[]}',
    '{"sites":[{"id":"a","name":"A","url":"https://a.com/","__proto__":{"x":1}}]}',
    '{"sites":[],"views":[{"id":"v","name":"V","layout":"grid","sound":1,"screens":{"1":{"url":"https://a.com/","constructor":{"prototype":{"x":1}}}}}]}',
    '{"sites":[],"views":[{"id":"v","name":"V","layout":"grid","sound":1,"screens":{"__proto__":{}}}]}',
    '{"sites":[{"id":"__proto__","name":"A","url":"https://a.com/"}]}'
  ]) {
    const r = parseBackup(json);
    assert.equal(r.ok, false, json);
  }
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.x, undefined);
});

test('backup: oversized lists and strings are rejected', () => {
  rejects(b => { b.sites = Array.from({ length: 10000 }, (_, i) => ({ id: 's' + i, name: 'S', url: 'https://s.com/' })); }, /Too many sites/, '10,000 sites');
  rejects(b => { b.views = Array.from({ length: 51 }, (_, i) => ({ ...b.views[0], id: 'v' + i })); }, /Too many views/, '51 views');
  rejects(b => { b.sites[0].name = 'x'.repeat(61); }, /longer than 60/, 'long name');
  rejects(b => { b.views[0].screens[1].label = 'x'.repeat(81); }, /longer than 80/, 'long label');
  rejects(b => { b.sites[1].id = 'a'; }, /same id/, 'duplicate ids');
});

test('backup: wrong types and out-of-range values are rejected', () => {
  rejects(b => { b.sites = 'lots'; }, /must be a list/, 'sites not array');
  rejects(b => { b.sites[0] = 'https://a.com/'; }, /must be an object/, 'site not object');
  rejects(b => { b.sites[0].name = 42; }, /must be text/, 'name not string');
  rejects(b => { b.layout = 'mosaic'; }, /Layout/, 'unknown layout');
  rejects(b => { b.views[0].layout = '<img>'; }, /layout/, 'view layout');
  rejects(b => { b.views[0].sound = 5; }, /0–4/, 'sound 5');
  rejects(b => { b.views[0].screens = { 5: b.views[0].screens[1] }; }, /unknown key "5"/, 'screen 5');
  rejects(b => { b.displayId = 7; }, /Display id/, 'display id number');
  rejects(b => { b.gap = '4"><script>'; }, /Gap/, 'gap string');
  rejects(b => { b.gap = 999; }, /Gap/, 'gap range');
  rejects(b => { b.audioFollowsFocus = 'yes'; }, /true or false/, 'bool');
  rejects(b => { b.tidyYouTube = 1; }, /Tidy YouTube/, 'tidy bool');
  rejects(b => { b.version = 1; }, /version/, 'version');
  rejects(b => { b.sites[0].sub = { price: 9 }; }, /unknown key "sub"/, 'subscription data');
  rejects(b => { b.subscriptions = {}; }, /unknown key "subscriptions"/, 'subscription settings');
  rejects(b => { b.extra = true; }, /unknown key "extra"/, 'unknown key');
});

test('settings patches are checked the same way; stored junk is dropped, not trusted', () => {
  assert.ok(checkSettings({ layout: 'pair' }, { partial: true }).ok);
  assert.equal(checkSettings({ sites: [{ id: 'x', name: 'X', url: 'javascript:alert(1)' }] }, { partial: true }).ok, false);
  assert.equal(checkSettings({ version: SETTINGS_VERSION, sites: [] }, { partial: true }).ok, true);
  const fixed = repairSettings({ gap: 'bad', layout: 'pair', sites: [{ id: 'ok', name: 'OK', url: 'https://ok.com/' }, { id: 'x', name: 'X', url: 'javascript:alert(1)' }] });
  assert.deepEqual(fixed, { layout: 'pair', sites: [{ id: 'ok', name: 'OK', url: 'https://ok.com/' }] });
  const m = migrate({ version: 3, gap: 'bad', sites: [{ id: 'x', name: 'X', url: 'data:,x' }], views: [{ id: 'v', name: 'V', layout: 'grid', sound: 1, screens: { 1: { url: 'file:///x' } } }] });
  assert.equal(m.gap, 0);
  assert.deepEqual(m.sites, []);
  assert.deepEqual(m.views, []);
});

test('backup import: older backups are upgraded, then strictly checked', () => {
  const v2 = JSON.stringify({ version: 2, layout: 'main', autoFill: true, games: { enabled: true },
    sites: [{ id: 'a', name: 'A', url: 'https://a.com/', sub: { price: 5, cycle: 'monthly' } }],
    views: [{ id: 'v', name: 'Sunday', layout: 'grid', sound: 1, fill: true, schedule: { enabled: true, days: [0], time: '12:00' }, screens: { 1: { url: 'https://a.com/', name: 'A', siteId: 'a' } } }] });
  const r = parseBackup(v2, migrate);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.summary.sites, 1);
  assert.equal(r.summary.views, 1);
  assert.equal('games' in r.settings, false);
  assert.equal('sub' in r.settings.sites[0], false);
  // Without the upgrader an old file is still refused, as before.
  assert.equal(parseBackup(v2).ok, false);
  // A current backup round-trips.
  const cur = migrate(null);
  assert.equal(parseBackup(JSON.stringify(cur), migrate).ok, true);
});

test('backup import: hostile old-format files are still refused', () => {
  const bad = [
    '{"version":2,"sites":[{"id":"a","name":"A","url":"javascript:alert(1)"}]}',
    '{"version":2,"sites":[],"__proto__":{"x":1}}',
    '{"version":1,"services":[{"name":"A","url":"https://a.com","constructor":{}}]}',
    '[1,2,3]', '"text"', 'null', '{"hello":"world"}'
  ];
  for (const text of bad) {
    const r = parseBackup(text, migrate);
    // A bad URL in an old file is dropped by the upgrade; it must never survive into the result.
    if (r.ok) assert.equal(JSON.stringify(r.settings).includes('javascript:'), false, text);
    else assert.ok(r.error, text);
  }
  assert.equal(parseBackup('{"version":2,"sites":[],"__proto__":{"x":1}}', migrate).ok, false);
  assert.equal(parseBackup('{"hello":"world"}', migrate).ok, false);
  assert.equal(({}).x, undefined, 'no prototype pollution');
});

test('recent pages: new pages go on top, title updates replace, revisits move up', () => {
  let l = pushPage([], { url: 'https://a.com/1', title: 'One' }, 1);
  l = pushPage(l, { url: 'https://a.com/2', title: '' }, 2);
  l = pushPage(l, { url: 'https://a.com/2', title: 'Two' }, 3);
  assert.deepEqual(l.map(p => [p.url, p.title]), [['https://a.com/1', 'One'], ['https://a.com/2', 'Two']]);
  assert.equal(l[1].at, 2, 'a title update keeps the visit time');
  const same = pushPage(l, { url: 'https://a.com/2', title: 'Two' }, 4);
  assert.equal(same, l, 'nothing changed, same list back');
  l = pushPage(l, { url: 'https://a.com/1', title: 'One' }, 5);
  assert.deepEqual(l.map(p => p.url), ['https://a.com/2', 'https://a.com/1']);
  assert.equal(describePage({ url: 'https://www.a.com/x?q=1', title: '' }), 'a.com/x');
  assert.equal(describePage({ url: 'https://a.com/', title: 'Home' }), 'Home · a.com');
});

test('recent pages: only web pages are kept, titles are clipped, list is capped', () => {
  for (const url of ['javascript:alert(1)', 'chrome-error://chromewebdata/', 'about:blank', 'data:,x', '', undefined])
    assert.deepEqual(pushPage([], { url, title: 'x' }), [], String(url));
  assert.equal(pushPage([], { url: 'https://a.com/', title: 'x'.repeat(500) })[0].title.length, LIMITS.title);
  let l = [];
  for (let i = 0; i < 40; i++) l = pushPage(l, { url: `https://a.com/${i}`, title: '' }, i);
  assert.equal(l.length, PAGES_MAX);
  assert.equal(l[l.length - 1].url, 'https://a.com/39');
});

test('Tidy YouTube: off by default, youtube.com only, keyed to video pages', () => {
  assert.equal(DEFAULT_SETTINGS.tidyYouTube, false);
  assert.equal(migrate({ version: SETTINGS_VERSION, tidyYouTube: true, sites: [] }).tidyYouTube, true);
  assert.equal(migrate({ version: SETTINGS_VERSION, tidyYouTube: 'yes', sites: [] }).tidyYouTube, false);
  assert.ok(checkSettings({ tidyYouTube: true }, { partial: true }).ok);
  for (const u of ['https://www.youtube.com/watch?v=x', 'https://www.youtube.com/'])
    assert.equal(isYouTube(u), true, u);
  for (const u of ['https://tv.youtube.com/live', 'http://www.youtube.com/watch?v=x', 'https://youtube.com.evil.com/', 'https://m.youtube.com/', 'not a url', undefined])
    assert.equal(isYouTube(u), false, String(u));
  assert.deepEqual(YOUTUBE_ORIGINS, ['https://www.youtube.com/*']);
  // Every rule is scoped to a visible watch page, so YouTube's home and search pages keep their top bar.
  const rules = TIDY_CSS.split('}').map(r => r.trim()).filter(Boolean);
  for (const r of rules) assert.match(r.split('{')[0], /ytd-watch-flexy:not\(\[hidden\]\)/, r);
});

console.log(`\n${passed} checks passed`);
