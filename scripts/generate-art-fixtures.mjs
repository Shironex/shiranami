/**
 * Writes the input cover PNGs that both v1's art pipelines and v2's are run
 * over (`crates/shiranami-metadata/fixtures/covers/`).
 *
 * These are *inputs*, not expectations. They are committed so that the Node
 * side and the Rust side hash identical bytes — generating them independently
 * would put two PNG encoders into a comparison that exists to isolate the JPEG
 * encoder. There is no reason to re-run this; doing so invalidates
 * `crates/shiranami-metadata/fixtures/v1-art.json`.
 *
 * Run: `node scripts/generate-art-fixtures.mjs` (needs `pnpm install`).
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolved from `apps/desktop` rather than imported by bare specifier: sharp is
// v1's dependency, not the repo root's, and pnpm's store layout means the path
// is not guessable.
const sharp = createRequire(path.join(ROOT, 'apps/desktop/package.json'))('sharp');
const OUT = path.join(ROOT, 'crates/shiranami-metadata/fixtures/covers');

/** Name, width, height — see the README beside the fixtures. */
const CASES = [
  ['cover-square.png', 600, 600],
  ['cover-wide.png', 1000, 500],
  ['cover-tall.png', 400, 900],
  ['cover-small.png', 100, 80],
];

/**
 * A deterministic pattern with real structure: two smooth gradients plus a
 * 32 px checkerboard.
 *
 * A flat fill would compress to nothing and let a broken resize produce a
 * coincidentally matching encode. Pure noise has the opposite problem — it is
 * incompressible, and the committed PNGs would be megabytes. The checkerboard
 * gives sharp edges for the resampler to get wrong while staying compressible.
 */
function pixels(width, height) {
  const buffer = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      // Quantised into 16 bands rather than a per-pixel ramp: a smooth ramp
      // defeats PNG's row filters and quadruples the committed fixture size
      // for no extra structure.
      buffer[i] = Math.floor((x * 16) / width) * 17;
      buffer[i + 1] = Math.floor((y * 16) / height) * 17;
      buffer[i + 2] = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0 ? 40 : 215;
    }
  }
  return buffer;
}

mkdirSync(OUT, { recursive: true });

for (const [name, width, height] of CASES) {
  await sharp(pixels(width, height), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(`✔ ${name} (${String(width)}×${String(height)})`);
}
