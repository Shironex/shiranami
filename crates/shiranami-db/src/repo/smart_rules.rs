//! The smart-playlist rule → SQL compiler.
//!
//! A [`SmartPlaylistDefinition`] is a user-authored filter that the renderer
//! builds from text inputs, and this crate turns it into one `WHERE` clause
//! over `tracks`. Every operand is therefore attacker-shaped by construction,
//! which makes the compiler's *shape* the safety property:
//!
//! [`compile`] returns a [`Filter`] holding a SQL fragment and a list of
//! [`Bind`]s. The fragment is assembled exclusively from `&'static str`
//! literals in this file plus `?` placeholders — no rule value, and no column
//! name derived from one, is ever written into it. Column names come from
//! matching a closed enum ([`SmartPlaylistField`]), so there is no path from
//! user input to SQL text at all. That is checkable by reading this one file,
//! and [`Filter::sql`] being inspectable is what lets the tests assert it
//! rather than trust it.
//!
//! # Fidelity
//!
//! Ported from `buildSmartPlaylistWhere` in
//! `apps/desktop/src/main/ipc/database/smart-playlists.ts`. Its quirks are
//! preserved deliberately, including the ones that read like bugs — a saved
//! playlist is a stored user document, and changing what it selects is
//! changing the user's data:
//!
//! - A rule that cannot produce a meaningful condition is **dropped**, not
//!   failed and not treated as "match nothing". An unusable rule in an `all`
//!   set therefore *widens* the result.
//! - When every rule drops out the filter is empty and matches the whole
//!   library — how desktop music players behave for a rule-less smart playlist.
//! - `is_favorite` accepts any operator; only `isNot` inverts, and every other
//!   operator behaves as `is`.
//! - `date_added` supports only `inLastDays`.
//! - Numeric operands parse with JavaScript's `Number()` semantics
//!   ([`js_number`]), not Rust's, because that is what decided which rules were
//!   usable in v1.

use shiranami_core::models::{
    SmartPlaylistDefinition, SmartPlaylistField, SmartPlaylistMatchType, SmartPlaylistOperator,
    SmartPlaylistRule,
};
use sqlx::{QueryBuilder, Sqlite};

/// One value bound into a compiled filter.
///
/// Typed rather than stringly so that the encoder, not the compiler, decides
/// how a value reaches SQLite — and so the tests can assert *what* was bound,
/// which a rendered statement cannot show.
#[derive(Debug, Clone, PartialEq)]
pub enum Bind {
    /// A text operand, or a `LIKE` pattern with its wildcards already escaped.
    Text(String),
    /// A numeric operand. `f64` because `Number()` is what parsed it.
    Number(f64),
    /// A favourite flag. Stored as `0`/`1`, as drizzle's boolean mode wrote it.
    Flag(bool),
}

impl Bind {
    /// Bind this operand into a query under construction.
    fn push_to(&self, builder: &mut QueryBuilder<Sqlite>) {
        match self {
            Self::Text(text) => builder.push_bind(text.clone()),
            Self::Number(number) => builder.push_bind(*number),
            Self::Flag(flag) => builder.push_bind(*flag),
        };
    }
}

/// A compiled `WHERE` clause: SQL text with `?` placeholders, and its operands.
///
/// The invariant that makes it usable is that `?` appears in [`Filter::sql`]
/// exactly once per [`Bind`], and only as a placeholder — no emitted literal
/// contains one. `placeholders_match_binds` pins it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Filter {
    sql: String,
    binds: Vec<Bind>,
}

impl Filter {
    /// The SQL fragment, or `""` when the filter matches everything.
    #[must_use]
    pub fn sql(&self) -> &str {
        &self.sql
    }

    /// The operands, in placeholder order.
    #[must_use]
    pub fn binds(&self) -> &[Bind] {
        &self.binds
    }

    /// Whether this filter constrains anything at all.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.sql.is_empty()
    }

    /// Append ` WHERE <fragment>` and its operands to a query under construction.
    ///
    /// A no-op for an empty filter, which is what makes "no usable rules" mean
    /// "the whole library" at the one place it matters.
    pub(crate) fn push_to(&self, builder: &mut QueryBuilder<Sqlite>) {
        if self.is_empty() {
            return;
        }

        builder.push(" WHERE ");

        let mut binds = self.binds.iter();
        let mut pieces = self.sql.split('?').peekable();

        while let Some(piece) = pieces.next() {
            builder.push(piece);
            // `split` yields one more piece than separators, so the final piece
            // is not followed by a placeholder.
            if pieces.peek().is_some()
                && let Some(bind) = binds.next()
            {
                bind.push_to(builder);
            }
        }
    }
}

