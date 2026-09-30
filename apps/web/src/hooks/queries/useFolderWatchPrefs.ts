import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  settingsKeys,
  useSettingsQuery,
  useUpdateSettingsMutation,
  type ElectronSettings,
} from './useSettings';

/**
 * The folder-watch settings, kept as fields inside the renderer `settings` blob
 * for the same reason `useLyricsSavePrefs` gives: a dedicated store key would
 * have to be registered in v1's Electron allowlist too, and the blob needs no
 * schema change on either side. The Rust shell reads the same two names
 * (`crate::watch::WATCH_FOLDERS_FIELD` and `WATCH_FOLDERS_EXCLUDED_FIELD`), so
 * they are spelled once on each side and nowhere else.
 */
const WATCH_FIELD = 'watchFolders';
const EXCLUDED_FIELD = 'watchFoldersExcluded';

export interface IFolderWatchPrefs {
  /** Whether registered folders are watched at all. */
  readonly enabled: boolean;
  /** Folder ids the user opted out of watching. */
  readonly excluded: readonly string[];
}

/**
 * Read the prefs out of the blob.
 *
 * Watching defaults to **on**, so only an explicit `false` turns it off, the
 * same rule the shell applies. It only reads the user's folders, and a library
 * that silently stops noticing new music is what the feature exists to prevent.
 */
export function readFolderWatchPrefs(blob: ElectronSettings | null): IFolderWatchPrefs {
  const excluded = blob?.[EXCLUDED_FIELD];
  return {
    enabled: blob?.[WATCH_FIELD] !== false,
    excluded: Array.isArray(excluded)
      ? excluded.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/** The prefs, `undefined` until the settings blob has loaded. */
export function useFolderWatchPrefsQuery() {
  const query = useSettingsQuery();
  return {
    ...query,
    data: query.data === undefined ? undefined : readFolderWatchPrefs(query.data),
  };
}

/** The patch the global toggle sends. */
export function watchFoldersPatch(enabled: boolean) {
  return { [WATCH_FIELD]: enabled };
}

/** The patch a per-folder toggle sends: `excluded` with `folderId` added or removed. */
export function folderWatchedPatch(
  excluded: readonly string[],
  folderId: string,
  watched: boolean
) {
  const rest = excluded.filter(id => id !== folderId);
  return { [EXCLUDED_FIELD]: watched ? rest : [...rest, folderId] };
}

/**
 * Opt one folder in or out, from the **latest** value rather than the one on
 * screen.
 *
 * The settings mutation writes the whole blob and only refetches after the
 * write lands, so two quick toggles computed from the rendered list would each
 * start from the same stale list and the second would drop the first. This
 * reads the cached blob at click time, writes the result back into the cache
 * straight away, and then persists it; the mutation merges over that same
 * cache, and a failed write resyncs it from disk.
 */
export function useSetFolderWatched(): (folderId: string, watched: boolean) => void {
  const queryClient = useQueryClient();
  const { mutate } = useUpdateSettingsMutation();

  return useCallback(
    (folderId, watched) => {
      // A refetch already in flight would overwrite the value written below.
      void queryClient.cancelQueries({ queryKey: settingsKeys.all });
      const current = queryClient.getQueryData<ElectronSettings | null>(settingsKeys.all) ?? {};
      const patch = folderWatchedPatch(readFolderWatchPrefs(current).excluded, folderId, watched);
      queryClient.setQueryData<ElectronSettings | null>(settingsKeys.all, { ...current, ...patch });
      mutate(patch);
    },
    [queryClient, mutate]
  );
}
