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
  album: string | null;
  duration: number | null;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  albumArt: string | null;
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
  album?: string | null;
  duration?: number | null;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  albumArt?: string | null;
  isFavorite?: boolean | null;
  playCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
}
