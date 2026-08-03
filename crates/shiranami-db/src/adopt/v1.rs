//! v1's drizzle migration chain, frozen into this crate.
//!
//! The `.sql` files under `v1_sql/` are byte-for-byte copies of
//! `packages/database/drizzle/*/migration.sql`. They are copied rather than
//! read from there for two reasons: `packages/database` is deleted at cutover
//! (Phase 20), and a runtime path into a sibling package would not survive
//! bundling anyway.
//!
//! This set is **frozen at nine**. v2 does not track v1's chain forward — a
//! tenth migration appearing in a user's ledger is a hard error
//! ([`crate::error::DbError::UnknownV1Migration`]), because v2 would have no
//! way to know what it did and therefore no way to claim its own baseline
//! describes the resulting schema. From `0002_*.sql` onward, migrations are
//! pure sqlx and drizzle is dead (architecture §3.2 step 6).
//!
//! Two of these are replayed on real user data during adoption, so the copies
//! are pinned against the generated fixture by tests below: a silent edit here
//! would run different SQL against a real library than v1 ever did.

use sha2::{Digest, Sha256};

/// drizzle-kit's statement separator inside a `migration.sql`.
const BREAKPOINT: &str = "--> statement-breakpoint";

/// One of v1's migrations.
pub(crate) struct V1Migration {
    /// The drizzle folder name, which is also the ledger's `name` column.
    pub(crate) name: &'static str,
    /// The ledger's `created_at`: the `YYYYMMDDHHMMSS` prefix as epoch millis,
    /// exactly as drizzle's `formatToMillis` computes it.
    ///
    /// Stored rather than parsed. These are frozen constants, and a literal
    /// that a test pins against the fixture is honest about that in a way a
    /// date parser with an unreachable error path is not.
    pub(crate) created_at: i64,
    /// The migration file, verbatim.
    pub(crate) sql: &'static str,
}

impl V1Migration {
    /// The statements, split the way drizzle splits them.
    pub(crate) fn statements(&self) -> impl Iterator<Item = &'static str> {
        self.sql
            .split(BREAKPOINT)
            .map(str::trim)
            .filter(|statement| !statement.is_empty())
    }

    /// The ledger's `hash` column: sha256 of the statements rejoined on the
    /// breakpoint marker.
    ///
    /// Derived rather than stored, so editing a `v1_sql/*.sql` copy changes the
    /// hash and the fixture test below notices. drizzle 1.0.0-rc.2 matches
    /// applied migrations by *name* and never reads this column, so a wrong
    /// value would be invisible at runtime — which is exactly why it is worth
    /// pinning.
    pub(crate) fn hash(&self) -> String {
        let joined = self.statements().collect::<Vec<_>>().join(BREAKPOINT);
        format!("{:x}", Sha256::digest(joined.as_bytes()))
    }
}

/// The baseline's name. Adoption stamps this one without running its DDL when
/// the database already holds tables — v1's `markBaseline`.
pub(crate) const BASELINE_NAME: &str = "20260101000000_baseline";

