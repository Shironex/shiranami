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
    /// `date_added` within the last `value` days.
    InLastDays,
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

/// The persisted rule definition, stored JSON-serialized in the `rules` column.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistDefinition {
    /// How the rules combine.
    pub match_type: SmartPlaylistMatchType,
    /// The rules themselves. An empty list matches the whole library.
    pub rules: Vec<SmartPlaylistRule>,
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
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-update timestamp.
    pub updated_at: String,
}
