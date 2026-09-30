/**
 * Build the café ambience loop from its public-domain source recording.
 *
 *   pnpm exec tsx scripts/ambient/make-cafe-loop.ts <path/to/Restaurant_ambience.ogg>
 *
 * Source: https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg
 * (public domain, see apps/web/src/lib/ambient/assets/ASSETS_CREDITS.md).
 * Requires ffmpeg with libmp3lame on PATH.
 *
 * Steps, all deterministic for a given ffmpeg build:
 *  1. Decode a steady 21.5 s stretch (12.3 s in, after the opening swell and a
 *     loud clatter at 11.5 s), mono 44.1 kHz, high-passed at 120 Hz (handling
 *     rumble) and low-passed at 7 kHz (the source is a 128 kbps MP3; its top
 *     octave is artefacts), with gentle compression so no single laugh or
 *     cup pokes out every 20 seconds.
 *  2. Fold the 1.5 s overhang into the head with the same equal-power seam
 *     the procedural layers use, level it to -24 dBFS RMS and round off peaks.
 *  3. Wrap it in periodic padding (see `cafe.ts`) and encode 80 kbps CBR MP3,
 *     which both WebView2 and WKWebView decode natively.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { foldSeam, normalizeRms, softCeiling } from '../../apps/web/src/lib/ambient/dsp';
import { CAFE_LOOP_SECONDS, CAFE_PAD_SECONDS } from '../../apps/web/src/lib/ambient/cafe';

const SAMPLE_RATE = 44100;
const START_SECONDS = 12.3;
const SEAM_SECONDS = 1.5;
const OUTPUT = resolve(import.meta.dirname, '../../apps/web/src/lib/ambient/assets/cafe-loop.mp3');

function ffmpeg(args: string[]): Buffer {
  const run = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.toString()}`);
  return run.stdout;
}

const source = process.argv[2];
if (!source) {
  console.error('usage: tsx scripts/ambient/make-cafe-loop.ts <Restaurant_ambience.ogg>');
  process.exit(1);
}

const raw = ffmpeg([
  '-ss',
  String(START_SECONDS),
  '-t',
  String(CAFE_LOOP_SECONDS + SEAM_SECONDS),
  '-i',
  source,
  '-ac',
  '1',
  '-ar',
  String(SAMPLE_RATE),
  '-af',
  'highpass=f=120,lowpass=f=7000,acompressor=threshold=-24dB:ratio=3:attack=5:release=120',
  '-f',
  'f32le',
  '-',
]);
const decoded = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();

const loopLength = Math.round(CAFE_LOOP_SECONDS * SAMPLE_RATE);
const pad = Math.round(CAFE_PAD_SECONDS * SAMPLE_RATE);
if (decoded.length <= loopLength) throw new Error('source stretch is shorter than the loop');

const loop = softCeiling(normalizeRms(foldSeam(decoded, loopLength), -24), 0.5);

const padded = new Float32Array(loopLength + pad * 2);
padded.set(loop.subarray(loopLength - pad), 0);
padded.set(loop, pad);
padded.set(loop.subarray(0, pad), pad + loopLength);

const work = mkdtempSync(join(tmpdir(), 'cafe-loop-'));
try {
  const pcm = join(work, 'loop.f32');
  writeFileSync(pcm, Buffer.from(padded.buffer));
  ffmpeg([
    '-y',
    '-f',
    'f32le',
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    '1',
    '-i',
    pcm,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '80k',
    '-map_metadata',
    '-1',
    OUTPUT,
  ]);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`wrote ${OUTPUT} (${(statSync(OUTPUT).size / 1024).toFixed(0)} KB)`);
