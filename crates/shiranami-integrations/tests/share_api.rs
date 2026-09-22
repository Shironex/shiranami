//! The share API against a real socket: the outbound body, the validated
//! import response, and the error-message extraction v1 did by hand.

mod support;

use shiranami_core::error::ErrorPayload;
use shiranami_integrations::share::{
    CreateShareRequest, PlaylistPayload, ShareClient, ShareImportResponse, TrackPayload,
};
use shiranami_net::HttpClient;
use support::request::{request_body, request_line};
use support::test_server::{Reply, TestServer};

fn client(server: &TestServer) -> ShareClient {
    ShareClient::with_base(
        HttpClient::new().expect("the shared client builds"),
        server.url(""),
    )
}

fn track() -> TrackPayload {
    TrackPayload {
        title: "Song".to_owned(),
        artist: "Artist".to_owned(),
        yt_id: "dQw4w9WgXcQ".to_owned(),
    }
}

fn import_body(code: &str) -> String {
    serde_json::json!({
        "type": "TRACK",
        "payload": { "title": "Song", "artist": "Artist", "ytId": "dQw4w9WgXcQ" },
        "code": code,
        "expiresAt": "2026-08-01T12:00:00.000Z",
    })
    .to_string()
}

#[tokio::test]
async fn creating_a_track_share_posts_the_discriminated_body() {
    let created = r#"{"code":"AbC12345","url":"https://shiranami.app/s/AbC12345","expiresAt":"2026-08-01T12:00:00.000Z"}"#;
    let server = TestServer::start(vec![Reply::ok(created)]).await;

    let response = client(&server)
        .create(&CreateShareRequest::Track { payload: track() })
        .await
        .expect("a share");

    assert_eq!(response["code"], "AbC12345");

    let requests = server.requests();
    assert_eq!(request_line(&requests[0]), "POST /api/share HTTP/1.1");
    assert!(
        requests[0]
            .to_lowercase()
            .contains("content-type: application/json")
    );

    let sent: serde_json::Value =
        serde_json::from_str(request_body(&requests[0])).expect("the body is JSON");
    assert_eq!(sent["type"], "TRACK");
    assert_eq!(sent["payload"]["ytId"], "dQw4w9WgXcQ");
}

