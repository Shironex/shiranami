import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANION_DEFAULT_PERCH_FRACTION,
  isCompanionSpecies,
  useCompanionStore,
} from './useCompanionStore';

const STORE_KEY = 'shiranami.companion-store';

describe('useCompanionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCompanionStore.setState({
      species: 'shio',
      perchFraction: COMPANION_DEFAULT_PERCH_FRACTION,
      sanctuaryKeepsWatch: false,
      dressForWeather: true,
    });
  });

  it('defaults to Shio, the default perch seat, no sanctuary watch, weather fits on', () => {
    const s = useCompanionStore.getState();
    expect(s.species).toBe('shio');
    expect(s.perchFraction).toBe(COMPANION_DEFAULT_PERCH_FRACTION);
    expect(s.sanctuaryKeepsWatch).toBe(false);
    expect(s.dressForWeather).toBe(true);
  });

  it('switches species between the two residents only', () => {
    useCompanionStore.getState().setSpecies('hotaru');
    expect(useCompanionStore.getState().species).toBe('hotaru');

    useCompanionStore.getState().setSpecies('cat' as never);
    expect(useCompanionStore.getState().species).toBe('hotaru');
  });

  it('clamps the perch fraction into 0..1 and rejects non-numbers', () => {
    const { setPerchFraction } = useCompanionStore.getState();
    setPerchFraction(1.7);
    expect(useCompanionStore.getState().perchFraction).toBe(1);
    setPerchFraction(-0.4);
    expect(useCompanionStore.getState().perchFraction).toBe(0);
    setPerchFraction(Number.NaN);
    expect(useCompanionStore.getState().perchFraction).toBe(COMPANION_DEFAULT_PERCH_FRACTION);
  });

  it('toggles the sanctuary keeps-watch preference', () => {
    useCompanionStore.getState().setSanctuaryKeepsWatch(true);
    expect(useCompanionStore.getState().sanctuaryKeepsWatch).toBe(true);
  });

  it('toggles the weather-fits preference', () => {
    useCompanionStore.getState().setDressForWeather(false);
    expect(useCompanionStore.getState().dressForWeather).toBe(false);
    useCompanionStore.getState().setDressForWeather(true);
    expect(useCompanionStore.getState().dressForWeather).toBe(true);
  });

  it('narrows species values', () => {
    expect(isCompanionSpecies('shio')).toBe(true);
    expect(isCompanionSpecies('hotaru')).toBe(true);
    expect(isCompanionSpecies('awa')).toBe(false);
    expect(isCompanionSpecies(null)).toBe(false);
  });
});

describe('useCompanionStore rehydration sanitizing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('round-trips a persisted dressForWeather=false on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { species: 'hotaru', dressForWeather: false }, version: 1 })
    );
    const mod = await import('./useCompanionStore');
    expect(mod.useCompanionStore.getState().species).toBe('hotaru');
    expect(mod.useCompanionStore.getState().dressForWeather).toBe(false);
  });

  it('falls back to weather fits on for garbage or absent persisted values', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { species: 'shio', dressForWeather: 'maybe' }, version: 1 })
    );
    const mod = await import('./useCompanionStore');
    expect(mod.useCompanionStore.getState().dressForWeather).toBe(true);
  });
});