/// Compile a definition into a `WHERE` fragment.
#[must_use]
pub fn compile(definition: &SmartPlaylistDefinition) -> Filter {
    let conditions: Vec<Filter> = definition.rules.iter().filter_map(condition).collect();

    if conditions.is_empty() {
        return Filter::default();
    }

    let joiner = match definition.match_type {
        SmartPlaylistMatchType::All => " AND ",
        SmartPlaylistMatchType::Any => " OR ",
    };

    let mut sql = String::new();
    let mut binds = Vec::new();

    for (index, condition) in conditions.into_iter().enumerate() {
        if index > 0 {
            sql.push_str(joiner);
        }
        sql.push_str(&condition.sql);
        binds.extend(condition.binds);
    }

    Filter { sql, binds }
}

/// Compile one rule, or drop it.
fn condition(rule: &SmartPlaylistRule) -> Option<Filter> {
    match rule.field {
        SmartPlaylistField::Genre
        | SmartPlaylistField::Artist
        | SmartPlaylistField::Album
        | SmartPlaylistField::Title => text_condition(rule),
        SmartPlaylistField::Year | SmartPlaylistField::PlayCount => numeric_condition(rule),
        SmartPlaylistField::IsFavorite => Some(favorite_condition(rule)),
        SmartPlaylistField::DateAdded => date_condition(rule),
    }
}

/// `genre` / `artist` / `album` / `title`.
///
/// The blank-operand guard is v1's, quirk included: a blank value drops the
/// rule *unless* the operator is `is` or `isNot`, which stay usable so that
/// "artist is (blank)" remains expressible.
fn text_condition(rule: &SmartPlaylistRule) -> Option<Filter> {
    let column = column_of(rule.field);

    match rule.operator {
        SmartPlaylistOperator::Is => Some(compare(column, " = ", Bind::Text(rule.value.clone()))),
        SmartPlaylistOperator::IsNot => {
            Some(compare(column, " <> ", Bind::Text(rule.value.clone())))
        }
        SmartPlaylistOperator::Contains if !rule.value.trim().is_empty() => Some(Filter {
            sql: format!("{column} LIKE ? ESCAPE '\\'"),
            binds: vec![Bind::Text(format!("%{}%", escape_like(&rule.value)))],
        }),
        _ => None,
    }
}

/// `year` / `play_count`.
fn numeric_condition(rule: &SmartPlaylistRule) -> Option<Filter> {
    if rule.value.trim().is_empty() {
        return None;
    }

    let value = js_number(&rule.value)?;
    let column = column_of(rule.field);

    let operator = match rule.operator {
        SmartPlaylistOperator::Is => " = ",
        SmartPlaylistOperator::IsNot => " <> ",
        SmartPlaylistOperator::GreaterThan => " > ",
        SmartPlaylistOperator::LessThan => " < ",
        SmartPlaylistOperator::Between => {
            let upper = rule.value_to.as_deref()?;
            if upper.trim().is_empty() {
                return None;
            }
            let upper = js_number(upper)?;

            // Parenthesised because an `any` definition joins conditions with
            // `OR`, and an unbracketed `a >= ? AND a <= ?` would bind tighter
            // than the surrounding `OR` and silently change the result.
            return Some(Filter {
                sql: format!("({column} >= ? AND {column} <= ?)"),
                binds: vec![Bind::Number(value), Bind::Number(upper)],
            });
        }
        _ => return None,
    };

    Some(compare(column, operator, Bind::Number(value)))
}

/// `is_favorite`, the one field v1 never drops a rule for.
///
/// The operand is read as a flag rather than compared as text: `"true"` and
/// `"1"` mean favourited, anything else means not.
fn favorite_condition(rule: &SmartPlaylistRule) -> Filter {
    let wanted = rule.value == "true" || rule.value == "1";
    let operator = match rule.operator {
        SmartPlaylistOperator::IsNot => " <> ",
        _ => " = ",
    };

    compare(column_of(rule.field), operator, Bind::Flag(wanted))
}

