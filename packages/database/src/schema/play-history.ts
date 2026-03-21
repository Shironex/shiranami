/**
 * Listening history table schema
 */

import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tracks } from './tracks.js';

export const playHistory = sqliteTable('play_history', {
  id: text('id').primaryKey(),
  trackId: text('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  playedAt: text('played_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  playedSeconds: real('played_seconds').notNull(),
  completionRatio: real('completion_ratio').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  source: text('source').notNull().default('library'),
});

export type PlayHistory = typeof playHistory.$inferSelect;
export type NewPlayHistory = typeof playHistory.$inferInsert;
