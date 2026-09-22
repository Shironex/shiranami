//! Reading and writing `__drizzle_migrations`, v1's migration ledger.
//!
//! Adoption leaves this table in place rather than dropping it (architecture
//! §3.2 step 5): it is the breadcrumb that lets a v1 build opened against the
//! same file understand what has already run. v2 never reads it after adoption
//! — `_sqlx_migrations` is the ledger of record from then on — but it keeps it
//! truthful, because "truthful" is what the rollback path depends on.
//!
//! Only drizzle's 5-column ledger shape is supported. drizzle 0.x wrote a
//! 3-column one (`id`, `hash`, `created_at`), and finding it would mean
//! matching rows to migrations by hash the way drizzle's own upgrader does —
//! which this crate deliberately does not implement, because no shipped
//! Shiranami release can have written one. v1's migrator landed in v0.22.0
//! (`9c0d0564`) and the bump to drizzle 1.0.0-rc.2 landed before v0.19.0
//! (`173f5832`), so every ledger that has ever existed in the wild was written
//! by rc.2 in the 5-column shape. The 3-column case is detected and refused
//! rather than guessed at.

use sqlx::{Row, SqliteConnection};

use crate::adopt::v1::V1Migration;
use crate::error::{DbError, Result};

/// v1's ledger table name.
const TABLE: &str = "__drizzle_migrations";

/// What state the drizzle ledger is in.
pub(crate) enum Shape {
    /// No ledger table. Either a fresh database or one from before v1's
    /// migrator shipped.
    Absent,
    /// drizzle 1.0.0-rc.2's shape — the only one v2 reads.
    Current,
    /// A ledger table exists but is not one v2 can interpret.
    Unsupported(String),
}

/// Whether a table exists.
pub(crate) async fn has_table(conn: &mut SqliteConnection, name: &str) -> Result<bool> {
    let found: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1")
            .bind(name)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|source| DbError::Query {
                operation: "look for a table in the database schema",
                source,
            })?;

    Ok(found.is_some())
}

/// Whether a table has a given column. The guard behind every heal step.
pub(crate) async fn has_column(
    conn: &mut SqliteConnection,
    table: &str,
    column: &str,
) -> Result<bool> {
    let found: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2")
            .bind(table)
            .bind(column)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|source| DbError::Query {
                operation: "inspect a table's columns",
                source,
            })?;

    Ok(found.is_some())
}

/// Classify the ledger in this database.
pub(crate) async fn shape(conn: &mut SqliteConnection) -> Result<Shape> {
    if !has_table(&mut *conn, TABLE).await? {
        return Ok(Shape::Absent);
    }

    if !has_column(&mut *conn, TABLE, "name").await? {
        return Ok(Shape::Unsupported(format!(
            "`{TABLE}` has no `name` column, so it was written by drizzle 0.x — a version no \
             Shiranami release with a migrator ever shipped"
        )));
    }

    Ok(Shape::Current)
}

/// The migration names the ledger records as applied.
///
/// Rows with a NULL `name` are skipped, mirroring drizzle's own
/// `getMigrationsToRun`, which filters them out before building its applied
/// set. A NULL name there means "unmatched during a ledger upgrade", and
/// treating it as applied would skip a migration that never ran.
pub(crate) async fn applied_names(conn: &mut SqliteConnection) -> Result<Vec<String>> {
    // Every `AssertSqlSafe` in this module interpolates `TABLE` and nothing
    // else. It is a private `&'static str` constant that no caller can reach.
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT name FROM `{TABLE}` WHERE name IS NOT NULL ORDER BY id"
    )))
    .fetch_all(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the drizzle migration ledger",
        source,
    })?;

    rows.into_iter()
        .map(|row| {
            row.try_get::<String, _>("name")
                .map_err(|source| DbError::Query {
                    operation: "read a drizzle ledger row",
                    source,
                })
        })
        .collect()
}

/// Create the ledger in drizzle 1.0.0-rc.2's shape, if it is not already there.
///
/// The DDL is a transcription of the one `SQLiteSyncDialect.migrate` emits, so
/// a v1 build opening this database afterwards finds the ledger it expects and
/// skips its own upgrade path.
pub(crate) async fn ensure_table(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "CREATE TABLE IF NOT EXISTS `{TABLE}` (
                id INTEGER PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric,
                name text,
                applied_at TEXT
            )"
    )))
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "create the drizzle migration ledger",
        source,
    })?;

    Ok(())
}

/// Record a migration as applied.
///
/// `applied_at` is produced by SQLite rather than in Rust so the format matches
/// the JavaScript `new Date().toISOString()` v1 writes, without this crate
/// taking a date dependency for one column nothing reads.
pub(crate) async fn record(conn: &mut SqliteConnection, migration: &V1Migration) -> Result<()> {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO `{TABLE}` (\"hash\", \"created_at\", \"name\", \"applied_at\")
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
    )))
    .bind(migration.hash())
    .bind(migration.created_at)
    .bind(migration.name)
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "record a migration in the drizzle ledger",
        source,
    })?;

    Ok(())
}
