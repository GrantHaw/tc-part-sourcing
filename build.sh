#!/usr/bin/env bash
# packages both browser builds into dist/
# same source files either way, only the manifest differs
set -e

cd "$(dirname "$0")"
rm -rf dist build
mkdir -p dist build

SRC="icons parsers popup"

# chrome / edge
mkdir -p build/chrome
cp -r $SRC build/chrome/
cp manifest.json build/chrome/manifest.json
(cd build/chrome && zip -qr ../../dist/tc-part-sourcing-chrome.zip .)

# firefox, xpi is just a zip with a different extension
# the manifest has to be at the archive root, not inside a folder
mkdir -p build/firefox
cp -r $SRC build/firefox/
cp manifest.firefox.json build/firefox/manifest.json
(cd build/firefox && zip -qr ../../dist/tc-part-sourcing-firefox.xpi .)

rm -rf build
ls -lh dist
echo
echo "note: the xpi is unsigned. release firefox refuses unsigned xpis."
echo "sign it through addons.mozilla.org (unlisted / self distribution) before handing it out,"
echo "or load it temporarily via about:debugging for testing."
