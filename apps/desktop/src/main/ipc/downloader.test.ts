import { describe, it, expect } from 'vitest';
import { extractVersionSegments, hasUpdate } from './downloader';

describe('extractVersionSegments', () => {
  it('parses standard semver', () => {
    expect(extractVersionSegments('1.2.3')).toEqual([1, 2, 3]);
  });

  it('parses date-based versions', () => {
    expect(extractVersionSegments('2024.01.01')).toEqual([2024, 1, 1]);
  });

  it('extracts version from prefixed string', () => {
    expect(extractVersionSegments('v1.0.0')).toEqual([1, 0, 0]);
  });

  it('returns empty array for null', () => {
    expect(extractVersionSegments(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractVersionSegments(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractVersionSegments('')).toEqual([]);
  });
});

describe('hasUpdate', () => {
  it('returns true when latest is newer (patch)', () => {
    expect(hasUpdate('1.0.0', '1.0.1')).toBe(true);
  });

  it('returns true when latest is newer (major)', () => {
    expect(hasUpdate('1.0.0', '2.0.0')).toBe(true);
  });

  it('returns false when versions are the same', () => {
    expect(hasUpdate('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(hasUpdate('2.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when current is null', () => {
    expect(hasUpdate(null, '1.0.0')).toBe(false);
  });

  it('returns false when latest is null', () => {
    expect(hasUpdate('1.0.0', null)).toBe(false);
  });

  it('handles date-based versions', () => {
    expect(hasUpdate('2024.01.01', '2024.06.15')).toBe(true);
    expect(hasUpdate('2024.06.15', '2024.01.01')).toBe(false);
  });

  it('handles different segment lengths', () => {
    expect(hasUpdate('1.0', '1.0.1')).toBe(true);
  });
});
