//! `share:*` — share links out, shared content back in.
//!
//! Four channels, ported from `apps/desktop/src/main/ipc/share.ts`, plus the
//! `share:deep-link` **event** that [`crate::events::ShareDeepLink`] declares —
//! it travels the other way, so it is not a command and is not registered here.
//!
//! # The assembly is here because it was there
//!
//! v1's handler mixed two jobs: assembling a payload from the library, and
//! talking to the API. `shiranami-integrations` owns the second
//! ([`ShareClient`]); the first is in [`assembly`], because resolving a track
//! with no cached mapping runs a yt-dlp search, and `shiranami-downloader` sits
//! *beside* integrations at rank 3 rather than below it. The command layer is
//! the only place both are reachable — which is exactly the position v1's
//! handler was in, without the ranks being written down.
//!
//! [`ShareClient`]: shiranami_integrations::share::ShareClient
//!
//! # Three of the four returns are opaque, and that is decision D25
//!
//! `packages/contracts`'s share schemas stay hand-written TypeScript: the NestJS
//! server validates inbound requests with them and the paused Expo app imports
//! them. So the DTOs in `shiranami-integrations::share` deliberately do **not**
//! derive `specta::Type`, and the renderer keeps compiling against its own zod
//! types. [`Json`] is what crosses the boundary, which types as `unknown` and
//! leaves the shape where D25 put it.
//!
//! That is a widening only on paper. `share:track` and `share:playlist` were
//! *already* untyped in v1 — the create response is passed through verbatim so
//! an additive server field cannot break the desktop — and `share:import` is
//! still validated here before it is handed on; what changes is only where the
//! TypeScript type comes from.
//!
//! # Validation
//!
//! v1's tuples were `[uuid]`, `[uuid]`, `[nonEmpty]` and `[uuid, nonEmpty]`.
//! serde gives the arity and the types; the id shape is semantic and is
//! re-raised as `BAD_REQUEST` by [`uuid_shaped`]. The share **code** needs no
//! check here — `ShareClient::import` refuses anything outside the nanoid
//! alphabet, under the same code, before it interpolates it into a path.

pub(crate) mod assembly;
#[cfg(test)]
pub(crate) mod loopback;
#[cfg(test)]
pub(crate) mod search;

use shiranami_db::repo::{playlist_tracks, playlists, tracks, youtube_mappings};
use shiranami_downloader::search::SearchService;
use shiranami_integrations::share::{CreateShareRequest, ShareClient, ShareError};
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request, not_booted};
use crate::state::AppState;
use crate::wire::Json;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::share::share_track,
                crate::commands::share::share_playlist,
                crate::commands::share::share_import,
                crate::commands::share::share_cache_youtube_id,
            ]
        }
    };
}
pub(crate) use commands;

/// `share:track` — create a share link for one track.
#[tauri::command]
#[specta::specta]
pub async fn share_track(state: State<'_, AppState>, track_id: String) -> CommandResult<Json> {
    let search = search(&state)?;
    track_share(&state, search, &client(&state), &track_id).await
}

/// [`share_track`]'s whole body, with the API client passed in.
///
/// Split for the same reason `weather`'s `validate_query` is: it makes the
/// orchestration reachable from a test that points the client at a loopback
/// server, rather than leaving everything past the argument check unexercised.
/// The command above is then the wiring — which client, which search service —
/// and nothing else.
async fn track_share(
    state: &AppState,
    search: &SearchService,
    client: &ShareClient,
    track_id: &str,
) -> CommandResult<Json> {
    uuid_shaped(track_id, "track id")?;

    let track = {
        let mut conn = state.conn().await?;
        tracks::get(&mut conn, track_id).await.wire()?
    }
    .ok_or(ShareError::TrackNotFound)
    .wire()?;

    tracing::info!(title = %track.title, "sharing a track");

    let youtube_id = assembly::resolve_youtube_id(state, search, track_id)
        .await?
        .ok_or(ShareError::NoYoutubeMatch)
        .wire()?;

    let request = CreateShareRequest::Track {
        payload: assembly::track_payload(&track, youtube_id),
    };

    create(client, &request).await
}

/// `share:playlist` — create a share link for a playlist.
///
/// Tracks with no YouTube match are dropped rather than failing the share; see
/// [`assembly::share_tracks`]. The share fails only when **none** of them
/// matched, which is a different code the renderer translates differently.
#[tauri::command]
#[specta::specta]
pub async fn share_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
) -> CommandResult<Json> {
    let search = search(&state)?;
    playlist_share(&state, search, &client(&state), &playlist_id).await
}

