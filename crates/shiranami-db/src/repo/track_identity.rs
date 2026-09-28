//! Content identity: the import that lets a row follow its file, and the
//! backfill that gives old rows something to be followed by.
//!
//! Split out of [`tracks`](super::tracks) like the loudness and analysis
//! columns were (one file, one job) and re-exported there, so callers say
//! `tracks::import_many`.
//!
//! # The rule
//!
//! An incoming file whose `content_hash` equals an existing row's, where that
//! row's own file is **gone from disk**, is the same track at a new path. The
//! row is re-pointed (its `file_path` rewritten) instead of a second row being
//! inserted, so the id, play count, favourite flag, playlist membership, play
//! history, loudness, BPM, key, lyrics and everything else keyed on the id
//! stay where they are.
//!
//! - **A copy is not a move.** If the matching row's file still exists, the
//!   incoming file is a second copy and is inserted normally, carrying the
//!   same hash.
//! - **"Gone" is the caller's existence check**, passed in as `on_disk`. The
//!   command layer uses [`std::path::Path::exists`], the same "any failure is
//!   missing" check `library:validate-files` uses, so a row is re-pointable
//!   exactly when the rescan's validate step would otherwise have deleted it.
//!   It is only called on the few rows whose hash matched, so the stat calls
//!   made while the transaction is open are bounded by the matches, not the
//!   library.
//! - **Several missing rows can match** (two copies that both moved). The pick
//!   is deterministic: a row whose old file *name* equals the incoming one
//!   first (a folder move keeps names, so it beats an unrelated duplicate),
//!   then the oldest row (`created_at`, then `rowid`: the longest-lived row
//!   carries the most history). Each row is claimed at most once per import,
//!   so two moved copies re-point to two new files rather than one.
//! - **Everything happens in one transaction**: the candidate read, every
//!   re-point and every insert of the batch commit together or not at all.
//! - **Rows only.** Nothing here, or anywhere in this feature, deletes or
//!   touches a file on disk.
//!
//! # What a re-point writes
//!
//! `file_path`, and the one path-derived value: `title`, when it still equals
//! the old file's stem, which is v1's fallback for an untagged file
//! (`shiranami_metadata::read`). A title that differs from the stem came from a
//! tag or the metadata enricher and is kept. Nothing else is taken from the
//! incoming file, for the same reason a rescan never re-reads a known path:
//! enrichment and in-app edits live in the row. `updated_at` is left alone, as
//! every write in the tracks namespace leaves it: a move is not an edit.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use shiranami_core::models::{Track, TrackCreateInput};
use sqlx::{Connection, QueryBuilder, Sqlite, SqliteConnection};

use crate::error::Result;
use crate::repo::conn::failed;
use crate::repo::track_row;
use crate::repo::tracks::{ID_CHUNK, INSERT_CHUNK, NewRow, exists_many, insert_rows};

/// A track to import, with the content identity measured for its file.
#[derive(Debug, Clone)]
pub struct IdentifiedTrack {
    /// What the renderer sent.
    pub input: TrackCreateInput,
    /// `shiranami_library::identity::content_hash` of the file, or `None` when
    /// it could not be read (such a file is inserted and never matched).
    pub content_hash: Option<String>,
}

/// What an import did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Imported {
    /// Rows inserted, in input order. Paths already in the library are
    /// skipped, as `add_many` skips them.
    pub added: Vec<Track>,
    /// Existing rows re-pointed at a new path, in input order. Same ids as
    /// before the import.
    pub moved: Vec<Track>,
}

/// A row the backfill has yet to hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unhashed {
    /// The cursor for the next page.
    pub rowid: i64,
    /// The track.
    pub id: String,
    /// Where its file should be.
    pub file_path: String,
}

/// A row an incoming hash matched.
struct Candidate {
    id: String,
    file_path: String,
}

