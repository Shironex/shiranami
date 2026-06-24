// Canonical Track shape. Source of truth: the drizzle `tracks` schema in
// @shiranami/database. Nullability mirrors the DB exactly — consumers that
// want non-null display strings (e.g. the renderer) must collapse `null` to a
// sensible default (`'Unknown Artist'`, etc.) at the mapper boundary, not by
// quietly tightening the type.

export interface Track {
  id: string;
  filePath: string;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  duration: number | null;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  albumArt: string | null;
  /** Integrated loudness (LUFS) measured by ffmpeg loudnorm; null = unanalysed. */
  loudnessLufs: number | null;
  /** Tempo (BPM) from the native analysis addon; null = unanalysed. */
  bpm: number | null;
  /** Musical key (e.g. 'A minor') from the native analysis addon; null = unanalysed. */
  musicalKey: string | null;
  isFavorite: boolean | null;
  playCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Insert shape — id/createdAt/updatedAt are DB-generated and may be omitted.
 * `title` and `filePath` are required; everything else defaults to null
 * (per the drizzle schema).
 */
export interface NewTrack {
  id?: string;
  filePath: string;
  title: string;
  artist?: string | null;
  albumArtist?: string | null;
  album?: string | null;
  duration?: number | null;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  albumArt?: string | null;
  loudnessLufs?: number | null;
  bpm?: number | null;
  musicalKey?: string | null;
  isFavorite?: boolean | null;
  playCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Renderer-facing display shape derived from the canonical `Track`. The mapper
 * boundary (`apps/web/src/lib/trackMapper.ts`) collapses the DB's nullable
 * `artist`/`album`/`duration` into non-null display values (e.g.
 * `'Unknown Artist'`, `0`) and narrows `albumArt`/`isFavorite`/`playCount` to
 * optional. Renderer stores import this as `Track`; it is intentionally NOT the
 * DB-mirror shape — never tighten `Track` (the wire type) to match it.
 */
export interface DisplayTrack {
  id: string;
  title: string;
  artist: string;
  /**
   * Album artist — used to group albums so identically-named albums by
   * different artists don't merge, and a compilation's varied track artists
   * don't fragment one album. Falls back to `artist` when absent.
   */
  albumArtist?: string | null;
  album: string;
  duration: number;
  filePath: string;
  albumArt?: string;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  /**
   * Seed value from the DB. After an in-session toggle, the live value lives
   * in the renderer's track-overlay store keyed by track id; read it via the
   * merged-library selectors rather than off this raw field.
   */
  isFavorite?: boolean;
  playCount?: number;
  /** Integrated loudness (LUFS) for loudness leveling; absent = unanalysed. */
  loudnessLufs?: number | null;
  /** Tempo in BPM (e.g. 128); absent/null = unanalysed or no detectable beat. */
  bpm?: number | null;
  /** Musical key (e.g. 'A minor'); absent/null = unanalysed or no tonal centre. */
  musicalKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
