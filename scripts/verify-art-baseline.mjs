/**
 * Records what v1's album-art pipelines actually produce, so the Rust port can
 * be checked against measurement rather than against an assumption
 * (architecture §3.3, decision D16, risk R14).
 *
 * v1 ships **two** art pipelines that write into the same content-addressed
 * directory:
 *
 *   A. `downscaleImage` in `apps/desktop/src/main/protocols/art-protocol.ts`
 *      — Electron `nativeImage`, i.e. Chromium/Skia. Main process.
 *   B. `downscaleAndHash` in `apps/desktop/src/main/shared/album-art-image.ts`
 *      — `sharp`, i.e. libvips/libjpeg-turbo. Scan utility, which exists only
 *      because `nativeImage` is unavailable inside an Electron `utilityProcess`.
 *
 * They agree on geometry, on nominal quality and on the hash construction. This
 * script runs both over the committed cover fixtures and writes the results to
 * `crates/shiranami-metadata/fixtures/v1-art.json`, which
 * `crates/shiranami-metadata/tests/art_v1_compat.rs` then reads hermetically.
 *
 * Run: `pnpm verify:art-baseline` to verify, `--write` to regenerate.
 *
 * Two modes, because the two pipelines have very different requirements:
 *
 *   - **sharp** needs `node_modules` but no display, so it is verified on every
 *     CI run of the `lint` job (which already installs the workspace).
 *   - **nativeImage** needs a full Electron process. It is captured once, by
 *     hand, with `--write --with-electron`, and re-verified the same way. The
 *     recorded values are what the Rust test reads; CI never spawns Electron.
 *     Same shape as `shiranami-audio`'s `#[ignore]`d fixture emitter.
 *
 * Why this lives in the `lint` job rather than `rust-checks`, unlike
 * `verify:db-baseline`: that job deliberately skips `pnpm install`, and this
 * check's whole point is to run v1's real `sharp`, which is a `node_modules`
 * dependency. A pure-builtin reimplementation would be measuring this script
 * instead of measuring v1.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVERS = path.join(ROOT, 'crates/shiranami-metadata/fixtures/covers');
const FIXTURE = path.join(ROOT, 'crates/shiranami-metadata/fixtures/v1-art.json');
const ELECTRON_CAPTURE = path.join(ROOT, 'scripts/capture-native-image-art.cjs');

const require_ = createRequire(path.join(ROOT, 'apps/desktop/package.json'));

// album-art-image.ts: ALBUM_ART_MAX_DIMENSION / _JPEG_QUALITY / _HASH_LENGTH.
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 85;
const HASH_LENGTH = 32;

function fail(message) {
  console.error(`✖ art-baseline verification: ${message}`);
  process.exit(1);
}

// ── Running v1's pipelines ──────────────────────────────────────────────────

function coverNames() {
  return readdirSync(COVERS)
    .filter(name => name.endsWith('.png'))
    .sort();
}

/**
 * Pipeline B, verbatim from `downscaleAndHash`:
 *
 *   sharp(input)
 *     .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
 *     .jpeg({ quality: 85 })
 *     .toBuffer()
 *
 * followed by `sha256(bytes).digest('hex').slice(0, 32)` and `${hash}.jpg`.
 */
async function captureSharp() {
  const sharp = require_('sharp');
  const entries = {};

  for (const name of coverNames()) {
    const input = readFileSync(path.join(COVERS, name));
    const bytes = await sharp(input)
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH);
    const { width, height } = await sharp(bytes).metadata();

    entries[name] = {
      hash,
      fileName: `${hash}.jpg`,
      byteLength: bytes.length,
      width,
      height,
      // What v1 wrote into `tracks.album_art` — `artUrlFor(fileName)`.
      albumArtUrl: `shiranami-art://art/${hash}.jpg`,
    };
  }

  return { sharp: sharp.versions.sharp, entries };
}

