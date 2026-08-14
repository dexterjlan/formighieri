#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"

current="$(tr -d '[:space:]' < "$VERSION_FILE")"
major="${current%%.*}"
rest="${current#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

patch=$((patch + 1))
next="${major}.${minor}.${patch}"

printf '%s\n' "$next" > "$VERSION_FILE"
python3 - "$ROOT/index.html" "$next" <<'PY'
import re
import sys

path, version = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
updated = re.sub(
    r'js/bootstrap\.js\?v=[^"]+',
    f'js/bootstrap.js?v={version}',
    text,
    count=1,
)
if updated == text:
    updated = text.replace(
        'js/bootstrap.js"',
        f'js/bootstrap.js?v={version}"',
        1,
    )
open(path, "w", encoding="utf-8").write(updated)
PY
echo "Version bumped: ${current} -> ${next}"
