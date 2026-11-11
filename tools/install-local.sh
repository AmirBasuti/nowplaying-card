#!/bin/bash
# Installs the extension into the live session. Every file lands under a
# temporary name first and is then renamed into place: a rename swaps the inode
# instead of rewriting bytes, so a shell that is running the old copy - and has
# schemas/gschemas.compiled memory-mapped - keeps a consistent view until it is
# restarted. Overwriting those bytes in place corrupts that view, and a lookup
# that then fails aborts the whole session.
set -euo pipefail

uuid=nowplaying-pinned@local
src=$(cd "$(dirname "$0")/.." && pwd)
dst=${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT

install_file() {
    local from=$1 to=$2
    mkdir -p "$(dirname "$to")"
    cp "$from" "$to.tmp"
    mv -f "$to.tmp" "$to"
}

payload=$staging/extension
"$src/tools/pack-extension.sh" "$staging"
unzip -q "$staging/$uuid.shell-extension.zip" -d "$payload"
glib-compile-schemas --strict "$payload/schemas"

while IFS= read -r -d '' file; do
    install_file "$file" "$dst/${file#"$payload/"}"
done < <(find "$payload" -type f ! -name gschemas.compiled -print0)
install_file "$payload/schemas/gschemas.compiled" "$dst/schemas/gschemas.compiled"

echo "installed to $dst"
echo "log out and back in - a running shell keeps the old code in memory"
