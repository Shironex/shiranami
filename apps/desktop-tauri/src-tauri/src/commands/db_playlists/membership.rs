//! The seven `db:playlists:*` channels that operate on membership.
//!
//! The other half of [`super`], split along the line `shiranami-db` already
//! drew between `repo::playlists` and `repo::playlist_tracks`. Every command
//! here delegates into the latter; the transactions, the chunk sizes, the
//! de-duplication and the set-based reorder were settled in Phase 7.
//!
//! # Five channels take one object, and that is v1's call shape
//!
//! `add-track`, `add-tracks`, `remove-track`, `remove-tracks` and `reorder` were
//! each `z.tuple([{ playlistId, … }])` — the preload took two positional
//! arguments and packed them into a single object before invoking. So
//! [`PlaylistTrackPair`] and [`PlaylistTracksBatch`] are parameters here rather
//! than pairs of scalars, exactly as `weather:get-current` takes one
//! `Coordinates`: the shim forwards the renderer's argument through, and
//! splitting it would change the call shape at every one of those call sites for
//! no benefit. `get-playlists-for-tracks` is the exception and really did take a
//! bare array.
//!
//! # `add-track` returns `{ id }`, and the two shapes it collapses
//!
//! v1's handler had two branches that returned *different* shapes: the
//! already-present branch selected `{ id }` alone, the insert branch returned
//! the whole membership row. `preload-api.ts` types the channel as
//! `Promise<{ id: string }>` — the narrower of the two, and the only field any
//! caller ever read. The repository normalises to the id and this module wraps
//! it back into [`PlaylistTrackRef`], so the declared contract is what crosses
//! rather than whichever branch happened to run.
//!
//! # Behaviours that live in the repository and must not be re-implemented
//!
//! - `add_track` is idempotent on `(playlist_id, track_id)` and yields the
//!   *existing* membership id on a repeat, writing nothing.
//! - `add_tracks` de-duplicates against both the current membership and the
//!   incoming list, then assigns positions from the current maximum in input
//!   order — the base computed once, which is what stops N serial adds from
//!   interleaving.
//! - `reorder` rewrites `position` only; membership row ids are preserved, so
//!   nothing holding one goes stale. Ids not in the playlist are simply not
//!   matched by the `WHERE`.
//! - `get_playlists_for_tracks` returns the playlists containing **every** one
//!   of the ids, not any of them, and is not chunked — the `HAVING` counts over
//!   the whole set, so splitting it would change the answer rather than just the
//!   statement count.
//! - `get_tracks` orders on `position` with no tie-break: two rows can only
//!   share one after a partial reorder, and v1 left that to the planner too.

use shiranami_core::models::Track;
use shiranami_db::repo::playlist_tracks;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// One playlist and one track — the argument `add-track` and `remove-track`
/// take.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistTrackPair {
    /// The playlist.
    pub playlist_id: String,
    /// The track.
    pub track_id: String,
}

/// One playlist and many tracks — the argument `add-tracks`, `remove-tracks`
/// and `reorder` take.
///
/// One struct for three channels because v1's zod was one `playlistTracksBatch`
/// object reused across `add-tracks` and `remove-tracks`, with `reorder`'s
/// declared inline and structurally identical.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistTracksBatch {
    /// The playlist.
    pub playlist_id: String,
    /// The tracks, in the order the operation gives them meaning.
    pub track_ids: Vec<String>,
}

/// A membership row's id — what `add-track` resolves to.
///
/// A struct rather than a bare string because `preload-api.ts` declares
/// `Promise<{ id: string }>`; see the module docs for the two v1 branches this
/// collapses.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct PlaylistTrackRef {
    /// The `playlist_tracks` row's primary key.
    pub id: String,
}

/// `db:playlists:get-tracks` — a playlist's tracks, in playlist order.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_get_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    playlist_tracks::get_tracks(&mut conn, &playlist_id)
        .await
        .wire()
}

/// `db:playlists:add-track` — append one track, idempotently.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_add_track(
    state: State<'_, AppState>,
    data: PlaylistTrackPair,
) -> CommandResult<PlaylistTrackRef> {
    let mut conn = state.conn().await?;
    let id = playlist_tracks::add_track(&mut conn, &data.playlist_id, &data.track_id)
        .await
        .wire()?;

    Ok(PlaylistTrackRef { id })
}

/// `db:playlists:add-tracks` — append a batch, skipping the ones already there.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_add_tracks(
    state: State<'_, AppState>,
    data: PlaylistTracksBatch,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    playlist_tracks::add_tracks(&mut conn, &data.playlist_id, &data.track_ids)
        .await
        .wire()
}

/// `db:playlists:remove-track` — remove one track from a playlist.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_remove_track(
    state: State<'_, AppState>,
    data: PlaylistTrackPair,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    playlist_tracks::remove_track(&mut conn, &data.playlist_id, &data.track_id)
        .await
        .wire()
}

