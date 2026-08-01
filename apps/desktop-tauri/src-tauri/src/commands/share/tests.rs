//! The share namespace over a real database and a real socket.
//!
//! Every test here drives the orchestration functions rather than the
//! `#[tauri::command]` wrappers, because building a `State<'_, AppState>` needs
//! a running Tauri runtime and a webview. The wrappers are three lines each —
//! pick a client, pick a search service, delegate — and what those lines choose
//! is asserted separately: the base URL is pinned in `shiranami-integrations`,
//! and the deferred pieces have their own absent-piece tests.

use super::*;
use crate::commands::share::loopback::{Reply, TestServer, request_body, request_line};
use crate::commands::share::search::{ScriptedYtDlp, scripted_search};
use crate::state::tests::state_over;
use shiranami_core::error::codes;
use shiranami_core::models::{PlaylistCreateInput, TrackCreateInput};
use shiranami_net::HttpClient;

/// A well-formed id that is not in any database.
const ABSENT_ID: &str = "11111111-1111-4111-8111-111111111111";

fn client_for(server: &TestServer) -> ShareClient {
    ShareClient::with_base(
        HttpClient::new().expect("the shared client builds"),
        server.url(""),
    )
}

const CREATED: &str = r#"{"code":"AbC12345","url":"https://shiranami.app/s/AbC12345","expiresAt":"2026-08-01T12:00:00.000Z"}"#;

fn import_body(code: &str) -> String {
    serde_json::json!({
        "type": "TRACK",
        "payload": { "title": "Song", "artist": "Artist", "ytId": "dQw4w9WgXcQ" },
        "code": code,
        "expiresAt": "2026-08-01T12:00:00.000Z",
    })
    .to_string()
}

fn track_input(file_path: &str, title: &str, artist: Option<&str>) -> TrackCreateInput {
    TrackCreateInput {
        file_path: file_path.to_owned(),
        title: title.to_owned(),
        artist: artist.map(str::to_owned),
        ..TrackCreateInput::default()
    }
}

// ── argument validation ─────────────────────────────────────────────────────

#[test]
fn a_well_formed_uuid_passes() {
    for id in [
        ABSENT_ID,
        "00000000-0000-0000-0000-000000000000",
        "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
    ] {
        assert!(uuid_shaped(id, "track id").is_ok(), "{id} should pass");
    }
}

#[test]
fn a_malformed_id_is_a_bad_request_rather_than_a_missing_row() {
    for id in [
        "",
        "not-a-uuid",
        "11111111111141118111111111111111",
        "11111111-1111-4111-8111-11111111111",
        "11111111-1111-4111-8111-1111111111111",
        "gggggggg-1111-4111-8111-111111111111",
        "11111111_1111_4111_8111_111111111111",
    ] {
        let error = uuid_shaped(id, "track id").expect_err("{id} should be refused");
        assert_eq!(
            error.code,
            codes::validation::BAD_REQUEST,
            "`{id}` must answer BAD_REQUEST, not share.track_not_found"
        );
    }
}

/// v1's `[uuid, nonEmpty]`. A blank video id would reach the share payload and
/// be refused by the server's `ytId` bound, so it is refused here where the
/// message can say which argument was wrong.
#[test]
fn caching_a_youtube_id_refuses_a_blank_video_id() {
    assert_eq!(
        non_empty("", "youtube id").expect_err("v1's min(1)").code,
        codes::validation::BAD_REQUEST
    );
    assert!(non_empty("dQw4w9WgXcQ", "youtube id").is_ok());
}

