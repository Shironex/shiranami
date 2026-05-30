import { describe, expect, it } from 'vitest';
import { parseIntegratedLufs } from './loudness-service';

describe('parseIntegratedLufs', () => {
  it('extracts the integrated loudness from a loudnorm JSON block in stderr', () => {
    const stderr = [
      '[Parsed_loudnorm_0 @ 0x123] ',
      '{',
      '\t"input_i" : "-18.42",',
      '\t"input_tp" : "-3.20",',
      '\t"input_lra" : "7.10",',
      '\t"input_thresh" : "-28.50",',
      '\t"output_i" : "-24.00"',
      '}',
    ].join('\n');
    expect(parseIntegratedLufs(stderr)).toBeCloseTo(-18.42);
  });

  it('returns null for non-finite (silent track) loudness', () => {
    const stderr = '{ "input_i" : "-inf", "input_tp" : "-120.0" }';
    expect(parseIntegratedLufs(stderr)).toBeNull();
  });

  it('returns null when no JSON block is present', () => {
    expect(parseIntegratedLufs('ffmpeg version 6.0 ... no json here')).toBeNull();
  });

  it('returns null when input_i is missing', () => {
    expect(parseIntegratedLufs('{ "input_tp" : "-3.2" }')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseIntegratedLufs('{ "input_i" : ')).toBeNull();
  });
});
