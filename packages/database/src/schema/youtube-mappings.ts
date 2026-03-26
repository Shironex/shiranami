/**
 * YouTube mappings table schema
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tracks } from './tracks.js';

export const youtubeMappings = sqliteTable('youtube_mappings', {
  id: text('id').primaryKey(),
  trackId: text('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }).unique(),
  youtubeId: text('youtube_id').notNull(),
  searchedAt: text('searched_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type YoutubeMapping = typeof youtubeMappings.$inferSelect;
export type NewYoutubeMapping = typeof youtubeMappings.$inferInsert;
