import { describe, it, expect } from 'vitest';
import { dialogOpenDirectoryArgs, dialogOpenFileArgs } from './dialog';

describe('dialog payload schemas', () => {
  describe('dialogOpenDirectoryArgs', () => {
    it('accepts zero args', () => {
      expect(dialogOpenDirectoryArgs.safeParse([]).success).toBe(true);
    });
  });

  describe('dialogOpenFileArgs', () => {
    it('accepts zero args (undefined options)', () => {
      expect(dialogOpenFileArgs.safeParse([]).success).toBe(true);
    });

    it('accepts empty options', () => {
      expect(dialogOpenFileArgs.safeParse([{}]).success).toBe(true);
    });

    it('accepts options with filters', () => {
      expect(
        dialogOpenFileArgs.safeParse([
          { filters: [{ name: 'Audio', extensions: ['mp3', 'flac'] }] },
        ]).success,
      ).toBe(true);
    });

    it('rejects malformed filter', () => {
      expect(
        dialogOpenFileArgs.safeParse([{ filters: [{ name: 'Audio' }] }]).success,
      ).toBe(false);
    });
  });
});