/// v1's nine migrations, in apply order.
pub(crate) const V1_MIGRATIONS: &[V1Migration] = &[
    V1Migration {
        name: BASELINE_NAME,
        created_at: 1_767_225_600_000,
        sql: include_str!("v1_sql/20260101000000_baseline.sql"),
    },
    V1Migration {
        name: "20260101000001_album_artist",
        created_at: 1_767_225_601_000,
        sql: include_str!("v1_sql/20260101000001_album_artist.sql"),
    },
    V1Migration {
        name: "20260101000002_track_loudness",
        created_at: 1_767_225_602_000,
        sql: include_str!("v1_sql/20260101000002_track_loudness.sql"),
    },
    V1Migration {
        name: "20260101000003_negative_signals",
        created_at: 1_767_225_603_000,
        sql: include_str!("v1_sql/20260101000003_negative_signals.sql"),
    },
    V1Migration {
        name: "20260101000004_smart_playlists",
        created_at: 1_767_225_604_000,
        sql: include_str!("v1_sql/20260101000004_smart_playlists.sql"),
    },
    V1Migration {
        name: "20260101000005_download_queue",
        created_at: 1_767_225_605_000,
        sql: include_str!("v1_sql/20260101000005_download_queue.sql"),
    },
    V1Migration {
        name: "20260101000006_unbake_album_artist",
        created_at: 1_767_225_606_000,
        sql: include_str!("v1_sql/20260101000006_unbake_album_artist.sql"),
    },
    V1Migration {
        name: "20260101000007_heal_legacy_tables",
        created_at: 1_767_225_607_000,
        sql: include_str!("v1_sql/20260101000007_heal_legacy_tables.sql"),
    },
    V1Migration {
        name: "20260101000008_query_indexes",
        created_at: 1_767_225_608_000,
        sql: include_str!("v1_sql/20260101000008_query_indexes.sql"),
    },
];

/// Whether `name` is one of the migrations this build knows.
pub(crate) fn is_known(name: &str) -> bool {
    V1_MIGRATIONS.iter().any(|migration| migration.name == name)
}

/// The stranded dev migration from the unmerged `feat/native-bpm-key-addon`
/// branch: `ALTER TABLE tracks ADD bpm real; ADD musical_key text`.
///
/// Never shipped, but real databases carry it — the developer's own v1 profile
/// ran that branch (architecture, Phase 18 amendments), and refusing it as
/// [`UnknownV1Migration`](crate::error::DbError::UnknownV1Migration) was
/// correct only until v2 grew a migration with the same intent. v2's
/// `0003_track_bpm_key.sql` now creates the **identical** column set, so a
/// ledger naming this migration describes schema this build fully understands:
/// adoption verifies the columns are really present and records `0003` as
/// satisfied instead of running it (see [`super::run`]).
///
/// It is deliberately *not* part of [`V1_MIGRATIONS`]: it is not in v1's chain,
/// must never be replayed onto a database that lacks it, and a v1 build rolling
/// back neither knows nor cares about the name — drizzle matches only its own
/// migrations against the ledger.
pub(crate) const STRANDED_BPM_KEY_NAME: &str = "20260101000008_track_bpm_key";

#[cfg(test)]
mod tests {
    use super::*;

    /// The fixture is generated from `packages/database` by
    /// `pnpm verify:db-baseline`, so this is the copies-versus-original diff.
    /// It covers name, order, ledger timestamp and — through the hash — the SQL
    /// bytes themselves.
    #[test]
    fn the_frozen_chain_matches_the_one_v1_ships() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/v1-schema.json"))
                .expect("the committed v1 schema fixture must be valid JSON");
        let expected = fixture["drizzleMigrations"]
            .as_array()
            .expect("the fixture must list v1's migrations");

        assert_eq!(
            expected.len(),
            V1_MIGRATIONS.len(),
            "v1 ships a different number of migrations than this crate froze"
        );

        for (row, migration) in expected.iter().zip(V1_MIGRATIONS) {
            assert_eq!(row["name"].as_str(), Some(migration.name));
            assert_eq!(row["createdAt"].as_i64(), Some(migration.created_at));
            assert_eq!(
                row["hash"].as_str(),
                Some(migration.hash().as_str()),
                "the frozen copy of `{}` no longer matches v1's",
                migration.name
            );
        }
    }

    #[test]
    fn every_migration_has_at_least_one_statement() {
        for migration in V1_MIGRATIONS {
            assert!(
                migration.statements().next().is_some(),
                "`{}` split into no statements",
                migration.name
            );
        }
    }

    #[test]
    fn the_baseline_is_first() {
        assert_eq!(
            V1_MIGRATIONS.first().map(|migration| migration.name),
            Some(BASELINE_NAME)
        );
        assert!(is_known(BASELINE_NAME));
        assert!(!is_known("20260101000009_something_v1_shipped_later"));
    }
}
