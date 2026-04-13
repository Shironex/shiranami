import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrimaryRGB } from './usePrimaryRGB';

describe('usePrimaryRGB', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--primary-rgb', '10, 20, 30');
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--primary-rgb');
    document.documentElement.removeAttribute('data-theme');
  });

  it('reads --primary-rgb from documentElement on mount', () => {
    const { result } = renderHook(() => usePrimaryRGB());
    expect(result.current.rgbRef.current).toEqual([10, 20, 30]);
  });

  it('falls back to default when the var is missing or malformed', () => {
    document.documentElement.style.removeProperty('--primary-rgb');
    const { result } = renderHook(() => usePrimaryRGB());
    expect(result.current.rgbRef.current).toEqual([155, 125, 235]);
  });

  it('updates rgbRef and bumps versionRef when --primary-rgb changes', async () => {
    const { result } = renderHook(() => usePrimaryRGB());
    const initialVersion = result.current.versionRef.current;

    await act(async () => {
      document.documentElement.style.setProperty('--primary-rgb', '200, 100, 50');
      // MutationObserver callbacks are microtask-scheduled.
      await Promise.resolve();
    });

    expect(result.current.rgbRef.current).toEqual([200, 100, 50]);
    expect(result.current.versionRef.current).toBe(initialVersion + 1);
  });

  it('does not bump version when the value is unchanged', async () => {
    const { result } = renderHook(() => usePrimaryRGB());
    const initialVersion = result.current.versionRef.current;

    await act(async () => {
      // Touch an unrelated attribute — value does not change.
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    expect(result.current.versionRef.current).toBe(initialVersion);
  });

  it('disconnects the observer on unmount', async () => {
    const { result, unmount } = renderHook(() => usePrimaryRGB());
    unmount();

    await act(async () => {
      document.documentElement.style.setProperty('--primary-rgb', '1, 2, 3');
      await Promise.resolve();
    });

    expect(result.current.rgbRef.current).not.toEqual([1, 2, 3]);
  });
});
