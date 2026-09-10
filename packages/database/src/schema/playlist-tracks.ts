/**
 * Playlist tracks join table schema
 */

import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { playlists } from './playlists.js';
import { tracks } from './tracks.js';

export const playlistTracks = sqliteTable(
  'playlist_tracks',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  table => [unique().on(table.playlistId, table.trackId)]
);

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type NewPlaylistTrack = typeof playlistTracks.$inferInsert;