/// Import a batch, re-pointing moved rows instead of duplicating them.
///
/// The move-aware `add_many`: same skip-on-conflict contract for paths already
/// in the library, plus the rule in the module docs.
pub async fn import_many(
    conn: &mut SqliteConnection,
    incoming: &[IdentifiedTrack],
    on_disk: impl Fn(&str) -> bool,
) -> Result<Imported> {
    if incoming.is_empty() {
        return Ok(Imported::default());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the track import"))?;

    let hashes: Vec<String> = incoming
        .iter()
        .filter_map(|item| item.content_hash.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let candidates = candidates(&mut tx, &hashes).await?;

    // Paths a row already holds can never be re-pointed at, or the rewrite
    // would violate `UNIQUE (file_path)`; they fall through to the insert,
    // whose `ON CONFLICT` skips them.
    let mut taken: HashSet<String> = if candidates.is_empty() {
        HashSet::new()
    } else {
        let paths: Vec<String> = incoming
            .iter()
            .filter(|item| {
                item.content_hash
                    .as_ref()
                    .is_some_and(|hash| candidates.contains_key(hash))
            })
            .map(|item| item.input.file_path.clone())
            .collect();
        exists_many(&mut tx, &paths).await?.into_iter().collect()
    };

    let mut claimed: HashSet<&str> = HashSet::new();
    let mut moved = Vec::new();
    let mut to_insert: Vec<NewRow<'_>> = Vec::new();

    for item in incoming {
        let target = &item.input.file_path;
        let chosen = item
            .content_hash
            .as_ref()
            .filter(|_| !taken.contains(target))
            .and_then(|hash| candidates.get(hash))
            .and_then(|rows| choose(rows, target, &claimed, &on_disk));

        match chosen {
            Some(row) => {
                claimed.insert(row.id.as_str());
                taken.insert(target.clone());
                if let Some(track) = repoint(&mut tx, row, &item.input).await? {
                    moved.push(track);
                }
            }
            None => to_insert.push((&item.input, item.content_hash.as_deref())),
        }
    }

    let mut added = Vec::with_capacity(to_insert.len());
    for chunk in to_insert.chunks(INSERT_CHUNK) {
        added.extend(insert_rows(&mut tx, chunk).await?);
    }

    tx.commit().await.map_err(failed("import the tracks"))?;

    Ok(Imported { added, moved })
}

/// Import one track: the move-aware `add`.
///
/// Idempotent on `file_path` exactly as `add` is: a path already in the
/// library returns its existing row. Otherwise the row that landed, or the row
/// that was re-pointed (an existing id).
pub async fn import(
    conn: &mut SqliteConnection,
    incoming: &IdentifiedTrack,
    on_disk: impl Fn(&str) -> bool,
) -> Result<Option<Track>> {
    let imported = import_many(&mut *conn, std::slice::from_ref(incoming), on_disk).await?;
    if let Some(track) = imported.moved.into_iter().chain(imported.added).next() {
        return Ok(Some(track));
    }

    let existing = sqlx::query("SELECT tracks.* FROM tracks WHERE tracks.file_path = ?1")
        .bind(&incoming.input.file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the track that already holds this path"))?;

    existing.as_ref().map(track_row::track).transpose()
}

/// A page of rows with no content hash, in `rowid` order after `after_rowid`.
///
/// Keyset-paged so a backfill that cannot hash a row (its file is missing)
/// moves past it instead of reading it again on the next page.
pub async fn unhashed(
    conn: &mut SqliteConnection,
    after_rowid: i64,
    limit: i64,
) -> Result<Vec<Unhashed>> {
    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT rowid, id, file_path FROM tracks \
         WHERE content_hash IS NULL AND rowid > ?1 ORDER BY rowid LIMIT ?2",
    )
    .bind(after_rowid)
    .bind(limit)
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("read the tracks without a content hash"))?;

    Ok(rows
        .into_iter()
        .map(|(rowid, id, file_path)| Unhashed {
            rowid,
            id,
            file_path,
        })
        .collect())
}

/// Record measured hashes, returning how many rows took one.
///
/// Only a row still `NULL` is written: a hash the import stored in the
/// meantime (for a row re-pointed between the backfill's read and this write)
/// describes the file the row now names and must win. Like every measurement,
/// it does not touch `updated_at`.
pub async fn set_content_hashes(
    conn: &mut SqliteConnection,
    hashes: &[(String, String)],
) -> Result<u64> {
    if hashes.is_empty() {
        return Ok(0);
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin recording the content hashes"))?;

    let mut written = 0;
    for (id, hash) in hashes {
        written += sqlx::query(
            "UPDATE tracks SET content_hash = ?1 WHERE id = ?2 AND content_hash IS NULL",
        )
        .bind(hash)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(failed("record a content hash"))?
        .rows_affected();
    }

    tx.commit()
        .await
        .map_err(failed("record the content hashes"))?;

    Ok(written)
}

/// Every row carrying one of `hashes`, grouped by hash, oldest first.
async fn candidates(
    conn: &mut SqliteConnection,
    hashes: &[String],
) -> Result<HashMap<String, Vec<Candidate>>> {
    let mut grouped: HashMap<String, Vec<Candidate>> = HashMap::new();

    for chunk in hashes.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT content_hash, id, file_path FROM tracks WHERE content_hash IN (",
        );
        let mut list = builder.separated(", ");
        for hash in chunk {
            list.push_bind(hash.clone());
        }
        builder.push(") ORDER BY created_at ASC, rowid ASC");

        let rows: Vec<(String, String, String)> = builder
            .build_query_as()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("look up the tracks by content hash"))?;

        for (hash, id, file_path) in rows {
            grouped
                .entry(hash)
                .or_default()
                .push(Candidate { id, file_path });
        }
    }

    Ok(grouped)
}

/// The row an incoming file at `target` re-points, if any (see module docs).
fn choose<'a>(
    rows: &'a [Candidate],
    target: &str,
    claimed: &HashSet<&str>,
    on_disk: &impl Fn(&str) -> bool,
) -> Option<&'a Candidate> {
    let target_name = Path::new(target).file_name();
    let mut available = rows
        .iter()
        .filter(|row| !claimed.contains(row.id.as_str()) && !on_disk(&row.file_path));

    let first = available.next()?;
    if Path::new(&first.file_path).file_name() == target_name {
        return Some(first);
    }
    Some(
        available
            .find(|row| Path::new(&row.file_path).file_name() == target_name)
            .unwrap_or(first),
    )
}

/// Rewrite one row's path (and a path-derived title), returning the row.
async fn repoint(
    conn: &mut SqliteConnection,
    row: &Candidate,
    incoming: &TrackCreateInput,
) -> Result<Option<Track>> {
    let old_stem = Path::new(&row.file_path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();

    let updated = sqlx::query(
        "UPDATE tracks SET file_path = ?1, \
         title = CASE WHEN title = ?2 THEN ?3 ELSE title END \
         WHERE id = ?4 RETURNING *",
    )
    .bind(&incoming.file_path)
    .bind(old_stem)
    .bind(&incoming.title)
    .bind(&row.id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(failed("re-point a moved track"))?;

    tracing::info!(id = %row.id, "re-pointed a moved track at its new path");

    updated.as_ref().map(track_row::track).transpose()
}
