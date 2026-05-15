import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Build a minimal silent WAV (PCM, 8 kHz, mono, 16-bit) of `durationSeconds`.
 * 1 s ≈ 16 KB so spinning up dozens for a single spec is cheap. Generating at
 * runtime keeps a binary out of the repo; the format never needs to vary.
 */
export function generateSilentWav(durationSeconds: number = 1): Buffer {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = sampleRate * durationSeconds;
  const dataSize = samples * channels * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  buf.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // remaining bytes default to zero — silence

  return buf;
}

export interface FixtureAudioFile {
  filePath: string;
  fileName: string;
}

/**
 * Materialise `count` unique silent WAV files under a fresh tmpdir. `tracks.filePath`
 * has a UNIQUE constraint so each seeded row needs its own file; the cheapest way
 * to honour that without duplicating bytes in git is to write each tiny WAV here.
 *
 * Caller owns cleanup (e.g. rm -r the parent tmpdir on spec teardown). The
 * launched-app helper already runs under `os.tmpdir()` so leftover dirs are
 * cleaned by the OS regardless.
 */
export function createSilentAudioFiles(
  count: number,
  durationSeconds: number = 1
): {
  dir: string;
  files: FixtureAudioFile[];
} {
  const dir = mkdtempSync(path.join(tmpdir(), 'shiranami-e2e-audio-'));
  const wav = generateSilentWav(durationSeconds);
  const files: FixtureAudioFile[] = [];
  for (let i = 0; i < count; i++) {
    const fileName = `track-${i + 1}.wav`;
    const filePath = path.join(dir, fileName);
    writeFileSync(filePath, wav);
    files.push({ filePath, fileName });
  }
  return { dir, files };
}
