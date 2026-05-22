/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(text: string, max: number, ellipsis = '...'): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);
  return text.slice(0, max - ellipsis.length) + ellipsis;
}

/**
 * Format duration in seconds to mm:ss or hh:mm:ss string.
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const sPad = s.toString().padStart(2, '0');
  if (h > 0) {
    const mPad = m.toString().padStart(2, '0');
    return `${h}:${mPad}:${sPad}`;
  }
  return `${m}:${sPad}`;
}
