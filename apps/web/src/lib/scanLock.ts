/**
 * Shared scanning lock to prevent concurrent library scans.
 * Both LibrarySection (rescan) and MusicFoldersSection (add folder) use this
 * to avoid inserting duplicate tracks from simultaneous scans.
 */
let _scanning = false;

export function isScanLocked(): boolean {
  return _scanning;
}

export function acquireScanLock(): boolean {
  if (_scanning) return false;
  _scanning = true;
  return true;
}

export function releaseScanLock(): void {
  _scanning = false;
}
