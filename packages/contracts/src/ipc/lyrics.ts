// Wire types for the lyrics write-back IPC surface (v2-only).
//
// Fetched lyrics used to live in an in-memory MRU and nowhere else, so losing
// the network lost them. Write-back saves a synced LRCLIB hit as a `.lrc` file
// beside the audio file, which the existing sidecar reader then serves on the
// next play with no network at all.
//
// Two rules the renderer must not work around:
//  - the whole surface is gated on the `lyrics.saveFetchedLyrics` opt-in, and
//    `lyrics:save-batch` rejects with `lyrics.save_disabled` when it is off;
//  - a lyric file the user already has is never overwritten — it is counted as
//    skipped.

/**
 * Input track for a lyrics write-back run. The two hints are nullable as well
 * as optional because that is what the generated binding declares — serde reads
 * an absent key and an explicit `null` alike as "no hint".
 */
export interface LyricsBatchTrack {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album?: string | null;
  durationSeconds?: number | null;
}

/**
 * Per-track progress event streamed during a write-back run. `current` is a
 * settled-count; `cancelled` is emitted at most once per run.
 */
export interface LyricsBatchProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'searching' | 'saved' | 'skipped' | 'not-found' | 'failed' | 'cancelled';
}

/**
 * What a finished — or cancelled — write-back run counted. `notFound` is
 * settled (the directory does not have the track); `failed` is not (the
 * directory was unreachable, or the file could not be written), so only the
 * second is worth running again.
 */
export interface LyricsBatchSummary {
  saved: number;
  skipped: number;
  notFound: number;
  failed: number;
  cancelled: boolean;
}
