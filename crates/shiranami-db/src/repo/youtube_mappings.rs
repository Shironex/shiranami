//! The `track_id → youtube_id` cache behind share links and RD-mix discovery.
//!
//! Unlike every other module here this backs **no** `db:*` channel. Phase 7
//! ported the 45 database channels and this table has none of them: v1 read and
//! wrote it inline from two consumers that own channels of their own —
//! `apps/desktop/src/main/ipc/share.ts` (three of the four query sites) and
//! `apps/desktop/src/main/services/recommendation-service.ts` (the other two).
//! Phase 14's prep note calls that gap out, because share-payload assembly is a
//! command-layer job in v2 exactly as it was in v1, and it cannot assemble
//! anything without these reads.
//!
//! # Why the shapes look like JavaScript
//!
//! v1 never wrote a SQL join against this table. Every place a mapping meets a
//! track or a playlist, it meets it through a JavaScript `Map` built from a
//! bulk `IN (…)` read, and the ordering and the drop-on-miss behaviour live in
//! the loop that consumes the map — not in the query. Those are observable:
//! a shared playlist keeps its `position` order, a track with no mapping is
//! **silently omitted** from the payload rather than erroring it, and the RD-mix
//! seeds are fetched strongest-first so the best seed's tracks win the dedupe.
//!
//! Introducing a join here would move all three decisions into SQL, where the
//! command layer can no longer make them, and would change the row order the
//! renderer has been receiving since the feature shipped. So the repository
//! returns the mapping and nothing else, and the command layer does what v1's
//! handler did.
//!
//! # `searched_at` holds two formats, and must keep holding both
//!
//! An insert takes the column's own `DEFAULT (datetime('now'))` —
//! `2026-08-01 12:34:56`. A conflicting insert took v1's
//! `new Date().toISOString()` — `2026-08-01T12:34:56.789Z`. Both spellings are
//! already on disk in every shipped library, and a v1 build can still be
//! reinstalled over this file for the length of the handover window, so
//! [`upsert`] reproduces the split rather than tidying it. See
//! [`crate::repo::clock`].

use std::collections::{HashMap, HashSet};

use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::clock::ISO_8601_NOW;
use crate::repo::conn::failed;

/// Track ids per `IN (…)` list. One bind each, matching v1's `share.ts`.
///
/// v1 chunked the share path at 500 and left the recommendation seed path
/// unchunked. That asymmetry is not a decision anyone made — seed sets are a
/// handful of tracks, so the missing chunk never bit — and the only input on
/// which the two differ is one large enough that the unchunked version raises
/// `SQLITE_MAX_VARIABLE_NUMBER` instead of answering. Reproducing a failure
/// mode is not port fidelity, so both paths chunk here. The rows returned are
/// identical either way.
const ID_CHUNK: usize = 500;

/// The YouTube id cached for this track, if one has ever been resolved.
///
/// v1 selected the whole row and read one column off it; the extra columns were
/// never used, so this reads the one the caller wants.
pub async fn get_for_track(conn: &mut SqliteConnection, track_id: &str) -> Result<Option<String>> {
    sqlx::query_scalar("SELECT youtube_id FROM youtube_mappings WHERE track_id = ?1")
        .bind(track_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("look up the cached YouTube id"))
}

/// The cached YouTube ids for these tracks, keyed by track id.
///
/// Tracks with no mapping are **absent from the map**, not present with a
/// sentinel — the callers branch on the miss, one into a `yt-dlp` search and one
/// into dropping the track from its result. A map rather than a list because
/// neither caller consumes these in database order: both walk their own ordered
/// track list and look each one up.
pub async fn get_many(
    conn: &mut SqliteConnection,
    track_ids: &[String],
) -> Result<HashMap<String, String>> {
    if track_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut cached = HashMap::with_capacity(track_ids.len());

    for chunk in track_ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT track_id, youtube_id FROM youtube_mappings WHERE track_id IN (",
        );
        let mut list = builder.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        builder.push(")");

        let rows = builder
            .build()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("read the cached YouTube ids"))?;

        for row in &rows {
            let track_id: String = row
                .try_get("track_id")
                .map_err(failed("read a YouTube mapping row"))?;
            let youtube_id: String = row
                .try_get("youtube_id")
                .map_err(failed("read a YouTube mapping row"))?;
            cached.insert(track_id, youtube_id);
        }
    }

    Ok(cached)
}

/// Every YouTube id the library has a mapping for.
///
/// Discovery subtracts this set from an RD mix so a shelf only surfaces music
/// the user does not already own. A set rather than a list because `youtube_id`
/// carries no `UNIQUE` constraint — two library tracks can legitimately resolve
/// to the same video, and v1 collapsed those through a JavaScript `Set`.
pub async fn all_youtube_ids(conn: &mut SqliteConnection) -> Result<HashSet<String>> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT youtube_id FROM youtube_mappings")
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the library's YouTube ids"))?;

    Ok(ids.into_iter().collect())
}

/// Cache the YouTube id resolved for a track, replacing any earlier answer.
///
/// The conflict target is `track_id`, the `UNIQUE` column — **not** the primary
/// key. A re-resolution therefore keeps the row's original `id` and replaces
/// only the video and the timestamp, which is what v1's two identical
/// `onConflictDoUpdate` call sites did. Nothing downstream reads that `id`, but
/// changing it would be a silent divergence from the rows already on disk.
///
/// The two `searched_at` formats are reproduced deliberately; see the module
/// docs.
pub async fn upsert(conn: &mut SqliteConnection, track_id: &str, youtube_id: &str) -> Result<()> {
    // Assembled rather than formatted into a literal so no code path here can
    // put a `String` where SQL text goes: the only non-literals are the three
    // binds. `ISO_8601_NOW` is a constant in this crate.
    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO youtube_mappings (id, track_id, youtube_id) VALUES (",
    );
    let mut values = builder.separated(", ");
    values.push_bind(Uuid::new_v4().to_string());
    values.push_bind(track_id.to_owned());
    values.push_bind(youtube_id.to_owned());
    builder.push(") ON CONFLICT (track_id) DO UPDATE SET youtube_id = excluded.youtube_id, ");
    builder.push("searched_at = ");
    builder.push(ISO_8601_NOW);

    builder
        .build()
        .execute(&mut *conn)
        .await
        .map_err(failed("cache the YouTube id"))?;

    Ok(())
}
