// Canonical playlist row + write-payload shapes. Source of truth: the drizzle
// `playlists` schema in @shiranami/database (row) and the zod payload schemas
// the `db:playlists:*` handlers validate against (inputs).

/**
 * A user playlist row as returned by the `db:playlists:*` read handlers.
 *
 * `description` / `coverArt` are declared optional rather than `string | null`:
 * the columns are nullable in SQLite, but every consumer treats them as
 * "present or not" (truthiness), and the write payloads below only accept
 * strings — keeping the read and write shapes aligned is what lets the renderer
 * pass a `Partial<Playlist>` straight into an update.
 */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload for `db:playlists:create`. `id` and the timestamps are DB-generated. */
export interface PlaylistCreateInput {
  name: string;
  description?: string;
  coverArt?: string;
}

/** Payload for `db:playlists:create-with-tracks` (create + seed membership). */
export interface PlaylistCreateWithTracksInput {
  name: string;
  description?: string;
  trackIds: string[];
}

/** Patch payload for `db:playlists:update`. Omitted fields are left untouched. */
export interface PlaylistUpdateInput {
  name?: string;
  description?: string;
  coverArt?: string;
}
