import { describe, it, expect } from 'vitest';
import {
  windowMinimizeArgs,
  windowMaximizeArgs,
  windowCloseArgs,
  windowIsMaximizedArgs,
  windowSetAlwaysOnTopArgs,
  windowSetCompactModeArgs,
} from './window';

describe('window payload schemas', () => {
  describe('zero-arg schemas', () => {
    it('accept zero args', () => {
      expect(windowMinimizeArgs.safeParse([]).success).toBe(true);
      expect(windowMaximizeArgs.safeParse([]).success).toBe(true);
      expect(windowCloseArgs.safeParse([]).success).toBe(true);
      expect(windowIsMaximizedArgs.safeParse([]).success).toBe(true);
    });

    it('reject extra args', () => {
      expect(windowMinimizeArgs.safeParse([true]).success).toBe(false);
    });
  });

  describe('windowSetAlwaysOnTopArgs / windowSetCompactModeArgs', () => {
    it('accept a boolean', () => {
      expect(windowSetAlwaysOnTopArgs.safeParse([true]).success).toBe(true);
      expect(windowSetCompactModeArgs.safeParse([false]).success).toBe(true);
    });

    it('reject non-boolean', () => {
      expect(windowSetAlwaysOnTopArgs.safeParse(['true']).success).toBe(false);
      expect(windowSetCompactModeArgs.safeParse([1]).success).toBe(false);
    });
  });
});
