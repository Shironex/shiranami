//! Turning library rows into a share payload.
//!
//! This is the half of v1's `ipc/share.ts` that is **not** an HTTP client, and
//! it is here rather than in `shiranami-integrations` because it reaches
//! `shiranami-downloader` for the yt-dlp search — a crate that sits *beside*
//! integrations at rank 3, so integrations may not depend on it. v1 had the same
//! split for the same reason, without the ranks being written down.
//!
//! # The ordering and the omission live in this loop, on purpose
//!
//! `repo::youtube_mappings` returns a `HashMap` and nothing else. v1 never wrote
//! a SQL join against that table: every place a mapping met a track, it met it
//! through a JavaScript `Map` built from a bulk `IN (…)` read, and two
//! observable behaviours lived in the loop that consumed it —
//!
//! - a shared playlist keeps its **`position` order**, and
//! - a track with no mapping is **silently omitted** rather than erroring the
//!   payload.
//!
//! A join would move both into the query, where this layer could no longer make
//! them, and would change the order the server has been receiving since the
//! feature shipped. So the repository answers "which of these tracks have a
//! mapping" and [`playlist_payload`] does what v1's `for` loop did.
//!
//! # Never hold the connection across a search
//!
//! The pool has one connection (Phase 6) and a yt-dlp search is a child process
//! that takes seconds. [`resolve_youtube_id`] therefore reads, **drops the
//! connection**, searches, and re-acquires only to write the mapping. Holding it
//! through the search would stall every query in the app for the length of a
//! playlist share.
//!
//! # A repeated track searches once
//!
//! The bulk prefetch happens before the loop, so a playlist holding the same
//! track twice has no entry for the second occurrence. v1's per-track fallback
//! re-read the cache before searching, which is what made the second occurrence
//! a cache hit against the row the first one had just written. That re-read is
//! preserved — it looks redundant beside the prefetch and it is not.

use std::collections::HashMap;

use shiranami_core::UNKNOWN_ARTIST;
use shiranami_core::models::Track;
use shiranami_db::repo::{tracks, youtube_mappings};
use shiranami_downloader::search::SearchService;
use shiranami_integrations::share::{PlaylistPayload, TrackPayload};
use tokio_util::sync::CancellationToken;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// The payload for one shared track.
///
/// `artist` collapses to `UNKNOWN_ARTIST` because the share contract requires a
/// non-empty string and v1 wrote `track.artist ?? UNKNOWN_ARTIST` here. Note
/// that the *search query* built below does **not** collapse it — v1 used
/// `?? ''` there, so an untagged track is searched by title alone rather than by
/// title plus the words "Unknown Artist".
pub(crate) fn track_payload(track: &Track, yt_id: String) -> TrackPayload {
    TrackPayload {
        title: track.title.clone(),
        artist: track
            .artist
            .clone()
            .unwrap_or_else(|| UNKNOWN_ARTIST.to_owned()),
        yt_id,
    }
}

/// v1's search query: `` `${track.title} ${track.artist ?? ''}`.trim() ``.
///
/// The `?? ''` is not the `?? UNKNOWN_ARTIST` two lines up, and the difference
/// is observable — searching YouTube for "Song Unknown Artist" finds different
/// videos from searching for "Song".
pub(crate) fn search_query(track: &Track) -> String {
    format!("{} {}", track.title, track.artist.as_deref().unwrap_or(""))
        .trim()
        .to_owned()
}

/// v1's `getYoutubeId`: cache, then a search, then cache the answer.
///
/// `Ok(None)` is "no match", which is not an error — the caller decides whether
/// that ends the share (a single track) or merely drops one entry (a playlist).
/// A search that fails outright is also `Ok(None)`: v1 wrapped the whole thing
/// in a `try/catch` returning `null`, so an absent yt-dlp and a video-less query
/// were the same answer, and the renderer's message is the same either way.
pub(crate) async fn resolve_youtube_id(
    state: &AppState,
    search: &SearchService,
    track_id: &str,
) -> CommandResult<Option<String>> {
    // One short read: the cache, and the row to search for if it misses. The
    // block is what releases the connection — `AppState::conn` is the crate's
    // only acquire site precisely so that "is one held across this await?" is a
    // question about scope rather than about discipline.
    let track = {
        let mut conn = state.conn().await?;

        if let Some(cached) = youtube_mappings::get_for_track(&mut conn, track_id)
            .await
            .wire()?
        {
            tracing::debug!(track_id, "youtube id cache hit");
            return Ok(Some(cached));
        }

        match tracks::get(&mut conn, track_id).await.wire()? {
            Some(track) => track,
            None => return Ok(None),
        }
    };

    // Released above, before a child process runs for seconds.
    let Some(youtube_id) = first_match(search, &search_query(&track)).await else {
        return Ok(None);
    };

    let mut conn = state.conn().await?;
    youtube_mappings::upsert(&mut conn, track_id, &youtube_id)
        .await
        .wire()?;

    Ok(Some(youtube_id))
}