// ── share:track ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn sharing_a_track_posts_the_discriminated_body_and_returns_the_server_answer() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let track = {
        let mut conn = state.conn().await.expect("acquire");
        tracks::add(
            &mut conn,
            &track_input("/music/a.mp3", "Song", Some("Artist")),
        )
        .await
        .expect("insert")
        .expect("a row")
    };

    let server = TestServer::start(vec![Reply::ok(CREATED)]).await;
    let (search, script) = scripted_search(ScriptedYtDlp::finding("dQw4w9WgXcQ"));

    let answer = track_share(&state, &search, &client_for(&server), &track.id)
        .await
        .expect("a share");

    assert_eq!(answer.0["code"], "AbC12345");
    assert_eq!(
        answer.0["url"], "https://shiranami.app/s/AbC12345",
        "the create response is passed through verbatim, as v1 did"
    );

    let requests = server.requests();
    assert_eq!(request_line(&requests[0]), "POST /api/share HTTP/1.1");
    let sent: serde_json::Value =
        serde_json::from_str(request_body(&requests[0])).expect("the body is JSON");
    assert_eq!(sent["type"], "TRACK");
    assert_eq!(sent["payload"]["title"], "Song");
    assert_eq!(sent["payload"]["artist"], "Artist");
    assert_eq!(sent["payload"]["ytId"], "dQw4w9WgXcQ");

    assert_eq!(script.queries(), vec!["Song Artist"]);
}

/// An additive field on the create response must not break the desktop. v1
/// passed the body through untouched for exactly this reason, and typing it
/// here would have been the coupling D25 exists to avoid.
#[tokio::test]
async fn an_unknown_field_on_the_create_response_passes_through() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let track = {
        let mut conn = state.conn().await.expect("acquire");
        tracks::add(
            &mut conn,
            &track_input("/music/a.mp3", "Song", Some("Artist")),
        )
        .await
        .expect("insert")
        .expect("a row")
    };

    let server = TestServer::start(vec![Reply::ok(
        r#"{"code":"AbC12345","url":"u","expiresAt":"2026-08-01T12:00:00.000Z","viewCount":0}"#,
    )])
    .await;
    let (search, _script) = scripted_search(ScriptedYtDlp::finding("yt1"));

    let answer = track_share(&state, &search, &client_for(&server), &track.id)
        .await
        .expect("a share");

    assert_eq!(answer.0["viewCount"], 0);
}

#[tokio::test]
async fn sharing_a_track_that_is_not_in_the_library_is_track_not_found() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let server = TestServer::start(vec![]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::never_called());

    let error = track_share(&state, &search, &client_for(&server), ABSENT_ID)
        .await
        .expect_err("no such track");

    assert_eq!(error.code, codes::share::TRACK_NOT_FOUND);
    assert_eq!(server.received(), 0, "and nothing was posted");
}

#[tokio::test]
async fn a_track_with_no_youtube_match_is_no_youtube_match() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let track = {
        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &track_input("/music/a.mp3", "Song", None))
            .await
            .expect("insert")
            .expect("a row")
    };

    let server = TestServer::start(vec![]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::finding_nothing());

    let error = track_share(&state, &search, &client_for(&server), &track.id)
        .await
        .expect_err("no match");

    assert_eq!(error.code, codes::share::NO_YOUTUBE_MATCH);
    assert_eq!(server.received(), 0);
}

// ── share:playlist ──────────────────────────────────────────────────────────

/// Seed a playlist holding `titles` in that order, returning its id.
async fn seeded_playlist(state: &AppState, titles: &[&str]) -> String {
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
    .expect("a row");

    for (index, title) in titles.iter().enumerate() {
        let track = tracks::add(
            &mut conn,
            &track_input(&format!("/music/{index}.mp3"), title, Some("A")),
        )
        .await
        .expect("insert")
        .expect("a row");
        playlist_tracks::add_track(&mut conn, &playlist.id, &track.id)
            .await
            .expect("add to the playlist");
    }

    playlist.id
}

/// The end-to-end ordering claim, asserted on the **bytes that leave**: the
/// server receives the playlist in `position` order.
#[tokio::test]
async fn a_shared_playlist_reaches_the_server_in_position_order() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let playlist_id = seeded_playlist(&state, &["First", "Second", "Third"]).await;

    let server = TestServer::start(vec![Reply::ok(CREATED)]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::finding("yt1"));

    playlist_share(&state, &search, &client_for(&server), &playlist_id)
        .await
        .expect("a share");

    let requests = server.requests();
    let sent: serde_json::Value =
        serde_json::from_str(request_body(&requests[0])).expect("the body is JSON");

    assert_eq!(sent["type"], "PLAYLIST");
    assert_eq!(sent["payload"]["name"], "Mix");
    let titles: Vec<&str> = sent["payload"]["tracks"]
        .as_array()
        .expect("an array")
        .iter()
        .map(|track| track["title"].as_str().expect("a title"))
        .collect();
    assert_eq!(titles, vec!["First", "Second", "Third"]);
}

