//! Bringing a database that is behind up to the schema the baseline describes.
//!
//! Adoption stamps `0001_baseline.sql` as applied without running it, which is
//! only honest if the database really does have that schema. A v1 database that
//! is behind by some migrations does not, so those migrations are replayed
//! first — v1's own SQL, in v1's order, exactly as the user's next v1 launch
//! would have run it.
//!
//! One deliberate strengthening over v1: `ALTER TABLE ... ADD` statements are
//! guarded by a `pragma_table_info` lookup and skipped when the column is
//! already there. v1 ran them unguarded, which is safe when the only databases
//! reaching them are ones v1 itself produced. Adoption has a wider input — any
//! database any v1 release ever wrote, including ones repaired by hand — and
//! SQLite has no `ADD COLUMN IF NOT EXISTS`, so an already-present column would
//! abort the whole adoption with a confusing error instead of being the no-op
//! it clearly is. v1 already made this exact exception for `disc_number`; this
//! generalises it rather than inventing it.

use sqlx::SqliteConnection;

use crate::adopt::ledger;
use crate::adopt::v1::V1Migration;
use crate::error::{DbError, Result};

/// Add `tracks.disc_number` if a pre-multi-disc database is missing it.
///
/// A direct port of v1's `healDiscNumberColumn`. The old boot path added the
/// column with an ad-hoc guarded `ALTER`, so a user who upgraded before that
/// shipped can reach the migrator without it, and the baseline's
/// `CREATE TABLE IF NOT EXISTS` will not add a column to a table that already
/// exists. v1 ran this on every open; so does adoption, and on any current
/// database it is a no-op.
///
/// The healed column lands at the *end* of `tracks` rather than in the position
/// a freshly-created table puts it — SQLite appends. That is what v1 produces
/// too, and it is invisible to both builds because every query names its
/// columns.
pub(crate) async fn heal_disc_number(conn: &mut SqliteConnection) -> Result<bool> {
    if !ledger::has_table(&mut *conn, "tracks").await? {
        return Ok(false);
    }
    if ledger::has_column(&mut *conn, "tracks", "disc_number").await? {
        return Ok(false);
    }

    tracing::info!("healing a legacy database that predates `tracks.disc_number`");

    sqlx::query("ALTER TABLE `tracks` ADD COLUMN `disc_number` integer")
        .execute(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "add the missing `tracks.disc_number` column",
            source,
        })?;

    Ok(true)
}

/// Replay one of v1's migrations against a database that never ran it.
pub(crate) async fn apply(conn: &mut SqliteConnection, migration: &V1Migration) -> Result<()> {
    for statement in migration.statements() {
        if let Some((table, column)) = add_column_target(statement)
            && ledger::has_column(&mut *conn, table, column).await?
        {
            tracing::debug!(
                migration = migration.name,
                table,
                column,
                "skipping ADD COLUMN — the column is already present"
            );
            continue;
        }

        sqlx::query(statement)
            .execute(&mut *conn)
            .await
            .map_err(|source| {
                tracing::error!(
                    migration = migration.name,
                    %source,
                    "a v1 migration could not be replayed; adoption is aborting without changes"
                );
                DbError::Query {
                    operation: "replay a v1 migration",
                    source,
                }
            })?;
    }

    Ok(())
}

/// The table and column an `ALTER TABLE ... ADD [COLUMN] ...` statement targets.
///
/// Deliberately a narrow shape-match rather than a SQL parser: the only input
/// is the nine frozen files in `v1_sql/`, and a test pins exactly which of
/// their statements this recognises. Anything it does not recognise is executed
/// unchanged, so a miss degrades to v1's behaviour rather than to a skipped
/// statement.
fn add_column_target(statement: &str) -> Option<(&str, &str)> {
    let mut tokens = statement.split_whitespace();

    if !tokens.next()?.eq_ignore_ascii_case("ALTER") {
        return None;
    }
    if !tokens.next()?.eq_ignore_ascii_case("TABLE") {
        return None;
    }

    let table = tokens.next()?;

    if !tokens.next()?.eq_ignore_ascii_case("ADD") {
        return None;
    }

    let mut column = tokens.next()?;
    // `COLUMN` is optional in SQLite's grammar; v1 uses both forms.
    if column.eq_ignore_ascii_case("COLUMN") {
        column = tokens.next()?;
    }

    Some((unquote(table), unquote(column)))
}

/// Strip one layer of SQLite identifier quoting.
fn unquote(identifier: &str) -> &str {
    let mut characters = identifier.chars();
    let (Some(first), Some(last)) = (characters.next(), characters.next_back()) else {
        return identifier;
    };

    let quoted = matches!(
        (first, last),
        ('`', '`') | ('"', '"') | ('[', ']') | ('\'', '\'')
    );

    if quoted {
        characters.as_str()
    } else {
        identifier
    }
}

#[cfg(test)]
mod tests {
    use crate::adopt::v1::V1_MIGRATIONS;

    use super::*;

    #[test]
    fn identifier_quoting_is_stripped() {
        assert_eq!(unquote("`tracks`"), "tracks");
        assert_eq!(unquote("\"tracks\""), "tracks");
        assert_eq!(unquote("[tracks]"), "tracks");
        assert_eq!(unquote("tracks"), "tracks");
        assert_eq!(unquote("`"), "`");
        assert_eq!(unquote(""), "");
    }

    #[test]
    fn non_alter_statements_are_not_matched() {
        assert_eq!(add_column_target("CREATE TABLE `t` (`a` text)"), None);
        assert_eq!(add_column_target("ALTER TABLE `t` RENAME TO `u`"), None);
        assert_eq!(add_column_target("DROP INDEX IF EXISTS `i`"), None);
        assert_eq!(add_column_target("UPDATE `t` SET `a` = NULL"), None);
        assert_eq!(add_column_target(""), None);
    }

    #[test]
    fn both_add_column_spellings_are_matched() {
        assert_eq!(
            add_column_target("ALTER TABLE `tracks` ADD `album_artist` text"),
            Some(("tracks", "album_artist"))
        );
        assert_eq!(
            add_column_target("ALTER TABLE tracks ADD COLUMN disc_number integer"),
            Some(("tracks", "disc_number"))
        );
    }

    /// Pins which statements in the frozen chain get the guard. If a future
    /// edit to `v1_sql/` adds or removes an `ALTER ... ADD`, this fails rather
    /// than silently changing which statements are skippable.
    #[test]
    fn exactly_two_frozen_statements_add_a_column() {
        let guarded: Vec<(&str, &str)> = V1_MIGRATIONS
            .iter()
            .flat_map(|migration| migration.statements())
            .filter_map(add_column_target)
            .collect();

        assert_eq!(
            guarded,
            vec![("tracks", "album_artist"), ("tracks", "loudness_lufs")]
        );
    }
}
