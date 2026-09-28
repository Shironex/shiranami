import { useSettingsQuery, type ElectronSettings } from './useSettings';

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