/// `created_at`, which supports only `inLastDays`.
///
/// The operand is bound as a SQLite date modifier — `-30 days` — so the day
/// count reaches SQL as data rather than as text spliced into the statement.
fn date_condition(rule: &SmartPlaylistRule) -> Option<Filter> {
    if rule.operator != SmartPlaylistOperator::InLastDays {
        return None;
    }

    let days = js_number(&rule.value)?;
    if days <= 0.0 {
        return None;
    }

    Some(Filter {
        sql: format!("{} >= datetime('now', ?)", column_of(rule.field)),
        binds: vec![Bind::Text(format!("-{days} days"))],
    })
}

/// `<column> <operator> ?`, the shape most rules take.
fn compare(column: &str, operator: &str, bind: Bind) -> Filter {
    Filter {
        sql: format!("{column}{operator}?"),
        binds: vec![bind],
    }
}

/// The column a field names.
///
/// Exhaustive over a closed enum and returning `&'static str` — the reason no
/// rule can reach a column name, spelled out as a signature.
fn column_of(field: SmartPlaylistField) -> &'static str {
    match field {
        SmartPlaylistField::Genre => "tracks.genre",
        SmartPlaylistField::Artist => "tracks.artist",
        SmartPlaylistField::Album => "tracks.album",
        SmartPlaylistField::Title => "tracks.title",
        SmartPlaylistField::Year => "tracks.year",
        SmartPlaylistField::PlayCount => "tracks.play_count",
        SmartPlaylistField::IsFavorite => "tracks.is_favorite",
        SmartPlaylistField::DateAdded => "tracks.created_at",
    }
}

/// Escape `LIKE`'s metacharacters so a `contains` operand matches literally.
///
/// Pairs with the `ESCAPE '\'` clause [`text_condition`] emits. Without it a
/// user searching for `100%` matches every track in the library.
fn escape_like(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());

    for character in value.chars() {
        if matches!(character, '\\' | '%' | '_') {
            escaped.push('\\');
        }
        escaped.push(character);
    }

    escaped
}

/// Parse an operand the way JavaScript's `Number()` does.
///
/// A fidelity requirement rather than a stylistic one: v1 decided whether a
/// rule was usable with `Number(value)` and `Number.isFinite`, so the set of
/// operands that compile has to match. Three differences from Rust's `parse`
/// are load-bearing:
///
/// - surrounding whitespace is ignored, and an all-blank operand is `0` (every
///   caller has already excluded blanks, so this is only here to be honest);
/// - `0x` / `0o` / `0b` prefixes are radix literals rather than parse failures,
///   and a *signed* one is not (`Number('-0x10')` is `NaN`);
/// - Rust's `inf` / `infinity` / `nan` spellings parse where JavaScript's
///   `Number()` rejects them — the finiteness check at the end catches all of
///   them, and `Infinity`, which both accept and both then reject.
///
/// Exponent forms (`1e3`) are common to both and pass through.
fn js_number(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(0.0);
    }

    if let Some(radix) = radix_of(trimmed) {
        return radix_value(&trimmed[2..], radix);
    }

    let parsed: f64 = trimmed.parse().ok()?;
    parsed.is_finite().then_some(parsed)
}

/// The radix a `0x` / `0o` / `0b` prefix names, if any.
fn radix_of(value: &str) -> Option<u32> {
    let mut characters = value.chars();

    if characters.next() != Some('0') {
        return None;
    }

    match characters.next() {
        Some('x' | 'X') => Some(16),
        Some('o' | 'O') => Some(8),
        Some('b' | 'B') => Some(2),
        _ => None,
    }
}

/// Accumulate radix digits into an `f64`, as JavaScript does.
///
/// Accumulating in the float rather than parsing to an integer first avoids
/// inventing an overflow cliff `Number()` does not have.
fn radix_value(digits: &str, radix: u32) -> Option<f64> {
    if digits.is_empty() {
        return None;
    }

    let mut value = 0.0_f64;
    for character in digits.chars() {
        let digit = character.to_digit(radix)?;
        value = value * f64::from(radix) + f64::from(digit);
    }

    value.is_finite().then_some(value)
}
