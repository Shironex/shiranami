import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  backgroundUrls,
  customBackgroundKeys,
  useReconcileCustomTheme,
} from './useCustomBackground';
import type { CustomBackground } from '@shiranami/contracts/bindings';

vi.mock('@/lib/bridge/stream-urls', () => ({
  toBackgroundUrl: (fileName: string) => `http://127.0.0.1:1234/tok/background/${fileName}`,
}));

const RECORD: CustomBackground = {
  fileName: 'bg-abc.gif',
  stillFileName: 'bg-abc.still.jpg',
  width: 1920,
  height: 1080,
  animated: true,
};

function wrapperFor(record: CustomBackground | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(customBackgroundKeys.current, record);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function reset(): void {
  useThemeStore.setState({ theme: 'none' });
  document.documentElement.removeAttribute('data-theme');
}

beforeEach(reset);
afterEach(reset);

describe('backgroundUrls', () => {
  it('builds both URLs for an animated record', () => {
    expect(backgroundUrls(RECORD)).toEqual({
      url: 'http://127.0.0.1:1234/tok/background/bg-abc.gif',
      stillUrl: 'http://127.0.0.1:1234/tok/background/bg-abc.still.jpg',
    });
  });

  it('has no still URL for a static record', () => {
    expect(backgroundUrls({ ...RECORD, animated: false, stillFileName: null }).stillUrl).toBeNull();
  });

  it('answers nulls for no record at all', () => {
    expect(backgroundUrls(null)).toEqual({ url: null, stillUrl: null });
    expect(backgroundUrls(undefined)).toEqual({ url: null, stillUrl: null });
  });
});

describe('useReconcileCustomTheme', () => {
  /**
   * I3, runtime half. The theme id lives in localStorage and the file it refers
   * to lives in a Rust settings document, so the two can disagree — after an
   * external delete, after restoring a profile without its `backgrounds/`
   * directory, or on any machine where localStorage outlived an app-data wipe.
   */
  it('falls back to the default theme when custom is selected but nothing is imported', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });
  });

  it('leaves the custom theme alone when an image is imported', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(RECORD) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('custom');
    });
  });

  /**
   * `applyTheme` withholds `data-theme="custom"` until a record is confirmed,
   * because the attribute switches on chrome-contrast rules and a heavier scrim
   * that all assume a photo is behind them. This is the confirmation.
   */
  it('sets data-theme="custom" only once the record is confirmed', async () => {
    useThemeStore.setState({ theme: 'custom' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(RECORD) });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('custom');
    });
  });

  it('never sets data-theme="custom" when no image is imported', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  /**
   * The regression this latch exists for, and the reason it is a test rather
   * than a comment.
   *
   * Selecting the "your image" tile before importing anything sets the theme to
   * `custom` with no record present — which, to an unlatched reconciler, is
   * indistinguishable from a stale persisted selection. It would reset the theme
   * on the very next effect pass, unmounting the "Choose an image…" button one
   * frame after it appeared and making the feature impossible to turn on from a
   * clean state.
   *
   * The whole suite was green while that was true, because nothing mounted the
   * reconciler and changed the theme afterwards. This does both.
   */
  it('does not undo a theme the user selects after the first answer', async () => {
    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    // Let the first (empty) answer be reconciled.
    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });

    // Now the user picks the custom tile, still with nothing imported.
    useThemeStore.getState().setTheme('custom');

    // It must survive: this is how they reach the picker.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useThemeStore.getState().theme).toBe('custom');
  });

  it('leaves a bundled theme alone when nothing is imported', async () => {
    // Having no custom background is the normal state for most users; it must
    // not reset a theme they deliberately picked.
    useThemeStore.setState({ theme: 'wisteria' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('wisteria');
    });
  });
});
