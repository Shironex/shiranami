//! The adoption state machine: taking a v1 database into the sqlx ledger.
//!
//! Runs once, before `MIGRATOR.run()`, against a database that may be anything
//! from an empty file to a library a user has been adding to since v0.9. The
//! decision it makes is narrow — *may this build claim `0001_baseline.sql`
//! describes this file's schema?* — and every path that cannot answer yes with
//! evidence returns an error instead (architecture §3.2, risk R6).
//!
//! The states, and what each does:
//!
//! | Database                                   | Adoption                                                   |
//! | ------------------------------------------ | ---------------------------------------------------------- |
//! | empty / absent                             | nothing; the migrator runs the baseline for real           |
//! | v1, all nine migrations applied            | stamp the baseline; no DDL                                 |
//! | v1, behind by N                            | replay the missing N, then stamp                           |
//! | v1, pre-migrator (tables, no ledger)       | stamp the baseline without DDL, heal, replay 001–008       |
//! | v1 + the stranded `track_bpm_key` dev migration | verify its columns exist, then also stamp `0003`      |
//! | already adopted                            | verify and no-op                                           |
//! | damaged, too new, or unrecognised          | refuse                                                     |
//!
//! The stranded row is the feature wave's addition (research-rust F2's
//! migration collision). The unmerged `feat/native-bpm-key-addon` branch
//! applied `20260101000008_track_bpm_key` to real dev profiles, and until v2
//! grew `0003_track_bpm_key.sql` the only safe answer was refusal #10
//! (`UnknownV1Migration`). Now that `0003` creates the identical column set,
//! the name is recognised: adoption **verifies** `tracks.bpm` and
//! `tracks.musical_key` really exist — a ledger that names the migration
//! without its schema is still refused — and records `0003` as satisfied so
//! the migrator does not fail re-adding the columns. Only that one name gets
//! this treatment; every other unknown ledger entry still refuses, because an
//! unknown migration is schema v2 cannot reason about.

use std::collections::BTreeSet;

use sqlx::{Connection, SqliteConnection};

use crate::adopt::{heal, ledger, v1};
use crate::compat;
use crate::error::{DbError, Result};
use crate::migrations;
use crate::pool;

/// What adoption did, for the caller to log and for Phase 17's marker file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Adoption {
    /// No pre-existing schema. The migrator will create it from the baseline.
    Fresh,
    /// A v1 database was taken over.
    Adopted {
        /// True when there was no drizzle ledger at all — a database from
        /// before v1's migrator shipped, whose baseline is stamped rather than
        /// run because its tables already exist (v1's `markBaseline`).
        legacy: bool,
        /// `tracks.disc_number` was missing and had to be added.
        healed_disc_number: bool,
        /// The v1 migrations replayed to bring the schema up to the baseline.
        replayed: Vec<String>,
        /// v2 migration versions recorded as applied without running, because a
        /// recognised v1 dev migration already created their exact schema —
        /// today only `3`, for a ledger carrying the stranded
        /// `20260101000008_track_bpm_key`. Empty for every shipped-v1 profile.
        satisfied: Vec<i64>,
    },
    /// An earlier run already adopted this database.
    AlreadyAdopted,
}

/// Adopt the database on `conn`, if it needs adopting.
///
/// Idempotent: running it again on its own output returns
/// [`Adoption::AlreadyAdopted`] and touches nothing.
pub async fn adopt(conn: &mut SqliteConnection) -> Result<Adoption> {
    // Before anything else, and specifically before anything writes: a damaged
    // file is refused rather than migrated (see `pool::quick_check`).
    pool::quick_check(&mut *conn).await?;

    let stamped = compat::read_user_version(&mut *conn).await?;
    compat::assert_not_downgrade(stamped, compat::SCHEMA_FLOOR)?;

    if let Some(row) = existing_baseline_row(&mut *conn).await? {
        migrations::verify_baseline(&row)?;
        return Ok(Adoption::AlreadyAdopted);
    }

    let ledger_shape = ledger::shape(&mut *conn).await?;
    let has_tables = ledger::has_table(&mut *conn, "tracks").await?;

    if matches!(ledger_shape, ledger::Shape::Absent) && !has_tables {
        return Ok(Adoption::Fresh);
    }

    let applied = read_applied(&mut *conn, ledger_shape).await?;
    let legacy = !applied.contains(v1::BASELINE_NAME);

    if !legacy && !has_tables {
        // The ledger says the schema exists and it does not. Stamping the
        // baseline here would record a schema that is not there, and the next
        // query would fail against a file we had already written to.
        return Err(DbError::UnsupportedLedger {
            reason: "the drizzle ledger records the baseline as applied, but the database has no \
                     `tracks` table"
                .to_owned(),
        });
    }

    // The stranded dev migration is recognised only with its schema actually
    // present. Verified here, read-only, before the adoption transaction opens:
    // a ledger that names it over a database without the columns is lying in
    // exactly the way the baseline check above refuses, and stamping `0003`
    // from it would leave the migrator claiming columns that are not there.
    let stranded_bpm_key = applied.contains(v1::STRANDED_BPM_KEY_NAME);
    if stranded_bpm_key {
        for column in ["bpm", "musical_key"] {
            if !ledger::has_column(&mut *conn, "tracks", column).await? {
                return Err(DbError::UnsupportedLedger {
                    reason: format!(
                        "the drizzle ledger records `{}` as applied, but `tracks` has no \
                         `{column}` column",
                        v1::STRANDED_BPM_KEY_NAME
                    ),
                });
            }
        }
    }

    apply_adoption(conn, &applied, legacy, stranded_bpm_key).await
}