#[tokio::test]
async fn sharing_a_playlist_that_does_not_exist_is_playlist_not_found() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let server = TestServer::start(vec![]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::never_called());

    let error = playlist_share(&state, &search, &client_for(&server), ABSENT_ID)
        .await
        .expect_err("no such playlist");

    assert_eq!(error.code, codes::share::PLAYLIST_NOT_FOUND);
}

#[tokio::test]
async fn sharing_an_empty_playlist_is_playlist_empty() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let playlist_id = seeded_playlist(&state, &[]).await;

    let server = TestServer::start(vec![]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::never_called());

    let error = playlist_share(&state, &search, &client_for(&server), &playlist_id)
        .await
        .expect_err("an empty playlist");

    assert_eq!(error.code, codes::share::PLAYLIST_EMPTY);
    assert_eq!(server.received(), 0);
}

/// The distinction the two "nothing matched" codes draw: a playlist with tracks
/// none of which resolved is **not** the same as a playlist with no tracks, and
/// the renderer says something different about each.
#[tokio::test]
async fn a_playlist_where_nothing_matched_is_no_matches_for_any_track() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let playlist_id = seeded_playlist(&state, &["First", "Second"]).await;

    let server = TestServer::start(vec![]).await;
    let (search, _script) = scripted_search(ScriptedYtDlp::finding_nothing());

    let error = playlist_share(&state, &search, &client_for(&server), &playlist_id)
        .await
        .expect_err("nothing matched");

    assert_eq!(error.code, codes::share::NO_MATCHES_FOR_ANY_TRACK);
    assert_eq!(server.received(), 0, "and nothing was posted");
}

// ── share:import ────────────────────────────────────────────────────────────

#[tokio::test]
async fn importing_fetches_the_code_and_returns_the_validated_payload() {
    let server = TestServer::start(vec![Reply::ok(&import_body("AbC12345"))]).await;

    let imported = import_share(&client_for(&server), "AbC12345")
        .await
        .expect("an import");

    assert_eq!(imported.0["type"], "TRACK");
    assert_eq!(imported.0["code"], "AbC12345");
    assert_eq!(imported.0["payload"]["ytId"], "dQw4w9WgXcQ");

    let requests = server.requests();
    assert_eq!(
        request_line(&requests[0]),
        "GET /api/share/AbC12345 HTTP/1.1"
    );
}

/// Untrusted network input: a response that deserializes but violates the
/// contract's bounds must not reach the import UI as a lying type.
#[tokio::test]
async fn an_out_of_contract_response_is_an_invalid_response() {
    let hostile = serde_json::json!({
        "type": "TRACK",
        "payload": { "title": "", "artist": "Artist", "ytId": "dQw4w9WgXcQ" },
        "code": "AbC12345",
        "expiresAt": "2026-08-01T12:00:00.000Z",
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(&hostile)]).await;

    let error = import_share(&client_for(&server), "AbC12345")
        .await
        .expect_err("an empty title violates the contract");

    assert_eq!(error.code, codes::share::INVALID_RESPONSE);
}

