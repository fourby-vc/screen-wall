#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Builds the upload-ready zip for the Chrome Web Store. Leaves out dev/, the README, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md and dotfiles.
#
#   sh dev/package.sh
#
# Output goes next to this folder (in Screen Wall/): <name>-<version>-store.zip
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
SLUG=$(python3 -c "import json,re; n=json.load(open('_locales/en/messages.json'))['appName']['message']; print(re.sub(r'[^a-z0-9]+','-',n.lower()).strip('-'))")

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
rsync -a --exclude 'dev/' --exclude 'README.md' --exclude 'SECURITY.md' --exclude 'CONTRIBUTING.md' --exclude 'CODE_OF_CONDUCT.md' --exclude '*.zip' --exclude '__pycache__/' --exclude '.*' ./ "$STAGE/"

OUT="$(cd .. && pwd)/$SLUG-$VERSION-store.zip"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" .)
echo "Built $OUT"
