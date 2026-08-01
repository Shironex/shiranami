//! The rule → SQL compiler, field by field and operator by operator.
//!
//! No database: [`compile`] is a pure function, so every case here asserts the
//! *exact* SQL fragment and the *exact* operands. That is deliberate — a test
//! that only checked which rows came back would pass just as happily against a
//! compiler that spliced the operand into the statement, which is the one
//! failure this module has to make impossible. `repo_smart_playlists.rs` covers
//! the behaviour against real rows.
//!
//! Ported from the operator vocabulary in
//! `packages/contracts/src/domain/smart-playlist.ts` and the switch in
//! `apps/desktop/src/main/ipc/database/smart-playlists.ts`, including the
//! combinations that are *dropped* — those are half the contract.

use shiranami_core::models::{
    SmartPlaylistDefinition, SmartPlaylistField as Field, SmartPlaylistMatchType as Match,
    SmartPlaylistOperator as Op, SmartPlaylistRule,
};
use shiranami_db::repo::smart_rules::{Bind, Filter, compile};

/// A rule with no upper bound.
fn rule(field: Field, operator: Op, value: &str) -> SmartPlaylistRule {
    SmartPlaylistRule {
        field,
        operator,
        value: value.to_owned(),
        value_to: None,
    }
}

/// A rule with an upper bound, for `between`.
fn ranged(field: Field, operator: Op, value: &str, value_to: &str) -> SmartPlaylistRule {
    SmartPlaylistRule {
        field,
        operator,
        value: value.to_owned(),
        value_to: Some(value_to.to_owned()),
    }
}

/// Compile a single rule under `all`.
fn one(rule: SmartPlaylistRule) -> Filter {
    compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: vec![rule],
    })
}

/// Assert a rule compiles to exactly this SQL and these operands.
fn assert_compiles(rule: SmartPlaylistRule, sql: &str, binds: &[Bind]) {
    let filter = one(rule);

    assert_eq!(filter.sql(), sql);
    assert_eq!(filter.binds(), binds);
}

/// Assert a rule is dropped — no condition, so it does not narrow anything.
fn assert_dropped(rule: SmartPlaylistRule) {
    let filter = one(rule);

    assert!(
        filter.is_empty(),
        "expected the rule to be dropped, got `{}`",
        filter.sql()
    );
}

// ── text fields ───────────────────────────────────────────────────────────────

#[test]
fn text_fields_compile_is_is_not_and_contains() {
    for (field, column) in [
        (Field::Genre, "tracks.genre"),
        (Field::Artist, "tracks.artist"),
        (Field::Album, "tracks.album"),
        (Field::Title, "tracks.title"),
    ] {
        assert_compiles(
            rule(field, Op::Is, "Lofi"),
            &format!("{column} = ?"),
            &[Bind::Text("Lofi".to_owned())],
        );
        assert_compiles(
            rule(field, Op::IsNot, "Lofi"),
            &format!("{column} <> ?"),
            &[Bind::Text("Lofi".to_owned())],
        );
        assert_compiles(
            rule(field, Op::Contains, "Lofi"),
            &format!("{column} LIKE ? ESCAPE '\\'"),
            &[Bind::Text("%Lofi%".to_owned())],
        );
    }
}

#[test]
fn text_fields_drop_the_numeric_and_date_operators() {
    for operator in [Op::GreaterThan, Op::LessThan, Op::Between, Op::InLastDays] {
        assert_dropped(rule(Field::Title, operator, "Lofi"));
    }
}

/// v1's guard, quirk included: a blank operand drops the rule *unless* the
/// operator is `is` or `isNot`, so "artist is (blank)" stays expressible.
#[test]
fn a_blank_text_operand_drops_contains_but_not_is() {
    assert_dropped(rule(Field::Genre, Op::Contains, "   "));

    assert_compiles(
        rule(Field::Genre, Op::Is, "   "),
        "tracks.genre = ?",
        &[Bind::Text("   ".to_owned())],
    );
    assert_compiles(
        rule(Field::Genre, Op::IsNot, ""),
        "tracks.genre <> ?",
        &[Bind::Text(String::new())],
    );
}

/// Without escaping, a user searching for `100%` matches the whole library.
#[test]
fn contains_escapes_like_metacharacters_in_the_operand() {
    for (value, pattern) in [
        ("100%", r"%100\%%"),
        ("a_b", r"%a\_b%"),
        (r"back\slash", r"%back\\slash%"),
        ("%_\\", r"%\%\_\\%"),
    ] {
        assert_compiles(
            rule(Field::Title, Op::Contains, value),
            "tracks.title LIKE ? ESCAPE '\\'",
            &[Bind::Text(pattern.to_owned())],
        );
    }
}

// ── numeric fields ────────────────────────────────────────────────────────────

