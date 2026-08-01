/**
 * Pins the v2 `0001_baseline.sql` squash against the schema v1's drizzle
 * migrations actually produce (architecture §3.2, decision D14, risk R6).
 *
 * The squash is the one place where "v2 adopts a real user's database" can go
 * silently wrong: adoption stamps the baseline as already-applied rather than
 * running it, so if the squash and the drizzle chain ever disagree, every v2
 * query after the handover runs against a schema nobody verified. The
 * `sqlite_master` diff test in `crates/shiranami-db/tests/` is what proves they
 * agree — and this script is what gives that test something true to compare
 * against.
 *
 * Run: `pnpm verify:db-baseline` to verify, `pnpm verify:db-baseline --write`
 * to regenerate. CI runs the verifying form in the `rust-checks` job.
 *
 * Why a Node script and not just a Rust test: the reference has to be built by
 * the *v1* migration chain living in `packages/database`, and that package is
 * deleted at cutover (Phase 20). Committing the fixture is what lets the cargo
 * test keep proving the squash after its source of truth is gone. While
 * `packages/database` still exists, this script is what stops the fixture from
 * rotting against it.
 *
 * Dependencies: none. `node:sqlite` and `node:crypto` are builtins, which is
 * what lets this run in the `rust-checks` job — that job installs Node so
 * `pnpm verify:drift-guard` resolves, but deliberately skips `node_modules`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/** Repo root, resolved from this file so the script is cwd-independent. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** v1's migration folders — one `migration.sql` each, named in apply order. */
const DRIZZLE_DIR = path.join(ROOT, 'packages/database/drizzle');

/** v1's migrator, read as text for the compatibility-floor derivation. */
const MIGRATE_TS = path.join(ROOT, 'packages/database/src/migrate.ts');

/** The committed reference the cargo test diffs against. */
const FIXTURE = path.join(ROOT, 'crates/shiranami-db/fixtures/v1-schema.json');

/** drizzle-kit's statement separator inside a `migration.sql`. */
const BREAKPOINT = '--> statement-breakpoint';

/**
 * Bookkeeping tables excluded from the comparison. Both ledgers record *what
 * ran*, not what the application schema is, and the two migration systems
 * necessarily disagree about them — that disagreement is the point of adoption,
 * not a drift signal.
 */
const LEDGER_TABLES = new Set(['__drizzle_migrations', '_sqlx_migrations']);

/** Reports a verification failure and exits non-zero. */
function fail(message) {
  console.error(`✖ db-baseline verification: ${message}`);
  process.exit(1);
}

// ── Reading v1 ────────────────────────────────────────────────────────────────

/**
 * v1's migration folder names in apply order. Mirrors the filter
 * `packages/database/src/migrate.test.ts` uses: a folder counts only when it
 * holds a `migration.sql`, which is what keeps drizzle-kit's `meta/`
 * bookkeeping from reading as a phantom migration.
 */
function readMigrationNames() {
  if (!existsSync(DRIZZLE_DIR)) {
    fail(
      `${path.relative(ROOT, DRIZZLE_DIR)} is missing. If \`packages/database\` was deleted at ` +
        `cutover, delete this script and its CI step too — the committed fixture is the record now.`
    );
  }

  return readdirSync(DRIZZLE_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(path.join(DRIZZLE_DIR, e.name, 'migration.sql')))
    .map(e => e.name)
    .sort();
}

/**
 * A migration's statements, split exactly the way drizzle's migrator splits
 * them so the sha256 below reproduces the ledger hash v1 stores.
 */
function readStatements(name) {
  const sql = readFileSync(path.join(DRIZZLE_DIR, name, 'migration.sql'), 'utf8');
  return sql
    .replace(/\r\n/gu, '\n')
    .split(BREAKPOINT)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * drizzle's `formatToMillis`: the `YYYYMMDDHHMMSS` folder prefix as epoch
 * millis. Stored as the ledger's `created_at`.
 */
function folderMillis(name) {
  const d = name.slice(0, 14);
  return Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(4, 6)) - 1,
    Number(d.slice(6, 8)),
    Number(d.slice(8, 10)),
    Number(d.slice(10, 12)),
    Number(d.slice(12, 14))
  );
}

/**
 * The `PRAGMA user_version` v1 stamps, derived from `migrate.ts` rather than
 * hardcoded.
 *
 * v1's stamp is a **compatibility floor, not a migration count**: it tracks the
 * last migration that genuinely broke older builds, so an index-only migration
 * flagged `backwardCompatible` leaves the floor alone and a user can still roll
 * back. v2 freezes that floor for the handover window (decision D15), so the
 * number has to be read from v1 rather than assumed — a v1 that raised it would
 * make every adopted database unopenable by the release the user rolls back to.
 */
function readCompatibilityFloor(names) {
  const source = readFileSync(MIGRATE_TS, 'utf8');

  // The first entry is `name: BASELINE_NAME` (a const), the rest are literals.
  const markers = names.map((name, index) =>
    index === 0 ? 'name: BASELINE_NAME' : `name: '${name}'`
  );

  const offsets = markers.map(marker => {
    const at = source.indexOf(marker);
    if (at === -1) {
      fail(
        `could not find \`${marker}\` in ${path.relative(ROOT, MIGRATE_TS)}. The migrator's ` +
          `shape changed; teach this script the new one before trusting the fixture.`
      );
    }
    return at;
  });

  // Everything after the MIGRATIONS array belongs to no migration.
  const end = source.indexOf('export const SCHEMA_VERSION');
  if (end === -1 || end < offsets[offsets.length - 1]) {
    fail(`could not locate \`SCHEMA_VERSION\` after the migration array in migrate.ts`);
  }

  let floor = 0;
  for (const [index, start] of offsets.entries()) {
    const region = source.slice(start, offsets[index + 1] ?? end);
    if (!region.includes('backwardCompatible: true')) {
      floor = index + 1;
    }
  }
  return floor;
}

