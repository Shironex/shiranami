import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerUIStore } from './usePlayerUIStore';

describe('usePlayerUIStore', () => {
  beforeEach(() => {
    usePlayerUIStore.setState({ scrubTime: null });
  });

  it('starts with scrubTime null', () => {
    expect(usePlayerUIStore.getState().scrubTime).toBeNull();
  });

  it('setScrubTime writes the given value', () => {
    usePlayerUIStore.getState().setScrubTime(42);
    expect(usePlayerUIStore.getState().scrubTime).toBe(42);
  });

  it('setScrubTime(null) clears the value', () => {
    usePlayerUIStore.setState({ scrubTime: 7 });
    usePlayerUIStore.getState().setScrubTime(null);
    expect(usePlayerUIStore.getState().scrubTime).toBeNull();
  });
});
