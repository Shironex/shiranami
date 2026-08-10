//! The compiler's fields that reach outside the `tracks` row.
//!
//! Split from `smart_rules.rs`, which owns the operator matrix over the plain
//! columns. These are the cases with their own shape: the analysis columns and
//! their `NULL`, and `last_played`, whose condition is a scoped subquery rather
//! than a comparison. Same discipline as its sibling — exact SQL, exact
//! operands, no database.

use shiranami_core::models::{SmartPlaylistField as Field, SmartPlaylistOperator as Op};
use shiranami_db::repo::smart_rules::Bind;

#[path = "support/rules.rs"]
mod rules;

use rules::{assert_compiles, assert_dropped, one, ranged, rule};

// ── the analysis columns ──────────────────────────────────────────────────────

#[test]
fn the_numeric_analysis_fields_reuse_the_numeric_branch() {
    for (field, column) in [
        (Field::Bpm, "tracks.bpm"),
        (Field::Duration, "tracks.duration"),
        (Field::LoudnessLufs, "tracks.loudness_lufs"),
    ] {
        assert_compiles(
            rule(field, Op::GreaterThan, "100"),
            &format!("{column} > ?"),
            &[Bind::Number(100.0)],
        );
        assert_compiles(
            ranged(field, Op::Between, "100", "130"),
            &format!("({column} >= ? AND {column} <= ?)"),
            &[Bind::Number(100.0), Bind::Number(130.0)],
        );
    }
}

/// Nothing here special-cases `NULL`: an unanalysed row carries one, and SQL's
/// three-valued logic excludes it from every comparison the compiler emits,
/// `isNot` included. Asserted as the *absence* of a null guard, because adding
/// one is the tempting change that would quietly fill an `all` definition with
/// unanalysed tracks.
#[test]
fn a_numeric_rule_emits_no_null_guard() {
    for operator in [Op::Is, Op::IsNot, Op::GreaterThan, Op::LessThan] {
        let filter = one(rule(Field::Bpm, operator, "120"));
        assert!(
            !filter.sql().to_uppercase().contains("NULL"),
            "`{}` must leave NULL handling to SQL",
            filter.sql()
        );
    }
}

#[test]
fn musical_key_compiles_as_a_text_field() {
    assert_compiles(
        rule(Field::MusicalKey, Op::Is, "8A"),
        "tracks.musical_key = ?",
        &[Bind::Text("8A".to_owned())],
    );
    assert_compiles(
        rule(Field::MusicalKey, Op::Contains, "A"),
        "tracks.musical_key LIKE ? ESCAPE '\\'",
        &[Bind::Text("%A%".to_owned())],
    );
}

// ── last_played ───────────────────────────────────────────────────────────────

/// The `EXISTS` body, spelled out once so the two direction tests below assert
/// the same scoping rather than each other's typos.
const PLAYED_SINCE: &str = "EXISTS (SELECT 1 FROM play_history \
     WHERE play_history.track_id = tracks.id AND play_history.source = 'library' \
     AND play_history.played_at >= datetime('now', ?))";

#[test]
fn last_played_in_last_days_is_a_scoped_exists() {
    assert_compiles(
        rule(Field::LastPlayed, Op::InLastDays, "90"),
        PLAYED_SINCE,
        &[Bind::Text("-90 days".to_owned())],
    );
}

/// The rule the whole field exists for. `NOT EXISTS` is true for a track with
/// no history row at all, which is what makes "never played" satisfy "not
/// played in 90 days" — a `MAX(played_at) < cutoff` comparison would yield
/// `NULL` there and silently drop exactly the rows being asked for.
#[test]
fn last_played_not_in_last_days_covers_never_played() {
    assert_compiles(
        rule(Field::LastPlayed, Op::NotInLastDays, "90"),
        &format!("NOT {PLAYED_SINCE}"),
        &[Bind::Text("-90 days".to_owned())],
    );
}

/// Radio plays are written to `play_history` too and are not plays of the
/// track they may be keyed to. The scope is an allowlist, so a source invented
/// later is excluded until someone decides it counts.
#[test]
fn last_played_counts_only_library_plays() {
    for operator in [Op::InLastDays, Op::NotInLastDays] {
        let filter = one(rule(Field::LastPlayed, operator, "30"));
        assert!(
            filter.sql().contains("play_history.source = 'library'"),
            "`{}` must not let another source count as a play",
            filter.sql()
        );
    }
}

#[test]
fn last_played_takes_only_the_two_day_count_operators() {
    for operator in [
        Op::Is,
        Op::IsNot,
        Op::Contains,
        Op::GreaterThan,
        Op::Between,
    ] {
        assert_dropped(rule(Field::LastPlayed, operator, "30"));
    }
    for value in ["0", "-5", "", "soon"] {
        assert_dropped(rule(Field::LastPlayed, Op::InLastDays, value));
        assert_dropped(rule(Field::LastPlayed, Op::NotInLastDays, value));
    }
}
