/**
 * The equaliser's state machine.
 *
 * Worth an E2E rather than a unit test for one reason: the store persists to
 * `localStorage` through `createPersistedStore`, and `localStorage` inside the
 * Tauri webview is a real browser store scoped to the `tauri://localhost`
 * origin — not the jsdom stub the unit tests get. The reload assertion at the
 * bottom is the only place the rehydrate path (`sanitize`, `partialize`, the
 * version gate) runs against a real one.
 *
 * The rest pins the rule that makes the preset menu honest: a preset is a *name
 * for a set of gains*, so moving a band re-derives the name rather than keeping
 * a stale label on gains that no longer match it.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';

/** The ten-band `flat` preset, and so the default gain array. */
const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** `EQ_PRESETS.rock`, restated so a change to it fails here rather than silently. */
const ROCK = [5, 3, -3.5, -5, -2, 2.5, 5.5, 6.5, 6.5, 6.5];

async function eqState() {
  return browser.execute(() => {
    const state = window.__shiranami!.stores.eq.getState();
    return {
      enabled: state.enabled,
      preset: state.preset,
      preampDb: state.preampDb,
      gains: state.gains,
    };
  });
}

describe('eq', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  beforeEach(async () => {
    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.reset();
      eq.setEnabled(false);
    });
  });

  it('starts flat and disabled', async () => {
    const state = await eqState();
    expect(state.enabled).toBe(false);
    expect(state.preset).toBe('flat');
    expect(state.preampDb).toBe(0);
    expect(state.gains).toEqual(FLAT);
  });

  it('applies a named preset to every band', async () => {
    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().applyPreset('rock');
    });

    const state = await eqState();
    expect(state.preset).toBe('rock');
    expect(state.gains).toEqual(ROCK);
  });

  it('moving one band detaches the preset name to custom', async () => {
    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().applyPreset('rock');
    });
    await browser.execute(() => {
      // 0 is not `rock`'s value for band 0 (5), so the resulting gains match no
      // named preset and the label must say so rather than keep claiming rock.
      window.__shiranami!.stores.eq.getState().setBandGain(0, 0);
    });

    const state = await eqState();
    expect(state.preset).toBe('custom');
    expect(state.gains[0]).toBe(0);
    // Every other band is untouched.
    expect(state.gains.slice(1)).toEqual(ROCK.slice(1));
  });

  it('re-derives a preset name when gains land back on one', async () => {
    // The inverse of the rule above, and the reason `detectPreset` exists
    // rather than a boolean "is custom" flag: hand-dialling the flat curve is
    // flat, not custom.
    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().applyPreset('rock');
    });
    await browser.execute(bandCount => {
      // `bandCount` is passed rather than closed over: `browser.execute`
      // serialises this function and evaluates it in the webview, where nothing
      // from the spec's module scope exists.
      const eq = window.__shiranami!.stores.eq.getState();
      for (let index = 0; index < bandCount; index += 1) {
        eq.setBandGain(index, 0);
      }
    }, ROCK.length);

    const state = await eqState();
    expect(state.gains).toEqual(FLAT);
    expect(state.preset).toBe('flat');
  });

  it('clamps band gains to the ±12 dB range', async () => {
    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.setBandGain(0, 999);
      eq.setBandGain(1, -999);
    });

    const state = await eqState();
    expect(state.gains[0]).toBe(12);
    expect(state.gains[1]).toBe(-12);
  });

  it('ignores a band index outside the ten bands', async () => {
    const before = (await eqState()).gains;

    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.setBandGain(-1, 6);
      eq.setBandGain(10, 6);
    });

    expect((await eqState()).gains).toEqual(before);
  });

  it('clamps the preamp too', async () => {
    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().setPreampDb(50);
    });
    expect((await eqState()).preampDb).toBe(12);

    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().setPreampDb(-50);
    });
    expect((await eqState()).preampDb).toBe(-12);
  });

  it('reset returns to flat without changing enabled', async () => {
    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.setEnabled(true);
      eq.applyPreset('bassboost');
      eq.setPreampDb(6);
    });

    await browser.execute(() => {
      window.__shiranami!.stores.eq.getState().reset();
    });

    const state = await eqState();
    expect(state.gains).toEqual(FLAT);
    expect(state.preset).toBe('flat');
    expect(state.preampDb).toBe(0);
    // `reset` is about the curve, not about whether the EQ is switched on.
    expect(state.enabled).toBe(true);
  });

  it('survives a reload through localStorage', async () => {
    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.setEnabled(true);
      eq.applyPreset('jazz');
      eq.setPreampDb(3);
    });

    await browser.execute(() => {
      window.location.reload();
    });

    await waitForStores();
    await waitForShell();

    const state = await eqState();
    expect(state.enabled).toBe(true);
    expect(state.preset).toBe('jazz');
    expect(state.preampDb).toBe(3);

    // Leave the profile as the other specs expect to find it.
    await browser.execute(() => {
      const eq = window.__shiranami!.stores.eq.getState();
      eq.reset();
      eq.setEnabled(false);
    });
  });
});