// ── Building the reference database ───────────────────────────────────────────

/**
 * Applies every drizzle migration in order to a fresh in-memory database, the
 * way v1's migrator does on a first run, and stamps the compatibility floor.
 */
function buildReference(names, floor) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  for (const name of names) {
    for (const statement of readStatements(name)) {
      db.exec(statement);
    }
  }

  db.exec(`PRAGMA user_version = ${floor}`);
  return db;
}

// ── Extracting the schema ─────────────────────────────────────────────────────

/**
 * Every schema object, ledgers excluded, ordered so the listing is stable
 * regardless of the order SQLite happened to create things in.
 */
function readObjects(db) {
  return db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite\\_stat%' ESCAPE '\\'
       ORDER BY type, name`
    )
    .all()
    .filter(row => !LEDGER_TABLES.has(row.tbl_name))
    .map(row => ({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      // Implicit indexes (the ones a UNIQUE constraint creates) have no SQL.
      sql: row.sql ?? null,
    }));
}

/**
 * The structural view of every table: columns, indexes and foreign keys as
 * SQLite itself parsed them.
 *
 * This exists alongside the raw `sql` above because the two catch different
 * mistakes. Text tells you the squash was written differently; pragmas tell you
 * it *means* something different — a dropped `NOT NULL`, a default that parsed
 * as an expression instead of a literal, a foreign key that lost its
 * `ON DELETE CASCADE`. A squash can only be trusted when both agree.
 */
function readTables(db, objects) {
  const tables = {};

  for (const object of objects) {
    if (object.type !== 'table') {
      continue;
    }

    const columns = db
      .prepare(`SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)`)
      .all(object.name)
      .sort((a, b) => Number(a.cid) - Number(b.cid))
      .map(c => ({
        name: c.name,
        type: c.type,
        notNull: Number(c.notnull) === 1,
        default: c.dflt_value ?? null,
        primaryKey: Number(c.pk),
      }));

    const indexes = db
      .prepare(`SELECT name, "unique", origin, partial FROM pragma_index_list(?)`)
      .all(object.name)
      .map(index => ({
        name: index.name,
        unique: Number(index.unique) === 1,
        // 'c' = CREATE INDEX, 'u' = UNIQUE constraint, 'pk' = PRIMARY KEY.
        origin: index.origin,
        partial: Number(index.partial) === 1,
        columns: db
          .prepare(`SELECT seqno, name FROM pragma_index_info(?)`)
          .all(index.name)
          .sort((a, b) => Number(a.seqno) - Number(b.seqno))
          .map(c => c.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const foreignKeys = db
      .prepare(`SELECT "table", "from", "to", on_update, on_delete FROM pragma_foreign_key_list(?)`)
      .all(object.name)
      .map(fk => ({
        table: fk.table,
        from: fk.from,
        to: fk.to,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
      }))
      .sort((a, b) => `${a.table}.${a.from}`.localeCompare(`${b.table}.${b.from}`));

    tables[object.name] = { columns, indexes, foreignKeys };
  }

  return tables;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const names = readMigrationNames();
if (names.length === 0) {
  fail(`no migrations found under ${path.relative(ROOT, DRIZZLE_DIR)}`);
}

const floor = readCompatibilityFloor(names);
const db = buildReference(names, floor);
const objects = readObjects(db);

const fixture = {
  _generator:
    'scripts/verify-db-baseline.mjs — regenerate with `pnpm verify:db-baseline --write`. Do not edit by hand.',
  _source: 'packages/database/drizzle/*/migration.sql, applied in folder order',
  userVersion: Number(db.prepare('PRAGMA user_version').get().user_version),
  drizzleMigrations: names.map(name => ({
    name,
    // drizzle-kit's hash: sha256 of the statements rejoined on the breakpoint
    // marker, which is byte-for-byte the on-disk file.
    hash: createHash('sha256').update(readStatements(name).join(BREAKPOINT)).digest('hex'),
    createdAt: folderMillis(name),
  })),
  objects,
  tables: readTables(db, objects),
};

db.close();

const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

if (process.argv.includes('--write')) {
  writeFileSync(FIXTURE, serialized);
  console.log(
    `✔ db-baseline: wrote ${path.relative(ROOT, FIXTURE)} ` +
      `(${String(names.length)} migrations, ${String(objects.length)} schema objects, user_version ${String(fixture.userVersion)}).`
  );
  process.exit(0);
}

if (!existsSync(FIXTURE)) {
  fail(
    `${path.relative(ROOT, FIXTURE)} does not exist. Run \`pnpm verify:db-baseline --write\` ` +
      `and commit it.`
  );
}

if (readFileSync(FIXTURE, 'utf8') !== serialized) {
  fail(
    `${path.relative(ROOT, FIXTURE)} no longer matches the schema ` +
      `packages/database/drizzle/*/migration.sql produces. A v1 migration changed after the ` +
      `fixture was committed, which means \`crates/shiranami-db/migrations/0001_baseline.sql\` ` +
      `is now a squash of a schema that no longer exists. Re-run ` +
      `\`pnpm verify:db-baseline --write\`, then make the baseline match again — the cargo ` +
      `\`sqlite_master\` diff test will tell you where it does not.`
  );
}

console.log(
  `✔ db-baseline verification: the committed fixture still matches v1's ` +
    `${String(names.length)} drizzle migrations.`
);
