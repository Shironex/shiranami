//! Shared fixtures for the rule → SQL compiler suites.
//!
//! `smart_rules.rs` covers the operator matrix a rule can be built from and
//! `smart_rules_analysis.rs` covers the fields that reach outside the `tracks`
//! row. Both build rules and assert against a compiled [`Filter`] the same way,
//! so the four helpers live here rather than being written twice and drifting.
//!
//! `#[path]`-included rather than a `mod.rs`, matching the crate's convention —
//! see `support/library.rs`.

#![allow(dead_code, reason = "each test file uses a different subset")]

use shiranami_core::models::{
    SmartPlaylistDefinition, SmartPlaylistField as Field, SmartPlaylistMatchType as Match,
    SmartPlaylistOperator as Op, SmartPlaylistRule,
};
use shiranami_db::repo::smart_rules::{Bind, Filter, compile};

/// A rule with no upper bound.
pub(crate) fn rule(field: Field, operator: Op, value: &str) -> SmartPlaylistRule {
    SmartPlaylistRule {
        field,
        operator,
        value: value.to_owned(),
        value_to: None,
    }
}

/// A rule with an upper bound, for `between`.
pub(crate) fn ranged(field: Field, operator: Op, value: &str, value_to: &str) -> SmartPlaylistRule {
    SmartPlaylistRule {
        field,
        operator,
        value: value.to_owned(),
        value_to: Some(value_to.to_owned()),
    }
}

/// Compile a single rule under `all`.
pub(crate) fn one(rule: SmartPlaylistRule) -> Filter {
    compile(&SmartPlaylistDefinition {
        match_type: Match::All,
        rules: vec![rule],
        limit: None,
        order_by: None,
    })
}

/// Assert a rule compiles to exactly this SQL and these operands.
pub(crate) fn assert_compiles(rule: SmartPlaylistRule, sql: &str, binds: &[Bind]) {
    let filter = one(rule);

    assert_eq!(filter.sql(), sql);
    assert_eq!(filter.binds(), binds);
}

/// Assert a rule is dropped — no condition, so it does not narrow anything.
pub(crate) fn assert_dropped(rule: SmartPlaylistRule) {
    let filter = one(rule);

    assert!(
        filter.is_empty(),
        "expected the rule to be dropped, got `{}`",
        filter.sql()
    );
}
