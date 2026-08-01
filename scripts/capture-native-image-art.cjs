/**
 * Captures v1 album-art **pipeline A** — Electron's `nativeImage`, the one that
 * runs in the main process — over the committed cover fixtures.
 *
 * Runs inside Electron (`electron scripts/capture-native-image-art.cjs`) and
 * prints one JSON object to stdout, which `verify-art-baseline.mjs --write
 * --with-electron` folds into `v1-art.json`. It is a separate file because
 * `nativeImage` only exists inside an Electron process; there is no way to
 * reach it from plain Node.
 *
 * The body is a verbatim port of `downscaleImage` + the hashing half of
 * `saveAlbumArt` from `apps/desktop/src/main/protocols/art-protocol.ts`. It is
 * duplicated rather than imported because that file is TypeScript, pulls in the
 * app's logger and store, and calls `app.getPath('userData')` at module scope.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { app, nativeImage } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const COVERS = path.join(ROOT, 'crates/shiranami-metadata/fixtures/covers');

// art-protocol.ts: `const MAX_DIMENSION = 512;` and `toJPEG(85)`.
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 85;

/** Verbatim `downscaleImage` from art-protocol.ts. */
function downscaleImage(image) {
  const { width, height } = image.getSize();
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return image.toJPEG(JPEG_QUALITY);
  }
  const scale = MAX_DIMENSION / Math.max(width, height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const resized = image.resize({
    width: targetWidth,
    height: targetHeight,
    quality: 'best',
  });
  return resized.toJPEG(JPEG_QUALITY);
}

function capture() {
  const entries = {};

  for (const name of fs
    .readdirSync(COVERS)
    .filter(file => file.endsWith('.png'))
    .sort()) {
    const image = nativeImage.createFromBuffer(fs.readFileSync(path.join(COVERS, name)));
    if (image.isEmpty()) {
      entries[name] = { decoded: false };
      continue;
    }

    const bytes = downscaleImage(image);
    // saveAlbumArt: `sha256(resized).digest('hex').slice(0, 32)`.
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const encoded = nativeImage.createFromBuffer(bytes).getSize();

    entries[name] = {
      decoded: true,
      hash,
      fileName: `${hash}.jpg`,
      byteLength: bytes.length,
      width: encoded.width,
      height: encoded.height,
    };
  }

  return entries;
}

app.whenReady().then(() => {
  try {
    process.stdout.write(
      JSON.stringify({ electron: process.versions.electron, entries: capture() })
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