/// The first search result's id, or `None`.
///
/// v1 ran `ytsearch1:` and read `.id` off the first JSON line, treating a
/// non-zero exit, empty output, a missing `id` and a thrown error alike as
/// `null`. The id is checked for emptiness because the parser defaults an
/// absent `id` to `""`, which is v1's falsy `!youtubeId` test.
async fn first_match(search: &SearchService, query: &str) -> Option<String> {
    let results = match search.search(query, &CancellationToken::new()).await {
        Ok(results) => results,
        Err(error) => {
            tracing::error!(%error, query, "youtube search failed");
            return None;
        }
    };

    results
        .first()
        .map(|result| result.id.clone())
        .filter(|id| !id.is_empty())
}

/// Every track that resolved to a YouTube id, in the order given.
///
/// **The loop the module docs are about.** Order is the caller's — for a
/// playlist that is `position` order, which `repo::playlist_tracks::get_tracks`
/// has already applied — and a track that resolves to nothing is dropped rather
/// than failing the share.
pub(crate) async fn share_tracks(
    state: &AppState,
    search: &SearchService,
    ordered: &[Track],
) -> CommandResult<Vec<TrackPayload>> {
    let cached = prefetch(state, ordered).await?;
    let mut payloads = Vec::with_capacity(ordered.len());

    for track in ordered {
        // The prefetched hit first, then v1's per-track fallback — which
        // re-reads the cache, so a track appearing twice searches once.
        let resolved = match cached.get(&track.id) {
            Some(hit) => Some(hit.clone()),
            None => resolve_youtube_id(state, search, &track.id).await?,
        };

        // The silent omission. A share of forty tracks where two have no
        // YouTube match is a share of thirty-eight, not a failure.
        if let Some(youtube_id) = resolved {
            payloads.push(track_payload(track, youtube_id));
        }
    }

    Ok(payloads)
}

/// The bulk cache read that lets an already-shared playlist skip every search.
async fn prefetch(state: &AppState, ordered: &[Track]) -> CommandResult<HashMap<String, String>> {
    let ids: Vec<String> = ordered.iter().map(|track| track.id.clone()).collect();

    let mut conn = state.conn().await?;
    youtube_mappings::get_many(&mut conn, &ids).await.wire()
}

