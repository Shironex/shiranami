import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('./app/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isSqliteFile, getBackupDir, importDatabase } from './db-backup';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shiranami-backup-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('isSqliteFile', () => {
  it('returns true for a file with the SQLite magic header', () => {
    const f = path.join(dir, 'real.db');
    fs.writeFileSync(f, Buffer.concat([SQLITE_HEADER, Buffer.alloc(100)]));
    expect(isSqliteFile(f)).toBe(true);
  });

  it('returns false for a non-SQLite file', () => {
    const f = path.join(dir, 'fake.db');
    fs.writeFileSync(f, 'this is not a database');
    expect(isSqliteFile(f)).toBe(false);
  });

  it('returns false for a missing file', () => {
    expect(isSqliteFile(path.join(dir, 'nope.db'))).toBe(false);
  });

  it('returns false for a file shorter than the header', () => {
    const f = path.join(dir, 'short.db');
    fs.writeFileSync(f, 'SQLite');
    expect(isSqliteFile(f)).toBe(false);
  });
});

describe('getBackupDir', () => {
  it('returns a "backups" directory alongside the DB file', () => {
    expect(getBackupDir('/data/shiranami.db')).toBe(path.join('/data', 'backups'));
  });
});

describe('importDatabase', () => {
  it('rejects a source that is not a valid SQLite file', async () => {
    const dbPath = path.join(dir, 'shiranami.db');
    const bogus = path.join(dir, 'bogus.db');
    fs.writeFileSync(bogus, 'not sqlite');
    await expect(importDatabase(dbPath, bogus)).rejects.toThrow(/not a valid SQLite/i);
  });

  it('replaces the live DB file and removes stale WAL/SHM sidecars', async () => {
    const dbPath = path.join(dir, 'shiranami.db');
    // Existing live DB + leftover WAL/SHM sidecars.
    fs.writeFileSync(dbPath, Buffer.concat([SQLITE_HEADER, Buffer.from('OLD')]));
    fs.writeFileSync(`${dbPath}-wal`, 'stale-wal');
    fs.writeFileSync(`${dbPath}-shm`, 'stale-shm');

    const source = path.join(dir, 'import.db');
    fs.writeFileSync(source, Buffer.concat([SQLITE_HEADER, Buffer.from('NEW')]));

    await importDatabase(dbPath, source);

    expect(fs.readFileSync(dbPath).toString('binary')).toContain('NEW');
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
  });
});
