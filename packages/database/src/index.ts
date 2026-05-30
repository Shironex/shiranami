/**
 * @shiranami/database
 * Schema, types, and Drizzle utilities — no native driver dependency.
 * For the better-sqlite3 client, import from '@shiranami/database/client'.
 */

// Schema
export * from './schema/index.js';

// Re-export commonly used Drizzle utilities
export {
  eq,
  ne,
  and,
  or,
  like,
  gt,
  gte,
  lt,
  lte,
  desc,
  asc,
  sql,
  inArray,
  isNull,
  isNotNull,
} from 'drizzle-orm';

export type { SQL } from 'drizzle-orm';
