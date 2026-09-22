//! `db:smart-playlists:*` — rule-based playlists.
//!
//! Seven channels, ported from
//! `apps/desktop/src/main/ipc/database/smart-playlists.ts`. A smart playlist
//! persists only its rules; its tracks are evaluated against the library at
//! read time, so it follows the library as that changes. The rule → SQL
//! translation lives in [`crate::repo::smart_rules`]; this module is the
//! storage around it.
//!
//! # Malformed rules are survivable
//!
//! The `rules` column is JSON text, written by a build that may be older than
//! this one. v1 parsed it defensively — a malformed document or one that fails
//! validation degrades to *no rules*, with a warning, rather than failing the
//! read — and so does this. The consequence is deliberate and worth stating:
//! a smart playlist whose rules cannot be parsed matches the whole library
//! rather than disappearing from the sidebar. Losing the filter is visible and
//! recoverable; losing the playlist looks like data loss.
//!
//! `match_type` degrades the same way, to `all`.

use shiranami_core::models::{
    SmartPlaylist, SmartPlaylistDefinition, SmartPlaylistMatchType, SmartPlaylistOrderBy,
    SmartPlaylistRule, SmartPlaylistSortDirection, Track,
};
use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection, sqlite::SqliteRow};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::clock::SQLITE_NOW;
use crate::repo::conn::failed;
use crate::repo::smart_rules;
use crate::repo::track_row::{self, LIBRARY_ORDER, TRACK_SELECT};

/// The `SELECT` list for every read that returns whole smart playlists.
const SMART_SELECT: &str = "SELECT id, name, description, match_type, rules, created_at, \
     updated_at FROM smart_playlists";

/// What an `INSERT`/`UPDATE` … `RETURNING` gives back, matching [`SMART_SELECT`].
const RETURNING_SMART: &str = " RETURNING id, name, description, match_type, rules, created_at, \
     updated_at";

/// The payload for creating a smart playlist.
///
/// Not in `shiranami-core` because it has no v1 domain type either — the
/// channel's zod schema was its only definition. Phase 13 gives it a wire form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmartPlaylistCreateInput {
    /// Display name.
    pub name: String,
    /// Free-text description.
    pub description: Option<String>,
    /// How the rules combine.
    pub match_type: SmartPlaylistMatchType,
    /// The rules themselves.
    pub rules: Vec<SmartPlaylistRule>,
    /// Maximum tracks to return. `None` means unbounded.
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    pub order_by: Option<SmartPlaylistOrderBy>,
}

/// A patch for an existing smart playlist. Absent fields are left alone.
///
/// Plain `Option`s rather than [`shiranami_core::models::Patch`]: v1's handler
/// tested each field against `undefined` and had no way to write `NULL`
/// through this channel, so there is no third state to carry.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SmartPlaylistUpdateInput {
    /// Display name.
    pub name: Option<String>,
    /// Free-text description.
    pub description: Option<String>,
    /// How the rules combine.
    pub match_type: Option<SmartPlaylistMatchType>,
    /// The rules themselves, replacing the stored set wholesale.
    ///
    /// `rules`, `limit` and `order_by` share one column and are written as a
    /// unit: a patch carrying `rules` rewrites all three, which is how the
    /// editor clears a limit — an optional field has no other way to say
    /// "none". A patch carrying only `limit`/`order_by` keeps the stored rules.
    pub rules: Option<Vec<SmartPlaylistRule>>,
    /// Maximum tracks to return.
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    pub order_by: Option<SmartPlaylistOrderBy>,
}

/// Every smart playlist, newest first.
pub async fn get_all(conn: &mut SqliteConnection) -> Result<Vec<SmartPlaylist>> {
    let mut builder = QueryBuilder::<Sqlite>::new(SMART_SELECT);
    builder.push(" ORDER BY created_at DESC");

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the smart playlists"))?;

    rows.iter().map(smart_playlist).collect()
}

/// One smart playlist by id.
pub async fn get(conn: &mut SqliteConnection, id: &str) -> Result<Option<SmartPlaylist>> {
    let row = fetch(&mut *conn, id).await?;

    row.as_ref().map(smart_playlist).transpose()
}

/// Create a smart playlist.
pub async fn create(
    conn: &mut SqliteConnection,
    input: &SmartPlaylistCreateInput,
) -> Result<Option<SmartPlaylist>> {
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO smart_playlists (id, name, description, match_type, rules) VALUES (",
    );
    let mut values = builder.separated(", ");
    values.push_bind(Uuid::new_v4().to_string());
    values.push_bind(input.name.clone());
    values.push_bind(input.description.clone());
    values.push_bind(match_type_text(input.match_type).to_owned());
    values.push_bind(encode_rules(&input.rules, input.limit, input.order_by));
    builder.push(")");
    builder.push(RETURNING_SMART);

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("create the smart playlist"))?;

    row.as_ref().map(smart_playlist).transpose()
}

