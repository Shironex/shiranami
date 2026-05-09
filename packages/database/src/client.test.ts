import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from './client';
import { cleanupTempDbDir, makeTempDbDir, tempSqlitePath } from './test/helpers/temp-db';

describe('database client', () => {
  let dir: string;

  beforeEach(() => {
    closeDatabase();
    dir = makeTempDbDir();
  });

  afterEach(() => {
    cleanupTempDbDir(dir);
  });

  it('throws when getDatabase is called before initializeDatabase', () => {
    expect(() => getDatabase()).toThrow(/not initialized/);
  });

  it('initializeDatabase creates tables and closeDatabase allows reopening a new file', () => {
    const pathA = tempSqlitePath(dir);
    const dbA = initializeDatabase({ path: pathA });
    expect(dbA).toBeDefined();

    // Introspect via the drizzle handle's underlying sqlite client. The previous
    // implementation opened a second raw better-sqlite3 connection in readonly
    // mode against the same file, which only worked because both connections
    // pointed at a shared on-disk database. Under the sql.js mock each
    // `new Database(path)` is an isolated in-memory instance, so we have to
    // reuse the same handle to see the tables we just created.
    const tables = dbA.$client
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;

    const names = tables.map(t => t.name);
    expect(names).toContain('tracks');
    expect(names).toContain('play_history');

    closeDatabase();

    const pathB = tempSqlitePath(dir);
    const dbB = initializeDatabase({ path: pathB });
    expect(dbB).toBeDefined();
    closeDatabase();
  });
});
