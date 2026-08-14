import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  backgroundLibraryKeys,
  backgroundUrls,
  libraryOfRecord,
  resolveEffectiveEntry,
  useReconcileCustomTheme,
  type IBackgroundLibraryView,
  type IBackgroundSelectionInputs,
} from './useBackgroundLibrary';
import type { BackgroundLibraryEntry, CustomBackground } from '@shiranami/contracts/bindings';

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

function entry(id: string, label = ''): BackgroundLibraryEntry {
  return {
    id,
    label,
    background: { ...RECORD, fileName: `bg-${id}.png`, stillFileName: null, animated: false },
  };
}

function wrapperFor(record: CustomBackground | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(backgroundLibraryKeys.library, libraryOfRecord(record));
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

describe('resolveEffectiveEntry', () => {
  const INPUTS: IBackgroundSelectionInputs = {
    mode: 'single',
    rotationInterval: 'daily',
    schedule: {},
    launchNonce: 7,
    hour: 12,
    // 2026-08-14T12:00Z-ish; any fixed instant works — the indices only need
    // to be deterministic within a test.
    now: 1_786_000_000_000,
    timezoneOffsetMinutes: 0,
  };
  const LIBRARY: IBackgroundLibraryView = {
    entries: [entry('1'), entry('2'), entry('3')],
    activeId: '2',
  };

  it('answers null for an empty library, in every mode', () => {
    for (const mode of ['single', 'rotation', 'timeOfDay'] as const) {
      expect(
        resolveEffectiveEntry({ entries: [], activeId: null }, { ...INPUTS, mode })
      ).toBeNull();
    }
  });

  it('answers the active entry in single mode, or the first when the id is stale', () => {
    expect(resolveEffectiveEntry(LIBRARY, INPUTS)?.id).toBe('2');
    expect(resolveEffectiveEntry({ ...LIBRARY, activeId: '99' }, INPUTS)?.id).toBe('1');
  });

  it('rotates per launch by the session nonce', () => {
    const chosen = resolveEffectiveEntry(LIBRARY, {
      ...INPUTS,
      mode: 'rotation',
      rotationInterval: 'launch',
    });
    // nonce 7 over 3 entries -> index 1
    expect(chosen?.id).toBe('2');
  });

  it('advances the hourly rotation when the hour advances', () => {
    const at = (hour: number) =>
      resolveEffectiveEntry(LIBRARY, {
        ...INPUTS,
        mode: 'rotation',
        rotationInterval: 'hourly',
        hour,
      })?.id;

    expect(at(13)).not.toBe(at(12));
  });

  it('advances the daily rotation when the local day advances', () => {
    const at = (now: number) =>
      resolveEffectiveEntry(LIBRARY, {
        ...INPUTS,
        mode: 'rotation',
        rotationInterval: 'daily',
        now,
      })?.id;

    expect(at(INPUTS.now + 86_400_000)).not.toBe(at(INPUTS.now));
  });

  it('keeps a one-entry rotation on that entry', () => {
    const solo: IBackgroundLibraryView = { entries: [entry('1')], activeId: '1' };
    expect(
      resolveEffectiveEntry(solo, { ...INPUTS, mode: 'rotation', rotationInterval: 'hourly' })?.id
    ).toBe('1');
  });

  it('answers the scheduled entry for the current room-light stop', () => {
    // Hour 23 is inside the night stop.
    const chosen = resolveEffectiveEntry(LIBRARY, {
      ...INPUTS,
      mode: 'timeOfDay',
      schedule: { night: '3' },
      hour: 23,
    });
    expect(chosen?.id).toBe('3');
  });

  it('falls back to the active pick for unmapped slots and dead ids', () => {
    const unmapped = resolveEffectiveEntry(LIBRARY, { ...INPUTS, mode: 'timeOfDay', hour: 23 });
    expect(unmapped?.id).toBe('2');

    const dead = resolveEffectiveEntry(LIBRARY, {
      ...INPUTS,
      mode: 'timeOfDay',
      schedule: { night: '99' },
      hour: 23,
    });
    expect(dead?.id).toBe('2');
  });
});

describe('useReconcileCustomTheme', () => {
  /**
   * I3, runtime half. The theme id lives in localStorage and the files it
   * refers to live in a Rust settings document, so the two can disagree —
   * after an external delete, after restoring a profile without its
   * `backgrounds/` directory, or on any machine where localStorage outlived an
   * app-data wipe.
   */
  it('falls back to the default theme when custom is selected but nothing is saved', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });
  });

  it('leaves the custom theme alone when an image is saved', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(RECORD) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('custom');
    });
  });

  /**
   * `applyTheme` withholds `data-theme="custom"` until a record is confirmed,
   * because the attribute switches on chrome-contrast rules and a heavier
   * scrim that all assume a photo is behind them. This is the confirmation.
   */
  it('sets data-theme="custom" only once the library is confirmed non-empty', async () => {
    useThemeStore.setState({ theme: 'custom' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(RECORD) });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('custom');
    });
  });

  it('never sets data-theme="custom" when nothing is saved', async () => {
    useThemeStore.setState({ theme: 'custom' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  /**
   * The regression this latch exists for. Selecting the "your image" tile
   * before importing anything sets the theme to `custom` with an empty
   * library — which, to an unlatched reconciler, is indistinguishable from a
   * stale persisted selection. It would reset the theme on the very next
   * effect pass, unmounting the add button one frame after it appeared and
   * making the feature impossible to turn on from a clean state.
   */
  it('does not undo a theme the user selects after the first answer', async () => {
    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    // Let the first (empty) answer be reconciled.
    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('none');
    });

    // Now the user picks the custom tile, still with nothing saved.
    useThemeStore.getState().setTheme('custom');

    // It must survive: this is how they reach the add button.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useThemeStore.getState().theme).toBe('custom');
  });

  it('leaves a bundled theme alone when nothing is saved', async () => {
    // Having no saved background is the normal state for most users; it must
    // not reset a theme they deliberately picked.
    useThemeStore.setState({ theme: 'wisteria' });

    renderHook(() => useReconcileCustomTheme(), { wrapper: wrapperFor(null) });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('wisteria');
    });
  });
});
