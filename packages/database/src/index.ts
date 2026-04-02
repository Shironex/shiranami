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
  and,
  or,
  like,
  desc,
  asc,
  sql,
  inArray,
  isNull,
  isNotNull,
} from 'drizzle-orm';
