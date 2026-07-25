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
