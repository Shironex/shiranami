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
    SmartPlaylist, SmartPlaylistDefinition, SmartPlaylistMatchType, SmartPlaylistRule, Track,
};
use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection, SqlitePool, sqlite::SqliteRow};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::clock::SQLITE_NOW;
use crate::repo::conn::{acquire, failed};
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
    pub rules: Option<Vec<SmartPlaylistRule>>,
}

/// Every smart playlist, newest first.
pub async fn get_all(pool: &SqlitePool) -> Result<Vec<SmartPlaylist>> {
    let mut conn = acquire(pool).await?;

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
pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<SmartPlaylist>> {
    let mut conn = acquire(pool).await?;
    let row = fetch(&mut conn, id).await?;

    row.as_ref().map(smart_playlist).transpose()
}

/// Create a smart playlist.
pub async fn create(
    pool: &SqlitePool,
    input: &SmartPlaylistCreateInput,
) -> Result<Option<SmartPlaylist>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO smart_playlists (id, name, description, match_type, rules) VALUES (",
    );
    let mut values = builder.separated(", ");
    values.push_bind(Uuid::new_v4().to_string());
    values.push_bind(input.name.clone());
    values.push_bind(input.description.clone());
    values.push_bind(match_type_text(input.match_type).to_owned());
    values.push_bind(encode_rules(&input.rules));
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
    pool: &SqlitePool,
    id: &str,
    patch: &SmartPlaylistUpdateInput,
) -> Result<Option<SmartPlaylist>> {
    let mut conn = acquire(pool).await?;

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
    if let Some(rules) = &patch.rules {
        set.push("rules = ");
        set.push_bind_unseparated(encode_rules(rules));
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

/// Delete a smart playlist. Nothing cascades — it owns no rows.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<()> {
    let mut conn = acquire(pool).await?;

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
/// Both statements run on the one connection this call acquired — the read of
/// the definition and the evaluation that follows it.
pub async fn get_tracks(pool: &SqlitePool, id: &str) -> Result<Vec<Track>> {
    let mut conn = acquire(pool).await?;

    let Some(row) = fetch(&mut conn, id).await? else {
        return Ok(Vec::new());
    };
    let saved = smart_playlist(&row)?;

    evaluate(
        &mut conn,
        &SmartPlaylistDefinition {
            match_type: saved.match_type,
            rules: saved.rules,
        },
    )
    .await
}

/// Evaluate an unsaved definition — the live rule-editor preview.
pub async fn preview(
    pool: &SqlitePool,
    definition: &SmartPlaylistDefinition,
) -> Result<Vec<Track>> {
    let mut conn = acquire(pool).await?;

    evaluate(&mut conn, definition).await
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
    builder.push(LIBRARY_ORDER);

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

/// Serialize rules for the `rules` column.
///
/// Falls back to an empty array, which cannot happen for a well-formed
/// [`SmartPlaylistRule`] but keeps the signature infallible rather than
/// inventing an error the channel has no way to report.
fn encode_rules(rules: &[SmartPlaylistRule]) -> String {
    serde_json::to_string(rules).unwrap_or_else(|_| "[]".to_owned())
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

    let rules = serde_json::from_str::<Vec<SmartPlaylistRule>>(&stored_rules).unwrap_or_else(
        |error| {
            tracing::warn!(%error, "a smart playlist's rules could not be read; treating it as unfiltered");
            Vec::new()
        },
    );

    let match_type = match stored_match.as_str() {
        "any" => SmartPlaylistMatchType::Any,
        _ => SmartPlaylistMatchType::All,
    };

    read(row, match_type, rules).map_err(failed("read a smart-playlist row"))
}

/// The remaining columns, once the two parsed ones are in hand.
fn read(
    row: &SqliteRow,
    match_type: SmartPlaylistMatchType,
    rules: Vec<SmartPlaylistRule>,
) -> sqlx::Result<SmartPlaylist> {
    Ok(SmartPlaylist {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        match_type,
        rules,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