/// The path-walking class the crate's code check removes, at the boundary the
/// renderer reaches: a code outside the nanoid alphabet never becomes a request.
#[tokio::test]
async fn a_code_that_could_walk_the_api_path_never_leaves_the_process() {
    let server = TestServer::start(vec![]).await;

    for code in ["", "../admin", "a/b", "a?b"] {
        let error = import_share(&client_for(&server), code)
            .await
            .expect_err("{code} is refused");
        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    assert_eq!(server.received(), 0);
}

/// The API writes actionable messages on a 4xx ("this share has expired") and
/// v1 parsed the body for exactly that rather than showing the status text.
#[tokio::test]
async fn the_servers_own_message_reaches_the_renderer() {
    let server = TestServer::start(vec![Reply::failing(
        404,
        r#"{"message":"This share has expired"}"#,
    )])
    .await;

    let error = import_share(&client_for(&server), "AbC12345")
        .await
        .expect_err("a 404");

    assert_eq!(error.message, "This share has expired");
    assert_eq!(error.code, codes::INTERNAL);
}

// ── share:cache-youtube-id ──────────────────────────────────────────────────

/// The write half, and the reason it exists: a download that came from a search
/// already knows the video id, so the next share of that track skips yt-dlp.
#[tokio::test]
async fn a_cached_id_is_what_a_later_share_resolves_to() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let track = {
        let mut conn = state.conn().await.expect("acquire");
        tracks::add(
            &mut conn,
            &track_input("/music/a.mp3", "Song", Some("Artist")),
        )
        .await
        .expect("insert")
        .expect("a row")
    };

    {
        let mut conn = state.conn().await.expect("acquire");
        youtube_mappings::upsert(&mut conn, &track.id, "cached-id")
            .await
            .expect("cache");
    }

    let server = TestServer::start(vec![Reply::ok(CREATED)]).await;
    let (search, script) = scripted_search(ScriptedYtDlp::never_called());
    track_share(&state, &search, &client_for(&server), &track.id)
        .await
        .expect("a share");

    let requests = server.requests();
    let sent: serde_json::Value =
        serde_json::from_str(request_body(&requests[0])).expect("the body is JSON");
    assert_eq!(sent["payload"]["ytId"], "cached-id");
    assert_eq!(script.queries().len(), 0, "no search ran");
}

/// Re-caching replaces the video rather than inserting a second row — the
/// conflict target is `track_id`, the `UNIQUE` column.
#[tokio::test]
async fn re_caching_a_track_replaces_its_mapping() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let mut conn = state.conn().await.expect("acquire");
    let track = tracks::add(&mut conn, &track_input("/music/a.mp3", "Song", None))
        .await
        .expect("insert")
        .expect("a row");

    youtube_mappings::upsert(&mut conn, &track.id, "first")
        .await
        .expect("cache");
    youtube_mappings::upsert(&mut conn, &track.id, "second")
        .await
        .expect("re-cache");

    assert_eq!(
        youtube_mappings::get_for_track(&mut conn, &track.id)
            .await
            .expect("read back"),
        Some("second".to_owned())
    );
}

/// The mapping table carries a foreign key onto `tracks`, so a cache write for
/// a track that is not in the library fails rather than orphaning a row. v1's
/// schema had the same constraint and the same outcome; what matters is that it
/// is a code-bearing rejection here rather than a panic.
#[tokio::test]
async fn caching_against_an_unknown_track_is_refused_by_the_foreign_key() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    let mut conn = state.conn().await.expect("acquire");
    let failed = youtube_mappings::upsert(&mut conn, ABSENT_ID, "yt1").await;

    let error = failed.wire().expect_err("no such track");
    assert_eq!(error.code, codes::INTERNAL);
}

// ── the deferred piece ──────────────────────────────────────────────────────

#[tokio::test]
async fn an_absent_search_service_is_an_error_naming_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    assert!(state.deferred().search.is_none());
    let error = state
        .deferred()
        .search
        .as_deref()
        .ok_or_else(|| not_booted("the YouTube search service"))
        .err()
        .expect("no search service is installed");
    assert_eq!(error.code, codes::INTERNAL);
}

/// `share:deep-link` is this lane's one event, and it is a **listener** channel
/// rather than a command: the main process emits it when a `shiranami://` URL
/// arrives. It is declared in `crate::events`, so what belongs here is the
/// assertion that it did not accidentally become a command too.
#[test]
fn the_deep_link_channel_is_an_event_and_not_a_command() {
    assert!(
        crate::events::ALL_EVENT_NAMES.contains(&"share:deep-link"),
        "the lane's one event is missing from the event registry"
    );
    assert_eq!(
        <crate::events::ShareDeepLink as tauri_specta::Event>::NAME,
        "share:deep-link",
        "the derive must use the attribute, not the kebab-cased struct name"
    );
}
