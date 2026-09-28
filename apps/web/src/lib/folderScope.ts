/**
 * Narrowing a rescan to some of the library's folders.
 *
 * The folder watcher reports which folders changed, and a rescan triggered by
 * it should touch only those: scan only those folders, and validate only the
 * tracks that live under them. A batch in one folder must not re-validate the
 * whole library, which on a large library is thousands of `stat` calls for a
 * single dropped file.
 */

/** The fields scoping needs from a watched folder. */
export interface IScopedFolder {
  id: string;
  path: string;
}

/**
 * The folders to scan: all of them, or only those whose id is in `folderIds`.
 * Ids that match no registered folder (a folder removed since the batch was
 * reported) are ignored.
 */
export function selectFolders<T extends IScopedFolder>(
  folders: readonly T[],
  folderIds?: readonly string[]
): T[] {
  if (!folderIds) return [...folders];
  const wanted = new Set(folderIds);
  return folders.filter(folder => wanted.has(folder.id));
}

/**
 * Whether `filePath` lives under `folderPath`, on either separator.
 *
 * Plain prefix matching would count `/music/lofi-archive/a.mp3` as inside
 * `/music/lofi`, so the character after the prefix must be a separator. A root
 * that already ends in one (`C:\`, `/`) needs no extra check.
 */
export function isUnderFolder(filePath: string, folderPath: string): boolean {
  if (!filePath.startsWith(folderPath)) return false;
  if (/[\\/]$/.test(folderPath)) return true;
  const next = filePath.charAt(folderPath.length);
  return next === '/' || next === '\\';
}

/**
 * The tracks a scoped rescan should validate: those under any of `folders`.
 * With no scope (`folders` undefined) every track is kept, which is what a full
 * rescan validates.
 */
export function tracksInFolders<T extends { filePath: string }>(
  tracks: readonly T[],
  folders?: readonly IScopedFolder[]
): T[] {
  if (!folders) return [...tracks];
  return tracks.filter(track => folders.some(folder => isUnderFolder(track.filePath, folder.path)));
}
