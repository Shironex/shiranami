//! `PRAGMA user_version` as a compatibility floor, and the downgrade guard.
//!
//! v1 stamps a number into `user_version` and refuses to open a database
//! stamped higher than the running build understands. The subtlety — and it is
//! load-bearing for the handover — is that the number is **not** a migration
//! count. v1 derives it as "the index of the last migration that genuinely
//! broke older builds", so a migration marked `backwardCompatible` (an index,
//! an added table, an added nullable column) leaves the floor where it was and
//! a user can still roll back to the previous release. Stamping the count
//! instead would make every migration a one-way door.
//!
//! v2 inherits the number and **freezes it** for the duration of the update
//! handover (decision D15, ~6 months per architecture §4). The reason is
//! narrow and specific: v1's `importDatabase` probes `PRAGMA user_version` on
//! the file being imported and refuses anything above its own floor. A user who
//! adopts into v2, changes their mind, and imports their library back into v1
//! has to get past that check. "Copy, never move" protects the *file*; the
//! frozen floor is what protects the *ability to read it*.
//!
//! Consequence for anyone adding `0002_*.sql`: every v2.0.x migration must be
//! backward-compatible in the sense above. If one genuinely is not, raising
//! this constant is a deliberate decision to end the rollback window, not a
//! detail of the migration.

use sqlx::SqliteConnection;

use crate::error::{DbError, Result};

/// The `PRAGMA user_version` v2 reads and re-stamps.
///
/// Frozen at v1's value for the handover window — see the module docs. A test
/// below pins it against the fixture generated from v1's own migrator, so a v1
/// that raised its floor cannot slip past unnoticed.
pub const SCHEMA_FLOOR: i64 = 8;

/// Refuse a database stamped by a build newer than this one.
///
/// Mirrors v1's `assertNotDowngrade`. Extracted as a pure function, as it is
/// there, so the comparison is testable without a live pragma round-trip.
pub fn assert_not_downgrade(found: i64, supported: i64) -> Result<()> {
    if found > supported {
        return Err(DbError::SchemaTooNew { found, supported });
    }
    Ok(())
}

/// Read `PRAGMA user_version`. Zero on a database nothing has stamped yet.
pub(crate) async fn read_user_version(conn: &mut SqliteConnection) -> Result<i64> {
    sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "read the database schema version",
            source,
        })
}

/// Stamp the compatibility floor.
///
/// `PRAGMA user_version` takes no bind parameter, so the value is formatted in.
/// It is a compile-time `i64` constant and reaches no user input, which is the
/// audit `AssertSqlSafe` asks for.
pub(crate) async fn stamp_user_version(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "PRAGMA user_version = {SCHEMA_FLOOR}"
    )))
    .execute(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "stamp the database schema version",
        source,
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_and_older_stamps_are_accepted() {
        assert!(assert_not_downgrade(SCHEMA_FLOOR, SCHEMA_FLOOR).is_ok());
        assert!(assert_not_downgrade(0, SCHEMA_FLOOR).is_ok());
        assert!(assert_not_downgrade(SCHEMA_FLOOR - 1, SCHEMA_FLOOR).is_ok());
    }

    #[test]
    fn a_newer_stamp_is_refused() {
        let error = assert_not_downgrade(SCHEMA_FLOOR + 1, SCHEMA_FLOOR)
            .expect_err("a database stamped above the floor must be refused");

        assert!(matches!(error, DbError::SchemaTooNew { found, supported }
            if found == SCHEMA_FLOOR + 1 && supported == SCHEMA_FLOOR));
    }

    /// The floor is only "frozen at v1's value" if it is still v1's value.
    ///
    /// The fixture is generated from `packages/database/src/migrate.ts` by
    /// `pnpm verify:db-baseline`, which derives the stamp the same way v1 does
    /// rather than copying a number. If v1 ever ships a breaking migration, the
    /// regenerated fixture disagrees with this constant and the decision to
    /// raise the floor — which ends the rollback window — has to be made
    /// deliberately instead of inherited.
    #[test]
    fn the_floor_matches_the_one_v1_stamps() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/v1-schema.json"))
                .expect("the committed v1 schema fixture must be valid JSON");

        assert_eq!(
            fixture["userVersion"].as_i64(),
            Some(SCHEMA_FLOOR),
            "v1 now stamps a different compatibility floor than v2 freezes"
        );
    }
}
