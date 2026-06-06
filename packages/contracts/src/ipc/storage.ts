// Wire types for the storage / disk-usage IPC surface.
//
// The renderer passes the watched library-folder paths; the main process buckets
// them by physical volume (POSIX device id / Windows drive root), walks each
// folder for its logical size, and reads the host volume's capacity via
// `fs.statfs`. One `VolumeUsage` is returned per distinct volume so the renderer
// can render one segmented bar per disk. See
// docs/research/2026-06-06-disk-space-usage.md for the full rationale.

/** One physical volume that hosts one or more watched library folders. */
export interface VolumeUsage {
  /** Stable bucket key (POSIX device id as string, or Windows drive root). */
  volumeKey: string;
  /** Friendly label for the bar header (volume name / drive letter). */
  mountLabel: string;
  /** Folder paths (from the `folders` table) that live on this volume. */
  folderPaths: string[];
  /** Sum of logical file sizes (`stat.size`) inside those folders (the FS walk). */
  musicBytes: number;
  /** Whole-disk capacity: `blocks * bsize`. */
  totalBytes: number;
  /** User-available free space: `bavail * bsize`. */
  freeBytes: number;
  /**
   * Whole-disk used across all apps: `(blocks - bfree) * bsize`. For captions
   * only — the bar segment widths use the clamped formula in the renderer, never
   * a raw `usedBytes - musicBytes` subtraction.
   */
  usedBytes: number;
  /** True if `statfs`/`stat` failed for this volume (unmounted/removed drive). */
  unavailable?: boolean;
}

/** Result of a disk-usage computation across every watched folder. */
export interface DiskUsageResult {
  volumes: VolumeUsage[];
  /** ISO timestamp the result was computed (for "updated x ago" / cache age). */
  computedAt: string;
}
