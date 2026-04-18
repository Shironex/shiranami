import { describe, it, expect } from 'vitest';
import { storeGetArgs, storeSetArgs, storeDeleteArgs } from './store';

describe('store payload schemas', () => {
  describe('storeGetArgs', () => {
    it('accepts an allowed key', () => {
      expect(storeGetArgs.safeParse(['theme']).success).toBe(true);
      expect(storeGetArgs.safeParse(['settings']).success).toBe(true);
    });

    it('rejects a disallowed key', () => {
      expect(storeGetArgs.safeParse(['downloads.location']).success).toBe(false);
      expect(storeGetArgs.safeParse(['admin.password']).success).toBe(false);
    });

    it('rejects empty args', () => {
      expect(storeGetArgs.safeParse([]).success).toBe(false);
    });
  });

  describe('storeSetArgs', () => {
    it('accepts (allowedKey, any value)', () => {
      expect(storeSetArgs.safeParse(['player.volume', 0.5]).success).toBe(true);
      expect(storeSetArgs.safeParse(['player-state', { foo: 1 }]).success).toBe(true);
    });

    it('rejects disallowed key', () => {
      expect(storeSetArgs.safeParse(['not-a-key', 1]).success).toBe(false);
    });
  });

  describe('storeDeleteArgs', () => {
    it('accepts an allowed key', () => {
      expect(storeDeleteArgs.safeParse(['window-bounds']).success).toBe(true);
    });

    it('rejects disallowed key', () => {
      expect(storeDeleteArgs.safeParse(['secret']).success).toBe(false);
    });
  });
});
