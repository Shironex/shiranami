import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  runMigrations,
  assertNotDowngrade,
  SCHEMA_VERSION,
  __embeddedMigrationsForTest,
} from './migrate';
import { createLegacyTables } from './test/helpers/legacy-schema';

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', 'drizzle');

// Normalize CRLF to LF so the on-disk/embedded comparison is independent of how
// git checked out the .sql files (Windows checkouts can carry CRLF).
const normalizeEol = (s: string): string => s.replace(/\r\n/g, '\n');

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
      name: string;
    }>
  ).map(r => r.name);
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    r => r.name
  );
}

function ledgerRows(db: Database.Database): Array<{ name: string | null }> {
  return db.prepare(`SELECT name FROM __drizzle_migrations ORDER BY id`).all() as Array<{
    name: string | null;
  }>;
}

describe('runMigrations', () => {
  it('(a) brings a FRESH database fully up to date', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const names = tableNames(db);
    for (const t of [
      'tracks',
      'playlists',
      'playlist_tracks',
      'folders',
      'radio_favorites',
      'play_history',
      'youtube_mappings',
      'recommendations',
    ]) {
      expect(names).toContain(t);
    }

    // album_artist migration applied
    expect(columnNames(db, 'tracks')).toContain('album_artist');

    // indexes present
    const indexes = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{
        name: string;
      }>
    ).map(r => r.name);
    expect(indexes).toContain('idx_tracks_album');
    expect(indexes).toContain('idx_tracks_album_artist');

    // ledger has both migrations
    expect(ledgerRows(db).map(r => r.name)).toEqual(__embeddedMigrationsForTest.map(m => m.name));

    db.close();
  });

  it('(b) baselines an OLD-FORMAT database without data loss and upgrades it', () => {
    // Seed an old-format DB via the legacy createTables path with real rows.
    const db = new Database(':memory:');
    createLegacyTables(db);
    db.prepare(
      `INSERT INTO tracks (id, file_path, title, artist, album) VALUES (?, ?, ?, ?, ?)`
    ).run('t1', '/music/a.mp3', 'Song A', 'Artist A', 'Album A');
    db.prepare(`INSERT INTO playlists (id, name) VALUES (?, ?)`).run('p1', 'My Playlist');

    // Sanity: no migration ledger yet (truly unversioned).
    expect(tableNames(db)).not.toContain('__drizzle_migrations');

    // Run the new migrator.
    expect(() => runMigrations(db)).not.toThrow();

    // No data loss.
    const track = db.prepare(`SELECT id, title, artist FROM tracks WHERE id='t1'`).get() as {
      id: string;
      title: string;
      artist: string;
    };
    expect(track).toEqual({ id: 't1', title: 'Song A', artist: 'Artist A' });
    expect((db.prepare(`SELECT COUNT(*) c FROM playlists`).get() as { c: number }).c).toBe(1);

    // Baseline marked + newer migration applied (album_artist exists now).
    expect(tableNames(db)).toContain('__drizzle_migrations');
    expect(ledgerRows(db).map(r => r.name)).toEqual(__embeddedMigrationsForTest.map(m => m.name));
    expect(columnNames(db, 'tracks')).toContain('album_artist');

    // Idempotent: a second run does nothing and does not duplicate ledger rows.
    const before = ledgerRows(db).length;
    expect(() => runMigrations(db)).not.toThrow();
    expect(ledgerRows(db).length).toBe(before);

    db.close();
  });

  it('is idempotent on a fresh DB (second run is a no-op)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const before = ledgerRows(db).length;
    runMigrations(db);
    expect(ledgerRows(db).length).toBe(before);
    db.close();
  });
});

describe('assertNotDowngrade', () => {
  it('allows equal or older DB versions', () => {
    expect(() => assertNotDowngrade(SCHEMA_VERSION)).not.toThrow();
    expect(() => assertNotDowngrade(SCHEMA_VERSION - 1)).not.toThrow();
    expect(() => assertNotDowngrade(0)).not.toThrow();
  });

  it('refuses a DB created by a newer app build', () => {
    expect(() => assertNotDowngrade(SCHEMA_VERSION + 1)).toThrow(/newer than this app/i);
  });
});

describe('embedded migrations stay in lock-step with on-disk drizzle files', () => {
  it('matches each drizzle/<name>/migration.sql statement-for-statement', () => {
    for (const m of __embeddedMigrationsForTest) {
      const sqlPath = join(drizzleDir, m.name, 'migration.sql');
      const disk = normalizeEol(readFileSync(sqlPath, 'utf8'));
      const diskStatements = disk
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(Boolean);
      const embedded = m.statements.map(s => normalizeEol(s).trim()).filter(Boolean);
      expect(embedded).toEqual(diskStatements);
    }
  });
});
