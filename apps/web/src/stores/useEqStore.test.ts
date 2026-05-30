import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEqStore, EQ_PRESETS, EQ_MIN_DB, EQ_MAX_DB } from './useEqStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const STORE_KEY = 'shiranami.eq-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

function resetStore() {
  useEqStore.setState({
    enabled: false,
    preset: 'flat',
    preampDb: 0,
    gains: [...EQ_PRESETS.flat],
    customPresets: [],
    activeCustomId: null,
  });
}

describe('useEqStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  describe('applyPreset', () => {
    it('writes the correct gains for the rock preset', () => {
      useEqStore.getState().applyPreset('rock');
      const s = useEqStore.getState();
      expect(s.preset).toBe('rock');
      expect(s.gains).toEqual(EQ_PRESETS.rock);
    });

    it('writes the correct gains for every named preset', () => {
      const entries = Object.entries(EQ_PRESETS) as [keyof typeof EQ_PRESETS, number[]][];
      for (const [id, gains] of entries) {
        useEqStore.getState().applyPreset(id);
        const s = useEqStore.getState();
        expect(s.preset).toBe(id);
        expect(s.gains).toEqual(gains);
        expect(s.gains).not.toBe(gains); // must be a copy
      }
    });

    it('ignores the sentinel "custom" value', () => {
      useEqStore.getState().applyPreset('rock');
      useEqStore.getState().applyPreset('custom');
      expect(useEqStore.getState().preset).toBe('rock');
    });
  });

  describe('setBandGain', () => {
    it('flips preset to "custom" when a gain diverges from a named preset', () => {
      useEqStore.getState().applyPreset('rock');
      useEqStore.getState().setBandGain(0, 0);
      expect(useEqStore.getState().preset).toBe('custom');
    });

    it('keeps the named preset when the gain matches exactly', () => {
      useEqStore.getState().applyPreset('rock');
      useEqStore.getState().setBandGain(0, EQ_PRESETS.rock[0]);
      expect(useEqStore.getState().preset).toBe('rock');
    });

    it('detects a flat preset when all bands are zeroed', () => {
      useEqStore.getState().applyPreset('rock');
      for (let i = 0; i < EQ_PRESETS.flat.length; i++) {
        useEqStore.getState().setBandGain(i, 0);
      }
      expect(useEqStore.getState().preset).toBe('flat');
    });

    it('clamps gains to the [-12, +12] range', () => {
      useEqStore.getState().setBandGain(3, 999);
      expect(useEqStore.getState().gains[3]).toBe(EQ_MAX_DB);
      useEqStore.getState().setBandGain(3, -999);
      expect(useEqStore.getState().gains[3]).toBe(EQ_MIN_DB);
    });

    it('ignores out-of-range indices', () => {
      const before = useEqStore.getState().gains;
      useEqStore.getState().setBandGain(99, 5);
      expect(useEqStore.getState().gains).toEqual(before);
      useEqStore.getState().setBandGain(-1, 5);
      expect(useEqStore.getState().gains).toEqual(before);
    });
  });

  describe('setPreampDb', () => {
    it('clamps preamp to [-12, +12]', () => {
      useEqStore.getState().setPreampDb(50);
      expect(useEqStore.getState().preampDb).toBe(EQ_MAX_DB);
      useEqStore.getState().setPreampDb(-50);
      expect(useEqStore.getState().preampDb).toBe(EQ_MIN_DB);
    });
  });

  describe('reset', () => {
    it('returns to flat, 0 preamp', () => {
      useEqStore.getState().applyPreset('rock');
      useEqStore.getState().setPreampDb(6);
      useEqStore.getState().reset();
      const s = useEqStore.getState();
      expect(s.preset).toBe('flat');
      expect(s.gains).toEqual(EQ_PRESETS.flat);
      expect(s.preampDb).toBe(0);
    });
  });

  describe('setEnabled', () => {
    it('toggles enabled flag', () => {
      useEqStore.getState().setEnabled(true);
      expect(useEqStore.getState().enabled).toBe(true);
      useEqStore.getState().setEnabled(false);
      expect(useEqStore.getState().enabled).toBe(false);
    });
  });

  describe('persistence sanitizer', () => {
    it('coerces out-of-range preamp on hydration', () => {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          state: {
            enabled: true,
            preset: 'flat',
            preampDb: 99,
            gains: [...EQ_PRESETS.flat],
          },
          version: 1,
        })
      );
      useEqStore.persist.rehydrate();
      expect(useEqStore.getState().preampDb).toBeLessThanOrEqual(EQ_MAX_DB);
    });

    it('coerces gains outside the valid range on hydration', () => {
      const dirty = [999, -999, 0, 0, 0, 0, 0, 0, 0, 0];
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          state: {
            enabled: true,
            preset: 'custom',
            preampDb: 0,
            gains: dirty,
          },
          version: 1,
        })
      );
      useEqStore.persist.rehydrate();
      const { gains } = useEqStore.getState();
      expect(gains[0]).toBe(EQ_MAX_DB);
      expect(gains[1]).toBe(EQ_MIN_DB);
    });

    it('resets all bands to 0 when the persisted array has the wrong length', () => {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          state: {
            enabled: true,
            preset: 'custom',
            preampDb: 0,
            gains: [1, 2, 3],
          },
          version: 1,
        })
      );
      useEqStore.persist.rehydrate();
      expect(useEqStore.getState().gains).toEqual(EQ_PRESETS.flat);
    });

    it('coerces an unknown preset id to "flat"', () => {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          state: {
            enabled: true,
            preset: 'bogus',
            preampDb: 0,
            gains: [...EQ_PRESETS.flat],
          },
          version: 1,
        })
      );
      useEqStore.persist.rehydrate();
      expect(useEqStore.getState().preset).toBe('flat');
    });

    it('persists changes to localStorage', () => {
      useEqStore.getState().applyPreset('rock');
      useEqStore.getState().setPreampDb(3);
      useEqStore.getState().setEnabled(true);

      const persisted = readPersisted();
      expect(persisted.preset).toBe('rock');
      expect(persisted.preampDb).toBe(3);
      expect(persisted.enabled).toBe(true);
    });
  });

  describe('custom presets', () => {
    it('saves the current gains as a named preset and activates it', () => {
      useEqStore.getState().applyPreset('rock');
      const id = useEqStore.getState().saveCustomPreset('  My Mix  ');
      expect(id).toBeTruthy();
      const s = useEqStore.getState();
      expect(s.customPresets).toHaveLength(1);
      expect(s.customPresets[0].name).toBe('My Mix'); // trimmed
      expect(s.customPresets[0].gains).toEqual(EQ_PRESETS.rock);
      expect(s.activeCustomId).toBe(id);
      expect(s.preset).toBe('custom');
    });

    it('refuses to save an empty name', () => {
      expect(useEqStore.getState().saveCustomPreset('   ')).toBeNull();
      expect(useEqStore.getState().customPresets).toHaveLength(0);
    });

    it('applies a saved preset by id', () => {
      const id = useEqStore.getState().saveCustomPreset('Mix')!;
      useEqStore.getState().applyPreset('flat');
      expect(useEqStore.getState().activeCustomId).toBeNull();
      useEqStore.getState().applyCustomPreset(id);
      expect(useEqStore.getState().activeCustomId).toBe(id);
      expect(useEqStore.getState().preset).toBe('custom');
    });

    it('renames a saved preset', () => {
      const id = useEqStore.getState().saveCustomPreset('Old')!;
      useEqStore.getState().renameCustomPreset(id, 'New');
      expect(useEqStore.getState().customPresets[0].name).toBe('New');
    });

    it('deletes a saved preset and clears the active id when it was active', () => {
      const id = useEqStore.getState().saveCustomPreset('Mix')!;
      useEqStore.getState().deleteCustomPreset(id);
      expect(useEqStore.getState().customPresets).toHaveLength(0);
      expect(useEqStore.getState().activeCustomId).toBeNull();
    });

    it('detaches the active custom preset on a manual band edit', () => {
      const id = useEqStore.getState().saveCustomPreset('Mix')!;
      expect(useEqStore.getState().activeCustomId).toBe(id);
      useEqStore.getState().setBandGain(0, 5);
      expect(useEqStore.getState().activeCustomId).toBeNull();
    });
  });
});
