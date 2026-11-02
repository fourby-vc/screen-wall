// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// URL helpers shared by the worker and the panel. Pure module.

export const normalizeUrl = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s;
};

export const hostOf = u => { try { return new URL(normalizeUrl(u)).hostname; } catch { return ''; } };

// "www.peacocktv.com" → "peacocktv.com"; handles two-part country suffixes like "co.uk".
export function baseDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last = parts[parts.length - 1], second = parts[parts.length - 2];
  const twoPartSuffix = last.length === 2 && ['co', 'com', 'net', 'org', 'gov', 'ac'].includes(second);
  return parts.slice(twoPartSuffix ? -3 : -2).join('.');
}

// A friendly name from a URL: "https://www.peacocktv.com/" → "Peacocktv".
export function nameFromUrl(url) {
  const base = baseDomain(hostOf(url)).split('.')[0] || 'Site';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Which saved site a URL belongs to: same host first (tv.youtube.com ≠ www.youtube.com), then same base domain.
export function siteForUrl(sites, url) {
  const host = hostOf(url);
  if (!host) return null;
  const b = baseDomain(host);
  return sites.find(s => hostOf(s.url) === host) || sites.find(s => baseDomain(hostOf(s.url)) === b) || null;
}
