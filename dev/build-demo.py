#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Builds the public web demo: the real control panel running on example data in any browser.

    python3 dev/build-demo.py                 # writes dist/demo/
    STORE_URL=https://... python3 dev/build-demo.py

Copies the extension, adds dev/mock-chrome.js (a stand-in for Chrome's APIs), dev/demo-seed.js
(four films on screen and some saved views) and dev/demo-display.js (a pretend projector that plays
them where the windows would go), and puts a "Live demo" banner on top. Nothing here ships in the extension.

Links in the banner: STORE_URL (Chrome Web Store listing; left out while empty) and REPO_URL (the
GitHub repo; on GitHub Actions it is filled in automatically).
"""
import html
import json
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "demo")
SHIP = ["manifest.json", "background.js", "dashboard.html", "dashboard.css", "dashboard.js", "core", "ui", "icons", "_locales"]
HOOK = '<script type="module" src="dashboard.js"></script>'
CSP = "script-src 'self'; object-src 'none'; base-uri 'none'"

STORE_URL = os.environ.get("STORE_URL", "").strip()
REPO_URL = os.environ.get("REPO_URL", "").strip()
if not REPO_URL and os.environ.get("GITHUB_REPOSITORY"):
    REPO_URL = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ['GITHUB_REPOSITORY']}"


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(os.path.join(OUT, path), "w", encoding="utf-8") as f:
        f.write(text)


def link(url, label, primary=False):
    if not url.startswith("https://"):
        return ""
    cls = "demo-btn primary" if primary else "demo-btn"
    return f'<a class="{cls}" href="{html.escape(url)}" target="_blank" rel="noopener">{label}</a>'


def main():
    name = json.loads(read("_locales/en/messages.json"))["appName"]["message"]
    version = json.loads(read("manifest.json"))["version"]

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, "demo"))
    for item in SHIP:
        src = os.path.join(ROOT, item)
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, os.path.join(OUT, item))

    # The mock reports a fixed version; show the real one in Settings → About.
    write("demo/mock-chrome.js", read("dev/mock-chrome.js").replace("version: '1.0.0'", f"version: '{version}'"))
    write("demo/seed.js", read("dev/demo-seed.js"))  # same ../core/ path works from demo/
    write("demo/display.js", read("dev/demo-display.js"))
    write("demo/display.css", read("dev/demo-display.css"))

    store = link(STORE_URL, "Add to Chrome", primary=True) or '<span class="demo-soon">Coming to the Chrome Web Store</span>'
    banner = f"""<style>
.demo-banner{{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:10px max(16px,env(safe-area-inset-left,0px));background:#e8a317;color:#1f1400;font:14px/1.45 system-ui,sans-serif}}
.demo-banner p{{margin:0;flex:1 1 320px;min-width:0}}
.demo-banner b{{font-weight:700}}
.demo-banner .demo-links{{display:flex;gap:8px;flex-wrap:wrap}}
.demo-btn{{color:#1f1400;text-decoration:none;font-weight:600;padding:5px 12px;border-radius:6px;border:1px solid rgba(31,20,0,.35);white-space:nowrap}}
.demo-btn.primary{{background:#1f1400;color:#fff;border-color:#1f1400}}
.demo-btn:focus-visible{{outline:2px solid #1f1400;outline-offset:2px}}
.demo-soon{{font-weight:600;white-space:nowrap}}
</style>
<div class="demo-banner" role="note">
  <p><b>Live demo.</b> The pretend projector shows what {html.escape(name)} does to your display; below it is the real control panel. Click a site's <b>1&nbsp;2&nbsp;3&nbsp;4</b>, click a screen to move the sound, drag one screen onto another, or try a saved view. In Chrome it places real windows on your display.</p>
  <div class="demo-links">{store}{link(REPO_URL, "Code on GitHub")}</div>
</div>
"""
    page = read("dashboard.html")
    if HOOK not in page or "<body>" not in page:
        raise SystemExit("dashboard.html changed: update dev/build-demo.py")
    page = page.replace("<title>Control panel</title>", f"<title>{html.escape(name)}: live demo</title>")
    page = page.replace("<head>", f'<head>\n<meta http-equiv="Content-Security-Policy" content="{CSP}">', 1)
    page = page.replace("</head>", '<link rel="stylesheet" href="demo/display.css">\n</head>', 1)
    page = page.replace("<body>", "<body>\n" + banner, 1)
    page = page.replace(HOOK, '<script src="demo/mock-chrome.js"></script>\n'
                              '<script type="module" src="background.js"></script>\n'
                              '<script type="module" src="demo/seed.js"></script>\n'
                              '<script type="module" src="demo/display.js"></script>\n' + HOOK)
    write("index.html", page)
    write("dashboard.html", page)
    write(".nojekyll", "")  # GitHub Pages: serve folders starting with "_" (the _locales folder) as-is
    print(f"Built {OUT} ({name} {version})")


if __name__ == "__main__":
    main()
