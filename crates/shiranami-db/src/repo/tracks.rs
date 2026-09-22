//! `db:tracks:*` — the library itself.
//!
//! Thirteen channels, ported from `apps/desktop/src/main/ipc/database/tracks.ts`.
//! Three properties are load-bearing and are pinned by
//! `tests/repo_tracks.rs` rather than left to review:
//!
//! - **Order.** Every library-wide read is `created_at DESC, rowid ASC`. See
//!   [`track_row::LIBRARY_ORDER`] for why the tie-break is not optional.
//! - **Idempotence on `file_path`.** The renderer's import path does a
//!   non-atomic `exists()` → `add()` across two calls, so a racing import must
//!   get the existing row back, not a `UNIQUE` violation.
//! - **Patch semantics.** An absent field leaves its column alone; an explicit
//!   `null` clears it ([`track_patch`]).
//!
//! One thing this module deliberately does *not* do: prune orphaned album art
//! after `remove_many`. v1 fired that off the critical path from inside the
//! handler; in v2 the art cache belongs to `shiranami-metadata`, which sits
//! beside this crate on the dependency spine rather than below it. The caller
//! sequences the two.

use std::collections::HashMap;

use shiranami_core::models::{Track, TrackCreateInput, TrackUpdateInput};
use sqlx::{Connection, QueryBuilder, Sqlite, SqliteConnection};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::art_url;
use crate::repo::conn::failed;
use crate::repo::ids;
use crate::repo::track_patch;
use crate::repo::track_row::{self, LIBRARY_ORDER, TRACK_SELECT};

// The loudness columns live in their own module (one file, one job); callers
// keep addressing them as `tracks::…`, so the split is invisible at call sites.
pub use crate::repo::track_loudness::{
    LoudnessProfileUpdate, StoredLoudness, loudness_lufs, loudness_state, set_album_loudness,
    set_loudness_lufs, set_loudness_profile,
};

// Same treatment for the analysis engine's persistence (the skip-test read and
// the measurement writes).
pub use crate::repo::track_analysis::{
    AnalysisWrite, TrackAnalysisState, analysis_state, record_analysis_many, set_bpm_key,
};

/// Rows per `INSERT`, as v1 sized it.
///
/// Twelve columns per track, so a full chunk binds 1,200 parameters — an order
/// of magnitude under SQLite's 32,766 `SQLITE_MAX_VARIABLE_NUMBER`.
const INSERT_CHUNK: usize = 100;

/// Ids per `IN (…)` list, as v1 sized it. One bind each.
const ID_CHUNK: usize = 500;

/// The insert column list, and the order [`push_values`] binds in.
const INSERT_INTO: &str = "INSERT INTO tracks \
    (id, file_path, title, artist, album_artist, album, duration, genre, year, \
     track_number, disc_number, album_art) ";

/// Every track, newest first.
pub async fn get_all(conn: &mut SqliteConnection) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(LIBRARY_ORDER);

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the library"))?;

    track_row::tracks(&rows)
}

/// Ranked full-text search over the library, best match first.
///
/// Backed by the `tracks_fts` index (migration `0004`). Each term of the query
/// must appear somewhere in the row, the last term may be half-typed (every
/// term is a prefix query), and rows are ordered by `bm25` with column weights
/// that put a title hit above an artist hit above album/genre metadata —
/// `rowid` breaks ties so equal scores keep insertion order. The tokenizer
/// folds diacritics on both sides, so "beyonce" finds "Beyoncé".
///
/// An empty or punctuation-only query returns no rows rather than the whole
/// library — "show everything" is [`get_all`]'s job, and the renderer only
/// calls this once the user has typed something.
pub async fn search(conn: &mut SqliteConnection, query: &str, limit: i64) -> Result<Vec<Track>> {
    let expression = fts_match_expression(query);
    if expression.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query(
        "SELECT tracks.* FROM tracks_fts JOIN tracks ON tracks.rowid = tracks_fts.rowid \
         WHERE tracks_fts MATCH ?1 \
         ORDER BY bm25(tracks_fts, 8.0, 4.0, 2.0, 2.0, 1.0), tracks.rowid ASC \
         LIMIT ?2",
    )
    .bind(expression)
    .bind(limit)
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("search the library"))?;

    track_row::tracks(&rows)
}

