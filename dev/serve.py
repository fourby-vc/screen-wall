#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Preview the control panel in a normal browser tab, with the chrome.* APIs mocked.

    python3 dev/serve.py            # then open http://127.0.0.1:8765/dashboard.html

Serves the extension folder and injects dev/mock-chrome.js plus background.js into dashboard.html,
so the real worker logic runs in the same tab. Nothing here ships in the extension.
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
INJECT = '<script src="dev/mock-chrome.js"></script>\n<script type="module" src="background.js"></script>\n'
CSP = "script-src 'self'; object-src 'none'; base-uri 'none'"
HOOK = '<script type="module" src="dashboard.js"></script>'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        # Same policy as manifest.json, so the preview catches anything the real CSP would block.
        self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/dashboard.html"):
            with open(os.path.join(ROOT, "dashboard.html"), encoding="utf-8") as f:
                html = f.read().replace(HOOK, INJECT + HOOK)
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Preview: http://127.0.0.1:{PORT}/dashboard.html")
        httpd.serve_forever()
