import { describe, expect, it } from 'vitest';
import { fadeIn, fadeOut } from './useAudioEngine';

describe('equal-power fade curves', () => {
  it('fadeOut goes from full volume to silence', () => {
    expect(fadeOut(0)).toBeCloseTo(1, 6);
    expect(fadeOut(1)).toBeCloseTo(0, 6);
  });

  it('fadeOut is monotonically decreasing', () => {
    let prev = fadeOut(0);
    for (let p = 0.05; p <= 1; p += 0.05) {
      const v = fadeOut(p);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('preserves equal power (fadeIn^2 + fadeOut^2 === 1)', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      expect(fadeIn(p) ** 2 + fadeOut(p) ** 2).toBeCloseTo(1, 6);
    }
  });
});
