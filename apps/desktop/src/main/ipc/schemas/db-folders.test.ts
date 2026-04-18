import { describe, it, expect } from 'vitest';
import {
  foldersGetAllArgs,
  foldersAddArgs,
  foldersRemoveArgs,
  foldersUpdateScannedArgs,
} from './db-folders';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('db:folders payload schemas', () => {
  describe('foldersGetAllArgs', () => {
    it('accepts zero args', () => {
      expect(foldersGetAllArgs.safeParse([]).success).toBe(true);
    });

    it('rejects extra args', () => {
      expect(foldersGetAllArgs.safeParse(['x']).success).toBe(false);
    });
  });

  describe('foldersAddArgs', () => {
    it('accepts a non-empty path', () => {
      expect(foldersAddArgs.safeParse(['/music']).success).toBe(true);
    });

    it('rejects empty string', () => {
      expect(foldersAddArgs.safeParse(['']).success).toBe(false);
    });

    it('rejects non-string', () => {
      expect(foldersAddArgs.safeParse([42]).success).toBe(false);
    });
  });

  describe('foldersRemoveArgs / foldersUpdateScannedArgs', () => {
    it('accept a uuid', () => {
      expect(foldersRemoveArgs.safeParse([UUID]).success).toBe(true);
      expect(foldersUpdateScannedArgs.safeParse([UUID]).success).toBe(true);
    });

    it('reject non-uuid', () => {
      expect(foldersRemoveArgs.safeParse(['nope']).success).toBe(false);
    });
  });
});