#[test]
fn numeric_fields_compile_the_four_comparisons() {
    for (field, column) in [
        (Field::Year, "tracks.year"),
        (Field::PlayCount, "tracks.play_count"),
    ] {
        for (operator, sql_operator) in [
            (Op::Is, "="),
            (Op::IsNot, "<>"),
            (Op::GreaterThan, ">"),
            (Op::LessThan, "<"),
        ] {
            assert_compiles(
                rule(field, operator, "2020"),
                &format!("{column} {sql_operator} ?"),
                &[Bind::Number(2020.0)],
            );
        }
    }
}

/// Parenthesised, because an `any` definition joins with `OR` and an
/// unbracketed `AND` pair would bind tighter and change the answer.
#[test]
fn between_compiles_to_an_inclusive_bracketed_range() {
    assert_compiles(
        ranged(Field::Year, Op::Between, "2000", "2008"),
        "(tracks.year >= ? AND tracks.year <= ?)",
        &[Bind::Number(2000.0), Bind::Number(2008.0)],
    );
}

#[test]
fn between_drops_without_a_usable_upper_bound() {
    assert_dropped(rule(Field::Year, Op::Between, "2000"));
    assert_dropped(ranged(Field::Year, Op::Between, "2000", "   "));
    assert_dropped(ranged(Field::Year, Op::Between, "2000", "not a number"));
    assert_dropped(ranged(Field::Year, Op::Between, "not a number", "2008"));
}

#[test]
fn numeric_fields_drop_the_text_and_date_operators() {
    for operator in [Op::Contains, Op::InLastDays] {
        assert_dropped(rule(Field::PlayCount, operator, "5"));
    }
}

#[test]
fn a_blank_or_unparseable_numeric_operand_drops_the_rule() {
    for value in [
        "", "   ", "abc", "12abc", "1_000", "", "nan", "inf", "Infinity",
    ] {
        assert_dropped(rule(Field::Year, Op::Is, value));
    }
}

/// The operand is parsed with JavaScript's `Number()`, not Rust's `parse`,
/// because that is what decided which rules were usable in v1.
#[test]
fn numeric_operands_follow_javascript_number_semantics() {
    for (value, parsed) in [
        ("2020", 2020.0),
        ("  2020  ", 2020.0),
        ("+2020", 2020.0),
        ("-5", -5.0),
        ("20.5", 20.5),
        (".5", 0.5),
        ("5.", 5.0),
        ("1e3", 1000.0),
        ("0x10", 16.0),
        ("0o17", 15.0),
        ("0b101", 5.0),
    ] {
        assert_compiles(
            rule(Field::Year, Op::Is, value),
            "tracks.year = ?",
            &[Bind::Number(parsed)],
        );
    }

    // A *signed* radix literal is `NaN` in JavaScript, and `0x` alone has no
    // digits — both drop.
    assert_dropped(rule(Field::Year, Op::Is, "-0x10"));
    assert_dropped(rule(Field::Year, Op::Is, "0x"));
    assert_dropped(rule(Field::Year, Op::Is, "0b12"));
}

// ── is_favorite ───────────────────────────────────────────────────────────────

/// The one field v1 never drops a rule for: every operator other than `isNot`
/// behaves as `is`, `contains` and `between` included.
#[test]
fn is_favorite_accepts_every_operator_and_only_is_not_inverts() {
    for operator in [
        Op::Is,
        Op::Contains,
        Op::GreaterThan,
        Op::LessThan,
        Op::Between,
        Op::InLastDays,
    ] {
        assert_compiles(
            rule(Field::IsFavorite, operator, "true"),
            "tracks.is_favorite = ?",
            &[Bind::Flag(true)],
        );
    }

    assert_compiles(
        rule(Field::IsFavorite, Op::IsNot, "true"),
        "tracks.is_favorite <> ?",
        &[Bind::Flag(true)],
    );
}

#[test]
fn is_favorite_reads_its_operand_as_a_flag() {
    for value in ["true", "1"] {
        assert_compiles(
            rule(Field::IsFavorite, Op::Is, value),
            "tracks.is_favorite = ?",
            &[Bind::Flag(true)],
        );
    }

    for value in ["false", "0", "", "TRUE", "yes"] {
        assert_compiles(
            rule(Field::IsFavorite, Op::Is, value),
            "tracks.is_favorite = ?",
            &[Bind::Flag(false)],
        );
    }
}

// ── date_added ────────────────────────────────────────────────────────────────

/// The day count is bound as a SQLite date modifier, so it reaches SQL as data
/// rather than as text spliced into the statement.
#[test]
fn date_added_compiles_in_last_days_to_a_bound_modifier() {
    assert_compiles(
        rule(Field::DateAdded, Op::InLastDays, "30"),
        "tracks.created_at >= datetime('now', ?)",
        &[Bind::Text("-30 days".to_owned())],
    );

    assert_compiles(
        rule(Field::DateAdded, Op::InLastDays, "3.5"),
        "tracks.created_at >= datetime('now', ?)",
        &[Bind::Text("-3.5 days".to_owned())],
    );
}

