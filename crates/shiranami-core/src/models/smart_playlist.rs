//! Smart (rule-based) playlists, ported from
//! `packages/contracts/src/domain/smart-playlist.ts`.
//!
//! A smart playlist persists only a rule definition; its tracks are evaluated
//! against the library at read time, so it auto-updates as the library changes.
//! Phase 7 translates [`SmartPlaylistDefinition`] into a single SQL query.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Track columns a rule can match against.
///
/// The TypeScript source keeps this as one `SMART_PLAYLIST_FIELDS` tuple from
/// which the union, the zod enum and the renderer's per-field operator map are
/// all derived. The Rust enum is that single source of truth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SmartPlaylistField {
    /// `tracks.genre`.
    Genre,
    /// `tracks.artist`.
    Artist,
    /// `tracks.album`.
    Album,
    /// `tracks.title`.
    Title,
    /// `tracks.year`.
    Year,
    /// `tracks.play_count`.
    PlayCount,
    /// `tracks.is_favorite`.
    IsFavorite,
    /// `tracks.created_at`.
    DateAdded,
    /// The most recent library play, from `play_history` — no column of its
    /// own. `NULL` (never played) is meaningful here rather than missing.
    LastPlayed,
    /// `tracks.bpm`. `NULL` until the analysis engine has run.
    Bpm,
    /// `tracks.duration`, in seconds.
    Duration,
    /// `tracks.loudness_lufs`. `NULL` until the analysis engine has run.
    LoudnessLufs,
    /// `tracks.musical_key`, the stored Camelot/name string.
    MusicalKey,
}

/// Comparison operators. Applicability depends on the field's type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SmartPlaylistOperator {
    /// Exact equality.
    Is,
    /// Exact inequality.
    IsNot,
    /// Substring match (`LIKE`, with the `ESCAPE '\'` guard).
    Contains,
    /// Strictly greater than.
    GreaterThan,
    /// Strictly less than.
    LessThan,
    /// Inclusive range across `value` (lower) and `value_to` (upper).
    Between,
    /// `date_added` / `last_played` within the last `value` days.
    InLastDays,
    /// The negation of [`Self::InLastDays`].
    ///
    /// For `last_played` this deliberately includes tracks with no play history
    /// at all: never played satisfies "not played in the last N days" for every
    /// N. That is the rule people actually want, and the one a
    /// `MAX(played_at) < cutoff` comparison quietly gets wrong.
    NotInLastDays,
}

/// How multiple rules combine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SmartPlaylistMatchType {
    /// Every rule must match (SQL `AND`).
    All,
    /// Any rule may match (SQL `OR`).
    Any,
}

/// A single rule.
///
/// `value` / `value_to` semantics depend on the operator:
/// - [`SmartPlaylistOperator::Between`] uses both, as lower and upper bound.
/// - [`SmartPlaylistOperator::InLastDays`] reads `value` as a day count.
/// - [`SmartPlaylistField::IsFavorite`] reads `value` as `"true"` / `"false"`.
/// - everything else compares `value` against the field.
///
/// The value stays a `String` on purpose — it is a heterogeneously-typed literal
/// the renderer builds from a text input, and Phase 7 parses it per operator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistRule {
    /// Column to match against.
    pub field: SmartPlaylistField,
    /// Comparison to apply.
    pub operator: SmartPlaylistOperator,
    /// Primary operand.
    pub value: String,
    /// Upper bound, for [`SmartPlaylistOperator::Between`] only.
    #[specta(optional)]
    pub value_to: Option<String>,
}

/// Sort direction for a [`SmartPlaylistOrderBy`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SmartPlaylistSortDirection {
    /// Ascending. SQLite sorts `NULL` lowest, so never-played sorts first.
    Asc,
    /// Descending.
    Desc,
}

/// An explicit sort, replacing the default library order (newest first).
///
/// Paired with [`SmartPlaylistDefinition::limit`] this is what makes "top 25
/// most played" and "50 least recently played" expressible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistOrderBy {
    /// The field to sort on.
    pub field: SmartPlaylistField,
    /// Which way.
    pub direction: SmartPlaylistSortDirection,
}

/// The persisted rule definition, stored JSON-serialized in the `rules` column.
///
/// # Storage shape
///
/// The column has always held a JSON *array* of rules, and rows written before
/// `limit`/`order_by` existed still do. Rather than migrate — v1's ledger is
/// frozen by [`crate`]'s adoption contract — the column accepts two shapes and
/// readers take both: a bare array (legacy, no limit and no sort), or an
/// envelope `{"rules": [...], "limit": 25, "orderBy": {...}}`. Writers emit the
/// envelope only when a limit or a sort is set, so a definition using neither
/// round-trips exactly as an older build would have written it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistDefinition {
    /// How the rules combine.
    pub match_type: SmartPlaylistMatchType,
    /// The rules themselves. An empty list matches the whole library.
    pub rules: Vec<SmartPlaylistRule>,
    /// Maximum tracks to return. `None` means unbounded.
    #[specta(optional)]
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    #[specta(optional)]
    pub order_by: Option<SmartPlaylistOrderBy>,
}

/// A persisted smart playlist row, with `rules` parsed back into structured form.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylist {
    /// Primary key (UUID v4).
    pub id: String,
    /// Display name.
    pub name: String,
    /// Free-text description; nullable in SQLite, and nullable on the wire.
    pub description: Option<String>,
    /// How the rules combine.
    pub match_type: SmartPlaylistMatchType,
    /// The rules themselves.
    pub rules: Vec<SmartPlaylistRule>,
    /// Maximum tracks to return. `None` means unbounded.
    #[specta(optional)]
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    #[specta(optional)]
    pub order_by: Option<SmartPlaylistOrderBy>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-update timestamp.
    pub updated_at: String,
}
