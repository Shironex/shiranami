import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BackgroundLibrary, BackgroundLibraryEntry } from '@shiranami/contracts/bindings';
import { commands } from '@/lib/bridge/commands';
import { toBackgroundUrl } from '@/lib/bridge/stream-urls';
import { IS_ELECTRON } from '@/lib/platform';
import { useCurrentHour } from '@/hooks/useCurrentHour';
import { roomLightStopKeyForHour } from '@/hooks/useRoomLight';
import { useThemeStore, applyTheme, DEFAULT_THEME, CUSTOM_THEME } from '@/stores/useThemeStore';
import {
  useBackgroundSelectionStore,
  type BackgroundRotationInterval,
  type BackgroundSchedule,
  type BackgroundSelectionMode,
} from '@/stores/useBackgroundSelectionStore';
import { logger } from '@/lib/logger';

export type { BackgroundLibraryEntry, CustomBackground } from '@shiranami/contracts/bindings';

export const backgroundLibraryKeys = {
  library: ['background-library'] as const,
};

/** The library with its wire-optional fields resolved to concrete values. */
export interface IBackgroundLibraryView {
  readonly entries: readonly BackgroundLibraryEntry[];
  readonly activeId: string | null;
}

export const EMPTY_BACKGROUND_LIBRARY: IBackgroundLibraryView = { entries: [], activeId: null };

/**
 * Resolve the wire shape's `#[serde(default)]` optionals once, at the cache
 * boundary, so every consumer reads `entries`/`activeId` without re-guarding.
 */
export function normalizeLibrary(library: BackgroundLibrary | null): IBackgroundLibraryView {
  if (!library) return EMPTY_BACKGROUND_LIBRARY;
  return { entries: library.entries ?? [], activeId: library.activeId ?? null };
}

/**
 * The saved-background library, as the backend knows it.
 *
 * The **backend is the source of truth** and nothing about the files is
 * mirrored into localStorage — the records name files on disk, and only the
 * process that can stat those files is entitled to say what exists.
 * `background_library_get` heals entries whose files have vanished, so what
 * arrives here is always paintable.
 */
export function useBackgroundLibraryQuery() {
  return useQuery({
    queryKey: backgroundLibraryKeys.library,
    queryFn: async (): Promise<IBackgroundLibraryView> => {
      if (!IS_ELECTRON) return EMPTY_BACKGROUND_LIBRARY;
      return normalizeLibrary(await commands.backgroundLibraryGet());
    },
    // The library only changes through the mutations below, all of which
    // write this key directly. Nothing else on the machine touches it.
    staleTime: Infinity,
    // One retry, unlike most queries here. A failure is not cosmetic: it makes
    // the wallpaper disappear app-wide and makes Settings offer to import
    // images that already exist, so it is worth a second attempt before the
    // Appearance card surfaces it.
    retry: 1,
  });
}

/**
 * Reconcile a persisted `custom` theme against the backend's answer.
 *
 * The two halves of "the user chose their own wallpaper" live in different
 * stores by necessity — the *choice* is a localStorage theme id, the *files*
 * are a Rust settings entry — so they can disagree: after an external delete,
 * after restoring a profile without its `backgrounds/` directory, and on any
 * machine where localStorage survived an app-data wipe.
 *
 * Returning to the default theme is the resolution because
 * `data-theme="custom"` with no image behind it is not a neutral state: it
 * turns on eight chrome-contrast rules that assume a photo is there.
 * `theme-init.ts` already refuses to set the attribute pre-paint; this only
 * has to correct the store, never the DOM mid-flight.
 */
export function useReconcileCustomTheme(): void {
  const { data, isSuccess } = useBackgroundLibraryQuery();
  const reconciled = useRef(false);

  useEffect(() => {
    if (!isSuccess || reconciled.current) return;
    // Latched to the FIRST answer. Without the latch this effect also fires on
    // every later theme change, and would then undo the user's own selection:
    // picking the custom tile before importing anything sets the theme with an
    // empty library, which is indistinguishable here from a stale persisted
    // one. Correcting persistence is a startup job; after that the user's
    // choices are theirs.
    reconciled.current = true;

    if (data.entries.length === 0 && useThemeStore.getState().theme === CUSTOM_THEME) {
      logger.warn('[background] no saved backgrounds; falling back to the default theme');
      useThemeStore.getState().setTheme(DEFAULT_THEME);
    }
  }, [isSuccess, data]);

  // `applyTheme` withholds `data-theme="custom"` until a record is confirmed,
  // because the attribute turns on chrome-contrast rules that assume a photo
  // is behind them. This is where the confirmation arrives.
  useEffect(() => {
    if (isSuccess && data.entries.length > 0 && useThemeStore.getState().theme === CUSTOM_THEME) {
      applyTheme(CUSTOM_THEME, true);
    }
  }, [isSuccess, data]);
}

