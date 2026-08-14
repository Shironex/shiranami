import { describe, expect, it } from 'vitest';
import {
  COMPANION_ACCESSORIES,
  isAccessoryUnlocked,
  isCompanionAccessory,
  sanitizeWornAccessories,
} from './companionAccessories';

describe('the keepsake catalog', () => {
  it('offers one keepsake per growth stage past hatch', () => {
    expect(COMPANION_ACCESSORIES.map(m => m.unlockStage)).toEqual([1, 2, 3, 4]);
  });

  it('recognizes only catalog ids', () => {
    expect(isCompanionAccessory('beret')).toBe(true);
    expect(isCompanionAccessory('umbrella')).toBe(false);
    expect(isCompanionAccessory(7)).toBe(false);
  });

  it('unlocks each keepsake exactly at its stage', () => {
    expect(isAccessoryUnlocked('beret', 0)).toBe(false);
    expect(isAccessoryUnlocked('beret', 1)).toBe(true);
    expect(isAccessoryUnlocked('pendant', 3)).toBe(false);
    expect(isAccessoryUnlocked('pendant', 4)).toBe(true);
  });
});

describe('sanitizeWornAccessories', () => {
  it('keeps only known, unlocked ids in catalog order', () => {
    expect(sanitizeWornAccessories(['satchel', 'beret'], 4)).toEqual(['beret', 'satchel']);
    expect(sanitizeWornAccessories(['pendant', 'glasses'], 2)).toEqual(['glasses']);
  });

  it('a keepsake past the reached stage waits in the drawer, not an error', () => {
    expect(sanitizeWornAccessories(['pendant'], 1)).toEqual([]);
  });

  it('degrades garbage and duplicates to nothing worn twice', () => {
    expect(sanitizeWornAccessories(['beret', 'beret', 'crown', ''], 4)).toEqual(['beret']);
    expect(sanitizeWornAccessories([], 4)).toEqual([]);
  });
});
