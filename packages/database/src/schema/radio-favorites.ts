/**
 * Radio favorites table schema
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const radioFavorites = sqliteTable('radio_favorites', {
  id: text('id').primaryKey(),
  stationUuid: text('station_uuid').notNull().unique(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  urlResolved: text('url_resolved').notNull(),
  homepage: text('homepage'),
  favicon: text('favicon'),
  country: text('country'),
  countryCode: text('country_code'),
  language: text('language'),
  codec: text('codec'),
  bitrate: integer('bitrate'),
  tags: text('tags'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type RadioFavorite = typeof radioFavorites.$inferSelect;
export type NewRadioFavorite = typeof radioFavorites.$inferInsert;
