//! The radio diary — what a station said it was playing, kept.
//!
//! Alongside [`super::radio`], which is the saved-stations table and nothing
//! else. The two are separate modules because they answer different questions
//! and neither read wants the other's rows: `radio_favorites` is a set the user
//! curates, `radio_log` is a stream the app appends to.
//!
//! # Written on a title change, never on a timer
//!
//! The ICY de-framer already debounces: it reports a `StreamTitle` only when it
//! *differs* from the last one it saw on that connection. So the write side is
//! event-shaped all the way down — one [`record`] per change, and no periodic
//! sampler anywhere. [`record`] repeats the same check against the table
//! instead of trusting it, because a connection is not a session: reconnecting
//! to a station mid-song, or switching away and back, starts a fresh de-framer
//! whose first title is "new" to it and is not new to the log.
//!
//! # The bound is a row cap, enforced on every insert
//!
//! [`MAX_ROWS`] rows, oldest evicted, in the same call that inserts. The
//! arithmetic: a station that re-titles every three minutes fills the cap in
//! roughly ten days of continuous listening, and a chattier one — ad breaks and
//! traffic tickers can re-title every few seconds — fills it in a few days. At
//! five thousand rows of short text the table is a couple of megabytes, which
//! is the point: an overnight session must cost a bounded amount of disk, and
//! the bound must be a number someone chose rather than whatever accumulated.
//!
//! The cap is **global, not per-station**. What has to stay bounded is the
//! file; a per-station cap bounds nothing when the user keeps finding stations.
//!
//! # `heard_at` is ISO-8601, and here that is a free choice
//!
//! [`super::radio::add`] must write SQLite's `datetime('now')` spelling and
//! [`super::history::record_play`] must write JavaScript's, because both
//! columns already hold shipped rows in those formats. `radio_log` is v2-born
//! and empty on every machine, so it takes the format the renderer reads
//! directly — [`super::clock::ISO_8601_NOW`], the same one `play_history` uses.

use shiranami_core::models::{RadioLogEntry, RadioNowPlaying};
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

use crate::error::{DbError, Result};
use crate::repo::clock::ISO_8601_NOW;

/// How many diary rows are kept, across every station. See the module docs.
pub const MAX_ROWS: i64 = 5_000;

/// Default page size for [`for_station`], and the ceiling on what it will
/// return however much a caller asks for.
///
/// The diary is a panel someone scrolls, not an export: two hundred rows is
/// several days of one station's titles, and reading the whole cap into the
/// webview to render a hundred of them would be the only unbounded response on
/// this surface.
pub const MAX_PAGE: i64 = 200;

/// File one title against `station_uuid`, and trim the table back to
/// [`MAX_ROWS`].
///
/// Returns the stored row, or `None` when the title is the same one this
/// station's most recent row already carries — a consecutive repeat, which is
/// the shape a reconnect produces and which the diary must not show twice in a
/// row. Only *consecutive* repeats are collapsed: a station that plays the same
/// song again an hour later gets a second row, because it genuinely played it
/// again.
///
/// The comparison is on `raw`, not on the derived split, so two different
/// strings that happen to split the same way stay two entries.
///
/// # Errors
///
/// Returns [`DbError::Query`] if any of the three statements fails.
pub async fn record(
    conn: &mut SqliteConnection,
    station_uuid: &str,
    playing: &RadioNowPlaying,
) -> Result<Option<RadioLogEntry>> {
    if latest_raw(&mut *conn, station_uuid).await?.as_deref() == Some(playing.raw.as_str()) {
        return Ok(None);
    }

    // Assembled rather than formatted into a literal, the way
    // [`super::folders::update_scanned`] assembles its own `ISO_8601_NOW`: no
    // code path in this module can then put a `String` where SQL text goes.
    // Every caller value here is a bind; the only pushed text is that constant.
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO radio_log (station_uuid, raw_title, artist, title, heard_at) VALUES (",
    );
    let mut values = builder.separated(", ");
    values.push_bind(station_uuid.to_owned());
    values.push_bind(playing.raw.clone());
    values.push_bind(playing.artist.clone());
    values.push_bind(playing.title.clone());
    values.push(ISO_8601_NOW);
    builder.push(") RETURNING id, station_uuid, raw_title, artist, title, heard_at");

    let row = builder
        .build_query_as::<LogRow>()
        .fetch_one(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "record what the radio station is playing",
            source,
        })?;

    evict_overflow(&mut *conn).await?;

    Ok(Some(row.into()))
}

/// One station's diary, newest first, at most `limit` (clamped to
/// [`MAX_PAGE`]) rows.
///
/// A non-positive `limit` reads nothing rather than everything: it is what an
/// arithmetic slip produces, and answering it with the whole table is the
/// failure mode worth refusing.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn for_station(
    conn: &mut SqliteConnection,
    station_uuid: &str,
    limit: i64,
) -> Result<Vec<RadioLogEntry>> {
    if limit <= 0 {
        return Ok(Vec::new());
    }

    // `id DESC` after `heard_at DESC` is the tie-break the migration's rowid
    // alias exists for: two titles inside the same millisecond come back in the
    // order they arrived, reversed, rather than in whatever order the index
    // walked them.
    let rows = sqlx::query_as::<_, LogRow>(
        "SELECT id, station_uuid, raw_title, artist, title, heard_at \
           FROM radio_log \
          WHERE station_uuid = ?1 \
          ORDER BY heard_at DESC, id DESC \
          LIMIT ?2",
    )
    .bind(station_uuid)
    .bind(limit.min(MAX_PAGE))
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the radio diary",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// The most recent `raw_title` filed against `station_uuid`, if any.
async fn latest_raw(conn: &mut SqliteConnection, station_uuid: &str) -> Result<Option<String>> {
    sqlx::query_scalar(
        "SELECT raw_title FROM radio_log \
          WHERE station_uuid = ?1 \
          ORDER BY heard_at DESC, id DESC \
          LIMIT 1",
    )
    .bind(station_uuid)
    .fetch_optional(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the last logged radio title",
        source,
    })
}

/// Delete the oldest rows until at most [`MAX_ROWS`] remain.
///
/// `LIMIT -1 OFFSET ?1` is SQLite's "everything past the first n", the same
/// shape [`super::scrobble_queue`] evicts with. Ordered newest-first so the
/// offset skips the rows that are kept.
async fn evict_overflow(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query(
        "DELETE FROM radio_log \
          WHERE id IN ( \
                SELECT id FROM radio_log \
                 ORDER BY heard_at DESC, id DESC \
                 LIMIT -1 OFFSET ?1 \
          )",
    )
    .bind(MAX_ROWS)
    .execute(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "trim the radio diary to its row cap",
        source,
    })?;

    Ok(())
}

#[derive(sqlx::FromRow)]
struct LogRow {
    id: i64,
    station_uuid: String,
    raw_title: String,
    artist: Option<String>,
    title: Option<String>,
    heard_at: String,
}

impl From<LogRow> for RadioLogEntry {
    fn from(row: LogRow) -> Self {
        Self {
            id: row.id,
            station_uuid: row.station_uuid,
            raw: row.raw_title,
            artist: row.artist,
            title: row.title,
            heard_at: row.heard_at,
        }
    }
}
