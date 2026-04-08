import { beforeEach, describe, expect, it } from 'vitest';
import { acquireScanLock, isScanLocked, releaseScanLock } from './scanLock';

describe('scanLock', () => {
  beforeEach(() => {
    releaseScanLock();
  });

  // --- isScanLocked ---
  describe('isScanLocked', () => {
    it('returns false initially', () => {
      expect(isScanLocked()).toBe(false);
    });

    it('returns true after acquiring lock', () => {
      acquireScanLock();
      expect(isScanLocked()).toBe(true);
    });

    it('returns false after releasing lock', () => {
      acquireScanLock();
      releaseScanLock();
      expect(isScanLocked()).toBe(false);
    });
  });

  // --- acquireScanLock ---
  describe('acquireScanLock', () => {
    it('returns true and locks when not locked', () => {
      expect(acquireScanLock()).toBe(true);
      expect(isScanLocked()).toBe(true);
    });

    it('returns false when already locked', () => {
      acquireScanLock();
      expect(acquireScanLock()).toBe(false);
    });
  });

  // --- releaseScanLock ---
  describe('releaseScanLock', () => {
    it('unlocks so subsequent acquire succeeds', () => {
      acquireScanLock();
      expect(acquireScanLock()).toBe(false);

      releaseScanLock();
      expect(acquireScanLock()).toBe(true);
    });
  });
});