/// Apply a patch to a smart playlist and return the row.
///
/// `updated_at` is set to [`SQLITE_NOW`], not the ISO-8601 spelling the
/// playlists channel uses — v1 passed drizzle a raw ``sql`datetime('now')` ``
/// here and a JavaScript date there, and both formats are on disk.
pub async fn update(
    conn: &mut SqliteConnection,
    id: &str,
    patch: &SmartPlaylistUpdateInput,
) -> Result<Option<SmartPlaylist>> {
    // Resolved before the builder exists because the read-modify-write branch
    // needs the connection, which the builder would otherwise be holding.
    let rules_column = rules_column_for(&mut *conn, id, patch).await?;

    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE smart_playlists SET ");
    let mut set = builder.separated(", ");

    if let Some(name) = &patch.name {
        set.push("name = ");
        set.push_bind_unseparated(name.clone());
    }
    if let Some(description) = &patch.description {
        set.push("description = ");
        set.push_bind_unseparated(description.clone());
    }
    if let Some(match_type) = patch.match_type {
        set.push("match_type = ");
        set.push_bind_unseparated(match_type_text(match_type).to_owned());
    }
    if let Some(rules) = rules_column {
        set.push("rules = ");
        set.push_bind_unseparated(rules);
    }

    // Always written, and last, so the separator fires only when a patched
    // field preceded it.
    set.push("updated_at = ");
    set.push_unseparated(SQLITE_NOW);

    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.push(RETURNING_SMART);

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("update the smart playlist"))?;

    row.as_ref().map(smart_playlist).transpose()
}

/// The new value for the `rules` column, or `None` to leave it alone.
///
/// `rules`, `limit` and `order_by` share the column, so a patch touching any of
/// them rewrites all three — see [`SmartPlaylistUpdateInput::rules`]. Only the
/// limit-or-sort-without-rules case has to read first, and only that case pays
/// for the extra statement.
async fn rules_column_for(
    conn: &mut SqliteConnection,
    id: &str,
    patch: &SmartPlaylistUpdateInput,
) -> Result<Option<String>> {
    if let Some(rules) = &patch.rules {
        return Ok(Some(encode_rules(rules, patch.limit, patch.order_by)));
    }
    if patch.limit.is_none() && patch.order_by.is_none() {
        return Ok(None);
    }

    let Some(row) = fetch(&mut *conn, id).await? else {
        return Ok(None);
    };
    let stored = smart_playlist(&row)?;

    Ok(Some(encode_rules(
        &stored.rules,
        patch.limit.or(stored.limit),
        patch.order_by.or(stored.order_by),
    )))
}

/// Delete a smart playlist. Nothing cascades — it owns no rows.
pub async fn delete(conn: &mut SqliteConnection, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM smart_playlists WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("delete the smart playlist"))?;

    Ok(())
}

/// Evaluate a saved smart playlist against the library.
///
/// An unknown id is an empty list rather than an error: v1 returned `[]`, and a
/// playlist deleted in another window should read as empty, not as a failure.
///
/// Both statements run on the caller's one connection — the read of the
/// definition and the evaluation that follows it.
pub async fn get_tracks(conn: &mut SqliteConnection, id: &str) -> Result<Vec<Track>> {
    let Some(row) = fetch(&mut *conn, id).await? else {
        return Ok(Vec::new());
    };
    let saved = smart_playlist(&row)?;

    evaluate(
        &mut *conn,
        &SmartPlaylistDefinition {
            match_type: saved.match_type,
            rules: saved.rules,
            limit: saved.limit,
            order_by: saved.order_by,
        },
    )
    .await
}

/// Evaluate an unsaved definition — the live rule-editor preview.
pub async fn preview(
    conn: &mut SqliteConnection,
    definition: &SmartPlaylistDefinition,
) -> Result<Vec<Track>> {
    evaluate(&mut *conn, definition).await
}

/// Run a definition's filter over `tracks`.
///
/// Ordered like every other library read, for the reason
/// [`crate::repo::track_row::LIBRARY_ORDER`] gives. An empty filter selects
/// everything, which is what a rule-less smart playlist means.
async fn evaluate(
    conn: &mut SqliteConnection,
    definition: &SmartPlaylistDefinition,
) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    smart_rules::compile(definition).push_to(&mut builder);

    match definition.order_by {
        // An explicit sort replaces the leading key but keeps `rowid` as the
        // final one, for the reason `LIBRARY_ORDER` gives: `play_count DESC`
        // alone leaves every tie to the planner, so "top 25" would not be a
        // stable 25. Both halves are `&'static str` — the field selects an
        // expression, it never supplies one.
        Some(order) => {
            builder.push(" ORDER BY ");
            builder.push(smart_rules::order_expression_of(order.field));
            builder.push(match order.direction {
                SmartPlaylistSortDirection::Asc => " ASC",
                SmartPlaylistSortDirection::Desc => " DESC",
            });
            builder.push(", tracks.rowid ASC");
        }
        None => {
            builder.push(LIBRARY_ORDER);
        }
    }

    // Bound rather than interpolated even though it is an integer, so the
    // statement text stays independent of the definition and SQLite can reuse
    // the prepared plan across playlists.
    if let Some(limit) = definition.limit.filter(|limit| *limit > 0) {
        builder.push(" LIMIT ");
        builder.push_bind(i64::from(limit));
    }

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("evaluate the smart playlist"))?;

    track_row::tracks(&rows)
}

