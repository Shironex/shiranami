import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BACKGROUND_ERROR_CODES, isIpcError } from '@shiranami/contracts';
import type { BackgroundLibrary } from '@shiranami/contracts/bindings';
import { commands } from '@/lib/bridge/commands';
import { IS_ELECTRON } from '@/lib/platform';
import { useThemeStore, applyTheme, DEFAULT_THEME, CUSTOM_THEME } from '@/stores/useThemeStore';
import { useBackgroundSelectionStore } from '@/stores/useBackgroundSelectionStore';
import {
  backgroundLibraryKeys,
  normalizeLibrary,
  type IBackgroundLibraryView,
} from '@/hooks/queries/useBackgroundLibrary';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';

function setLibraryData(
  queryClient: QueryClient,
  library: BackgroundLibrary
): IBackgroundLibraryView {
  const view = normalizeLibrary(library);
  queryClient.setQueryData(backgroundLibraryKeys.library, view);
  return view;
}

/**
 * Import an image into the library, or do nothing if the picker was cancelled.
 *
 * The refusals are the reason this reports rather than swallows. Five of them
 * are things the user can fix — choose a different file, or free a slot — and
 * each carries its own code so the toast can say which.
 *
 * `label` is the localized default name the caller proposes for the new entry;
 * the user renames it later if they care.
 */
export function useAddBackground() {
  const queryClient = useQueryClient();
  const setTheme = useThemeStore(s => s.setTheme);

  return useMutation({
    mutationFn: async (label: string): Promise<BackgroundLibrary | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundAdd(label);
    },
    onSuccess: library => {
      if (library === null) return;
      setLibraryData(queryClient, library);
      // Saving the image *is* selecting the theme. Importing one and then
      // having to pick a tile to see it would be two steps for one intent.
      setTheme(CUSTOM_THEME);
      // The library now has an entry, so the attribute the store withheld can land.
      applyTheme(CUSTOM_THEME, true);
    },
    onError: (error: unknown) => {
      toast.error(importErrorMessage(error));
    },
  });
}

/**
 * Remove one saved background. Schedule slots pointing at it are pruned, and
 * emptying the library while `custom` is showing returns to the default theme
 * — `data-theme="custom"` over no image is the state everything here avoids.
 */
export function useRemoveBackground() {
  const queryClient = useQueryClient();
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  return useMutation({
    mutationFn: async (id: string): Promise<BackgroundLibrary | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundRemove(id);
    },
    onSuccess: library => {
      if (library === null) return;
      const view = setLibraryData(queryClient, library);
      useBackgroundSelectionStore.getState().pruneScheduleTo(view.entries.map(entry => entry.id));
      if (view.entries.length === 0 && theme === CUSTOM_THEME) {
        setTheme(DEFAULT_THEME);
      }
    },
    onError: (error: unknown) => {
      logger.error('[background] the background could not be removed', error);
      toast.error(i18n.t('settings:app.background.errors.generic'));
    },
  });
}

/** Pick which saved background is the wallpaper. */
export function useSetActiveBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<BackgroundLibrary | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundSetActive(id);
    },
    onSuccess: library => {
      if (library !== null) setLibraryData(queryClient, library);
    },
    onError: (error: unknown) => {
      logger.error('[background] the active background could not be set', error);
      toast.error(i18n.t('settings:app.background.errors.generic'));
    },
  });
}

/** Relabel one saved background. */
export function useRenameBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; label: string }): Promise<BackgroundLibrary | null> => {
      if (!IS_ELECTRON) return null;
      return await commands.backgroundRename(input.id, input.label);
    },
    onSuccess: library => {
      if (library !== null) setLibraryData(queryClient, library);
    },
    onError: (error: unknown) => {
      logger.error('[background] the background could not be renamed', error);
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
    case BACKGROUND_ERROR_CODES.LIBRARY_FULL:
      return i18n.t('settings:app.background.errors.libraryFull');
    default:
      // Everything the user cannot act on — a full disk, a permission error —
      // arrives as INTERNAL and gets the one message that does not pretend to
      // know what went wrong.
      logger.error('[background] the import failed', error);
      return i18n.t('settings:app.background.errors.generic');
  }
}
