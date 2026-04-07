/**
 * Pure-JS mock of better-sqlite3 using sql.js (WASM SQLite).
 *
 * This lets integration tests run real SQL without depending on a native
 * binary that must match the exact Node ABI version.
 *
 * The mock implements only the surface area that Drizzle ORM's
 * better-sqlite3 driver + our client.ts actually use.
 */

import type SqlJs from 'sql.js';

declare global {
  // Populated by test/setup-sqljs.ts (runs before any test file)
  var __SQL: SqlJs.SqlJsStatic;
}

/* ------------------------------------------------------------------ */
/*  Statement                                                         */
/* ------------------------------------------------------------------ */

class Statement {
  private db: SqlJs.Database;
  private sql: string;
  private _raw = false;

  constructor(db: SqlJs.Database, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  /** Toggle raw (array-of-arrays) mode — Drizzle calls stmt.raw().all() */
  raw(): this {
    this._raw = true;
    return this;
  }

  run(...params: unknown[]) {
    const flat = params.flat();
    const stmt = this.db.prepare(this.sql);
    try {
      if (flat.length) stmt.bind(flat as SqlJs.BindParams);
      stmt.step();
    } finally {
      stmt.free();
    }

    const changesStmt = this.db.prepare('SELECT changes() as c, last_insert_rowid() as r');
    try {
      changesStmt.step();
      const row = changesStmt.get();
      return {
        changes: row ? Number(row[0]) : 0,
        lastInsertRowid: row ? Number(row[1]) : 0,
      };
    } finally {
      changesStmt.free();
    }
  }

  all(...params: unknown[]) {
    const flat = params.flat();
    const stmt = this.db.prepare(this.sql);
    try {
      if (flat.length) stmt.bind(flat as SqlJs.BindParams);

      const rows: unknown[] = [];
      while (stmt.step()) {
        if (this._raw) {
          rows.push([...stmt.get()]);
        } else {
          rows.push(stmt.getAsObject());
        }
      }
      return rows;
    } finally {
      stmt.free();
      this._raw = false;
    }
  }

  get(...params: unknown[]) {
    const flat = params.flat();
    const stmt = this.db.prepare(this.sql);
    try {
      if (flat.length) stmt.bind(flat as SqlJs.BindParams);

      let result: unknown = undefined;
      if (stmt.step()) {
        result = this._raw ? [...stmt.get()] : stmt.getAsObject();
      }
      return result;
    } finally {
      stmt.free();
      this._raw = false;
    }
  }

  columns() {
    const stmt = this.db.prepare(this.sql);
    try {
      const names = stmt.getColumnNames();
      return names.map((name) => ({ name }));
    } finally {
      stmt.free();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Database                                                          */
/* ------------------------------------------------------------------ */

class Database {
  private db: SqlJs.Database;

  constructor(_path?: string, _options?: Record<string, unknown>) {
    if (!globalThis.__SQL) {
      throw new Error(
        'sql.js not initialised — make sure test/setup-sqljs.ts runs before tests',
      );
    }
    this.db = new globalThis.__SQL.Database();
  }

  pragma(source: string) {
    try {
      this.db.run(`PRAGMA ${source}`);
    } catch {
      // Some pragmas may not be supported in sql.js — ignore
    }
  }

  /** Execute raw SQL statements (used by client.ts createTables) */
  runStatements(sql: string) {
    this.db.run(sql);
    return this;
  }

  prepare(sql: string) {
    return new Statement(this.db, sql);
  }

  close() {
    this.db.close();
  }

  /**
   * better-sqlite3's transaction() returns a function with
   * .deferred / .immediate / .exclusive helpers.
   * Drizzle calls: `this.client.transaction(fn)[behavior](tx)`
   */
  transaction<T extends (...args: unknown[]) => unknown>(fn: T) {
    const db = this.db;

    const wrapped = (...args: Parameters<T>): ReturnType<T> => {
      db.run('BEGIN');
      try {
        const result = fn(...args) as ReturnType<T>;
        db.run('COMMIT');
        return result;
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    };

    // Drizzle accesses .deferred / .immediate / .exclusive
    wrapped.deferred = wrapped;
    wrapped.immediate = wrapped;
    wrapped.exclusive = wrapped;

    return wrapped;
  }
}

// The client.ts calls `database.exec(sql)` — alias it
Database.prototype.exec = Database.prototype.runStatements;

export default Database;