#[tokio::test]
async fn creating_a_playlist_share_posts_its_tracks_in_order() {
    let server = TestServer::start(vec![Reply::ok(r#"{"code":"x"}"#)]).await;

    client(&server)
        .create(&CreateShareRequest::Playlist {
            payload: PlaylistPayload {
                name: "Mix".to_owned(),
                tracks: vec![
                    track(),
                    TrackPayload {
                        title: "Second".to_owned(),
                        ..track()
                    },
                ],
            },
        })
        .await
        .expect("a share");

    let requests = server.requests();
    let sent: serde_json::Value =
        serde_json::from_str(request_body(&requests[0])).expect("the body is JSON");

    assert_eq!(sent["type"], "PLAYLIST");
    assert_eq!(sent["payload"]["tracks"][0]["title"], "Song");
    assert_eq!(sent["payload"]["tracks"][1]["title"], "Second");
}

/// A body that fails the contract never leaves the process — the point of
/// validating locally is to name the field instead of taking an opaque 400.
#[tokio::test]
async fn a_body_failing_the_contract_is_never_sent() {
    let server = TestServer::start(Vec::new()).await;

    let error = client(&server)
        .create(&CreateShareRequest::Track {
            payload: TrackPayload {
                title: String::new(),
                ..track()
            },
        })
        .await
        .expect_err("an empty title fails the contract");

    assert_eq!(ErrorPayload::of(&error).code, "BAD_REQUEST");
    assert_eq!(server.received(), 0, "nothing was sent");
}

/// The API writes actionable messages; v1 dug them out of the error body and so
/// does this, rather than showing "HTTP 404".
#[tokio::test]
async fn the_servers_message_is_surfaced_from_a_failing_response() {
    let server = TestServer::start(vec![Reply::failing(
        404,
        r#"{"message":"This share has expired"}"#,
    )])
    .await;

    let error = client(&server)
        .import("AbC12345")
        .await
        .expect_err("a 404 is a failure");

    assert_eq!(error.to_string(), "This share has expired");
}

#[tokio::test]
async fn a_failing_response_without_a_message_falls_back_to_the_status() {
    let server = TestServer::start(vec![Reply::failing(500, "<html>oops</html>")]).await;

    let error = client(&server)
        .import("AbC12345")
        .await
        .expect_err("a 500 is a failure");

    assert_eq!(error.to_string(), "HTTP 500");
}

#[tokio::test]
async fn importing_returns_the_validated_response() {
    let server = TestServer::start(vec![Reply::ok(&import_body("AbC12345"))]).await;

    let response = client(&server).import("AbC12345").await.expect("an import");

    assert_eq!(response.code(), "AbC12345");
    assert_eq!(response.expires_at(), "2026-08-01T12:00:00.000Z");
    let ShareImportResponse::Track { payload, .. } = response else {
        panic!("expected a track share");
    };
    assert_eq!(payload.title, "Song");

    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /api/share/AbC12345 HTTP/1.1"
    );
}

#[tokio::test]
async fn a_playlist_import_round_trips() {
    let body = serde_json::json!({
        "type": "PLAYLIST",
        "payload": {
            "name": "Mix",
            "tracks": [{ "title": "Song", "artist": "Artist", "ytId": "abc" }],
        },
        "code": "AbC12345",
        "expiresAt": "2026-08-01T12:00:00+02:00",
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(&body)]).await;

    let response = client(&server).import("AbC12345").await.expect("an import");

    let ShareImportResponse::Playlist { payload, .. } = response else {
        panic!("expected a playlist share");
    };
    assert_eq!(payload.name, "Mix");
    assert_eq!(payload.tracks.len(), 1);
}

/// Untrusted network input the renderer reads field by field. A response that
/// does not match the contract must not reach it as a lying type.
#[tokio::test]
async fn a_malformed_import_response_is_refused() {
    let bodies = [
        // Not the union at all.
        r#"{"nope":true}"#,
        // A type the contract does not carry.
        r#"{"type":"ALBUM","payload":{},"code":"x","expiresAt":"2026-08-01T12:00:00Z"}"#,
        // Right shape, missing a required payload field.
        r#"{"type":"TRACK","payload":{"title":"S"},"code":"x","expiresAt":"2026-08-01T12:00:00Z"}"#,
        // Not JSON.
        "definitely not json",
    ];

    for body in bodies {
        let server = TestServer::start(vec![Reply::ok(body)]).await;
        let error = match client(&server).import("AbC12345").await {
            Err(error) => error,
            Ok(accepted) => panic!("{body} was accepted as {accepted:?}"),
        };

        assert_eq!(
            ErrorPayload::of(&error).code,
            "share.invalid_response",
            "body {body}"
        );
    }
}

/// A response that *parses* can still lie: an empty title or a bogus expiry
/// deserialises fine and is caught by the bounds check.
#[tokio::test]
async fn a_parseable_but_invalid_import_response_is_refused() {
    let bodies = [
        serde_json::json!({
            "type": "TRACK",
            "payload": { "title": "", "artist": "A", "ytId": "abc" },
            "code": "AbC12345",
            "expiresAt": "2026-08-01T12:00:00Z",
        }),
        serde_json::json!({
            "type": "TRACK",
            "payload": { "title": "S", "artist": "A", "ytId": "abc" },
            "code": "AbC12345",
            "expiresAt": "<script>alert(1)</script>",
        }),
        serde_json::json!({
            "type": "PLAYLIST",
            "payload": { "name": "Mix", "tracks": [] },
            "code": "AbC12345",
            "expiresAt": "2026-08-01T12:00:00Z",
        }),
    ];

    for body in bodies {
        let server = TestServer::start(vec![Reply::ok(&body.to_string())]).await;
        let error = client(&server)
            .import("AbC12345")
            .await
            .expect_err("an out-of-bounds response must be refused");

        assert_eq!(ErrorPayload::of(&error).code, "share.invalid_response");
    }
}

/// The hardening: a code that could walk the API path is refused before a
/// request is made, rather than being normalised into a different endpoint.
#[tokio::test]
async fn a_code_that_could_walk_the_path_is_refused_without_a_request() {
    let server = TestServer::start(Vec::new()).await;

    for code in ["", "../admin", "a/b", "a?x=1", "a%2fb"] {
        let error = client(&server)
            .import(code)
            .await
            .expect_err("a malformed code must be refused");

        assert_eq!(ErrorPayload::of(&error).code, "BAD_REQUEST", "code {code}");
    }

    assert_eq!(server.received(), 0, "nothing was sent");
}

/// v1 handed the *create* response to the renderer unvalidated, and that
/// asymmetry is deliberate: an additive server-side field must not become a
/// desktop-side failure.
#[tokio::test]
async fn an_unexpected_field_in_the_create_response_is_passed_through() {
    let created =
        r#"{"code":"AbC12345","url":"https://x","expiresAt":"2026-08-01T12:00:00Z","newField":42}"#;
    let server = TestServer::start(vec![Reply::ok(created)]).await;

    let response = client(&server)
        .create(&CreateShareRequest::Track { payload: track() })
        .await
        .expect("an additive field must not break the client");

    assert_eq!(response["newField"], 42);
}
