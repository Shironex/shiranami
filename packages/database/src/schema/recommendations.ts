/**
 * Recommendation cache table schema.
 *
 * A single row per shelf `kind` (e.g. 'library' | 'discover') holds that
 * shelf's fully-resolved payload as a JSON string, plus the instant it was
 * generated. Reads come from this cache; a background job refreshes it. The
 * 24h TTL is enforced at read time against `generatedAt` (see the desktop
 * recommendation service), not by a DB trigger — keeping the table dumb.
 *
 * The yt-dlp discover shelf is best-effort and can be empty; an empty payload
 * is a valid, cacheable result (it just means "nothing discovered / yt-dlp
 * degraded"), so emptiness is never treated as a cache miss.
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const recommendations = sqliteTable('recommendations', {
  /** Shelf identifier — one cache row per kind. */
  kind: text('kind').primaryKey(),
  /** Resolved shelf payload, JSON-serialized (array of recommended items). */
  payload: text('payload').notNull(),
  /** ISO-8601 instant the payload was generated; drives the read-time TTL. */
  generatedAt: text('generated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;