/// Build an FTS5 `MATCH` expression from raw user input.
///
/// FTS5 gives `"`, `*`, `-`, `^`, parentheses and the bare keywords
/// `AND`/`OR`/`NOT`/`NEAR` meaning, so raw input containing any of them is a
/// syntax error rather than a search. The input is therefore split on every
/// non-alphanumeric character — the same boundary the `unicode61` tokenizer
/// uses, so "don't" becomes the two tokens the index actually holds — and each
/// run becomes a quoted prefix query. Purely alphanumeric terms cannot smuggle
/// an operator, which turns the whole query grammar off.
fn fts_match_expression(query: &str) -> String {
    query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{term}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Insert one track, or hand back the row that already holds its `file_path`.
///
/// `file_path` is `UNIQUE` and the renderer's import is a non-atomic
/// `exists()` → `add()` across two calls, so the loser of that race must not
/// see a constraint error. `ON CONFLICT DO NOTHING` plus the fallback read
/// makes the channel idempotent, which is the contract the preload API
/// documents ("an already-imported file returns its existing row").
pub async fn add(conn: &mut SqliteConnection, input: &TrackCreateInput) -> Result<Option<Track>> {
    let inserted = insert_chunk(&mut *conn, std::slice::from_ref(input)).await?;
    if let Some(track) = inserted.into_iter().next() {
        return Ok(Some(track));
    }

    let existing = sqlx::query("SELECT tracks.* FROM tracks WHERE tracks.file_path = ?1")
        .bind(&input.file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the track that already holds this path"))?;

    existing.as_ref().map(track_row::track).transpose()
}

/// Insert many tracks in one transaction, returning only the rows that landed.
///
/// Duplicates are skipped rather than echoed — the preload contract's wording,
/// and what the scan path depends on: the returned rows are exactly the ones to
/// add to the in-memory library, since the already-present ones are already
/// there.
pub async fn add_many(
    conn: &mut SqliteConnection,
    incoming: &[TrackCreateInput],
) -> Result<Vec<Track>> {
    if incoming.is_empty() {
        return Ok(Vec::new());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the track import"))?;

    let mut inserted = Vec::with_capacity(incoming.len());
    for chunk in incoming.chunks(INSERT_CHUNK) {
        inserted.extend(insert_chunk(&mut tx, chunk).await?);
    }

    tx.commit().await.map_err(failed("import the tracks"))?;

    Ok(inserted)
}

/// Delete one track. Cascades to playlist membership and play history.
pub async fn remove(conn: &mut SqliteConnection, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM tracks WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("remove the track"))?;

    Ok(())
}

/// Delete many tracks in one transaction, in chunks.
pub async fn remove_many(conn: &mut SqliteConnection, ids: &[String]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin removing the tracks"))?;

    for chunk in ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new("DELETE FROM tracks WHERE id IN (");
        push_ids(&mut builder, chunk);
        builder.push(")");

        builder
            .build()
            .execute(&mut *tx)
            .await
            .map_err(failed("remove the tracks"))?;
    }

    tx.commit().await.map_err(failed("remove the tracks"))?;

    Ok(())
}

/// Apply a patch to one track and return the row as it now stands.
///
/// An all-absent patch is a no-op that still returns the row: `SET` with no
/// assignments is a syntax error, and refusing the call would be a worse
/// contract than "you asked for no changes, here is the unchanged track".
pub async fn update(
    conn: &mut SqliteConnection,
    id: &str,
    patch: &TrackUpdateInput,
) -> Result<Option<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET ");
    if track_patch::push_assignments(&mut builder, patch) == 0 {
        let row = sqlx::query("SELECT tracks.* FROM tracks WHERE tracks.id = ?1")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(failed("read the track"))?;

        return row.as_ref().map(track_row::track).transpose();
    }

    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.push(" RETURNING *");

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("update the track"))?;

    row.as_ref().map(track_row::track).transpose()
}

/// Apply many patches in one transaction, grouping identical ones.
///
/// The sole caller (metadata-enrich apply) re-reads the library afterwards, so
/// nothing is returned and the per-row `RETURNING` round-trips v1 dropped stay
/// dropped. Patches repeat heavily — a whole album getting the same
/// album/artist/year fix — so equal patches collapse into one `IN (…)` update
/// each ([`track_patch::grouping_key`]). Patches that say nothing are skipped
/// rather than turned into an empty `SET`.
pub async fn update_many(
    conn: &mut SqliteConnection,
    updates: &[(String, TrackUpdateInput)],
) -> Result<()> {
    if updates.is_empty() {
        return Ok(());
    }

    let groups = group_by_patch(updates);
    if groups.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin updating the tracks"))?;

    for (patch, ids) in &groups {
        for chunk in ids.chunks(ID_CHUNK) {
            let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET ");
            if track_patch::push_assignments(&mut builder, patch) == 0 {
                continue;
            }
            builder.push(" WHERE id IN (");
            push_ids(&mut builder, chunk);
            builder.push(")");

            builder
                .build()
                .execute(&mut *tx)
                .await
                .map_err(failed("update the tracks"))?;
        }
    }

    tx.commit().await.map_err(failed("update the tracks"))?;

    Ok(())
}

