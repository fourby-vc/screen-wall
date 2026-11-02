# Contributing

Thanks for helping with Screen Wall. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug or asking for a feature

Open an issue and pick the matching template. For bugs, include your Chrome version, your operating system and the steps that make it happen.

Security or privacy problems go through private reporting instead of a public issue. See [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Load the folder in Chrome (`chrome://extensions` → **Developer mode** → **Load unpacked**) and make your change.
3. Run the checks:

   ```bash
   node dev/run-tests.mjs
   ```

4. Try the panel in a normal tab with `chrome.*` mocked, if your change touches the UI:

   ```bash
   python3 dev/serve.py
   ```

5. Open a pull request and fill in the template. The checks run automatically on every pull request.

Keep each pull request to one change. Small, focused pull requests are reviewed faster.

## Ground rules for the code

- **No network requests.** The extension's own code never contacts a server, and no analytics or tracking code is accepted.
- **No new permissions without discussion.** Open an issue first if a change needs a new permission in `manifest.json`, and explain why in the README's permissions table.
- **No remote code.** Everything runs from files in this repository under the strict Content Security Policy. No `eval`, no scripts loaded from the web.
- **Escape everything shown on the page.** Any text that reaches `innerHTML` goes through `esc()` from `ui/common.js`, because site names and page titles come from websites.
- **Only `http:` and `https:` links.** Run any address through `safeUrl()` before it can open in a window.
- **Pure logic lives in `core/`** with no `chrome.*` calls, so `dev/run-tests.mjs` can test it in Node. Add a check there for new logic.
- **No build step and no dependencies.** Plain JavaScript modules, loaded as they are.

## Licence of contributions

This project is licensed under the [Mozilla Public License 2.0](LICENSE). By submitting a pull request, you agree that your contribution is licensed under the MPL-2.0 as well.

New source files start with the MPL-2.0 notice, as the existing ones do:

```js
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
```

Only submit code you wrote yourself or code under a licence compatible with the MPL-2.0, and say where any copied code came from.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
