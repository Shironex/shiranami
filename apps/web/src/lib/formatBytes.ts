/**
 * Format a byte count as a human-readable size using DECIMAL (1000-base) units
 * (KB/MB/GB/TB), not binary (1024-base) units.
 *
 * Decimal is deliberate: macOS Finder / "Get Info" has reported decimal GB since
 * 10.6, so a 1000-base label matches the free-space figure users compare against
 * on a Mac. Windows Explorer uses 1024 (labelled "GB"), so the two OSes never
 * fully agree — decimal is the safer default for a user-facing capacity figure,
 * and it keeps the disk-usage panel's numbers checkable against Finder.
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const BASE = 1000;

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(BASE)), UNITS.length - 1);
  const value = bytes / BASE ** exponent;
  // Whole bytes never need a decimal; larger units show one by default.
  const digits = exponent === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits).replace(/\.0+$/, '')} ${UNITS[exponent]}`;
}