/** Pipeline A, by spawning a real Electron process. */
function captureNativeImage() {
  const electron = require_('electron');
  const output = execFileSync(electron, [ELECTRON_CAPTURE], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });

  return JSON.parse(output);
}

// ── Main ────────────────────────────────────────────────────────────────────

const write = process.argv.includes('--write');
const withElectron = process.argv.includes('--with-electron');

const names = coverNames();
if (names.length === 0) {
  fail(`no cover fixtures in ${path.relative(ROOT, COVERS)}`);
}

const sharpResult = await captureSharp();

// The divergence this fixture exists to record, computed rather than asserted.
const nativeImageResult = withElectron ? captureNativeImage() : null;

let existing = null;
if (existsSync(FIXTURE)) {
  existing = JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

// Without `--with-electron` the recorded pipeline-A block is carried forward
// untouched, so the ordinary CI run neither needs Electron nor drops the
// evidence that was captured with it.
const nativeImage = nativeImageResult
  ? {
      _capturedWith: `electron ${nativeImageResult.electron}`,
      entries: nativeImageResult.entries,
    }
  : (existing?.nativeImage ?? null);

if (!nativeImage) {
  fail(
    'no pipeline-A capture recorded. Run `pnpm verify:art-baseline --write --with-electron` ' +
      'once on a machine with Electron installed and commit the result.'
  );
}

const divergence = {};
for (const name of names) {
  const a = nativeImage.entries[name];
  const b = sharpResult.entries[name];
  divergence[name] = {
    geometryAgrees: Boolean(a?.decoded) && a.width === b.width && a.height === b.height,
    // The headline: two v1 pipelines, one cover, two cache filenames.
    hashAgrees: Boolean(a?.decoded) && a.hash === b.hash,
  };
}

const fixture = {
  _generator:
    'scripts/verify-art-baseline.mjs — regenerate with `pnpm verify:art-baseline --write`. Do not edit by hand.',
  _what:
    "What v1's two album-art pipelines produce for the covers in fixtures/covers/. " +
    'Pipeline A is Electron nativeImage (main process), pipeline B is sharp (scan utility). ' +
    'v2 reproduces the geometry, the hash construction and the URL shape exactly, and ' +
    "deliberately reproduces neither pipeline's bytes — see architecture.md §3.3 (D16, R14).",
  maxDimension: MAX_DIMENSION,
  jpegQuality: JPEG_QUALITY,
  hashLength: HASH_LENGTH,
  albumArtUrlPrefix: 'shiranami-art://art/',
  nativeImage,
  sharp: { _capturedWith: `sharp ${sharpResult.sharp}`, entries: sharpResult.entries },
  // Recorded, not asserted: this is the measurement that makes "byte-parity
  // with v1" a question with no well-defined answer.
  divergence,
};

const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

if (write) {
  writeFileSync(FIXTURE, serialized);
  console.log(
    `✔ art-baseline: wrote ${path.relative(ROOT, FIXTURE)} ` +
      `(${String(names.length)} covers, pipeline A ${withElectron ? 'recaptured' : 'carried forward'})`
  );
  process.exit(0);
}

if (!existing) {
  fail(
    `${path.relative(ROOT, FIXTURE)} does not exist. ` +
      'Run `pnpm verify:art-baseline --write --with-electron` and commit it.'
  );
}

if (readFileSync(FIXTURE, 'utf8') !== serialized) {
  fail(
    `${path.relative(ROOT, FIXTURE)} no longer matches what v1's art pipeline produces. ` +
      "If v1's pipeline genuinely changed, regenerate with `pnpm verify:art-baseline --write` " +
      'and re-read `crates/shiranami-metadata/tests/art_v1_compat.rs` before committing — ' +
      'the Rust test asserts against these values.'
  );
}

const agreeing = Object.values(divergence).filter(entry => entry.hashAgrees).length;
console.log(
  `✔ art-baseline verification: ${String(names.length)} covers still hash as recorded ` +
    `(v1's own two pipelines agree on ${String(agreeing)} of them).`
);
