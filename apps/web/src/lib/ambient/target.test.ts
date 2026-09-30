import { describe, expect, it } from 'vitest';
import { DEFAULT_AMBIENT_LEVELS } from '@/stores/useAmbientStore';
import {
  FOLLOW_WEATHER_RAIN_LEVEL,
  computeAmbientTarget,
  levelToGain,
  nextSleptOut,
  type AmbientInputs,
} from './target';

const BASE: AmbientInputs = {
  enabled: true,
  levels: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.5 },
  keepWhenPaused: false,
  followWeather: false,
  raining: false,
  isPlaying: true,
  volume: 1,
  isMuted: false,
  sleepFading: false,
  pausedSleepFading: false,
  sleptOut: false,
  sleepFadeSeconds: 8,
};

function target(overrides: Partial<AmbientInputs>) {
  return computeAmbientTarget({ ...BASE, ...overrides });
}

describe('levelToGain', () => {
  it('squares the slider so its travel is even by ear', () => {
    expect(levelToGain(1)).toBe(1);
    expect(levelToGain(0.5)).toBe(0.25);
    expect(levelToGain(0)).toBe(0);
  });

  it('treats sub-step dust as off', () => {
    expect(levelToGain(0.001)).toBe(0);
  });
});

describe('computeAmbientTarget', () => {
  it('plays with the music', () => {
    const t = target({});
    expect(t.mode).toBe('play');
    expect(t.gains.rain).toBeCloseTo(0.25);
    expect(t.gains.fire).toBe(0);
  });

  it('is idle when switched off, and releases its buffers', () => {
    const t = target({ enabled: false });
    expect(t.mode).toBe('idle');
    expect(t.gains.rain).toBe(0);
    expect(t.keepBuffers).toBe(false);
  });

  it('is idle when every layer is down, so nothing is synthesized', () => {
    const t = target({ levels: { ...DEFAULT_AMBIENT_LEVELS, rain: 0 } });
    expect(t.mode).toBe('idle');
    expect(t.keepBuffers).toBe(true);
  });

  it('pauses with the music by default', () => {
    expect(target({ isPlaying: false }).mode).toBe('idle');
  });

  it('keeps playing over a pause when asked to', () => {
    expect(target({ isPlaying: false, keepWhenPaused: true }).mode).toBe('play');
  });

  it('scales with the player volume and goes quiet on mute', () => {
    expect(target({ volume: 0.5 }).gains.rain).toBeCloseTo(0.125);
    const muted = target({ isMuted: true });
    expect(muted.gains.rain).toBe(0);
    expect(muted.mode).toBe('idle');
  });

  describe('sleep timer', () => {
    it('fades with the music while the timer fades it', () => {
      const t = target({ sleepFading: true, sleepFadeSeconds: 12 });
      expect(t.mode).toBe('sleep');
      expect(t.sleepFadeSeconds).toBe(12);
    });

    it('stays silent after a sleep ending even when kept over pauses', () => {
      expect(target({ isPlaying: false, keepWhenPaused: true, sleptOut: true }).mode).toBe('idle');
    });

    it('fades a paused-music ambience when the timer runs out over it', () => {
      expect(target({ isPlaying: false, keepWhenPaused: true, pausedSleepFading: true }).mode).toBe(
        'sleep'
      );
    });
  });

  describe('follow the weather', () => {
    it('lifts the rain while it rains', () => {
      const t = target({ followWeather: true, raining: true, levels: DEFAULT_AMBIENT_LEVELS });
      expect(t.gains.rain).toBeCloseTo(levelToGain(FOLLOW_WEATHER_RAIN_LEVEL));
    });

    it('brings rain in even from zero', () => {
      const t = target({
        followWeather: true,
        raining: true,
        levels: { ...DEFAULT_AMBIENT_LEVELS, rain: 0, fire: 0.3 },
      });
      expect(t.gains.rain).toBeGreaterThan(0);
    });

    it('never lowers a louder rain slider', () => {
      const t = target({
        followWeather: true,
        raining: true,
        levels: { ...DEFAULT_AMBIENT_LEVELS, rain: 0.9 },
      });
      expect(t.gains.rain).toBeCloseTo(0.81);
    });

    it('does nothing when it is dry or the option is off', () => {
      expect(target({ followWeather: true, raining: false }).gains.rain).toBeCloseTo(0.25);
      expect(target({ followWeather: false, raining: true }).gains.rain).toBeCloseTo(0.25);
    });

    it('does not wake a switched-off ambience', () => {
      expect(target({ enabled: false, followWeather: true, raining: true }).mode).toBe('idle');
    });
  });
});

describe('nextSleptOut', () => {
  const playing = { isPlaying: true, sleepFading: false };
  const fading = { isPlaying: true, sleepFading: true };
  const paused = { isPlaying: false, sleepFading: false };

  it('latches when the fade completes (flag clears and pause lands together)', () => {
    expect(nextSleptOut(fading, paused, false)).toBe(true);
  });

  it('latches on a manual pause mid-fade', () => {
    expect(nextSleptOut(fading, { isPlaying: false, sleepFading: true }, false)).toBe(true);
  });

  it('does not latch on an ordinary pause', () => {
    expect(nextSleptOut(playing, paused, false)).toBe(false);
  });

  it('holds while paused and clears when the music plays again', () => {
    expect(nextSleptOut(paused, paused, true)).toBe(true);
    expect(nextSleptOut(paused, playing, true)).toBe(false);
  });

  it('does not latch while the fade is still running with the music', () => {
    expect(nextSleptOut(playing, fading, false)).toBe(false);
  });
});
