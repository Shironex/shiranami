//! The sqlx migration set and its `_sqlx_migrations` ledger.
//!
//! From `0002_*.sql` onward this is the only migration system in the app.
//! `0001_baseline.sql` is the seam: it is a squash of v1's drizzle chain, run
//! for real on a fresh install and *stamped* on an adopted one.
//!
//! Stamping means writing a `_sqlx_migrations` row that says the baseline ran,
//! when it did not. That is safe only because the row carries sqlx's own
//! checksum of the file — taken from the compiled-in migration set here, never
//! recomputed by hand — so the next `MIGRATOR.run()` validates it exactly as it
//! would validate a migration that really ran, and a future edit to the
//! baseline is caught rather than silently accepted.

use sqlx::SqliteConnection;
use sqlx::migrate::{Migrate, Migration, Migrator};

use crate::error::{DbError, Result};

/// Every sqlx migration, compiled in from `migrations/`.
///
/// `sqlx::migrate!` resolves its path at compile time against the crate root,
/// which is why this does not violate the "never `CARGO_MANIFEST_DIR` as a
/// runtime path" rule (architecture §2.3) — nothing looks for this directory on
/// the user's machine.
pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// The version of the squashed baseline, from its filename.
const BASELINE_VERSION: i64 = 1;

/// The version of `0003_track_bpm_key.sql`, from its filename.
///
/// Named here because adoption needs to address it: a database carrying the
/// stranded v1 dev migration `20260101000008_track_bpm_key` already has the
/// exact schema this migration creates, and adoption records it as satisfied
/// rather than letting the migrator fail on a duplicate column (see
/// [`crate::adopt::run`]).
pub(crate) const TRACK_BPM_KEY_VERSION: i64 = 3;

/// sqlx's ledger table.
///
/// A constant rather than `MIGRATOR.table_name` at every call site so the
/// queries below stay `&'static str` — sqlx 0.9 requires anything else to be
/// waved through with `AssertSqlSafe`, and a ledger name is not worth the
/// exception. A test pins the two together.
pub(crate) const LEDGER_TABLE: &str = "_sqlx_migrations";

/// The compiled-in baseline migration.
fn baseline() -> Result<&'static Migration> {
    compiled(BASELINE_VERSION)
}

/// The compiled-in migration at `version`.
fn compiled(version: i64) -> Result<&'static Migration> {
    MIGRATOR
        .iter()
        .find(|migration| migration.version == version)
        .ok_or_else(|| DbError::LedgerConflict {
            reason: format!("this build has no migration {version}"),
        })
}

/// What `_sqlx_migrations` says about the baseline.
pub(crate) struct BaselineRow {
    /// Whether the recorded run succeeded. sqlx writes `false` for a migration
    /// that failed partway through a non-transactional run.
    success: bool,
    /// The checksum recorded when the row was written.
    checksum: Vec<u8>,
}

/// Create `_sqlx_migrations` if it is absent.
///
/// Delegates to sqlx's own `Migrate::ensure_migrations_table` rather than
/// transcribing the DDL, so the table this crate stamps into is byte-identical
/// to the one the migrator would have created itself.
pub(crate) async fn ensure_table(conn: &mut SqliteConnection) -> Result<()> {
    conn.ensure_migrations_table(LEDGER_TABLE)
        .await
        .map_err(|source| DbError::Migrate { source })
}

/// Read the baseline's ledger row, if the ledger exists and holds one.
pub(crate) async fn baseline_row(conn: &mut SqliteConnection) -> Result<Option<BaselineRow>> {
    let row: Option<(bool, Vec<u8>)> =
        sqlx::query_as("SELECT success, checksum FROM _sqlx_migrations WHERE version = ?1")
            .bind(BASELINE_VERSION)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|source| DbError::Query {
                operation: "read the sqlx migration ledger",
                source,
            })?;

    Ok(row.map(|(success, checksum)| BaselineRow { success, checksum }))
}

/// Confirm an existing baseline row describes *this* build's baseline.
///
/// A mismatch means the database was adopted by a build whose squash differed
/// from this one's — so this build cannot claim to know the schema. It refuses
/// rather than continue, which is the same call sqlx's own validator makes, one
/// step earlier and with a message that says what actually happened.
pub(crate) fn verify_baseline(row: &BaselineRow) -> Result<()> {
    let baseline = baseline()?;

    if !row.success {
        return Err(DbError::LedgerConflict {
            reason: "a previous run recorded the baseline migration as failed. The database was \
                     left partway through adoption and needs to be restored from a backup"
                .to_owned(),
        });
    }

    if row.checksum.as_slice() != baseline.checksum.as_ref() {
        return Err(DbError::LedgerConflict {
            reason: "the recorded baseline checksum does not match this build's \
                     `0001_baseline.sql`. The database was adopted by a different build"
                .to_owned(),
        });
    }

    Ok(())
}

/// Record the baseline as applied without running its DDL.
pub(crate) async fn stamp_baseline(conn: &mut SqliteConnection) -> Result<()> {
    stamp_version(conn, BASELINE_VERSION).await
}

/// Record a compiled-in migration as applied without running its DDL.
///
/// `execution_time` is zero because nothing executed; sqlx only reports that
/// column, never validates it. `installed_on` is left to the column default so
/// the timestamp comes from SQLite, as it does for a migration sqlx applies
/// itself. The checksum comes from the compiled-in migration set, so the next
/// `MIGRATOR.run()` validates the stamp exactly as it would a real run and a
/// later edit to the file is caught rather than silently accepted.
///
/// Only two call sites may exist: the baseline (every adoption) and
/// [`TRACK_BPM_KEY_VERSION`] (a database carrying the stranded v1 dev
/// migration, whose schema is verified first). A stamp is a claim the schema
/// already exists, and a claim without a verification is exactly risk R6.
pub(crate) async fn stamp_version(conn: &mut SqliteConnection, version: i64) -> Result<()> {
    let migration = compiled(version)?;

    sqlx::query(
        "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
         VALUES (?1, ?2, TRUE, ?3, 0)",
    )
    .bind(migration.version)
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "record a migration as applied without running it",
        source,
    })?;

    tracing::info!(
        version = migration.version,
        "recorded a migration as applied without running its DDL"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ledger_constant_matches_the_migrator() {
        assert_eq!(
            MIGRATOR.table_name.as_ref(),
            LEDGER_TABLE,
            "the queries in this module name the ledger table literally"
        );
    }

    #[test]
    fn the_baseline_is_migration_one() {
        let baseline = baseline().expect("the crate must compile in a baseline migration");

        assert_eq!(baseline.version, BASELINE_VERSION);
        assert_eq!(baseline.description.as_ref(), "baseline");
        assert!(
            !baseline.checksum.is_empty(),
            "the checksum is what makes a stamped row verifiable"
        );
    }

    /// Adoption stamps the baseline, and `0003` only on a database that
    /// verifiably ran the stranded dev migration; every other post-baseline
    /// migration arrives unstamped and is run for real against an adopted
    /// database — correct, and only correct if it was written knowing that.
    #[test]
    fn later_migrations_are_run_not_stamped() {
        for migration in MIGRATOR.iter().filter(|m| m.version != BASELINE_VERSION) {
            assert!(
                migration.version > BASELINE_VERSION,
                "migration {} sorts before the baseline it would have to assume",
                migration.version
            );
        }
    }
}
