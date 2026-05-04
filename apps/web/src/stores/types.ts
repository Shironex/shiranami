/**
 * Shared domain types for the player stores.
 *
 * The player state was split into `useLibraryStore`, `usePlaybackStore`, and
 * `usePlayerUIStore`, but the `Track`/`RepeatMode` types are referenced by
 * every consumer. Keep them here as the single source of truth so no store
 * owns the canonical definition.
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
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
   * in `useTrackOverlayStore` keyed by track id; read via `useTrack(id)` or
   * `useMergedLibrary()` rather than off this raw field.
   */
  isFavorite?: boolean;
  playCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';
