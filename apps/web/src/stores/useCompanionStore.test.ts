import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPANION_DEFAULT_PERCH_FRACTION,
  isCompanionSpecies,
  useCompanionStore,
} from './useCompanionStore';

describe('useCompanionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCompanionStore.setState({
      species: 'shio',
      perchFraction: COMPANION_DEFAULT_PERCH_FRACTION,
      sanctuaryKeepsWatch: false,
    });
  });

  it('defaults to Shio, the default perch seat, and no sanctuary watch', () => {
    const s = useCompanionStore.getState();
    expect(s.species).toBe('shio');
    expect(s.perchFraction).toBe(COMPANION_DEFAULT_PERCH_FRACTION);
    expect(s.sanctuaryKeepsWatch).toBe(false);
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

  it('narrows species values', () => {
    expect(isCompanionSpecies('shio')).toBe(true);
    expect(isCompanionSpecies('hotaru')).toBe(true);
    expect(isCompanionSpecies('awa')).toBe(false);
    expect(isCompanionSpecies(null)).toBe(false);
  });
});
