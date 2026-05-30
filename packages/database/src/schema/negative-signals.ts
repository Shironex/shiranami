/**
 * Negative-signal ("not interested" / skip) table schema.
 *
 * The affinity engine is positive-only — it ranks what the user already plays
 * and so keeps re-surfacing it, with no way to learn dislikes. This table
 * records an explicit negative signal per track: when the user marks a track
 * "Not interested", a row is written here. The recommendation service folds
 * these rows into affinity scoring (the exact track is dropped; the artist is
 * softly downranked) via the pure `@shiranami/recommendation` core.
 *
 * One row per track (track_id is unique) — re-marking the same track is
 * idempotent. `artist` is denormalized from the track at write time so the
 * artist-level penalty survives the track row being deleted (cascade clears
 * the FK row, but a separate artist roll-up can still be computed before that).
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tracks } from './tracks.js';

export const negativeSignals = sqliteTable('negative_signals', {
  id: text('id').primaryKey(),
  trackId: text('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' })
    .unique(),
  /** Denormalized artist of the disliked track, for the artist-level penalty. */
  artist: text('artist'),
  /** Where the signal came from, e.g. 'context-menu' | 'discover'. */
  source: text('source').notNull().default('context-menu'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type NegativeSignal = typeof negativeSignals.$inferSelect;
export type NewNegativeSignal = typeof negativeSignals.$inferInsert;
