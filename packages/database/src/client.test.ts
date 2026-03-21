import Database from 'better-sqlite3';
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

    const raw = new Database(pathA, { readonly: true });
    const tables = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    raw.close();

    const names = tables.map((t) => t.name);
    expect(names).toContain('tracks');
    expect(names).toContain('play_history');

    closeDatabase();

    const pathB = tempSqlitePath(dir);
    const dbB = initializeDatabase({ path: pathB });
    expect(dbB).toBeDefined();
    closeDatabase();
  });
});
