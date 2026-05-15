import { test, expect } from './fixtures';
import { test as base } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface EqState {
  enabled: boolean;
  preset: string;
  preampDb: number;
  gains: number[];
  setEnabled: (on: boolean) => void;
  setBandGain: (index: number, db: number) => void;
  setPreampDb: (db: number) => void;
  applyPreset: (id: string) => void;
  reset: () => void;
}

test.describe('EQ store', () => {
  test('initial state is disabled + flat preset', async ({ page }) => {
    await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.eq));

    const initial = await page.evaluate(() => {
      const store = window.__shiranami!.stores.eq as unknown as { getState: () => EqState };
      const s = store.getState();
      return {
        enabled: s.enabled,
        preset: s.preset,
        preampDb: s.preampDb,
        bandCount: s.gains.length,
      };
    });

    expect(initial.enabled).toBe(false);
    expect(initial.preset).toBe('flat');
    expect(initial.preampDb).toBe(0);
    expect(initial.bandCount).toBeGreaterThan(0); // EQ_BANDS defines the count
  });

  test('setEnabled / setBandGain / setPreampDb / reset all flow through state', async ({
    page,
  }) => {
    await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.eq));

    const after = await page.evaluate(() => {
      const store = window.__shiranami!.stores.eq as unknown as { getState: () => EqState };
      store.getState().setEnabled(true);
      store.getState().setPreampDb(-3);
      store.getState().setBandGain(0, 4);
      store.getState().setBandGain(1, 2);
      const dirty = store.getState();
      const snapshot = {
        enabled: dirty.enabled,
        preampDb: dirty.preampDb,
        band0: dirty.gains[0],
        band1: dirty.gains[1],
        preset: dirty.preset,
      };
      store.getState().reset();
      const clean = store.getState();
      return {
        dirty: snapshot,
        clean: { preset: clean.preset, preampDb: clean.preampDb, band0: clean.gains[0] },
      };
    });

    expect(after.dirty.enabled).toBe(true);
    expect(after.dirty.preampDb).toBe(-3);
    expect(after.dirty.band0).toBe(4);
    expect(after.dirty.band1).toBe(2);
    // After setBandGain the preset transitions to 'custom' (gains no longer match any named preset).
    expect(after.dirty.preset).toBe('custom');

    // reset() returns to flat / 0 dB.
    expect(after.clean.preset).toBe('flat');
    expect(after.clean.preampDb).toBe(0);
    expect(after.clean.band0).toBe(0);
  });

  test('applyPreset switches the preset id and gains together', async ({ page }) => {
    await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.eq));

    const applied = await page.evaluate(() => {
      const store = window.__shiranami!.stores.eq as unknown as { getState: () => EqState };
      // applyPreset rejects 'custom' (round-trip via setBandGain instead).
      store.getState().applyPreset('bassboost');
      const s = store.getState();
      return { preset: s.preset, gains: s.gains };
    });

    expect(applied.preset).toBe('bassboost');
    expect(applied.gains.some((g: number) => g !== 0)).toBe(true);
  });
});

base.describe('EQ persistence', () => {
  base('settings persist across a relaunch', async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'shiranami-e2e-eq-persist-'));
    try {
      const first = await launchApp({ userDataDir });
      try {
        await first.page.waitForFunction(() => Boolean(window.__shiranami?.stores?.eq));
        await first.page.evaluate(() => {
          const store = window.__shiranami!.stores.eq as unknown as { getState: () => EqState };
          store.getState().setEnabled(true);
          store.getState().applyPreset('rock');
          store.getState().setPreampDb(-2);
        });

        // zustand persist writes asynchronously — wait until the localStorage
        // value reflects the change before tearing down.
        await first.page.waitForFunction(() => {
          const raw = window.localStorage.getItem('shiranami.eq-store');
          if (!raw) return false;
          try {
            const parsed = JSON.parse(raw);
            return parsed?.state?.enabled === true && parsed?.state?.preset === 'rock';
          } catch {
            return false;
          }
        });
      } finally {
        await first.close();
      }

      const second = await launchApp({ userDataDir });
      try {
        await second.page.waitForFunction(() => Boolean(window.__shiranami?.stores?.eq));
        const restored = await second.page.evaluate(() => {
          const store = window.__shiranami!.stores.eq as unknown as { getState: () => EqState };
          const s = store.getState();
          return { enabled: s.enabled, preset: s.preset, preampDb: s.preampDb };
        });
        expect(restored.enabled).toBe(true);
        expect(restored.preset).toBe('rock');
        expect(restored.preampDb).toBe(-2);
      } finally {
        await second.close();
      }
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
