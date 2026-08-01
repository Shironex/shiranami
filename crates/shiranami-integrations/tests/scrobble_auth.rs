//! The two connection flows, end to end.
//!
//! Last.fm is a two-step desktop-auth handshake; ListenBrainz is a token the
//! user pastes. Both end the same way: a credential in the main-only settings
//! blob, and nothing but booleans and a display name on the wire back.

#[path = "support/scrobbler.rs"]
mod harness;
#[path = "support/test_server.rs"]
mod test_server;

use shiranami_core::models::{LastfmAuthStart, ScrobbleConnectError, ScrobbleConnectResult};
use shiranami_core::store::ScrobbleSettings;

use harness::{API_KEY, Harness, connected};
use test_server::{Reply, TestServer};

#[tokio::test]
async fn beginning_lastfm_auth_returns_a_token_and_the_page_to_approve_it_on() {
    let server = TestServer::start(vec![Reply::ok(r#"{"token":"REQTOKEN"}"#)]).await;
    let harness = Harness::new(&server, true).await;

    let (result, authorize_url) = harness.scrobbler.begin_lastfm_auth().await;

    assert_eq!(result, LastfmAuthStart::started("REQTOKEN"));

    let url = authorize_url.expect("a configured build returns a URL to open");
    assert!(url.starts_with("https://www.last.fm/api/auth/?"));
    assert!(url.contains(&format!("api_key={API_KEY}")));
    assert!(url.contains("token=REQTOKEN"));

    // The composition root opens that URL; this crate does not.
    let request = server.requests().join("\n");
    assert!(request.contains("method=auth.getToken"));
    assert!(request.contains("api_sig="));
}

#[tokio::test]
async fn an_answer_with_no_token_is_a_no_token_failure() {
    let server = TestServer::start(vec![Reply::ok(r#"{}"#)]).await;
    let harness = Harness::new(&server, true).await;

    let (result, url) = harness.scrobbler.begin_lastfm_auth().await;

    assert_eq!(
        result,
        LastfmAuthStart::failed(ScrobbleConnectError::NoToken)
    );
    assert!(url.is_none(), "there is nothing to open");
}

/// A build with no application credential never reaches the network — the
/// request would be unsignable.
#[tokio::test]
async fn an_unconfigured_build_refuses_before_sending_anything() {
    let server = TestServer::start(vec![Reply::ok(r#"{"token":"T"}"#)]).await;
    let harness = Harness::new(&server, false).await;

    let (result, url) = harness.scrobbler.begin_lastfm_auth().await;

    assert_eq!(
        result,
        LastfmAuthStart::failed(ScrobbleConnectError::NotConfigured)
    );
    assert!(url.is_none());
    assert_eq!(server.received(), 0);
}

#[tokio::test]
async fn completing_the_handshake_stores_the_session_and_switches_scrobbling_on() {
    let server = TestServer::start(vec![Reply::ok(
        r#"{"session":{"key":"SESSIONKEY","name":"alice","subscriber":0}}"#,
    )])
    .await;
    let harness = Harness::new(&server, true).await;

    let result = harness.scrobbler.complete_lastfm_auth("REQTOKEN").await;

    assert_eq!(
        result,
        ScrobbleConnectResult::connected(Some("alice".to_owned()))
    );

    let stored = harness.settings();
    assert_eq!(stored.lastfm_session_key.as_deref(), Some("SESSIONKEY"));
    assert_eq!(stored.lastfm_username.as_deref(), Some("alice"));
    assert!(
        stored.enabled,
        "connecting a backend is what turns scrobbling on for a user who never \
         touched the master switch"
    );

    assert!(
        server
            .requests()
            .join("")
            .contains("method=auth.getSession")
    );
}

/// Last.fm answers a rejected or expired token with a body carrying no session.
#[tokio::test]
async fn an_answer_with_no_session_stores_nothing() {
    let server =
        TestServer::start(vec![Reply::ok(r#"{"error":4,"message":"Invalid token"}"#)]).await;
    let harness = Harness::new(&server, true).await;

    let result = harness.scrobbler.complete_lastfm_auth("STALE").await;

    assert_eq!(
        result,
        ScrobbleConnectResult::failed(ScrobbleConnectError::NoSession)
    );
    assert_eq!(harness.settings(), ScrobbleSettings::default());
}

#[tokio::test]
async fn a_session_without_a_display_name_still_connects() {
    let server = TestServer::start(vec![Reply::ok(r#"{"session":{"key":"K"}}"#)]).await;
    let harness = Harness::new(&server, true).await;

    assert_eq!(
        harness.scrobbler.complete_lastfm_auth("T").await,
        ScrobbleConnectResult::connected(None)
    );
    assert_eq!(harness.settings().lastfm_session_key.as_deref(), Some("K"));
}

#[tokio::test]
async fn a_valid_listenbrainz_token_is_stored_with_its_user_name() {
    let server = TestServer::start(vec![Reply::ok(
        r#"{"code":200,"message":"Token valid.","valid":true,"user_name":"bob"}"#,
    )])
    .await;
    let harness = Harness::new(&server, true).await;

    let result = harness.scrobbler.connect_listenbrainz("LBTOKEN").await;

    assert_eq!(
        result,
        ScrobbleConnectResult::connected(Some("bob".to_owned()))
    );

    let stored = harness.settings();
    assert_eq!(stored.listen_brainz_token.as_deref(), Some("LBTOKEN"));
    assert!(stored.enabled);

    assert!(
        server.requests().join("").contains("Token LBTOKEN"),
        "the token goes in the Authorization header"
    );
}

#[tokio::test]
async fn an_invalid_listenbrainz_token_is_not_stored() {
    let server = TestServer::start(vec![Reply::ok(
        r#"{"code":200,"message":"Token invalid.","valid":false}"#,
    )])
    .await;
    let harness = Harness::new(&server, true).await;

    let result = harness.scrobbler.connect_listenbrainz("WRONG").await;

    assert_eq!(
        result,
        ScrobbleConnectResult::failed(ScrobbleConnectError::InvalidToken)
    );
    assert_eq!(harness.settings(), ScrobbleSettings::default());
}

#[tokio::test]
async fn disconnecting_one_backend_leaves_the_other_connected() {
    let server = TestServer::start(Vec::new()).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    let status = harness
        .scrobbler
        .disconnect_lastfm(&harness.pool)
        .await
        .expect("read the status back");

    assert!(!status.lastfm_connected);
    assert!(status.lastfm_username.is_none());
    assert!(status.listen_brainz_connected);
    assert_eq!(harness.settings().lastfm_session_key, None);
    assert_eq!(
        harness.settings().listen_brainz_token.as_deref(),
        Some("LBTOKEN")
    );

    let status = harness
        .scrobbler
        .disconnect_listenbrainz(&harness.pool)
        .await
        .expect("read the status back");
    assert!(!status.listen_brainz_connected);
    assert!(
        status.enabled,
        "disconnecting a backend does not flip the master switch back off"
    );
}

#[tokio::test]
async fn the_master_switch_round_trips_through_the_settings_file() {
    let server = TestServer::start(Vec::new()).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    let status = harness
        .scrobbler
        .set_enabled(&harness.pool, false)
        .await
        .expect("read the status back");
    assert!(!status.enabled);
    assert!(!harness.settings().enabled);

    let status = harness
        .scrobbler
        .set_enabled(&harness.pool, true)
        .await
        .expect("read the status back");
    assert!(status.enabled);
    assert!(harness.settings().enabled);
}

/// The secrets are on disk, in the main-only key, and nowhere in what the
/// renderer is handed. Asserted against the real file rather than the in-memory
/// struct, because the file is what a later process reads back.
#[tokio::test]
async fn the_credentials_reach_the_settings_file_and_never_the_status() {
    let server = TestServer::start(vec![Reply::ok(
        r#"{"session":{"key":"SUPERSECRET","name":"alice"}}"#,
    )])
    .await;
    let harness = Harness::new(&server, true).await;

    harness.scrobbler.complete_lastfm_auth("T").await;

    let on_disk = std::fs::read_to_string(harness.store.path()).expect("read the settings file");
    assert!(
        on_disk.contains("SUPERSECRET"),
        "the session key must persist, or the user re-authenticates every launch"
    );
    assert!(
        on_disk.contains("scrobble"),
        "and it must live under the main-only scrobble key"
    );

    let status = harness
        .scrobbler
        .status(&harness.pool)
        .await
        .expect("read the status");
    let wire = serde_json::to_string(&status).expect("serialize the status");
    assert!(
        !wire.contains("SUPERSECRET"),
        "the session key must never cross the command boundary"
    );
    assert!(status.lastfm_connected);
}
