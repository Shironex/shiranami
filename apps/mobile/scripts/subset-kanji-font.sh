#!/usr/bin/env sh
# Rebuilds assets/fonts/ShipporiMincho_700Bold.ttf: the full Shippori Mincho
# Bold (8.5 MB) cut down to the glyphs lib/kanji.ts can show. Needs fonttools
# (`pip install fonttools`). Run from apps/mobile after changing the glyphs.
set -eu
cd "$(dirname "$0")/.."

SOURCE=node_modules/@expo-google-fonts/shippori-mincho/700Bold/ShipporiMincho_700Bold.ttf
OUT=assets/fonts/ShipporiMincho_700Bold.ttf
GLYPHS_FILE=assets/fonts/ShipporiMincho_700Bold.glyphs.json

GLYPHS=$(pnpm exec tsx -e "import { KANJI_GLYPHS } from './lib/kanji'; process.stdout.write(KANJI_GLYPHS);")
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ glyphs: process.argv[2] }, null, 2) + "\n")' "$GLYPHS_FILE" "$GLYPHS"
pyftsubset "$SOURCE" --text="$GLYPHS" --output-file="$OUT" --layout-features='' --no-hinting --desubroutinize
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
