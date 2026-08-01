//! Frozen sentinels mirrored from `packages/shared/src/constants/library.ts`.
//!
//! These two literals are **not** a Rust redefinition free to change — they are
//! a mirror of values already baked into shipped migration SQL. Both appear as
//! column defaults in `packages/database/drizzle/…_baseline/migration.sql` and
//! `…_heal_legacy_tables/migration.sql`:
//!
//! ```sql
//! `artist` text DEFAULT 'Unknown Artist',
//! `album`  text DEFAULT 'Unknown Album',
//! ```
//!
//! Every v1 database on disk already holds rows written with them, and the
//! recommendation similarity core and the metadata-enrichment filters both test
//! equality against them to decide "this track has no real tag". Changing either
//! literal silently reclassifies existing rows.
//!
//! `packages/shared` stays TypeScript (architecture §1.3, subsystem 36), so this
//! is a mirror with an equality test rather than a move — never a redefinition.

/// Display fallback for a track with no artist tag.
///
/// Frozen: baked into shipped migration SQL as a column default.
pub const UNKNOWN_ARTIST: &str = "Unknown Artist";

/// Display fallback for a track with no album tag.
///
/// Frozen: baked into shipped migration SQL as a column default.
pub const UNKNOWN_ALBUM: &str = "Unknown Album";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::repo_file;

    /// The mirror half of "a Rust mirror with an equality test, never a
    /// redefinition" (architecture §2.2, subsystem 36). Drifting from
    /// `packages/shared` would silently reclassify every existing row that the
    /// shipped SQL default already wrote.
    #[test]
    fn the_sentinels_mirror_packages_shared() {
        let ts = repo_file("packages/shared/src/constants/library.ts");
        for (rust_name, rust_value) in [
            ("UNKNOWN_ARTIST", UNKNOWN_ARTIST),
            ("UNKNOWN_ALBUM", UNKNOWN_ALBUM),
        ] {
            let declaration = format!("export const {rust_name} = '{rust_value}';");
            assert!(
                ts.contains(&declaration),
                "packages/shared no longer declares `{declaration}` — the Rust mirror \
                 has drifted from the literal baked into shipped migration SQL"
            );
        }
    }

    /// The other half: the literals really are baked into migration SQL that has
    /// already run on user databases, which is *why* they are frozen.
    #[test]
    fn the_sentinels_are_baked_into_shipped_migration_sql() {
        let sql = repo_file("packages/database/drizzle/20260101000000_baseline/migration.sql");
        assert!(
            sql.contains(&format!("DEFAULT '{UNKNOWN_ARTIST}'")),
            "the baseline migration no longer defaults `artist` to the mirrored literal"
        );
        assert!(
            sql.contains(&format!("DEFAULT '{UNKNOWN_ALBUM}'")),
            "the baseline migration no longer defaults `album` to the mirrored literal"
        );
    }
}