/// [`share_playlist`]'s whole body, with the API client passed in. See
/// [`track_share`] for why the split exists.
async fn playlist_share(
    state: &AppState,
    search: &SearchService,
    client: &ShareClient,
    playlist_id: &str,
) -> CommandResult<Json> {
    uuid_shaped(playlist_id, "playlist id")?;

    // One read for both, then the connection is released for the searches.
    let (playlist, ordered) = {
        let mut conn = state.conn().await?;
        let playlist = playlists::get(&mut conn, playlist_id).await.wire()?;
        let ordered = playlist_tracks::get_tracks(&mut conn, playlist_id)
            .await
            .wire()?;
        (playlist, ordered)
    };

    let playlist = playlist.ok_or(ShareError::PlaylistNotFound).wire()?;
    if ordered.is_empty() {
        return Err(ShareError::PlaylistEmpty).wire();
    }

    let matched = assembly::share_tracks(state, search, &ordered).await?;
    tracing::info!(
        name = %playlist.name,
        matched = matched.len(),
        of = ordered.len(),
        "sharing a playlist"
    );

    if matched.is_empty() {
        return Err(ShareError::NoMatchesForAnyTrack).wire();
    }

    let request = CreateShareRequest::Playlist {
        payload: assembly::playlist_payload(playlist.name, matched),
    };

    create(client, &request).await
}

/// `share:import` — fetch shared content by its code.
///
/// The response is **untrusted network input** that the renderer reads field by
/// field, so the client validates its bounds before it is handed on: a title of
/// 50 MB or an `expiresAt` of `<script>` deserializes fine and must not reach
/// the import UI as a lying type.
#[tauri::command]
#[specta::specta]
pub async fn share_import(state: State<'_, AppState>, code: String) -> CommandResult<Json> {
    import_share(&client(&state), &code).await
}

/// [`share_import`]'s whole body, with the API client passed in.
async fn import_share(client: &ShareClient, code: &str) -> CommandResult<Json> {
    let imported = client.import(code).await.wire()?;

    // Re-encoding a value that deserialized from JSON a moment ago cannot fail
    // in practice; it is mapped rather than unwrapped because a command layer
    // that panics takes the webview down with it.
    serde_json::to_value(&imported)
        .map(Json)
        .map_err(|error| bad_request(format!("the share response could not be re-encoded: {error}")))
}

/// `share:cache-youtube-id` — record a YouTube id resolved elsewhere.
///
/// Called after a download that came from a search, so the next share of that
/// track skips yt-dlp entirely. Returns nothing, as v1 did.
#[tauri::command]
#[specta::specta]
pub async fn share_cache_youtube_id(
    state: State<'_, AppState>,
    track_id: String,
    youtube_id: String,
) -> CommandResult<()> {
    uuid_shaped(&track_id, "track id")?;
    non_empty(&youtube_id, "youtube id")?;

    let mut conn = state.conn().await?;
    youtube_mappings::upsert(&mut conn, &track_id, &youtube_id)
        .await
        .wire()
}

/// POST the body and hand the server's answer back verbatim.
///
/// Unvalidated on the way out by design: the create response is our own server
/// echoing a code back, and a typed struct here would turn an additive
/// server-side field into a desktop failure. The *outbound* body is validated,
/// inside `ShareClient::create`, because that is where drift between this side
/// and the server's schema would otherwise surface as an opaque 400.
async fn create(client: &ShareClient, request: &CreateShareRequest) -> CommandResult<Json> {
    client.create(request).await.map(Json).wire()
}

/// A client against the API this build talks to.
///
/// Constructed per call rather than held in [`AppState`]: it is a `reqwest`
/// handle and a base string with no cache behind it, unlike the weather service.
/// The base is fixed at **build** time (`debug_assertions`), never from an
/// environment variable, so a release bundle cannot be talked into pointing at
/// localhost.
fn client(state: &AppState) -> ShareClient {
    ShareClient::new(state.http().clone())
}

/// The search service, or an `INTERNAL` naming it.
fn search<'state>(state: &'state State<'_, AppState>) -> CommandResult<&'state SearchService> {
    state
        .deferred()
        .search
        .as_deref()
        .ok_or_else(|| not_booted("the YouTube search service"))
}

/// v1's `z.string().uuid()` on the three id arguments.
///
/// Deliberately looser than zod's regex, which additionally pins the version
/// nibble to `1-5` and the variant nibble to `89ab`. Every id these channels
/// receive was minted by this app's own `Uuid::new_v4()`, so the extra
/// constraint can only ever *refuse* a legitimate stored id — and the cost of
/// accepting a malformed one is a lookup that misses, which is already a
/// handled outcome. What the check is actually for is preserving v1's
/// `BAD_REQUEST`: without it a garbage id would answer `share.track_not_found`,
/// a different code the renderer translates differently.
/// v1's `z.string().min(1)` on the `youtubeId` argument.
fn non_empty(value: &str, what: &str) -> CommandResult<()> {
    if value.is_empty() {
        return Err(bad_request(format!("the {what} must not be empty")));
    }
    Ok(())
}

fn uuid_shaped(value: &str, what: &str) -> CommandResult<()> {
    let shaped = value.len() == 36
        && value.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        });

    if shaped {
        Ok(())
    } else {
        Err(bad_request(format!("the {what} must be a UUID")))
    }
}

#[cfg(test)]
mod tests;
