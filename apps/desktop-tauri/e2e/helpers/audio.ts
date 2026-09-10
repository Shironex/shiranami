/**
 * Audio the suite can put in a library.
 *
 * Ported from `apps/desktop/e2e/helpers/audio-fixtures.ts` with one change: v1
 * only ever needed silence, because nothing it asserted decoded the bytes. v2's
 * playback scenario streams a file through the loopback server and into Web
 * Audio, so it needs a signal — see {@link writeSineWav}.
 */

import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 8000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * A canonical 44-byte RIFF/WAVE header followed by `samples`.
 *
 * Generated rather than committed: the format never varies, and a binary in git
 * is a binary someone has to justify at review.
 */
function encodeWav(samples: Int16Array): Buffer {
  const dataSize = samples.length * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  return buffer;
}

/** Silence. Cheap, and all a row that is never played needs. */
export function silentWav(seconds = 1): Buffer {
  return encodeWav(new Int16Array(SAMPLE_RATE * seconds));
}

/**
 * A 440 Hz sine at roughly half scale.
 *
 * The playback scenario asserts the analyser sees energy, which §8 calls the
 * only automated detector of the silent-on-CORS failure. Silence would satisfy
 * a "did it play" assertion and defeat exactly that test, so the fixture that
 * feeds it has to actually make noise.
 */
export function sineWav(seconds = 2, frequency = 440): Buffer {
  const total = SAMPLE_RATE * seconds;
  const samples = new Int16Array(total);
  for (let i = 0; i < total; i += 1) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * 16000);
  }
  return encodeWav(samples);
}

/**
 * Write `count` distinct WAVs into `dir` and return their absolute paths.
 *
 * Distinct because `tracks.file_path` is UNIQUE, so every seeded row needs its
 * own file even when the bytes would be identical.
 */
export function writeTracks(
  dir: string,
  count: number,
  make: (index: number) => Buffer = () => silentWav()
): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const file = path.join(dir, `track-${i + 1}.wav`);
    fs.writeFileSync(file, make(i));
    files.push(file);
  }
  return files;
}