/// Flip one track's favourite flag and return the row.
///
/// `NOT NULL` is `NULL` in SQLite, so a row whose `is_favorite` was never set
/// stays `NULL` here — exactly as v1's `sql`NOT ${tracks.isFavorite}`` did. The
/// column has a `false` default, so only a row written around it can be in that
/// state.
pub async fn toggle_favorite(conn: &mut SqliteConnection, id: &str) -> Result<Option<Track>> {
    updated_row(
        conn,
        "UPDATE tracks SET is_favorite = NOT is_favorite WHERE id = ?1 RETURNING *",
        id,
        "toggle the track's favourite flag",
    )
    .await
}

/// Every favourited track, newest first.
pub async fn get_favorites(conn: &mut SqliteConnection) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(" WHERE tracks.is_favorite = ");
    builder.push_bind(true);
    builder.push(LIBRARY_ORDER);

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the favourite tracks"))?;

    track_row::tracks(&rows)
}

/// Add one to a track's play count and return the row.
pub async fn increment_play_count(conn: &mut SqliteConnection, id: &str) -> Result<Option<Track>> {
    updated_row(
        conn,
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1 RETURNING *",
        id,
        "increment the track's play count",
    )
    .await
}

/// Whether the library already holds a track for this file.
pub async fn exists(conn: &mut SqliteConnection, file_path: &str) -> Result<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT id FROM tracks WHERE file_path = ?1")
        .bind(file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("look up the track by path"))?;

    Ok(found.is_some())
}

/// Which of these paths the library already holds, deduplicated.
///
/// Order follows first appearance in the database reads, matching the `Set`
/// insertion order v1 spread into an array.
pub async fn exists_many(
    conn: &mut SqliteConnection,
    file_paths: &[String],
) -> Result<Vec<String>> {
    if file_paths.is_empty() {
        return Ok(Vec::new());
    }

    let mut existing = Vec::new();

    for chunk in file_paths.chunks(ID_CHUNK) {
        let mut builder =
            QueryBuilder::<Sqlite>::new("SELECT file_path FROM tracks WHERE file_path IN (");
        push_ids(&mut builder, chunk);
        builder.push(")");

        let found: Vec<String> = builder
            .build_query_scalar()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("look up the tracks by path"))?;

        existing.extend(found);
    }

    // A caller that passed the same path twice gets one answer, and a path
    // repeated across two chunks is answered once.
    Ok(ids::unique(existing))
}

/// One track by id, if it is in the library.
///
/// Backs **no** `db:tracks:*` channel — v1 has none, because the renderer holds
/// the whole library in memory and never asks for one row. It exists for
/// share-payload assembly (Phase 14), which is a *main-process* reader: v1's
/// `ipc/share.ts` opened `db.select().from(tracks).where(eq(tracks.id, …)).get()`
/// inline for exactly this. Reading the library and scanning it in the command
/// layer would answer the same question by loading every row.
pub async fn get(conn: &mut SqliteConnection, id: &str) -> Result<Option<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(" WHERE tracks.id = ");
    builder.push_bind(id.to_owned());

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the track"))?;

    row.as_ref().map(track_row::track).transpose()
}

/// The id of the track holding this file, if any.
pub async fn get_id_by_path(
    conn: &mut SqliteConnection,
    file_path: &str,
) -> Result<Option<String>> {
    sqlx::query_scalar("SELECT id FROM tracks WHERE file_path = ?1")
        .bind(file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("look up the track id by path"))
}

/// Run a single-row `UPDATE … RETURNING *` keyed on `id`.
///
/// Shared by the two counter-style channels, whose only difference is the `SET`
/// expression. `statement` is always a literal from this module.
async fn updated_row(
    conn: &mut SqliteConnection,
    statement: &'static str,
    id: &str,
    operation: &'static str,
) -> Result<Option<Track>> {
    let row = sqlx::query(statement)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed(operation))?;

    row.as_ref().map(track_row::track).transpose()
}

