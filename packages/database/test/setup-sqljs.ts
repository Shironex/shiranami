/**
 * Vitest setup file — initialises sql.js (WASM SQLite) once before all tests.
 * The loaded module is stored on `globalThis.__SQL` so the better-sqlite3 mock
 * can create databases synchronously.
 */

import initSqlJs from 'sql.js';

globalThis.__SQL = await initSqlJs();
