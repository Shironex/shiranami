import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BACKGROUND_ERROR_CODES, isIpcError } from '@shiranami/contracts';
import type { CustomBackground } from '@shiranami/contracts/bindings';
import { commands } from '@/lib/bridge/commands';
import { toBackgroundUrl } from '@/lib/bridge/stream-urls';
import { IS_ELECTRON } from '@/lib/platform';
import { useThemeStore, applyTheme, DEFAULT_THEME, CUSTOM_THEME } from '@/stores/useThemeStore';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';

export type { CustomBackground } from '@shiranami/contracts/bindings';

export const customBackgroundKeys = {
  current: ['custom-background'] as const,
};

/**
 * The imported background, as the backend knows it.
 *
 * The **backend is the source of truth** and nothing about the file is mirrored
 * into localStorage. That is the whole reason this is a query rather than a
 * zustand slice: the record names a file on disk, and only the process that can
 * stat that file is entitled to say whether a background exists. `background_get`
 * heals a record whose file has vanished, so a `null` here means "no background",
 * never "a background we cannot show".
 */
export function useCustomBackgroundQuery() {
  return useQuery({
    queryKey: customBackgroundKeys.current,
    queryFn: async (): Promise<CustomBackground | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundGet();
    },
    // The file only changes through the two mutations below, both of which
    // write this key directly. Nothing else on the machine touches it.
    staleTime: Infinity,
    // One retry, unlike most queries here. A failure is not cosmetic: it makes
    // the wallpaper disappear app-wide and makes Settings offer to import one
    // that already exists, so it is worth a second attempt before the Appearance
    // card surfaces it.
    retry: 1,
  });
}

/**
 * Reconcile a persisted `custom` theme against the backend's answer.
 *
 * The two halves of "the user chose their own wallpaper" live in different
 * stores by necessity — the *choice* is a localStorage theme id, the *file* is a
 * Rust settings entry — so they can disagree. They do disagree whenever the file
 * is deleted outside the app, whenever a profile is restored without its
 * `backgrounds/` directory, and on any machine where localStorage survived an
 * app-data wipe.
 *
 * Returning to the default theme is the resolution rather than, say, showing an
 * empty `custom`, because `data-theme="custom"` with no image behind it is not a
 * neutral state: it turns on eight chrome-contrast rules that assume a photo is
 * there. `theme-init.ts` already refuses to set the attribute pre-paint for the
 * same reason, so this only has to correct the store, never the DOM mid-flight.
 */
export function useReconcileCustomTheme(): void {
  const { data, isSuccess } = useCustomBackgroundQuery();
  const reconciled = useRef(false);

  useEffect(() => {
    if (!isSuccess || reconciled.current) return;
    // Latched to the FIRST answer. Without the latch this effect also fires on
    // every later theme change, and would then undo the user's own selection:
    // picking the custom tile before importing anything sets the theme with no
    // record present, which is indistinguishable here from a stale persisted
    // one. Correcting persistence is a startup job; after that the user's
    // choices are theirs.
    reconciled.current = true;

    if (data === null && useThemeStore.getState().theme === CUSTOM_THEME) {
      logger.warn('[background] no imported background; falling back to the default theme');
      useThemeStore.getState().setTheme(DEFAULT_THEME);
    }
  }, [isSuccess, data]);

  // `applyTheme` withholds `data-theme="custom"` until the record is confirmed,
  // because the attribute turns on chrome-contrast rules that assume a photo is
  // behind them. This is where the confirmation arrives.
  useEffect(() => {
    if (isSuccess && data !== null && useThemeStore.getState().theme === CUSTOM_THEME) {
      applyTheme(CUSTOM_THEME, true);
    }
  }, [isSuccess, data]);
}

/** The loopback URLs for a record, or `null` before the shell has answered. */
export function backgroundUrls(record: CustomBackground | null | undefined): {
  url: string | null;
  stillUrl: string | null;
} {
  if (!record) return { url: null, stillUrl: null };
  return {
    url: toBackgroundUrl(record.fileName),
    stillUrl: record.stillFileName === null ? null : toBackgroundUrl(record.stillFileName),
  };
}

/**
 * Import an image, or do nothing if the picker was cancelled.
 *
 * The refusals are the reason this reports rather than swallows. Four of them
 * are things the user can fix by choosing a different file, and each carries its
 * own code so the toast can say which — the alternative, which the
 * implementation this is modelled on shipped, is a `logger.error` the user never
 * sees and a picker that appears to do nothing.
 */
export function usePickCustomBackground() {
  const queryClient = useQueryClient();
  const setTheme = useThemeStore(s => s.setTheme);

  return useMutation({
    mutationFn: async (): Promise<CustomBackground | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundPick();
    },
    onSuccess: record => {
      if (record === null) return;
      queryClient.setQueryData(customBackgroundKeys.current, record);
      // Selecting the image *is* selecting the theme. Importing one and then
      // having to pick a tile to see it would be two steps for one intent.
      setTheme(CUSTOM_THEME);
      // The record now exists, so the attribute the store withheld can land.
      applyTheme(CUSTOM_THEME, true);
    },
    onError: (error: unknown) => {
      toast.error(importErrorMessage(error));
    },
  });
}

/** Remove the background and return to the default theme. */
export function useClearCustomBackground() {
  const queryClient = useQueryClient();
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!IS_ELECTRON) return;
      await commands.backgroundClear();
    },
    onSuccess: () => {
      queryClient.setQueryData(customBackgroundKeys.current, null);
      // Only if it is the one showing: clearing from a state where a bundled
      // theme is active should not also change the theme.
      if (theme === CUSTOM_THEME) setTheme(DEFAULT_THEME);
    },
    onError: (error: unknown) => {
      logger.error('[background] the background could not be cleared', error);
      toast.error(i18n.t('settings:app.background.errors.generic'));
    },
  });
}

/** Map a rejected import onto the sentence that explains it. */
function importErrorMessage(error: unknown): string {
  if (!isIpcError(error)) return i18n.t('settings:app.background.errors.generic');

  switch (error.code) {
    case BACKGROUND_ERROR_CODES.TOO_LARGE:
      return i18n.t('settings:app.background.errors.tooLarge');
    case BACKGROUND_ERROR_CODES.UNSUPPORTED_FORMAT:
      return i18n.t('settings:app.background.errors.unsupportedFormat');
    case BACKGROUND_ERROR_CODES.NOT_AN_IMAGE:
      return i18n.t('settings:app.background.errors.notAnImage');
    case BACKGROUND_ERROR_CODES.DIMENSIONS_TOO_LARGE:
      return i18n.t('settings:app.background.errors.dimensionsTooLarge');
    default:
      // Everything the user cannot act on — a full disk, a permission error —
      // arrives as INTERNAL and gets the one message that does not pretend to
      // know what went wrong.
      logger.error('[background] the import failed', error);
      return i18n.t('settings:app.background.errors.generic');
  }
}
