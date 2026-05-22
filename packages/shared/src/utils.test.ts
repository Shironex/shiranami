import { describe, it, expect } from 'vitest';
import { formatDuration, truncate } from './utils';

describe('truncate', () => {
  it('returns empty string when max <= 0', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -1)).toBe('');
  });

  it('returns original text when within max', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('abcdef', 5)).toBe('ab...');
  });

  it('respects short max vs ellipsis length', () => {
    expect(truncate('abcdef', 2, '...')).toBe('..');
  });
});

describe('formatDuration', () => {
  it('formats mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats hh:mm:ss when hours present', () => {
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('handles non-finite and negative', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(-1)).toBe('0:00');
  });
});
