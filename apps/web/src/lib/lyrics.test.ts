import { describe, expect, it } from 'vitest';
import { findActiveLine, isInstrumentalGap } from './lyrics';

const LINES = [{ time: 0 }, { time: 8 }, { time: 16 }, { time: 40 }, { time: 48 }];

describe('findActiveLine', () => {
  it('returns the last line at or before the current time', () => {
    expect(findActiveLine(LINES, 0)).toBe(0);
    expect(findActiveLine(LINES, 15.9)).toBe(1);
    expect(findActiveLine(LINES, 100)).toBe(4);
  });

  it('returns -1 before the first timestamp', () => {
    expect(findActiveLine([{ time: 5 }], 2)).toBe(-1);
  });
});

describe('isInstrumentalGap', () => {
  it('is false for missing or empty lines', () => {
    expect(isInstrumentalGap(null, -1, 10)).toBe(false);
    expect(isInstrumentalGap([], -1, 10)).toBe(false);
  });

  it('breathes inside a ≥6s stretch once the lead has elapsed', () => {
    // 16 → 40 is a 24s stretch; the lead ends at 18.5.
    expect(isInstrumentalGap(LINES, 2, 18.4)).toBe(false);
    expect(isInstrumentalGap(LINES, 2, 18.6)).toBe(true);
    expect(isInstrumentalGap(LINES, 2, 39.9)).toBe(true);
    expect(isInstrumentalGap(LINES, 2, 40)).toBe(false);
  });

  it('ignores stretches under six seconds', () => {
    // 40 → 48 is 8s (counts); 0 → 8 is 8s (counts); use a tight fixture.
    const tight = [{ time: 0 }, { time: 5 }, { time: 30 }];
    expect(isInstrumentalGap(tight, 0, 4)).toBe(false);
  });

  it('covers a long intro before the first line, with a shorter lead', () => {
    const lateStart = [{ time: 12 }, { time: 20 }];
    expect(isInstrumentalGap(lateStart, -1, 0.5)).toBe(false);
    expect(isInstrumentalGap(lateStart, -1, 2)).toBe(true);
    expect(isInstrumentalGap(lateStart, -1, 11.9)).toBe(true);
  });

  it('never reads the unknowable outro as a gap', () => {
    expect(isInstrumentalGap(LINES, 4, 60)).toBe(false);
  });
});
