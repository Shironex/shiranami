/**
 * Lyrics wire types — the single definition of the `lyrics:fetch` result
 * shape shared by the main-process resolver, the preload bridge, and the
 * renderer. Adding a source or reshaping the result starts here.
 */

/** Where resolved lyrics came from; null when nothing was found. */
export type LyricsSource = 'lrclib' | 'local-lrc' | 'local-txt' | 'embedded' | null;

export interface LyricLine {
  /** Seconds from track start. */
  time: number;
  text: string;
}

export interface LyricsResult {
  /** Timestamped lyrics, or null when only plain text (or nothing) is available. */
  synced: LyricLine[] | null;
  /** Plain (untimed) lyrics. */
  plain: string | null;
  source: LyricsSource;
}
