/**
 * Smart (dynamic, rule-based) playlists.
 *
 * Unlike regular `playlists` (which hold an explicit, ordered set of tracks in
 * `playlist_tracks`), a smart playlist stores only a rule definition. Its
 * contents are evaluated dynamically against the `tracks` table at read time,
 * so the playlist auto-updates as the library changes.
 *
 * `rules` is a JSON-serialized `SmartPlaylistDefinition` (see the main-process
 * evaluator). It is stored as text because SQLite has no native JSON column and
 * the rule shape evolves independently of the relational schema.
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const smartPlaylists = sqliteTable('smart_playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  /** 'all' = every rule must match (AND); 'any' = at least one (OR). */
  matchType: text('match_type').notNull().default('all'),
  /** JSON-serialized array of rule objects. */
  rules: text('rules').notNull().default('[]'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type SmartPlaylist = typeof smartPlaylists.$inferSelect;
export type NewSmartPlaylist = typeof smartPlaylists.$inferInsert;
