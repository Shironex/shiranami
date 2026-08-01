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
use crate::repo::conn::acquire;

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
    // one and nothing may acquire a second while this is held. Taken through
    // `repo::conn::acquire`, the crate's one acquire site (see `repo`).
    let mut conn = acquire(&pool).await?;

    let adoption = adopt(&mut conn).await?;

    migrate(&mut conn).await?;

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

/// Run every migration the ledger says is still pending.
///
/// # Why not `MIGRATOR.run(&mut *conn)`
///
/// Because that makes [`open`]'s future non-`Send`, and a `Send` future is what
/// both §2.8's boot sequence and `db:backup:import`'s `#[tauri::command]`
/// require.
///
/// `Migrator::run` is `run<'a, A>(&self, migrator: A) where A: Acquire<'a>`, and
/// `'a` appears **only** in the bound — nothing about `A` constrains it. It is
/// therefore late-bound, so it stays a free region variable that rustc has to
/// discharge for *every* lifetime, and `Acquire` is implemented for
/// `&'c mut SqliteConnection` at one. The diagnostic is
/// `implementation of 'sqlx::Acquire' is not general enough`, reported against
/// whichever `async fn` transitively awaits it rather than against the call —
/// which is why lane 2 met it as an error on a `#[tauri::command]` attribute two
/// crates away. Being late-bound, it cannot be pinned with a turbofish either
/// (rust#42868): the argument is accepted and then ignored.
///
/// `run_direct` is sqlx's own answer, carrying the comment "Getting around the
/// annoying `implementation of Acquire is not general enough` error", and
/// `run(a)` is defined as exactly `a.acquire()` followed by
/// `run_direct(None, &mut *conn, false)`. Since this function is *given* the
/// connection, that acquire step is a reborrow of a connection already in hand —
/// ceremony that buys nothing here and costs the `Send` bound. The arguments
/// below reproduce `run`'s literally: no target version, and `skip = false` so
/// migrations are executed rather than merely stamped.
///
/// `run_direct` is `#[doc(hidden)]`, so a sqlx upgrade could rename it. That is
/// a compile error, not a silent behaviour change, and
/// [`tests::the_open_future_is_send`] plus the adoption suite pin both halves of
/// what it does.
async fn migrate(conn: &mut sqlx::SqliteConnection) -> Result<()> {
    MIGRATOR
        .run_direct(None, conn, false)
        .await
        .map_err(|source| DbError::Migrate { source })
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

#[cfg(test)]
mod tests {
    /// [`super::open`]'s future has to be `Send`.
    ///
    /// A compile-time assertion rather than a runtime one — it never opens the
    /// path it names, and the test body would pass just as well if the property
    /// held; the failure is a *compile* error in this file. It exists because
    /// nothing else in the crate needs `Send`: every other caller is a test
    /// driving `open` on a single thread, so the property regressed once already
    /// and was found from a `#[tauri::command]` two crates away, reported against
    /// an attribute rather than against any line here.
    ///
    /// See [`super::migrate`] for what makes it hold.
    #[test]
    fn the_open_future_is_send() {
        fn assert_send<T: Send>(_: T) {}
        assert_send(super::open(std::path::Path::new("/nonexistent/probe.db")));
    }
}
