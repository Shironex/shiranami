// Cross-process media payload shapes.
//
// These flow across the desktop IPC boundary (main → preload → renderer) and
// were previously hand-duplicated in several places. Defining them once here
// keeps the main-process services, the preload bridge, and the renderer mirror
// (`apps/web/src/types/electron.d.ts`) in lockstep.

/**
 * Parsed audio-file metadata produced by the metadata service / scan utility
 * and surfaced to the renderer. Display-shaped: `artist`/`album`/`genre` are
 * already collapsed to non-null strings at parse time (`'Unknown Artist'`,
 * `'Unknown Album'`, `''`).
 */
export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  /** Duration in seconds. */
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  /** `shiranami-art://` protocol URL, or null when no embedded cover. */
  albumArt: string | null;
}

/**
 * A single yt-dlp search/extract result surfaced through the downloader IPC
 * surface. `view_count` is only present on full search results (absent from
 * flat-playlist extraction).
 *
 * `matchConfidence` / `matchFlag` are only populated on the Spotify playlist
 * path, where a YouTube candidate is scored against the Spotify track's
 * metadata. Plain search and single-match callers leave them undefined, so the
 * download/import pipeline that consumes `SearchResult[]` is unaffected.
 */
export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
  view_count?: number;
  /** 0..1 match score from the Spotify scorer; absent outside playlist import. */
  matchConfidence?: number;
  /** 'low' when the best candidate scored below the confidence threshold. */
  matchFlag?: 'low' | 'ok';
}
