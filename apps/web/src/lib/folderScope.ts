import { logger } from '@/lib/logger';

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

/** Why a watcher-triggered rescan kept a folder's missing tracks. */
export type HeldReason = 'root-missing' | 'scan-empty' | 'all-missing';

export interface IDeletionGuardInput {
  /** The folders the rescan covered. */
  folders: readonly IScopedFolder[];
  /** The tracks it validated. */
  tracks: readonly { filePath: string }[];
  /** The paths validation reported missing. */
  missing: readonly string[];
  /** Folders whose scan found no files or failed outright. */
  unscannedIds: ReadonlySet<string>;
  /** Folder roots that were not found just before deleting. */
  missingRoots: ReadonlySet<string>;
}

export interface IDeletionGuardResult {
  /** The missing paths that may be deleted. */
  missing: string[];
  /** The folders whose deletions were held back, and why. */
  held: { folderId: string; reason: HeldReason }[];
}

/**
 * The watcher's deletion policy: remove files the user really deleted, and
 * never empty a folder that merely became unreachable.
 *
 * A folder's missing tracks are all kept when
 *
 * - its root is gone (a drive ejected between the watcher's batch and now),
 * - its scan found nothing or failed while it still has tracks (a volume
 *   unmounted mid-scan, a stale share), or
 * - every one of its tracks reads as missing (the same, seen from validation).
 *
 * Those look exactly like a vanished volume, and a watcher must not decide that
 * on its own; the user's manual Rescan still can. Validation itself already
 * keeps any file it could not check (only "not found" is missing), so what is
 * left here is the case where the whole folder answers "not found".
 */
export function guardDeletions({
  folders,
  tracks,
  missing,
  unscannedIds,
  missingRoots,
}: IDeletionGuardInput): IDeletionGuardResult {
  const missingSet = new Set(missing);
  const held: IDeletionGuardResult['held'] = [];

  for (const folder of folders) {
    const own = tracks.filter(track => isUnderFolder(track.filePath, folder.path));
    if (own.length === 0) continue;

    if (missingRoots.has(folder.path)) {
      held.push({ folderId: folder.id, reason: 'root-missing' });
    } else if (unscannedIds.has(folder.id)) {
      held.push({ folderId: folder.id, reason: 'scan-empty' });
    } else if (own.every(track => missingSet.has(track.filePath))) {
      held.push({ folderId: folder.id, reason: 'all-missing' });
    }
  }

  const heldFolders = folders.filter(folder => held.some(h => h.folderId === folder.id));
  return {
    missing: missing.filter(path => !heldFolders.some(f => isUnderFolder(path, f.path))),
    held,
  };
}

/**
 * The paths still missing on a second look.
 *
 * Validation of a large library takes a while, and a volume can drop out for
 * part of it and come back (a reseated cable, an SMB blip, a nested mount
 * remounting). The files checked during that gap read as missing, and nothing
 * else about the folder looks wrong. A second check of just the missing paths,
 * right before deleting, keeps only what is missing both times. It costs one
 * `stat` per missing file, which is nothing on a normal rescan, and it can only
 * ever remove a deletion, never add one, so every rescan uses it.
 */
export async function confirmMissing(missing: readonly string[]): Promise<string[]> {
  if (missing.length === 0) return [];
  const again = new Set(await window.electronAPI.library.validateFiles([...missing]));
  return missing.filter(path => again.has(path));
}

/**
 * {@link guardDeletions} for a watcher-triggered rescan, with the roots
 * re-checked immediately before anything is deleted and the survivors
 * re-validated ({@link confirmMissing}). Logs every held folder.
 */
export async function watcherDeletions(
  input: Omit<IDeletionGuardInput, 'missingRoots'>
): Promise<string[]> {
  const missingRoots = new Set(
    await window.electronAPI.library.validateFiles(input.folders.map(folder => folder.path))
  );
  const { missing, held } = guardDeletions({ ...input, missingRoots });
  for (const { folderId, reason } of held) {
    logger.warn(
      `[folder-watch] kept the missing tracks of folder ${folderId} (${reason}); a manual Rescan removes them`
    );
  }
  return confirmMissing(missing);
}
