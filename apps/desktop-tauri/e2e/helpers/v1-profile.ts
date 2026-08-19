/**
 * Stage an Electron-shaped v1 profile so the app has something to migrate.
 *
 * # Why this is rebuilt here rather than imported
 *
 * Phase 17 built the same thing twice already — `Profile::build` in
 * `crates/shiranami-db/tests/first_run_continuity.rs` and `v1_profile()` in
 * `crates/shiranami-core/src/migrate/run.rs` — but both are `tests/`-only Rust,
 * private to their own compilation unit and unreachable from a Node harness.
 * What is *shared* is the thing that actually matters: the nine frozen v1
 * migrations under `crates/shiranami-db/src/adopt/v1_sql/`, which this reads off
 * disk rather than restating. The schema therefore cannot drift from the one
 * adoption checks against — if a `.sql` file changes, this stager changes with
 * it, and if one is added the ledger below stops matching and the migrated
 * scenario fails loudly rather than silently testing an obsolete shape.
 *
 * The layout is `crates/shiranami-core/src/migrate/plan.rs`'s allowlist: the
 * settings file, the two content-addressed caches, and the database last.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, v1DataDir, assertIsolated } from './paths.js';
import { writeTracks, sineWav } from './audio.js';

/** `PRAGMA user_version` a current v1 install carries; the frozen floor is 8. */
const V1_USER_VERSION = 8;

/** Where the frozen v1 migrations live — the single source of truth. */
const V1_SQL_DIR = path.join(REPO_ROOT, 'crates/shiranami-db/src/adopt/v1_sql');

/** One seeded track, as a spec sees it after migration. */
export interface StagedTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly filePath: string;
}

export interface StagedV1Profile {
  readonly root: string;
  readonly tracks: readonly StagedTrack[];
}

/** The nine migration file names, in ledger order. */
function v1Migrations(): { name: string; sql: string }[] {
  return fs
    .readdirSync(V1_SQL_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(file => ({
      name: file.replace(/\.sql$/, ''),
      sql: fs.readFileSync(path.join(V1_SQL_DIR, file), 'utf8'),
    }));
}

/**
 * Build `<home>/Library/Application Support/Shiranami` with a real v1 database.
 *
 * `audioDir` is where the playable files go. It sits outside the profile on
 * purpose: v1 stored absolute paths to wherever a user's music actually lived,
 * and a migration that only works when the audio is inside the profile would
 * be testing something no user has.
 */
export function stageV1Profile(home: string, audioDir: string): StagedV1Profile {
  assertIsolated(home);

  const root = v1DataDir(home);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  // A real signal, because the playback scenario decodes these bytes.
  const files = writeTracks(audioDir, 3, () => sineWav(2));
  const tracks: StagedTrack[] = files.map((filePath, index) => ({
    id: `e2e-track-${index + 1}`,
    title: MIGRATED_TITLES[index],
    artist: MIGRATED_ARTISTS[index],
    album: MIGRATED_ALBUM,
    filePath,
  }));

  writeDatabase(path.join(root, 'shiranami.db'), tracks);

  // The caches first-run continuity copies. Content-addressed, so their
  // presence in the v2 tree afterwards is what proves the copy ran.
  fs.mkdirSync(path.join(root, 'album-art'), { recursive: true });
  fs.mkdirSync(path.join(root, 'waveform-peaks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'album-art', 'deadbeef.jpg'), Buffer.from('ffd8ff', 'hex'));
  fs.writeFileSync(path.join(root, 'waveform-peaks', 'cafe.json'), '{"peaks":[0.5]}');

  // electron-store's own formatting: tabs, and dot-paths as nested objects.
  // `app.onboardingCompleted` is what makes the migrated profile land on the
  // library rather than the first-run wizard.
  fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify(
      {
        theme: 'dark',
        app: { onboardingCompleted: true, language: 'en' },
        player: { volume: 0.5 },
      },
      null,
      '\t'
    )
  );

  // What a real Electron userData is mostly made of, and what the allowlist
  // must refuse to carry across.
  fs.mkdirSync(path.join(root, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Cache', 'data_0'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(root, 'Preferences'), '{}');

  return { root, tracks };
}

export const MIGRATED_ALBUM = 'Migrated Nights';

/**
 * The three staged rows, exported because the `migrated` capability's specs
 * assert on them by name.
 *
 * `stageV1Profile` runs in `onPrepare`, in the launcher process; the specs run
 * in a worker and never see its return value. Sharing the constants is what
 * keeps the two halves from drifting into separate copies of the same list.
 */
export const MIGRATED_TITLES = ['Harbour Lights', 'Paper Lanterns', 'Slow Ferry'] as const;
export const MIGRATED_ARTISTS = ['Aoi', 'Aoi', 'Nagi'] as const;

function writeDatabase(file: string, tracks: readonly StagedTrack[]): void {
  const db = new DatabaseSync(file);
  try {
    const migrations = v1Migrations();

    for (const migration of migrations) {
      // drizzle-kit's own separator; each chunk is one statement.
      for (const statement of migration.sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim();
        if (trimmed.length > 0) db.exec(trimmed);
      }
    }

    // The ledger adoption reads. Its *shape* is drizzle's, down to the
    // `numeric` created_at, because `adopt` matches on the column set.
    db.exec(
      'CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (' +
        'id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, ' +
        'name text, applied_at TEXT)'
    );
    const ledger = db.prepare(
      'INSERT INTO `__drizzle_migrations` (hash, created_at, name, applied_at) VALUES (?, ?, ?, ?)'
    );
    migrations.forEach((migration, index) => {
      ledger.run(
        `hash-of-${migration.name}`,
        1_767_225_600_000 + index * 1_000,
        migration.name,
        '2026-07-01T00:00:00.000Z'
      );
    });

    const insert = db.prepare(
      'INSERT INTO `tracks` (id, file_path, title, artist, album, duration, album_art, ' +
        'is_favorite, play_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const track of tracks) {
      insert.run(
        track.id,
        track.filePath,
        track.title,
        track.artist,
        track.album,
        2,
        // The v1 URL scheme, so the renderer's rewrite has something to rewrite.
        'shiranami-art://art/deadbeef.jpg',
        0,
        0
      );
    }

    db.exec(`PRAGMA user_version = ${V1_USER_VERSION}`);
  } finally {
    db.close();
  }
}
