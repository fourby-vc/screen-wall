# Screen Wall

[![Checks](https://github.com/fourby-vc/screen-wall/actions/workflows/checks.yml/badge.svg)](https://github.com/fourby-vc/screen-wall/actions/workflows/checks.yml)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)

Watch up to four sites at once on one big screen. Each screen is a bare Chrome window (no address bar, tabs or bookmarks) snapped into a grid on the display you choose.

## What it does

- **Wall view.** The panel draws your display as a map, with each screen in its real place in the layout. Click a screen to give it the sound, drag one screen onto another to swap them, or drag a site from the list onto a screen to open it there. Hover a screen for Edit, Reload, Show and Close.
- **Edit view.** One card per screen with its link box, Back and Forward, recent pages and Swap. Switch between the two views above the screens; the panel remembers your choice. Clicking an empty screen in Wall view takes you straight to its link box.
- **Saved views.** Save a full setup, such as "NFL Sunday" (sites, layout and which screen has sound), and open it in one click. You can also open a view from the toolbar icon's right-click menu, or with ⌥⇧1 for the first view.
- **Back.** Before the wall changes (opening a view, opening a site on a screen that's in use, closing screens, changing the layout), the panel saves what was there. **Back** in the header puts it back. The menu arrow next to it lists the last 10 walls by time and sites, so you can jump to any of them. Going back is undoable too. The list is cleared when Chrome quits.
- **Back and Forward on each screen.** In Edit view, every screen card has Back and Forward buttons for that window's own history, a Home button to return to the page the screen opened with, and a **Recent pages** menu listing the last 15 pages it showed (title, address and time) so you can jump straight to one. The list is kept per screen and cleared when Chrome quits.
- **Your sites.** Keep a list of the sites you use. Each one shows its icon and **1 2 3 4** buttons that open it on that screen. Click several numbers to put the same site on several screens, or drag the site onto the wall. Add, rename, delete and drag to reorder. Pasting any link onto a screen still works. New installs start with 8 services (YouTube TV, ESPN, Peacock, Paramount+, Fox One, Prime Video, YouTube, Netflix). Ten more, such as HBO Max, Hulu, Fubo and Sling TV, sit under **Quick add** for one-click adding.
- **Layouts and display.** Single, Side by side, 1 + 2, 2 × 2 and 1 + 3, with an optional gap between screens. The menu next to the layout buttons picks the display the wall goes on.
- **Sound.** One screen plays at a time, and amber always marks the one that does. Click a screen, press **1**–**4** in the panel, or press ⌥⇧A anywhere to move the sound. Swapping two screens keeps the sound with its page. **Mute all**, **Snap** and **Close all** (which asks for a second click) are in the **⋯** menu.
- **Tidy YouTube.** Off by default. When it's on, a YouTube video on a screen fills the window: YouTube's top bar, suggestions and comments are hidden. Other YouTube pages (home, search, channels) look normal, and YouTube TV and your own tabs are never touched. If you put YouTube on a screen while it's off, the panel offers to turn it on once per screen, with a **Don't ask again** button.
- **Settings page.** Layout, gap, sound, Tidy YouTube, a shortcut list, and backup export and import.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repository folder.
4. The control panel opens on first install.
5. Pin the extension: click the puzzle-piece icon, then the pin.
6. Sign in to each streaming service once, in a normal Chrome tab. The screens share those logins.

## Shortcuts

Change any of these at `chrome://extensions/shortcuts`, or from **Settings → Keyboard shortcuts**.

| Keys | Action |
|---|---|
| ⌥⇧D | Open the control panel |
| ⌥⇧A | Move the sound to the next screen |
| ⌥⇧1 | Open saved view 1 |
| (unset) | Open saved view 2 or 3; sound to screen 1–4; snap every screen back into the layout |

## Privacy & security

- **Collects nothing.** No accounts, analytics or tracking. Your sites, views and settings stay in `chrome.storage.local` on your computer. Wall history (Back) and each screen's recent pages live in `chrome.storage.session` and are gone when Chrome quits.
- **No network requests.** The extension's own code never contacts a server. The only pages that load are the sites you open on a screen.
- **No access to websites unless you turn on Tidy YouTube.** Out of the box it can't read or change any website. Tidy YouTube asks Chrome for access to `www.youtube.com` only, and only when you switch it on. It then adds a style sheet (CSS, no script) to YouTube pages in the wall's own screens. Turning it off removes the style sheet and gives the access back. The extension never injects scripts into pages.
- **Locked-down pages.** A strict Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'none'`) allows only the extension's own scripts. There's no `eval` and no remote code.
- **Only web links open.** Anything that becomes a screen, a site or a saved view must be an `http:` or `https:` address. `javascript:`, `data:`, `file:`, `chrome:` and other schemes are refused.
- **Backups are checked before import.** A backup file is capped at 1 MB and checked field by field (known keys only, types, lengths, list sizes, every link). A file that fails is rejected whole, and you see a summary before a valid one replaces your data.

### Permissions

| Permission | Why |
|---|---|
| `tabs` | Reads the title and current address of the four screen windows. The panel shows the titles and each screen's recent pages, and Back and "Save wall as view" save the page each screen is on now, not just the one it opened with. Back and Forward on a screen use `chrome.tabs.goBack` and `goForward` on that window only. It's also used to find an open control panel instead of opening a second one. Chrome describes this permission as "Read your browsing history" at install. The extension only looks at its own screen windows and its own panel, and stores nothing beyond what Back and saved views need. |
| `storage` | Saves your sites, views and settings on this computer, and the wall history for the current Chrome session. |
| `system.display` | Lists your displays so the wall goes on the one you choose. |
| `favicon` | Shows site icons from Chrome's own favicon cache. |
| `contextMenus` | Adds your saved views to the toolbar icon's right-click menu. |
| `scripting` | Adds and removes the Tidy YouTube style sheet. On its own it gives no access to any site. |
| `https://www.youtube.com/*` (optional) | Asked for only when you turn on Tidy YouTube, and given back when you turn it off. Lets the style sheet be added to YouTube screens. |

Opening, placing and muting windows uses the `chrome.windows` and `chrome.tabs` APIs, which need no extra permission. To report a security problem, see [SECURITY.md](SECURITY.md).

## Tips and limits

- **Stream limits.** Each service caps how many streams one account can play at once. YouTube TV's base plan allows 3. Spread what you watch across services.
- **Title bars.** macOS keeps a thin title bar (about 28px) on every window. Chrome can't remove it.
- **Projector as the only display.** Turn on *System Settings → Control Center → Automatically hide the menu bar* and *Desktop & Dock → Automatically hide the Dock*.
- **Saved views and live games.** A view saves the page each screen opens, not a particular game. For live TV, point it at a channel or guide page, since game pages change every week.
- **Back restores pages, not playback.** It reopens each screen's page; a stream starts again from wherever that site starts it.

## For developers

```
manifest.json        Manifest V3
background.js        Service worker: windows, layouts, sound, saved views, wall history, menus, shortcuts
dashboard.*          Control panel (Wall and Settings pages)
core/                Pure logic shared by worker and panel: defaults + migration, layouts, URL helpers,
                     history.js (Back snapshots), pages.js (recent pages per screen), validate.js (URL and backup checks), brand.js (product name),
                     youtube.js (Tidy YouTube style sheet)
_locales/en/         Product name and store description
ui/                  Panel components: screens, sites, saved views, settings, demo mode
icons/               Generated by dev/make-icons.py
dev/                 Not shipped: mock chrome.* APIs, preview server, unit checks, packaging
```

**Checks:**

```bash
node dev/run-tests.mjs
```

```bash
python3 dev/serve.py
```

The server prints the address of a local preview (port 8765 unless you pass another, as in `python3 dev/serve.py 8800`). It runs the real panel and background worker with `chrome.*` mocked and sends the same Content Security Policy as the manifest. Inspect `__mock` in the browser console to see windows, tabs, mute states and menu items. Site icons show as letter badges in the preview, because Chrome's built-in favicon service only exists inside the extension.

**Screenshots:** open the panel with `?demo` on the end of its address (for example `chrome-extension://<id>/dashboard.html?demo`). That puts example sites on all four screens, four saved views and two history entries, using your real site icons. Nothing opens or saves in demo mode.

**Package for the Chrome Web Store** (leaves out `dev/`, this README and the other contributor docs):

```bash
sh dev/package.sh
```

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run the checks and the ground rules for changes, and the [Code of Conduct](CODE_OF_CONDUCT.md).

## How it's made

Built with the help of Claude Code (an AI coding assistant). I direct the design, review the changes and test the extension on my own setup, and the unit checks run in CI. Bug reports are welcome.

## License

[Mozilla Public License 2.0](LICENSE). You can use, change and share this code, including in other projects. Changes to these files that you distribute must stay under the MPL-2.0.
