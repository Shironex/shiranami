//! Saved internet-radio stations.
//!
//! Ported from `apps/desktop/src/main/ipc/radio.ts` — the four
//! `radio:favorites:*` channels. The only entity in this crate whose channels
//! live outside the `db:*` namespace, because v1 grouped them with the rest of
//! the radio feature; the queries are as much this crate's as any other table's.
//!
//! # `created_at` is left to the column default, and that is load-bearing
//!
//! [`add`] does not write `created_at`. v1 did not either, so every existing
//! row carries SQLite's `datetime('now')` format — `2026-08-01 12:34:56`, with
//! a space and no fractional part — rather than JavaScript's
//! `2026-08-01T12:34:56.789Z`.
//!
//! [`all`] orders by that column, as text. Writing an ISO-8601 string here
//! instead would sort every new favourite *below* every old one forever, since
//! `'T'` (0x54) is above `' '` (0x20): the newest station would appear at the
//! bottom of a newest-first list. The inconsistency with
//! [`super::history::record_play`], which must write ISO-8601 for the opposite
//! reason, is therefore real and deliberate — each column matches what v1 put
//! in it.

use shiranami_core::models::{RadioFavorite, RadioStationInput};
use sqlx::SqliteConnection;

use crate::error::{DbError, Result};

/// Every saved station, newest first.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn all(conn: &mut SqliteConnection) -> Result<Vec<RadioFavorite>> {
    let rows = sqlx::query_as::<_, FavoriteRow>(
        "SELECT id, station_uuid, name, url, url_resolved, homepage, favicon, \
                country, country_code, language, codec, bitrate, tags, created_at \
           FROM radio_favorites \
          ORDER BY created_at DESC",
    )
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the saved radio stations",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Save a station and return the stored row.
///
/// `id` is the new primary key, minted by the caller (see [`super`]).
/// `created_at` is the column default — see the module docs.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the insert fails, which includes the
/// `UNIQUE` violation on `station_uuid` when the station is already saved. v1
/// let that surface too; the renderer guards with
/// [`is_favorite`] rather than relying on the insert to be idempotent.
pub async fn add(
    conn: &mut SqliteConnection,
    id: &str,
    station: &RadioStationInput,
) -> Result<RadioFavorite> {
    let row = sqlx::query_as::<_, FavoriteRow>(
        "INSERT INTO radio_favorites \
           (id, station_uuid, name, url, url_resolved, homepage, favicon, \
            country, country_code, language, codec, bitrate, tags) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) \
         RETURNING id, station_uuid, name, url, url_resolved, homepage, favicon, \
                   country, country_code, language, codec, bitrate, tags, created_at",
    )
    .bind(id)
    .bind(&station.station_uuid)
    .bind(&station.name)
    .bind(&station.url)
    .bind(&station.url_resolved)
    .bind(station.homepage.as_deref())
    .bind(station.favicon.as_deref())
    .bind(station.country.as_deref())
    .bind(station.country_code.as_deref())
    .bind(station.language.as_deref())
    .bind(station.codec.as_deref())
    .bind(station.bitrate)
    .bind(station.tags.as_deref())
    .fetch_one(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "save the radio station",
        source,
    })?;

    Ok(row.into())
}

/// Forget a station, by directory id.
///
/// Keyed on `station_uuid` rather than the row id, because that is the id the
/// renderer holds while browsing the directory. Removing a station that was
/// never saved is not an error, as it was not in v1.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn remove(conn: &mut SqliteConnection, station_uuid: &str) -> Result<()> {
    sqlx::query("DELETE FROM radio_favorites WHERE station_uuid = ?1")
        .bind(station_uuid)
        .execute(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "remove the saved radio station",
            source,
        })?;

    Ok(())
}

/// Whether a station is saved.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn is_favorite(conn: &mut SqliteConnection, station_uuid: &str) -> Result<bool> {
    // `EXISTS` rather than v1's "select the id and test it for truthiness":
    // same answer, and it stops at the first matching row.
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM radio_favorites WHERE station_uuid = ?1)")
            .bind(station_uuid)
            .fetch_one(conn)
            .await
            .map_err(|source| DbError::Query {
                operation: "check whether the radio station is saved",
                source,
            })?;

    Ok(exists)
}

#[derive(sqlx::FromRow)]
struct FavoriteRow {
    id: String,
    station_uuid: String,
    name: String,
    url: String,
    url_resolved: String,
    homepage: Option<String>,
    favicon: Option<String>,
    country: Option<String>,
    country_code: Option<String>,
    language: Option<String>,
    codec: Option<String>,
    bitrate: Option<u32>,
    tags: Option<String>,
    created_at: String,
}

impl From<FavoriteRow> for RadioFavorite {
    fn from(row: FavoriteRow) -> Self {
        Self {
            id: row.id,
            station_uuid: row.station_uuid,
            name: row.name,
            url: row.url,
            url_resolved: row.url_resolved,
            homepage: row.homepage,
            favicon: row.favicon,
            country: row.country,
            country_code: row.country_code,
            language: row.language,
            codec: row.codec,
            bitrate: row.bitrate,
            tags: row.tags,
            created_at: row.created_at,
        }
    }
}
