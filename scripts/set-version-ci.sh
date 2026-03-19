#!/usr/bin/env bash
set -euo pipefail

# Sync an explicit version across workspace package.json files for CI/release jobs.
# Usage:
#   ./scripts/set-version-ci.sh 0.1.1

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PACKAGES=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/apps/desktop/package.json"
  "$ROOT_DIR/apps/landing/package.json"
  "$ROOT_DIR/apps/web/package.json"
  "$ROOT_DIR/packages/shared/package.json"
  "$ROOT_DIR/packages/database/package.json"
)

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION="$1"

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?([+][0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'; then
  echo "Error: '$VERSION' is not a valid semver version"
  exit 1
fi

echo "Setting workspace package versions to $VERSION"

for FILE in "${PACKAGES[@]}"; do
  REL_PATH="${FILE#"$ROOT_DIR/"}"
  if [ ! -f "$FILE" ]; then
    echo "Error: $REL_PATH not found" >&2
    exit 1
  fi

  VERSION="$VERSION" FILE="$FILE" node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync(process.env.FILE, "utf8"));
    pkg.version = process.env.VERSION;
    fs.writeFileSync(process.env.FILE, JSON.stringify(pkg, null, 2) + "\n");
  '

  echo "  Updated $REL_PATH"
done

echo "All package versions synced to $VERSION"
