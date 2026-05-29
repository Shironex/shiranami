// Wire types for the database backup (export / import) IPC surface.

/** Result of a `db:backup:export` call. */
export interface DbExportResult {
  /** True when a file was written. False when the user cancelled the dialog. */
  success: boolean;
  /** Absolute path of the exported file, when `success` is true. */
  path?: string;
  /** Error message when the export failed (distinct from a user cancel). */
  error?: string;
}

/** Result of a `db:backup:import` call. */
export interface DbImportResult {
  /**
   * True when the library was replaced from the selected backup. False when the
   * user cancelled the dialog (no `error`) or the import failed (with `error`).
   */
  success: boolean;
  /** Error message when the import failed — e.g. not a valid SQLite file, or a
   * backup created by a newer app version (downgrade guard). */
  error?: string;
}
