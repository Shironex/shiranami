/**
 * Dotted-numeric version comparison, shared by the yt-dlp updater (which sees
 * date-based versions like `2024.01.01`) and the v2 handover bridge (which
 * compares the running app version against a manifest floor).
 *
 * Deliberately dependency-free so callers do not drag a subsystem's module
 * graph in behind a fifteen-line comparison.
 */

/** Extract the numeric `.`-separated segments from a version string. */
export function extractVersionSegments(version: string | null | undefined): number[] {
  if (!version) return [];

  const match = version.match(/\d+(?:\.\d+)*/);
  if (!match) return [];

  return match[0]
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .filter(part => Number.isFinite(part));
}

/** True when `latestVersion` is strictly newer than `currentVersion`. */
export function hasUpdate(currentVersion: string | null, latestVersion: string | null): boolean {
  const currentSegments = extractVersionSegments(currentVersion);
  const latestSegments = extractVersionSegments(latestVersion);

  if (currentSegments.length === 0 || latestSegments.length === 0) {
    return false;
  }

  const maxLength = Math.max(currentSegments.length, latestSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const current = currentSegments[index] ?? 0;
    const latest = latestSegments[index] ?? 0;

    if (latest > current) return true;
    if (latest < current) return false;
  }

  return false;
}
