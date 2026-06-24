/**
 * Integration tests for the compiled native addon's N-API surface.
 *
 * Unlike the C++ doctest suite (which links core/ directly), these load the real
 * build/Release/shiranami_native.node the way the app does — through
 * createRequire — and assert the JS-visible contract of waveform.fromFile and
 * loudness.fromFile against the committed fixture audio files.
 *
 * The whole suite skips when the addon hasn't been built, so a plain
 * `pnpm test` (which doesn't compile native code) stays green in CI. Run the
 * full thing with `pnpm native:test`, which builds first.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const addonPath = resolve(__dirname, '../../../build/Release/shiranami_native.node');
const fixtures = resolve(__dirname, '../../native/test/fixtures');
const fixture = (name: string) => resolve(fixtures, name);

interface NativeAddon {
  waveform: {
    fromFile: (
      path: string,
      buckets: number
    ) => { peaks: Float32Array; sampleRate: number; channels: number; durationSec: number } | null;
  };
  loudness: {
    fromFile: (
      path: string
    ) => { status: 'ok'; lufs: number } | { status: 'silent' } | { status: 'undecodable' };
  };
  analysis: {
    fromFile: (
      path: string
    ) => { status: 'ok'; bpm: number; key: string } | { status: 'unanalyzable' };
  };
}

const addon = existsSync(addonPath) ? (createRequire(__filename)(addonPath) as NativeAddon) : null;

describe.skipIf(addon === null)('native addon N-API surface', () => {
  // Non-null assertions are safe: skipIf above guarantees addon is loaded here.
  const native = () => addon as NativeAddon;

  describe('waveform.fromFile', () => {
    it('decodes a WAV fixture to the requested number of peaks', () => {
      const result = native().waveform.fromFile(fixture('sine.wav'), 64);
      expect(result).not.toBeNull();
      expect(result!.peaks).toHaveLength(64);
      expect(result!.sampleRate).toBe(48000);
      expect(result!.channels).toBe(2);
      expect(result!.durationSec).toBeCloseTo(1.0, 1);
    });

    it('returns null for a format dr_libs cannot decode', () => {
      expect(native().waveform.fromFile(fixture('undecodable.m4a'), 64)).toBeNull();
    });
  });

  describe('loudness.fromFile', () => {
    it('measures a real signal as ok with a finite LUFS value', () => {
      const result = native().loudness.fromFile(fixture('sine.wav'));
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.lufs).toBeGreaterThan(-50);
        expect(result.lufs).toBeLessThan(-30);
      }
    });

    it('reports silent for digital silence', () => {
      expect(native().loudness.fromFile(fixture('silence.wav')).status).toBe('silent');
    });

    it('reports undecodable for a format dr_libs cannot decode', () => {
      expect(native().loudness.fromFile(fixture('undecodable.m4a')).status).toBe('undecodable');
    });
  });

  describe('analysis.fromFile', () => {
    it('returns ok with a numeric bpm and string key for a decodable file', () => {
      // The sine fixture has no beat, so bpm may be 0 (no tempo); we assert the
      // N-API surface shape here — the C++ doctest suite pins the DSP accuracy.
      const result = native().analysis.fromFile(fixture('sine.wav'));
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(typeof result.bpm).toBe('number');
        expect(result.bpm).toBeGreaterThanOrEqual(0);
        expect(typeof result.key).toBe('string');
      }
    });

    it('reports unanalyzable for a format dr_libs cannot decode', () => {
      expect(native().analysis.fromFile(fixture('undecodable.m4a')).status).toBe('unanalyzable');
    });
  });
});