#[test]
fn date_added_drops_every_other_operator() {
    for operator in [
        Op::Is,
        Op::IsNot,
        Op::Contains,
        Op::GreaterThan,
        Op::LessThan,
        Op::Between,
    ] {
        assert_dropped(rule(Field::DateAdded, operator, "30"));
    }
}

#[test]
fn date_added_drops_a_non_positive_or_unparseable_day_count() {
    for value in ["0", "-5", "", "   ", "soon"] {
        assert_dropped(rule(Field::DateAdded, Op::InLastDays, value));
    }
}

// ── combining ─────────────────────────────────────────────────────────────────

#[test]
fn all_joins_with_and_and_any_joins_with_or() {
    let rules = vec![
        rule(Field::Genre, Op::Is, "Lofi"),
        rule(Field::Year, Op::GreaterThan, "2010"),
    ];

    let all = compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: rules.clone(),
    });
    assert_eq!(all.sql(), "tracks.genre = ? AND tracks.year > ?");

    let any = compile(&SmartPlaylistDefinition {
        match_type: Match::Any,
        rules,
    });
    assert_eq!(any.sql(), "tracks.genre = ? OR tracks.year > ?");

    assert_eq!(
        any.binds(),
        &[Bind::Text("Lofi".to_owned()), Bind::Number(2010.0)]
    );
}

/// The bracketing that matters: an `OR` around a `between` must not absorb it.
#[test]
fn a_between_stays_bracketed_inside_an_or() {
    let filter = compile(&SmartPlaylistDefinition {
        match_type: Match::Any,
        rules: vec![
            ranged(Field::Year, Op::Between, "2000", "2008"),
            rule(Field::Genre, Op::Is, "Jazz"),
        ],
    });

    assert_eq!(
        filter.sql(),
        "(tracks.year >= ? AND tracks.year <= ?) OR tracks.genre = ?"
    );
}

#[test]
fn an_empty_rule_set_matches_everything() {
    let filter = compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: Vec::new(),
    });

    assert!(filter.is_empty());
    assert!(filter.binds().is_empty());
}

/// An unusable rule is dropped rather than failed, so an `all` set containing
/// one *widens*. Preserved from v1 because a saved playlist is a stored user
/// document and changing what it selects is changing their data.
#[test]
fn a_dropped_rule_widens_an_all_set_rather_than_emptying_it() {
    let filter = compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: vec![
            rule(Field::Genre, Op::Is, "Lofi"),
            rule(Field::Year, Op::Contains, "20"),
        ],
    });

    assert_eq!(filter.sql(), "tracks.genre = ?", "only the usable rule");

    let all_unusable = compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: vec![rule(Field::Year, Op::Contains, "20")],
    });

    assert!(
        all_unusable.is_empty(),
        "every rule dropping means the whole library, not nothing"
    );
}

// ── the safety invariant ──────────────────────────────────────────────────────

/// Every operand is a placeholder, and no emitted literal contains a `?`.
///
/// This is what makes the fragment safe to interleave with its operands, and
/// what a compiler that spliced a value into the statement would break.
#[test]
fn placeholders_match_binds_across_every_operator() {
    let every_rule = vec![
        rule(Field::Genre, Op::Is, "Lofi"),
        rule(Field::Artist, Op::IsNot, "Nujabes"),
        rule(Field::Album, Op::Contains, "100%"),
        rule(Field::Title, Op::Is, "?"),
        rule(Field::Year, Op::GreaterThan, "2010"),
        rule(Field::Year, Op::LessThan, "2020"),
        ranged(Field::PlayCount, Op::Between, "1", "9"),
        rule(Field::IsFavorite, Op::Is, "true"),
        rule(Field::DateAdded, Op::InLastDays, "30"),
    ];

    for match_type in [Match::All, Match::Any] {
        let filter = compile(&SmartPlaylistDefinition {
            match_type,
            rules: every_rule.clone(),
        });

        assert_eq!(
            filter.sql().matches('?').count(),
            filter.binds().len(),
            "one placeholder per operand in `{}`",
            filter.sql()
        );
    }
}

/// A rule value carrying SQL never reaches the statement text.
#[test]
fn an_operand_that_looks_like_sql_stays_an_operand() {
    let hostile = "'; DROP TABLE tracks; --";

    let filter = one(rule(Field::Title, Op::Is, hostile));

    assert_eq!(filter.sql(), "tracks.title = ?");
    assert!(!filter.sql().contains("DROP"));
    assert_eq!(filter.binds(), &[Bind::Text(hostile.to_owned())]);
}