/// The `_sqlx_migrations` baseline row, or `None` if this database has never
/// been adopted.
///
/// A ledger table with no baseline row counts as "never adopted": a first run
/// that created the table and then died is resumable, not a conflict.
async fn existing_baseline_row(
    conn: &mut SqliteConnection,
) -> Result<Option<migrations::BaselineRow>> {
    if !ledger::has_table(&mut *conn, migrations::LEDGER_TABLE).await? {
        return Ok(None);
    }

    migrations::baseline_row(conn).await
}

/// The set of v1 migrations this database records as applied.
///
/// A name the frozen chain does not contain means v1 shipped a migration after
/// v2 froze its copy. v2 has no idea what it did, so it cannot claim its
/// baseline matches — refuse (see [`v1`]). The one exception is
/// [`v1::STRANDED_BPM_KEY_NAME`], the addon branch's dev migration, whose
/// schema v2's own `0003` reproduces exactly; it passes through here and the
/// caller verifies its columns really exist before honouring it.
async fn read_applied(
    conn: &mut SqliteConnection,
    shape: ledger::Shape,
) -> Result<BTreeSet<String>> {
    let names = match shape {
        ledger::Shape::Absent => Vec::new(),
        ledger::Shape::Current => ledger::applied_names(conn).await?,
        ledger::Shape::Unsupported(reason) => return Err(DbError::UnsupportedLedger { reason }),
    };

    for name in &names {
        if !v1::is_known(name) && name != v1::STRANDED_BPM_KEY_NAME {
            return Err(DbError::UnknownV1Migration {
                name: name.clone(),
                known: v1::V1_MIGRATIONS.len(),
            });
        }
    }

    Ok(names.into_iter().collect())
}

/// Heal, replay, stamp — all inside one transaction.
///
/// Either the database comes out adopted or it comes out exactly as it went in.
/// There is no partial state to resume from, which is what makes a crashed
/// first run safe to simply retry.
async fn apply_adoption(
    conn: &mut SqliteConnection,
    applied: &BTreeSet<String>,
    legacy: bool,
    stranded_bpm_key: bool,
) -> Result<Adoption> {
    let mut tx = conn.begin().await.map_err(|source| DbError::Query {
        operation: "begin the adoption transaction",
        source,
    })?;

    // v1 ran this on every open, ahead of its migrator, because SQLite has no
    // `ADD COLUMN IF NOT EXISTS` and the statement could not be guarded inside
    // the migration SQL. No-op on any database that has the column.
    let healed_disc_number = heal::heal_disc_number(&mut tx).await?;

    ledger::ensure_table(&mut tx).await?;

    let mut replayed = Vec::new();

    for migration in v1::V1_MIGRATIONS {
        if applied.contains(migration.name) {
            continue;
        }

        if migration.name == v1::BASELINE_NAME {
            // v1's `markBaseline`: the tables are already here, put down by the
            // pre-migrator boot path that created them additively. Running the
            // baseline's DDL would fail on the first `CREATE TABLE`; the later
            // `heal_legacy_tables` migration is what fills in whatever that
            // additive path never created.
            tracing::info!("adopting a pre-migrator database: stamping the baseline without DDL");
        } else {
            heal::apply(&mut tx, migration).await?;
            replayed.push(migration.name.to_owned());
        }

        ledger::record(&mut tx, migration).await?;
    }

    migrations::ensure_table(&mut tx).await?;
    migrations::stamp_baseline(&mut tx).await?;

    // The stranded dev migration's schema was verified by the caller; record
    // v2's identical `0003` as satisfied so the migrator does not fail
    // re-adding columns the branch already added. `0002` is deliberately NOT
    // here: the stranded profile has never seen it, and the migrator runs it
    // for real exactly as it does on any adopted database — sqlx applies
    // whatever the ledger is missing regardless of what sorts after it.
    let mut satisfied = Vec::new();
    if stranded_bpm_key {
        migrations::stamp_version(&mut tx, migrations::TRACK_BPM_KEY_VERSION).await?;
        satisfied.push(migrations::TRACK_BPM_KEY_VERSION);
    }

    // Inside the transaction, unlike v1, which stamped after its migrator
    // returned. `PRAGMA user_version` is transactional, so keeping it here
    // means the stamp and the ledger it describes commit together.
    compat::stamp_user_version(&mut tx).await?;

    tx.commit().await.map_err(|source| DbError::Query {
        operation: "commit the adoption transaction",
        source,
    })?;

    tracing::info!(
        legacy,
        healed_disc_number,
        replayed = replayed.len(),
        satisfied = satisfied.len(),
        "adopted a v1 database"
    );

    Ok(Adoption::Adopted {
        legacy,
        healed_disc_number,
        replayed,
        satisfied,
    })
}
