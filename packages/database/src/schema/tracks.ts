/**
 * Tracks table schema
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull().unique(),
  title: text('title').notNull(),
  artist: text('artist').default(UNKNOWN_ARTIST),
  albumArtist: text('album_artist'),
  album: text('album').default(UNKNOWN_ALBUM),
  duration: real('duration'),
  genre: text('genre'),
  year: integer('year'),
  trackNumber: integer('track_number'),
  discNumber: integer('disc_number'),
  albumArt: text('album_art'),
  /**
   * Integrated loudness (EBU R128 / ITU-R BS.1770) in LUFS, measured by ffmpeg
   * `loudnorm`. Stored as the raw measurement (not a precomputed gain) so the
   * playback gain can be recomputed instantly when the user changes the target
   * LUFS without re-analysing every track. `null` = not yet analysed.
   */
  loudnessLufs: real('loudness_lufs'),
  /**
   * Tempo in beats per minute, estimated by the native analysis addon
   * (core/tempo). Stored as `real` because the estimate is fractional. `null` =
   * not yet analysed (or no detectable beat).
   */
  bpm: real('bpm'),
  /**
   * Estimated musical key, e.g. `'C major'` / `'A minor'`, from the native
   * analysis addon (core/key). `null` = not yet analysed (or no tonal centre).
   */
  musicalKey: text('musical_key'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  playCount: integer('play_count').default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
