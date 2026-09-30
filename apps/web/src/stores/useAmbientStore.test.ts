import { beforeEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_LAYER_IDS,
  DEFAULT_AMBIENT_LEVELS,
  hasAudibleLevel,
  useAmbientStore,
  type AmbientLayerId,
} from './useAmbientStore';

const STORE_KEY = 'shiranami.ambient-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  return (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {};
}

function resetStore() {
  useAmbientStore.setState({
    enabled: false,
    levels: { ...DEFAULT_AMBIENT_LEVELS },
    keepWhenPaused: false,
    followWeather: false,
  });
}

async function rehydrateFrom(state: unknown) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ state, version: 1 }));
  await useAmbientStore.persist.rehydrate();
}

describe('useAmbientStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('starts off, with only rain up, never keeping ambience over a pause', () => {
    const s = useAmbientStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.levels).toEqual({ rain: 0.5, vinyl: 0, noise: 0, fire: 0, cafe: 0 });
    expect(s.keepWhenPaused).toBe(false);
    expect(s.followWeather).toBe(false);
  });

  describe('setLevel', () => {
    it('sets one layer and leaves the others alone', () => {
      useAmbientStore.getState().setLevel('fire', 0.4);
      expect(useAmbientStore.getState().levels).toEqual({ ...DEFAULT_AMBIENT_LEVELS, fire: 0.4 });
    });

    it('clamps to 0 … 1 and treats garbage as silence', () => {
      const { setLevel } = useAmbientStore.getState();
      setLevel('vinyl', 3);
      expect(useAmbientStore.getState().levels.vinyl).toBe(1);
      setLevel('vinyl', -1);
      expect(useAmbientStore.getState().levels.vinyl).toBe(0);
      setLevel('vinyl', Number.NaN);
      expect(useAmbientStore.getState().levels.vinyl).toBe(0);
    });

    it('ignores an unknown layer', () => {
      const before = useAmbientStore.getState().levels;
      useAmbientStore.getState().setLevel('thunder' as AmbientLayerId, 1);
      expect(useAmbientStore.getState().levels).toBe(before);
    });

    it('persists the mix', () => {
      useAmbientStore.getState().setLevel('cafe', 0.3);
      expect(readPersisted().levels).toMatchObject({ cafe: 0.3 });
    });
  });

  describe('setEnabled', () => {
    it('switches on with the current mix', () => {
      useAmbientStore.getState().setLevel('noise', 0.7);
      useAmbientStore.getState().setEnabled(true);
      const s = useAmbientStore.getState();
      expect(s.enabled).toBe(true);
      expect(s.levels.noise).toBe(0.7);
    });

    it('brings the default mix back when every layer is at zero, so on is never silent', () => {
      for (const id of AMBIENT_LAYER_IDS) useAmbientStore.getState().setLevel(id, 0);
      useAmbientStore.getState().setEnabled(true);
      expect(useAmbientStore.getState().levels).toEqual(DEFAULT_AMBIENT_LEVELS);
      expect(hasAudibleLevel(useAmbientStore.getState().levels)).toBe(true);
    });

    it('keeps the mix when switching off', () => {
      useAmbientStore.getState().setEnabled(true);
      useAmbientStore.getState().setLevel('fire', 0.2);
      useAmbientStore.getState().setEnabled(false);
      expect(useAmbientStore.getState().levels.fire).toBe(0.2);
    });
  });

  it('resets the levels without touching the switch or the options', () => {
    const s = useAmbientStore.getState();
    s.setEnabled(true);
    s.setKeepWhenPaused(true);
    s.setFollowWeather(true);
    s.setLevel('vinyl', 0.9);
    s.resetLevels();
    const after = useAmbientStore.getState();
    expect(after.levels).toEqual(DEFAULT_AMBIENT_LEVELS);
    expect(after.enabled).toBe(true);
    expect(after.keepWhenPaused).toBe(true);
    expect(after.followWeather).toBe(true);
  });

  describe('rehydration', () => {
    it('restores a valid persisted mix', async () => {
      await rehydrateFrom({
        enabled: true,
        levels: { rain: 0.2, vinyl: 0.3, noise: 0.4, fire: 0.5, cafe: 0.6 },
        keepWhenPaused: true,
        followWeather: true,
      });
      const s = useAmbientStore.getState();
      expect(s.enabled).toBe(true);
      expect(s.levels).toEqual({ rain: 0.2, vinyl: 0.3, noise: 0.4, fire: 0.5, cafe: 0.6 });
      expect(s.keepWhenPaused).toBe(true);
      expect(s.followWeather).toBe(true);
    });

    it('clamps bad levels, drops unknown layers and defaults missing ones', async () => {
      await rehydrateFrom({ levels: { rain: 7, vinyl: 'loud', thunder: 1 } });
      const levels = useAmbientStore.getState().levels as Record<string, number>;
      expect(levels.rain).toBe(1);
      expect(levels.vinyl).toBe(0);
      expect(levels.fire).toBe(DEFAULT_AMBIENT_LEVELS.fire);
      expect(levels.thunder).toBeUndefined();
    });

    it('ignores non-boolean flags', async () => {
      await rehydrateFrom({ enabled: 'yes', keepWhenPaused: 1, followWeather: null });
      const s = useAmbientStore.getState();
      expect(s.enabled).toBe(false);
      expect(s.keepWhenPaused).toBe(false);
      expect(s.followWeather).toBe(false);
    });
  });
});
