// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Product name, kept in one place.
// The name itself lives in _locales/en/messages.json ("appName"), so a rename is a one-line change.

export const APP_NAME = globalThis.chrome?.i18n?.getMessage?.('appName') || 'Extension';
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'extension';
