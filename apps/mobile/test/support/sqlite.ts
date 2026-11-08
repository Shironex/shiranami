import type { SQLiteDatabase } from 'expo-sqlite';

type Param = string | number | null;

interface Statement {
  run(...params: Param[]): unknown;
  all(...params: Param[]): unknown[];
  get(...params: Param[]): unknown;
}

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

// Node's built-in SQLite, loaded past Jest's resolver (which does not know
// `node:`-only modules). The repo pins Node 22.23, where it needs no flag.
const { DatabaseSync } = (
  process as unknown as { getBuiltinModule(id: string): unknown }
).getBuiltinModule('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };

const clean = (params: unknown[] = []) =>
  params.map(value => (value === undefined ? null : (value as Param)));

/**
 * The part of expo-sqlite's async API the app uses, over an in-memory Node
 * SQLite database, so migrations and library queries run real SQL in tests.
 */
export function openTestDb(): SQLiteDatabase & { close: () => void } {
  const db = new DatabaseSync(':memory:');
  const api = {
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, params?: unknown[]) => {
      db.prepare(sql).run(...clean(params));
      return { lastInsertRowId: 0, changes: 0 };
    },
    getAllAsync: async (sql: string, params?: unknown[]) => db.prepare(sql).all(...clean(params)),
    getFirstAsync: async (sql: string, params?: unknown[]) =>
      db.prepare(sql).get(...clean(params)) ?? null,
    withTransactionAsync: async (task: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
  return api as unknown as SQLiteDatabase & { close: () => void };
}
