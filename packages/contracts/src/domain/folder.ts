// Watched library folder row. Source of truth: the drizzle `folders` schema in
// @shiranami/database — the `db:folders:*` handlers return the raw row, so the
// nullability here mirrors the columns exactly.

/** A folder the library watches for audio files. */
export interface WatchedFolder {
  id: string;
  path: string;
  /** ISO timestamp of the last completed scan; null until the first scan. */
  lastScanned: string | null;
  createdAt: string;
}

/**
 * The `library:folders-changed` payload (v2-only, F10): the registered folders
 * whose audio files changed on disk, one payload per coalesced batch.
 */
export interface FoldersChanged {
  /** `WatchedFolder.id` of every folder in the batch. */
  folderIds: string[];
}
