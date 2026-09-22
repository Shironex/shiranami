import { describe, expect, it } from 'vitest';
import { formatTempoKeyLine } from './tempoKeyFormat';

describe('formatTempoKeyLine', () => {
  it('shows both tempo and key when analysed', () => {
    expect(formatTempoKeyLine(81.6, 'A minor')).toBe('≈ 82 BPM · A minor');
  });

  it('shows tempo alone when the key is undetectable', () => {
    expect(formatTempoKeyLine(74, null)).toBe('≈ 74 BPM');
  });

  it('shows the key alone when no beat was detected', () => {
    expect(formatTempoKeyLine(null, 'C major')).toBe('C major');
  });

  it('returns null for an unanalysed track', () => {
    expect(formatTempoKeyLine(null, null)).toBeNull();
    expect(formatTempoKeyLine(undefined, undefined)).toBeNull();
    expect(formatTempoKeyLine(Number.NaN, '')).toBeNull();
  });
});
