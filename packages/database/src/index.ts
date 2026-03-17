/**
 * @shiranami/database
 * Database layer for Shiranami using Drizzle ORM with SQLite
 */

// Client
export {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  type DatabaseOptions,
} from './client.js';

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