/**
 * A one-entry library view around a single record — the exact shape the
 * backend migration produces from a pre-library profile. Exported for tests
 * and stories, which mostly care about "one image is saved and active".
 */
export function libraryOfRecord(
  record: BackgroundLibraryEntry['background'] | null
): IBackgroundLibraryView {
  if (!record) return EMPTY_BACKGROUND_LIBRARY;
  return { entries: [{ id: '1', label: '', background: record }], activeId: '1' };
}

/** The loopback URLs for a record, or `null` before the shell has answered. */
export function backgroundUrls(record: BackgroundLibraryEntry['background'] | null | undefined): {
  url: string | null;
  stillUrl: string | null;
} {
  if (!record) return { url: null, stillUrl: null };
  return {
    url: toBackgroundUrl(record.fileName),
    // `== null`, covering undefined as well: `still_file_name` carries
    // `#[serde(default)]` so the generated type is optional, and a record
    // written before stills existed omits the key entirely rather than
    // sending null.
    stillUrl: record.stillFileName == null ? null : toBackgroundUrl(record.stillFileName),
  };
}

/** Everything the effective-background resolver depends on. */
export interface IBackgroundSelectionInputs {
  readonly mode: BackgroundSelectionMode;
  readonly rotationInterval: BackgroundRotationInterval;
  readonly schedule: BackgroundSchedule;
  readonly launchNonce: number;
  /** The current local hour, for the time-of-day slot. */
  readonly hour: number;
  /** Epoch milliseconds "now", for the rotation indices. */
  readonly now: number;
  /** Minutes the local zone trails UTC (Date#getTimezoneOffset). */
  readonly timezoneOffsetMinutes: number;
}

/** Local calendar days since the epoch — so the daily rotation flips at local midnight. */
function localDayIndex(inputs: IBackgroundSelectionInputs): number {
  return Math.floor((inputs.now - inputs.timezoneOffsetMinutes * 60_000) / 86_400_000);
}

/**
 * The entry the app should paint, given the library and the selection prefs.
 *
 * Pure and exported for tests. Every branch falls back to the *active* entry
 * (or the first, when the active id is stale mid-flight) rather than to
 * nothing: a half-configured schedule or a one-image rotation should never
 * blank the wallpaper.
 */
export function resolveEffectiveEntry(
  library: IBackgroundLibraryView,
  inputs: IBackgroundSelectionInputs
): BackgroundLibraryEntry | null {
  const { entries, activeId } = library;
  if (entries.length === 0) return null;
  const active = entries.find(entry => entry.id === activeId) ?? entries[0];

  if (inputs.mode === 'rotation' && entries.length > 1) {
    return entries[rotationIndex(inputs, entries.length)];
  }

  if (inputs.mode === 'timeOfDay') {
    const slot = roomLightStopKeyForHour(inputs.hour);
    const id = inputs.schedule[slot];
    const scheduled = id === undefined ? undefined : entries.find(entry => entry.id === id);
    return scheduled ?? active;
  }

  return active;
}

/**
 * Which entry the rotation shows. Indices derive from the local calendar so
 * `daily` flips at local midnight and `hourly` on the hour — exactly when
 * `useCurrentHour` re-renders the consumers of this file.
 */
function rotationIndex(inputs: IBackgroundSelectionInputs, count: number): number {
  switch (inputs.rotationInterval) {
    case 'launch':
      return inputs.launchNonce % count;
    case 'hourly':
      return (localDayIndex(inputs) * 24 + inputs.hour) % count;
    case 'daily':
      return localDayIndex(inputs) % count;
  }
}

/**
 * The saved background the app should paint right now — the user's pick, the
 * rotation's current slot, or the scheduled image for this part of the day.
 * Live across hour boundaries via the same minute-tick clock room light uses.
 */
export function useEffectiveBackgroundEntry(): BackgroundLibraryEntry | null {
  const { data } = useBackgroundLibraryQuery();
  const mode = useBackgroundSelectionStore(s => s.mode);
  const rotationInterval = useBackgroundSelectionStore(s => s.rotationInterval);
  const schedule = useBackgroundSelectionStore(s => s.schedule);
  const launchNonce = useBackgroundSelectionStore(s => s.launchNonce);
  const hour = useCurrentHour();

  const now = new Date();
  return resolveEffectiveEntry(data ?? EMPTY_BACKGROUND_LIBRARY, {
    mode,
    rotationInterval,
    schedule,
    launchNonce,
    hour,
    now: now.getTime(),
    timezoneOffsetMinutes: now.getTimezoneOffset(),
  });
}
