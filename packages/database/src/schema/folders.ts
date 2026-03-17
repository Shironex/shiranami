/**
 * Watched folders table schema
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  lastScanned: text('last_scanned'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
