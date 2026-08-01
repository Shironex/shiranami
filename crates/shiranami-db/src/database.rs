//! The boot path: open, adopt, migrate, stamp.
//!
//! One function, in one order, because the order is the safety property. Every
//! step assumes the one before it ran (architecture §2.8, risk R18):
//!
//! 1. **open** with v1's pragmas, creating the file if a fresh install;
//! 2. **adopt** — which begins by refusing a damaged or too-new database, so
//!    nothing below ever writes to a file v2 does not understand;
//! 3. **migrate** — `0002_*.sql` onward on an adopted database, the baseline
//!    itself on a fresh one;
//! 4. **stamp** the drizzle ledger and the compatibility floor.
//!
//! Backing up the file belongs *before* all of this and lives in Phase 17's
//! first-run sequence, where the legacy directory is still in scope.

use std::path::Path;

use sqlx::SqlitePool;

use crate::adopt::{Adoption, adopt};
use crate::adopt::{ledger, v1};
use crate::compat;
use crate::error::{DbError, Result};
use crate::migrations::MIGRATOR;
use crate::pool;

/// An open database and the story of how it got that way.
pub struct OpenedDatabase {
    /// The connection pool every repository queries through.
    pub pool: SqlitePool,
    /// What adoption found and did. Phase 17 records this in
    /// `migrated_from_v1.json`; the boot log prints it.
    pub adoption: Adoption,
}

/// Open the database at `path`, adopting and migrating it as needed.
pub async fn open(path: &Path) -> Result<OpenedDatabase> {
    let pool = pool::open_pool(path).await?;

    // The pool holds a single connection, so everything below runs on the same
    // one and nothing may acquire a second while this is held.
    let mut conn = pool.acquire().await.map_err(|source| DbError::Query {
        operation: "acquire the database connection",
        source,
    })?;

    let adoption = adopt(&mut conn).await?;

    MIGRATOR
        .run(&mut *conn)
        .await
        .map_err(|source| DbError::Migrate { source })?;

    if matches!(adoption, Adoption::Fresh) {
        seed_v1_ledger(&mut conn).await?;
    }

    // Adoption stamps the floor inside its own transaction; a fresh install has
    // not been stamped yet, and re-stamping an adopted one is a no-op write of
    // the same value.
    compat::stamp_user_version(&mut conn).await?;

    drop(conn);

    Ok(OpenedDatabase { pool, adoption })
}

/// Write a complete `__drizzle_migrations` ledger into a database v2 created.
///
/// Nothing in v2 reads this. It exists so the handover runs in both directions:
/// v1's `importDatabase` will happily take a v2 file whose `user_version` is at
/// the frozen floor, and would then hand it to v1's migrator — which, finding
/// no ledger but a populated `tracks` table, would stamp the baseline and
/// replay `ALTER TABLE tracks ADD album_artist` against a column that already
/// exists, and fail. A complete ledger makes that migrator a no-op instead.
///
/// drizzle 1.0.0-rc.2 selects pending migrations purely by name-set membership,
/// so these rows do exactly the job of saying "all nine have run".
///
/// Removable once the handover window closes (architecture §4) and v1 is no
/// longer a rollback target.
async fn seed_v1_ledger(conn: &mut sqlx::SqliteConnection) -> Result<()> {
    if ledger::has_table(&mut *conn, "__drizzle_migrations").await? {
        return Ok(());
    }

    ledger::ensure_table(&mut *conn).await?;

    for migration in v1::V1_MIGRATIONS {
        ledger::record(&mut *conn, migration).await?;
    }

    tracing::debug!(
        migrations = v1::V1_MIGRATIONS.len(),
        "seeded a v1 migration ledger so a rollback build can still read this database"
    );

    Ok(())
}
