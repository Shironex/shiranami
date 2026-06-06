export interface DiskSegments {
  /** Music-folder bytes, clamped so it never overflows the available space. */
  music: number;
  /** Everything else on the disk (other apps + reserved blocks + skew). */
  other: number;
  /** User-available free space. */
  free: number;
}

/**
 * Derive the three disk-usage bar segments defensively so they ALWAYS sum to
 * `totalBytes` and no segment can go negative.
 *
 * `free` comes from `bavail`-derived `freeBytes`; `music` is clamped to the
 * space actually left for it; `other` absorbs reserved blocks and any
 * logical-vs-allocated skew (APFS/NTFS compression, sparse files). Never compute
 * `other = usedBytes - musicBytes` — `free`/`used` use different `statfs` fields,
 * so the subtraction can leak a reserved sliver or go negative. See
 * docs/research/2026-06-06-disk-space-usage.md §3.
 */
export function computeDiskSegments(
  musicBytes: number,
  totalBytes: number,
  freeBytes: number
): DiskSegments {
  const total = Math.max(0, totalBytes);
  const free = Math.max(0, Math.min(freeBytes, total));
  const music = Math.max(0, Math.min(musicBytes, total - free));
  const other = Math.max(0, total - free - music);
  return { music, other, free };
}