/// The whole playlist payload.
pub(crate) fn playlist_payload(name: String, tracks: Vec<TrackPayload>) -> PlaylistPayload {
    PlaylistPayload { name, tracks }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::models::TrackCreateInput;

    fn track(id: &str, title: &str, artist: Option<&str>) -> Track {
        Track {
            id: id.to_owned(),
            file_path: format!("/music/{id}.mp3"),
            title: title.to_owned(),
            artist: artist.map(str::to_owned),
            album_artist: None,
            album: None,
            duration: None,
            genre: None,
            year: None,
            track_number: None,
            disc_number: None,
            album_art: None,
            loudness_lufs: None,
            bpm: None,
            musical_key: None,
            is_favorite: None,
            play_count: None,
            created_at: "2026-08-01T00:00:00.000Z".to_owned(),
            updated_at: "2026-08-01T00:00:00.000Z".to_owned(),
            album_loudness_lufs: None,
            true_peak_db: None,
            loudness_range: None,
        }
    }

    pub(crate) fn input(file_path: &str, title: &str, artist: Option<&str>) -> TrackCreateInput {
        TrackCreateInput {
            file_path: file_path.to_owned(),
            title: title.to_owned(),
            artist: artist.map(str::to_owned),
            ..TrackCreateInput::default()
        }
    }

    /// The two artist fallbacks differ, and the difference is not a typo: the
    /// payload must carry a non-empty artist for the server's schema, while the
    /// search query must not search for the words "Unknown Artist".
    #[test]
    fn an_untagged_artist_falls_back_differently_in_the_payload_and_the_query() {
        let untagged = track("t1", "Song", None);

        assert_eq!(
            track_payload(&untagged, "yt1".to_owned()).artist,
            UNKNOWN_ARTIST
        );
        assert_eq!(
            search_query(&untagged),
            "Song",
            "v1 used `?? ''` here, so an untagged track is searched by title alone"
        );
    }

    #[test]
    fn a_tagged_track_searches_for_title_and_artist() {
        assert_eq!(
            search_query(&track("t1", "Song", Some("Artist"))),
            "Song Artist"
        );
    }

    /// v1 trimmed the joined query, so a track with a blank artist tag does not
    /// send a trailing space to yt-dlp.
    #[test]
    fn the_query_is_trimmed_the_way_v1_trimmed_it() {
        assert_eq!(search_query(&track("t1", "Song", Some(""))), "Song");
        assert_eq!(search_query(&track("t1", "  Song  ", None)), "Song");
    }

    #[test]
    fn the_payload_keeps_the_wire_field_names() {
        let payload = track_payload(&track("t1", "Song", Some("Artist")), "yt1".to_owned());
        let wire = serde_json::to_value(&payload).expect("serialize");

        assert_eq!(wire["title"], "Song");
        assert_eq!(wire["artist"], "Artist");
        assert_eq!(wire["ytId"], "yt1", "the wire field is camelCase");
    }

    // ── the loop, over a real database and a scripted yt-dlp ─────────────────

    use crate::commands::share::search::{ScriptedYtDlp, scripted_search};
    use crate::state::tests::state_over;

    /// Insert `count` tracks and return them in insertion order.
    async fn seeded(state: &AppState, titles: &[&str]) -> Vec<Track> {
        let mut conn = state.conn().await.expect("acquire");
        let mut rows = Vec::new();
        for (index, title) in titles.iter().enumerate() {
            rows.push(
                tracks::add(
                    &mut conn,
                    &input(&format!("/music/{index}.mp3"), title, Some("A")),
                )
                .await
                .expect("insert")
                .expect("a row"),
            );
        }
        rows
    }

    async fn cache(state: &AppState, track_id: &str, youtube_id: &str) {
        let mut conn = state.conn().await.expect("acquire");
        youtube_mappings::upsert(&mut conn, track_id, youtube_id)
            .await
            .expect("cache the mapping");
    }

    /// **The ordering half.** The payload follows the order it was handed, not
    /// the order the cache read happened to return — `get_many` answers with a
    /// `HashMap`, whose iteration order is deliberately unspecified.
    #[tokio::test]
    async fn the_payload_keeps_the_order_it_was_given() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["First", "Second", "Third"]).await;
        for (index, row) in rows.iter().enumerate() {
            cache(&state, &row.id, &format!("yt{index}")).await;
        }

        let (search, _script) = scripted_search(ScriptedYtDlp::never_called());
        let payloads = share_tracks(&state, &search, &rows)
            .await
            .expect("assembly");

        let titles: Vec<&str> = payloads.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, vec!["First", "Second", "Third"]);
        let ids: Vec<&str> = payloads.iter().map(|p| p.yt_id.as_str()).collect();
        assert_eq!(ids, vec!["yt0", "yt1", "yt2"]);
    }

    /// …including when the order given is not the order the rows were created
    /// in, which is what `position` ordering produces for a reordered playlist.
    #[tokio::test]
    async fn a_reordered_playlist_keeps_its_position_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["First", "Second", "Third"]).await;
        for (index, row) in rows.iter().enumerate() {
            cache(&state, &row.id, &format!("yt{index}")).await;
        }

        let reordered = vec![rows[2].clone(), rows[0].clone(), rows[1].clone()];
        let (search, _script) = scripted_search(ScriptedYtDlp::never_called());
        let payloads = share_tracks(&state, &search, &reordered)
            .await
            .expect("assembly");

        let titles: Vec<&str> = payloads.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, vec!["Third", "First", "Second"]);
    }

    /// **The omission half.** A track that resolves to nothing is dropped, and
    /// the rest of the payload is unaffected — a share of three tracks where one
    /// has no YouTube match is a share of two, not a failure. The surviving
    /// entries keep their relative order.
    #[tokio::test]
    async fn a_track_with_no_youtube_match_is_silently_omitted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["First", "Second", "Third"]).await;
        cache(&state, &rows[0].id, "yt0").await;
        cache(&state, &rows[2].id, "yt2").await;

        // The uncached middle track searches and finds nothing.
        let (search, script) = scripted_search(ScriptedYtDlp::finding_nothing());
        let payloads = share_tracks(&state, &search, &rows)
            .await
            .expect("assembly does not fail on a miss");

        let titles: Vec<&str> = payloads.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, vec!["First", "Third"]);
        assert_eq!(script.queries(), vec!["Second A"], "only the miss searched");
    }

    /// The prefetch is what keeps an already-shared playlist off yt-dlp
    /// entirely. Asserted by counting searches, because the payload is identical
    /// either way and a lost prefetch would only show up as a slow share.
    #[tokio::test]
    async fn a_fully_cached_playlist_runs_no_search_at_all() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["First", "Second"]).await;
        for (index, row) in rows.iter().enumerate() {
            cache(&state, &row.id, &format!("yt{index}")).await;
        }

        let (search, script) = scripted_search(ScriptedYtDlp::never_called());
        share_tracks(&state, &search, &rows)
            .await
            .expect("assembly");

        assert_eq!(script.queries().len(), 0);
    }

    /// A resolved search is written back, so the next share of the same track
    /// is a cache hit. This is the write half of `getYoutubeId`.
    #[tokio::test]
    async fn a_resolved_search_is_cached_for_the_next_share() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["Only"]).await;

        let (search, script) = scripted_search(ScriptedYtDlp::finding("found-id"));
        let first = share_tracks(&state, &search, &rows)
            .await
            .expect("assembly");
        assert_eq!(first[0].yt_id, "found-id");

        let second = share_tracks(&state, &search, &rows)
            .await
            .expect("assembly");
        assert_eq!(second[0].yt_id, "found-id");
        assert_eq!(
            script.queries().len(),
            1,
            "the second share read the mapping the first one wrote"
        );
    }

    /// The redundant-looking re-read inside `resolve_youtube_id`. The bulk
    /// prefetch ran before the loop, so the second occurrence of a repeated
    /// track is not in the map — only the per-track cache check makes it a hit
    /// against the row the first occurrence just wrote.
    #[tokio::test]
    async fn a_track_repeated_in_one_playlist_searches_once() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["Twice"]).await;
        let repeated = vec![rows[0].clone(), rows[0].clone()];

        let (search, script) = scripted_search(ScriptedYtDlp::finding("found-id"));
        let payloads = share_tracks(&state, &search, &repeated)
            .await
            .expect("assembly");

        assert_eq!(payloads.len(), 2, "both occurrences are in the payload");
        assert_eq!(script.queries().len(), 1, "and only one search ran");
    }

    /// A search that fails outright is a miss, not an error: v1 wrapped the
    /// whole of `getYoutubeId` in a `try/catch` returning `null`, so an absent
    /// yt-dlp and a query with no results were the same answer.
    #[tokio::test]
    async fn a_failing_search_is_a_miss_rather_than_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["Only"]).await;

        let (search, _script) = scripted_search(ScriptedYtDlp::failing());
        let payloads = share_tracks(&state, &search, &rows)
            .await
            .expect("a failed search does not fail the assembly");

        assert!(payloads.is_empty());
    }

    /// yt-dlp's parser defaults an absent `id` to `""`, which is v1's falsy
    /// `!youtubeId` test — an entry with no id is a miss, not an empty `ytId`
    /// on the wire, which the server's schema would refuse.
    #[tokio::test]
    async fn a_result_with_a_blank_id_is_a_miss() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let rows = seeded(&state, &["Only"]).await;

        let (search, _script) = scripted_search(ScriptedYtDlp::finding(""));
        let payloads = share_tracks(&state, &search, &rows)
            .await
            .expect("assembly");

        assert!(payloads.is_empty());
    }

    /// A track id with no row resolves to nothing rather than erroring — v1's
    /// `if (!track) return null`.
    #[tokio::test]
    async fn an_unknown_track_id_resolves_to_nothing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let (search, _script) = scripted_search(ScriptedYtDlp::never_called());
        let resolved = resolve_youtube_id(&state, &search, "no-such-track")
            .await
            .expect("a missing row is not an error");

        assert_eq!(resolved, None);
    }
}
