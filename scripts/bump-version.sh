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
echo "Version bumped: ${current} -> ${next}"
