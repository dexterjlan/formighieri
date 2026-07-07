#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/pre-push
chmod +x scripts/bump-version.sh

echo "Git hooks installed (core.hooksPath=.githooks)."
echo "Each push will bump VERSION and create a chore commit automatically."
