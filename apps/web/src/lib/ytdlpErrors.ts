import i18n from '@/lib/i18n';

/**
 * Stable error codes emitted by the Electron main process's downloader
 * when yt-dlp fails with a recognized pattern. These match the constants
 * in apps/desktop/src/main/ipc/downloader.ts (YT_DLP_ERROR_CODES) and
 * map 1:1 to translation keys in locales/{en,pl}/toast.json.
 *
 * Unknown failures are returned to the renderer as raw (English)
 * tail output from yt-dlp/ffmpeg — not user-friendly, but the
 * known cases above cover the vast majority of reports.
 */
const YT_DLP_ERROR_KEYS = new Set([
  'yt_dlp_age_restricted',
  'yt_dlp_video_unavailable',
  'yt_dlp_no_audio_format',
]);

/**
 * Translate a yt-dlp error message from the main process into the
 * current locale. If the message is a known error code, return the
 * localized string; otherwise return the original message unchanged
 * so unknown failures still surface their raw technical detail.
 */
export function translateYtDlpError(raw: string): string {
  if (YT_DLP_ERROR_KEYS.has(raw)) {
    return i18n.t(raw, { ns: 'toast' });
  }
  return raw;
}
