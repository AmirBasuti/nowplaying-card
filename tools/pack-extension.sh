#!/bin/bash
# Build the installable extension from its runtime files.
set -euo pipefail

src=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$src}
archive=nowplaying-pinned@local.shell-extension.zip

mkdir -p -- "$out"
out=$(cd "$out" && pwd)
staging=$(mktemp -d "$out/.nowplaying-pack.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT

cd "$src"
python3 tools/gen-stylesheets.py
zip -q -X -MM "$staging/$archive" \
    metadata.json extension.js prefs.js spectrum.js pinnedLayout.js \
    lyrics.js lyricsPresentation.js lyricsProvider.js lyricsService.js \
    spotifyLyrics.js spotifyLyricsProvider.js wordTiming.js \
    stylesheet.css stylesheet-light.css stylesheet-dark.css LICENSE \
    icons/qr/bitcoin.svg icons/qr/ethereum.svg icons/qr/solana.svg \
    schemas/org.gnome.shell.extensions.nowplaying-pinned.gschema.xml \
    vendor/js-yaml.mjs vendor/js-yaml.LICENSE vendor/js-yaml.README

mv -f -- "$staging/$archive" "$out/$archive"
printf '%s\n' "$out/$archive"