/// `db:playlists:remove-tracks` — remove a batch from a playlist.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_remove_tracks(
    state: State<'_, AppState>,
    data: PlaylistTracksBatch,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    playlist_tracks::remove_tracks(&mut conn, &data.playlist_id, &data.track_ids)
        .await
        .wire()
}

/// `db:playlists:get-playlists-for-tracks` — which playlists hold *every* one
/// of these tracks.
///
/// The one channel in this namespace that takes a bare array rather than an
/// object, because v1's tuple did.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_get_playlists_for_tracks(
    state: State<'_, AppState>,
    track_ids: Vec<String>,
) -> CommandResult<Vec<String>> {
    let mut conn = state.conn().await?;
    playlist_tracks::get_playlists_for_tracks(&mut conn, &track_ids)
        .await
        .wire()
}

/// `db:playlists:reorder` — rewrite a playlist's order to match the sequence.
#[tauri::command]
#[specta::specta]
pub async fn db_playlists_reorder(
    state: State<'_, AppState>,
    data: PlaylistTracksBatch,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    playlist_tracks::reorder(&mut conn, &data.playlist_id, &data.track_ids)
        .await
        .wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::models::{PlaylistCreateInput, TrackCreateInput};
    use shiranami_db::repo::{playlists, tracks};
    use sqlx::Sqlite;
    use sqlx::pool::PoolConnection;
    use std::time::Duration;

    /// A real temporary database holding one playlist and some seeded tracks.
    ///
    /// Every test below needs the same setup and the interesting part of each is
    /// what happens after it. The temp directory is owned here so it outlives
    /// the database file rather than being dropped at the end of a helper.
    struct Fixture {
        _dir: tempfile::TempDir,
        state: AppState,
        /// The playlist under test.
        playlist: String,
        /// Seeded track ids, in insertion order. Not yet members.
        tracks: Vec<String>,
    }

    async fn fixture(track_count: usize) -> Fixture {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let mut conn = state.conn().await.expect("acquire");

        let playlist = playlists::create(
            &mut conn,
            &PlaylistCreateInput {
                name: "Mix".to_owned(),
                ..PlaylistCreateInput::default()
            },
        )
        .await
        .expect("create the playlist")
        .expect("a row")
        .id;

        let mut seeded = Vec::with_capacity(track_count);
        for index in 0..track_count {
            let created = tracks::add(
                &mut conn,
                &TrackCreateInput {
                    file_path: format!("/music/{index}.mp3"),
                    title: format!("Track {index}"),
                    ..TrackCreateInput::default()
                },
            )
            .await
            .expect("seed a track")
            .expect("a row");
            seeded.push(created.id);
        }
        drop(conn);

        Fixture {
            _dir: dir,
            state,
            playlist,
            tracks: seeded,
        }
    }

    impl Fixture {
        async fn conn(&self) -> PoolConnection<Sqlite> {
            self.state.conn().await.expect("acquire")
        }

        /// Put every seeded track in the playlist, in insertion order.
        async fn fill(&self) {
            playlist_tracks::add_tracks(&mut *self.conn().await, &self.playlist, &self.tracks)
                .await
                .expect("fill the playlist");
        }

        /// The playlist's membership, as track ids, in playlist order.
        async fn order(&self) -> Vec<String> {
            playlist_tracks::get_tracks(&mut *self.conn().await, &self.playlist)
                .await
                .expect("read the membership")
                .into_iter()
                .map(|track| track.id)
                .collect()
        }
    }

    /// **The acquire-once discipline**, asserted the way `db:tracks` asserts it.
    ///
    /// Thirteen acquisitions run back to back over one `AppState`, each taking
    /// the pool's single connection and releasing it on return. Several of these
    /// commands open a *transaction* on that connection, which is the shape most
    /// likely to leak one — and a leak does not fail, it hangs, so the body runs
    /// under a timeout and the hang is reported as a named failure.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let fixture = fixture(2).await;

        let exercise = async {
            for _ in 0..13 {
                playlist_tracks::get_tracks(&mut *fixture.conn().await, &fixture.playlist)
                    .await
                    .expect("read");
            }

            fixture.fill().await;
            playlist_tracks::reorder(
                &mut *fixture.conn().await,
                &fixture.playlist,
                &fixture.tracks,
            )
            .await
            .expect("reorder");
            playlist_tracks::remove_tracks(
                &mut *fixture.conn().await,
                &fixture.playlist,
                &fixture.tracks,
            )
            .await
            .expect("remove");
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// The object argument five channels take, pinned against v1's zod. The shim
    /// forwards the renderer's object straight through, so a rename here is a
    /// silently undefined `playlistId` there.
    #[test]
    fn the_object_arguments_keep_v1s_key_names() {
        let pair: PlaylistTrackPair =
            serde_json::from_str(r#"{"playlistId":"p1","trackId":"t1"}"#).expect("v1's shape");
        let batch: PlaylistTracksBatch =
            serde_json::from_str(r#"{"playlistId":"p1","trackIds":["t1","t2"]}"#)
                .expect("v1's shape");

        assert_eq!(pair.playlist_id, "p1");
        assert_eq!(pair.track_id, "t1");
        assert_eq!(batch.playlist_id, "p1");
        assert_eq!(batch.track_ids, ["t1", "t2"]);
    }

    /// `preload-api.ts` declares `addTrack` as `Promise<{ id: string }>`, so the
    /// repository's bare id has to be wrapped rather than returned raw.
    #[test]
    fn add_track_resolves_to_an_object_carrying_the_membership_id() {
        let serialized = serde_json::to_string(&PlaylistTrackRef {
            id: "row-1".to_owned(),
        })
        .expect("serialize");

        assert_eq!(serialized, r#"{"id":"row-1"}"#);
    }

    /// v1's `db:playlists:add-track is idempotent on (playlist, track)` and
    /// `add-track does not duplicate an existing entry`, at the layer that wraps
    /// the id.
    #[tokio::test]
    async fn adding_the_same_track_twice_yields_the_existing_membership_id() {
        let fixture = fixture(1).await;
        let mut conn = fixture.conn().await;

        let first = playlist_tracks::add_track(&mut conn, &fixture.playlist, &fixture.tracks[0])
            .await
            .expect("add");
        let second = playlist_tracks::add_track(&mut conn, &fixture.playlist, &fixture.tracks[0])
            .await
            .expect("add again");
        drop(conn);

        assert_eq!(first, second, "the pre-existing row comes back");
        assert_eq!(fixture.order().await.len(), 1);
    }

    /// v1's `add-tracks appends in input order and is idempotent` plus
    /// `de-dups repeats within a single call`, which are one property seen from
    /// the command layer.
    #[tokio::test]
    async fn add_tracks_appends_in_input_order_and_never_duplicates() {
        let fixture = fixture(3).await;

        playlist_tracks::add_tracks(
            &mut *fixture.conn().await,
            &fixture.playlist,
            &fixture.tracks[..2],
        )
        .await
        .expect("first add");

        // The first two again, the third once, and a repeat inside this call.
        let mut second = fixture.tracks.clone();
        second.push(fixture.tracks[2].clone());
        playlist_tracks::add_tracks(&mut *fixture.conn().await, &fixture.playlist, &second)
            .await
            .expect("second add");

        assert_eq!(fixture.order().await, fixture.tracks);
    }

    /// v1's `reorder rewrites positions to match the supplied order`. Only
    /// `position` changes, so a reversal is observable purely as a read order.
    #[tokio::test]
    async fn reorder_rewrites_positions_to_match_the_supplied_order() {
        let fixture = fixture(3).await;
        fixture.fill().await;

        let reversed: Vec<String> = fixture.tracks.iter().rev().cloned().collect();
        playlist_tracks::reorder(&mut *fixture.conn().await, &fixture.playlist, &reversed)
            .await
            .expect("reorder");

        assert_eq!(fixture.order().await, reversed);
    }

    /// v1's `remove-tracks removes the supplied ids and leaves the rest`.
    #[tokio::test]
    async fn remove_tracks_leaves_the_ids_it_was_not_given() {
        let fixture = fixture(3).await;
        fixture.fill().await;

        playlist_tracks::remove_tracks(
            &mut *fixture.conn().await,
            &fixture.playlist,
            &fixture.tracks[..2],
        )
        .await
        .expect("remove");

        assert_eq!(fixture.order().await, [fixture.tracks[2].clone()]);
    }

    /// **Every**, not any. The playlist picker uses this to decide which
    /// playlists show as already containing the whole selection, so "holds two
    /// of three" qualifying would tick a box that is not true.
    #[tokio::test]
    async fn get_playlists_for_tracks_requires_every_track_not_any() {
        let fixture = fixture(2).await;
        fixture.fill().await;

        let mut conn = fixture.conn().await;
        let partial = playlists::create(
            &mut conn,
            &PlaylistCreateInput {
                name: "Partial".to_owned(),
                ..PlaylistCreateInput::default()
            },
        )
        .await
        .expect("create")
        .expect("a row");
        playlist_tracks::add_tracks(&mut conn, &partial.id, &fixture.tracks[..1])
            .await
            .expect("add");

        let holding = playlist_tracks::get_playlists_for_tracks(&mut conn, &fixture.tracks)
            .await
            .expect("read");

        assert_eq!(holding, [fixture.playlist.as_str()]);
    }

    /// An unknown playlist reads as an empty list rather than a rejection —
    /// v1 issued the same join and got no rows.
    #[tokio::test]
    async fn an_unknown_playlist_has_an_empty_membership_not_an_error() {
        let fixture = fixture(0).await;

        assert!(
            playlist_tracks::get_tracks(&mut *fixture.conn().await, "no-such-playlist")
                .await
                .expect("read")
                .is_empty()
        );
        assert!(
            playlist_tracks::get_playlists_for_tracks(&mut *fixture.conn().await, &[])
                .await
                .expect("read")
                .is_empty()
        );
    }
}
