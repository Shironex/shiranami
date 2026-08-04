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
  isFavorite: boolean | null;
  playCount: number | null;
  createdAt: string;
  updatedAt: string;
  /** Album-level integrated loudness (LUFS); null = unanalysed or no album. */
  albumLoudnessLufs: number | null;
  /** Loudest true peak (dBTP); null = unanalysed or digital silence. */
  truePeakDb: number | null;
  /** Loudness range (EBU Tech 3342, LU); null = unanalysed. */
  loudnessRange: number | null;
  /** Estimated tempo (BPM), octave-folded into 60-180; null = unanalysed or no detectable beat. */
  bpm: number | null;
  /** Estimated musical key, e.g. "C major" / "A minor"; null = unanalysed or undetectable. */
  musicalKey: string | null;
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
  isFavorite?: boolean | null;
  playCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Renderer → main write payload for `db:tracks:add` / `db:tracks:add-many`.
 * Narrower than `NewTrack` on purpose: it mirrors the zod schema the handlers
 * validate against, which omits the backend-managed columns (`id`,
 * `loudnessLufs`, `isFavorite`, `playCount`, `createdAt`, `updatedAt`). Those
 * are generated in the main process or owned by dedicated handlers, so a
 * payload carrying them has them stripped rather than honoured.
 */
export interface TrackCreateInput {
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
}

/** Patch payload for `db:tracks:update` / `db:tracks:update-many`. */
export type TrackUpdateInput = Partial<TrackCreateInput>;

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
  /** Album-level integrated loudness (LUFS); absent = unanalysed or no album. */
  albumLoudnessLufs?: number | null;
  /** Loudest true peak (dBTP), the boost guard; absent = unanalysed. */
  truePeakDb?: number | null;
  /** Loudness range (LU), a dynamics figure; absent = unanalysed. */
  loudnessRange?: number | null;
  /** Estimated tempo (BPM), octave-folded into 60-180; absent = unanalysed or no detectable beat. */
  bpm?: number | null;
  /** Estimated musical key, e.g. "C major" / "A minor"; absent = unanalysed or undetectable. */
  musicalKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