/// Insert up to [`INSERT_CHUNK`] tracks, returning the rows that landed.
///
/// Both callers hand down what they were given: [`add`] its connection,
/// [`add_many`] the transaction it opened on one.
///
/// Every column the create payload can speak about is listed and bound, so a
/// `None` writes `NULL` rather than falling to the column default. That is the
/// one place the port cannot mirror v1 exactly: drizzle distinguished an absent
/// key (take the default, e.g. `'Unknown Artist'`) from an explicit `null`, and
/// [`TrackCreateInput`] has no absent state to carry the difference. Binding
/// `NULL` is the branch the real callers take — v1's scan path sends every key,
/// with `?? null` for the untagged ones, and its `artist`/`album` are collapsed
/// to non-null strings before they get here (`TrackMetadata`), so the defaults
/// were already unreachable through the IPC surface.
async fn insert_chunk(
    conn: &mut SqliteConnection,
    chunk: &[TrackCreateInput],
) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(INSERT_INTO);

    builder.push_values(chunk, |mut row, track| {
        row.push_bind(Uuid::new_v4().to_string())
            .push_bind(track.file_path.clone())
            .push_bind(track.title.clone())
            .push_bind(track.artist.clone())
            .push_bind(track.album_artist.clone())
            .push_bind(track.album.clone())
            .push_bind(track.duration)
            .push_bind(track.genre.clone())
            .push_bind(track.year)
            .push_bind(track.track_number)
            .push_bind(track.disc_number)
            // The one bind that is normalised rather than passed through: a
            // renderer that posts back the loopback URL it was shown must not
            // be able to make a session-scoped address durable.
            .push_bind(art_url::canonical(track.album_art.as_deref()));
    });

    builder.push(" ON CONFLICT (file_path) DO NOTHING RETURNING *");

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("insert the tracks"))?;

    track_row::tracks(&rows)
}

/// Push a comma-separated list of bound ids, for an `IN (…)`.
fn push_ids(builder: &mut QueryBuilder<Sqlite>, ids: &[String]) {
    let mut list = builder.separated(", ");
    for id in ids {
        list.push_bind(id.clone());
    }
}

/// Every non-null `album_art` value the library holds.
///
/// For the album-art orphan prune (`shiranami_metadata::art::prune_orphans`),
/// which needs to know which cache files are still referenced. Values come back
/// **raw** — `shiranami-art://` URLs, remote `https://` covers and legacy
/// `data:` URLs alike — because deciding which of those name a cache file is
/// the prune's job, and a repository that filtered here would be a second
/// opinion on it.
///
/// `DISTINCT` because a compilation shares one cover across every track on it,
/// and the caller only asks "is this file referenced at all".
pub async fn album_art_urls(conn: &mut SqliteConnection) -> Result<Vec<String>> {
    sqlx::query_scalar("SELECT DISTINCT album_art FROM tracks WHERE album_art IS NOT NULL")
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the referenced album art"))
}

/// Collapse `(id, patch)` pairs into one entry per distinct patch.
///
/// Insertion-ordered, like the `Map` v1 built, so the statements run in the
/// order the caller listed them. Patches that say nothing survive grouping and
/// are dropped at the statement, where [`track_patch::push_assignments`] is the
/// one authority on whether a patch is empty.
fn group_by_patch(updates: &[(String, TrackUpdateInput)]) -> Vec<(TrackUpdateInput, Vec<String>)> {
    let mut groups: Vec<(TrackUpdateInput, Vec<String>)> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();

    for (id, patch) in updates {
        let key = track_patch::grouping_key(patch);
        match seen.get(&key) {
            Some(&index) => groups[index].1.push(id.clone()),
            None => {
                seen.insert(key, groups.len());
                groups.push((patch.clone(), vec![id.clone()]));
            }
        }
    }

    groups
}

#[cfg(test)]
mod tests {
    use super::fts_match_expression;

    #[test]
    fn terms_become_quoted_prefix_queries() {
        assert_eq!(fts_match_expression("lofi beats"), r#""lofi"* "beats"*"#);
    }

    /// Every FTS5 operator must come out defanged: split on non-alphanumeric
    /// boundaries, nothing but the letters survives into the quoted terms.
    #[test]
    fn fts_operators_cannot_reach_the_query_grammar() {
        assert_eq!(
            fts_match_expression(r#"a* (b) -c "d" e^"#),
            r#""a"* "b"* "c"* "d"* "e"*"#
        );
    }

    /// The split boundary mirrors the `unicode61` tokenizer: "don't" is indexed
    /// as the two tokens `don` and `t`, so the query must ask for both rather
    /// than the single token `dont` the index does not hold.
    #[test]
    fn punctuated_words_split_the_way_the_tokenizer_splits_them() {
        assert_eq!(fts_match_expression("don't stop"), r#""don"* "t"* "stop"*"#);
    }

    #[test]
    fn punctuation_only_input_produces_an_empty_expression() {
        assert_eq!(fts_match_expression("  \"*-^()  "), "");
        assert_eq!(fts_match_expression(""), "");
    }

    /// Diacritics pass through untouched — `remove_diacritics 2` folds them at
    /// query time, so both "beyoncé" and "beyonce" must reach FTS5 as-is.
    #[test]
    fn diacritics_survive_into_the_expression() {
        assert_eq!(fts_match_expression("beyoncé"), r#""beyoncé"*"#);
    }
}
