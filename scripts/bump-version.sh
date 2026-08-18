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
python3 - "$ROOT/index.html" "$ROOT/js/bootstrap.js" "$next" <<'PY'
import re
import sys

index_path, bootstrap_path, version = sys.argv[1], sys.argv[2], sys.argv[3]

index_text = open(index_path, encoding="utf-8").read()
index_updated = re.sub(
    r'js/bootstrap\.js\?v=[^"]+',
    f'js/bootstrap.js?v={version}',
    index_text,
    count=1,
)
if index_updated == index_text:
    index_updated = index_text.replace(
        'js/bootstrap.js"',
        f'js/bootstrap.js?v={version}"',
        1,
    )
open(index_path, "w", encoding="utf-8").write(index_updated)

bootstrap_text = open(bootstrap_path, encoding="utf-8").read()
bootstrap_updated = re.sub(
    r"const APP_CACHE_VERSION = '[^']+'",
    f"const APP_CACHE_VERSION = '{version}'",
    bootstrap_text,
    count=1,
)
open(bootstrap_path, "w", encoding="utf-8").write(bootstrap_updated)
PY
echo "Version bumped: ${current} -> ${next}"
