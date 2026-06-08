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

describe('un-bake album_artist data migration (#269)', () => {
  // The shipped statement, pulled from the embedded list so the test can't
  // drift from what actually runs against user databases.
  const unbakeSql = __embeddedMigrationsForTest.find(
    m => m.name === '20260101000006_unbake_album_artist'
  )!.statements[0];

  it('nulls album_artist that merely mirrors the track artist, preserves real tags', () => {
    const db = new Database(':memory:');
    runMigrations(db); // schema ready; the data migration ran on an empty table

    const insert = db.prepare(
      `INSERT INTO tracks (id, file_path, title, artist, album, album_artist) VALUES (?, ?, ?, ?, ?, ?)`
    );
    // Baked untagged track: album_artist was forced to equal the track artist.
    insert.run('baked', '/m/baked.mp3', 'A', 'Alice', 'Comp', 'Alice');
    // Genuine compilation tag: album_artist differs from the track artist.
    insert.run('tagged', '/m/tagged.mp3', 'B', 'Bob', 'Comp', 'Various Artists');
    // Already untagged.
    insert.run('null', '/m/null.mp3', 'C', 'Carol', 'Comp', null);

    db.prepare(unbakeSql).run();

    const byId = Object.fromEntries(
      (
        db.prepare(`SELECT id, album_artist FROM tracks`).all() as Array<{
          id: string;
          album_artist: string | null;
        }>
      ).map(r => [r.id, r.album_artist])
    );
    expect(byId.baked).toBeNull(); // un-baked → grouping falls back to album title
    expect(byId.tagged).toBe('Various Artists'); // genuine tag preserved
    expect(byId.null).toBeNull();

    db.close();
  });

  it('is idempotent — a second apply nulls nothing further', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO tracks (id, file_path, title, artist, album, album_artist) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('t', '/m/t.mp3', 'A', 'Alice', 'Comp', 'Alice');

    db.prepare(unbakeSql).run();
    const after1 = (
      db.prepare(`SELECT album_artist FROM tracks WHERE id='t'`).get() as {
        album_artist: string | null;
      }
    ).album_artist;
    db.prepare(unbakeSql).run();
    const after2 = (
      db.prepare(`SELECT album_artist FROM tracks WHERE id='t'`).get() as {
        album_artist: string | null;
      }
    ).album_artist;

    expect(after1).toBeNull();
    expect(after2).toBeNull();

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