/// Read one stored row by id.
async fn fetch(conn: &mut SqliteConnection, id: &str) -> Result<Option<SqliteRow>> {
    let mut builder = QueryBuilder::<Sqlite>::new(SMART_SELECT);
    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());

    builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the smart playlist"))
}

/// What a decoded `rules` column yields.
#[derive(Debug, Default, PartialEq, Eq)]
struct DecodedRules {
    rules: Vec<SmartPlaylistRule>,
    limit: Option<u32>,
    order_by: Option<SmartPlaylistOrderBy>,
}

/// Read the `rules` column, whichever of its two shapes it holds.
///
/// A bare array is what every build before `limit`/`order_by` wrote, and what
/// this one still writes when neither is set; the envelope
/// `{"rules": [...], "limit": 25, "orderBy": {...}}` carries them when they
/// are. See [`SmartPlaylistDefinition`] for why this is a column convention
/// rather than a migration.
///
/// Written against [`serde_json::Value`] rather than a derived enum because
/// this crate takes `serde`'s derive only as a dev-dependency; the leaf types
/// carry their own [`serde::Deserialize`] impls from `shiranami-core`, which is
/// all [`serde_json::from_value`] needs.
///
/// Partial failure degrades the same way total failure does — to no rules —
/// for the reason the module header gives: a playlist that reads as unfiltered
/// is recoverable, one that fails to read looks like data loss.
fn decode_rules(stored: &str) -> Result<DecodedRules, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(stored)?;

    if value.is_array() {
        return Ok(DecodedRules {
            rules: serde_json::from_value(value)?,
            limit: None,
            order_by: None,
        });
    }

    let rules = match value.get("rules") {
        Some(rules) => serde_json::from_value(rules.clone())?,
        None => Vec::new(),
    };
    let limit = value
        .get("limit")
        .and_then(serde_json::Value::as_u64)
        .and_then(|limit| u32::try_from(limit).ok());
    let order_by = match value.get("orderBy") {
        Some(order_by) => serde_json::from_value(order_by.clone())?,
        None => None,
    };

    Ok(DecodedRules {
        rules,
        limit,
        order_by,
    })
}

/// Serialize rules for the `rules` column.
///
/// Emits the bare array whenever there is no limit and no sort, so a definition
/// using neither is written byte-for-byte as an older build would have written
/// it and stays readable by one. Only a definition that needs the envelope gets
/// one.
///
/// Falls back to an empty array, which cannot happen for a well-formed
/// [`SmartPlaylistRule`] but keeps the signature infallible rather than
/// inventing an error the channel has no way to report.
fn encode_rules(
    rules: &[SmartPlaylistRule],
    limit: Option<u32>,
    order_by: Option<SmartPlaylistOrderBy>,
) -> String {
    let encoded = serde_json::to_value(rules).and_then(|rules| {
        if limit.is_none() && order_by.is_none() {
            return serde_json::to_string(&rules);
        }

        let mut envelope = serde_json::Map::new();
        envelope.insert("rules".to_owned(), rules);
        if let Some(limit) = limit {
            envelope.insert("limit".to_owned(), limit.into());
        }
        if let Some(order_by) = order_by {
            envelope.insert("orderBy".to_owned(), serde_json::to_value(order_by)?);
        }

        serde_json::to_string(&serde_json::Value::Object(envelope))
    });

    encoded.unwrap_or_else(|_| "[]".to_owned())
}

/// The stored spelling of a match type, as the column's `'all'` default implies.
fn match_type_text(match_type: SmartPlaylistMatchType) -> &'static str {
    match match_type {
        SmartPlaylistMatchType::All => "all",
        SmartPlaylistMatchType::Any => "any",
    }
}

/// Map one `smart_playlists` row into the wire model, degrading rather than failing.
fn smart_playlist(row: &SqliteRow) -> Result<SmartPlaylist> {
    let stored_rules: String = row
        .try_get("rules")
        .map_err(failed("read a rules column"))?;
    let stored_match: String = row
        .try_get("match_type")
        .map_err(failed("read a match-type column"))?;

    let decoded = decode_rules(&stored_rules).unwrap_or_else(|error| {
        tracing::warn!(%error, "a smart playlist's rules could not be read; treating it as unfiltered");
        DecodedRules::default()
    });

    let match_type = match stored_match.as_str() {
        "any" => SmartPlaylistMatchType::Any,
        _ => SmartPlaylistMatchType::All,
    };

    read(row, match_type, decoded).map_err(failed("read a smart-playlist row"))
}

/// The remaining columns, once the two parsed ones are in hand.
fn read(
    row: &SqliteRow,
    match_type: SmartPlaylistMatchType,
    decoded: DecodedRules,
) -> sqlx::Result<SmartPlaylist> {
    Ok(SmartPlaylist {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        match_type,
        rules: decoded.rules,
        limit: decoded.limit,
        order_by: decoded.order_by,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
