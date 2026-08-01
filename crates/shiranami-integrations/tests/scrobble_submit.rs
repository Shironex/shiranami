//! Submission and the persisted retry queue, end to end.
//!
//! A real settings file, a real database opened through the crate's boot path,
//! and a real HTTP client pointed at a loopback socket. What each test is
//! really asking is the question v1 could only answer by inspection: **when
//! does a play get parked, and what happens to it afterwards.**

#[path = "support/scrobbler.rs"]
mod harness;
#[path = "support/test_server.rs"]
mod test_server;

use shiranami_core::store::ScrobbleSettings;
use shiranami_db::repo::scrobble_queue::ScrobbleTargets;
use shiranami_integrations::scrobble::ScrobblePlay;

use harness::{Harness, connected, play};
use test_server::{Reply, TestServer};

/// Last.fm's success body, and ListenBrainz's.
fn accepted() -> Reply {
    Reply::ok(r#"{"scrobbles":{"@attr":{"accepted":1}},"status":"ok"}"#)
}

/// Enough successful replies for both backends' ping and submission.
fn all_accepted() -> Vec<Reply> {
    (0..8).map(|_| accepted()).collect()
}

#[tokio::test]
async fn a_successful_play_reaches_both_backends_and_parks_nothing() {
    let server = TestServer::start(all_accepted()).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("submitting must not fail");

    let requests = server.requests().join("\n");
    assert!(
        requests.contains("method=track.scrobble"),
        "the scrobble was never sent"
    );
    assert!(
        requests.contains("method=track.updateNowPlaying"),
        "the now-playing ping was never sent"
    );
    assert!(
        requests.contains("api_sig="),
        "every last.fm call must carry a signature"
    );
    assert!(
        requests.contains(r#""listen_type":"single""#),
        "the listenbrainz listen was never sent"
    );
    assert!(
        requests.contains(r#""listen_type":"playing_now""#),
        "the listenbrainz ping was never sent"
    );

    assert!(
        harness.parked().await.is_empty(),
        "nothing should be parked"
    );
}

/// The case a bare status check misses, and the reason v1 read the body:
/// Last.fm reports a bad session key or a rate limit as **HTTP 200** with an
/// error code in the JSON. A play that hits it must requeue, not vanish.
#[tokio::test]
async fn a_lastfm_error_inside_a_200_parks_the_play() {
    let replies = (0..8)
        .map(|_| Reply::ok(r#"{"error":9,"message":"Invalid session key"}"#))
        .collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        listen_brainz_token: None,
        ..connected()
    });

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");

    let parked = harness.parked().await;
    assert_eq!(parked.len(), 1);
    assert_eq!(parked[0].targets, ScrobbleTargets::LASTFM);
    assert_eq!(parked[0].attempts, 0);
    assert_eq!(parked[0].artist, "Nujabes");
    assert_eq!(
        parked[0].started_at, 1_700_000_000,
        "the parked play keeps the time it was played, not the time it failed"
    );
}

#[tokio::test]
async fn a_failing_status_parks_the_play_too() {
    let replies = (0..8).map(|_| Reply::failing(503, "nope")).collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");

    let parked = harness.parked().await;
    assert_eq!(parked.len(), 1);
    assert_eq!(
        parked[0].targets,
        ScrobbleTargets::BOTH,
        "both backends still owe the scrobble"
    );
}

/// One backend failing must not abort the other, and the parked row must name
/// only the one that owes it — otherwise a retry double-scrobbles.
#[tokio::test]
async fn only_the_backend_that_failed_is_parked() {
    // Last.fm's two calls fail; ListenBrainz's two succeed. Both backends run
    // concurrently, so the replies are matched by what each connection asks
    // for rather than by order: every reply here is a 200, and only the
    // last.fm-shaped ones carry an error code.
    let replies = (0..8)
        .map(|_| Reply::ok(r#"{"error":16,"message":"temporarily unavailable"}"#))
        .collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");

    let parked = harness.parked().await;
    assert_eq!(parked.len(), 1);
    assert_eq!(
        parked[0].targets,
        ScrobbleTargets::LASTFM,
        "listenbrainz ignores the last.fm error body, so only last.fm owes it"
    );
}

/// v1 skipped a play with no artist or no title — a bare radio entry, which
/// both APIs would happily record as something meaningless.
#[tokio::test]
async fn a_play_with_nothing_to_attribute_is_never_sent() {
    let server = TestServer::start(all_accepted()).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(connected());

    for unattributable in [
        ScrobblePlay {
            artist: "   ".to_owned(),
            ..play()
        },
        ScrobblePlay {
            track: String::new(),
            ..play()
        },
    ] {
        harness
            .scrobbler
            .submit_play(&harness.pool, &unattributable)
            .await
            .expect("skipping is not an error");
    }

    assert_eq!(server.received(), 0, "nothing should have been sent");
    assert!(harness.parked().await.is_empty());
}

#[tokio::test]
async fn nothing_is_sent_while_scrobbling_is_switched_off() {
    let server = TestServer::start(all_accepted()).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        enabled: false,
        ..connected()
    });

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("the master switch is not an error");

    assert_eq!(server.received(), 0);
    assert!(
        harness.parked().await.is_empty(),
        "a play nobody asked for must not be parked either"
    );
}

/// A build with no Last.fm application credential still scrobbles to
/// ListenBrainz, and does not park a Last.fm submission it could never make.
#[tokio::test]
async fn a_build_without_lastfm_keys_still_scrobbles_to_listenbrainz() {
    let server = TestServer::start(all_accepted()).await;
    let harness = Harness::new(&server, false).await;
    harness.set_settings(connected());

    assert!(!harness.scrobbler.is_lastfm_configured());

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("submitting must not fail");

    let requests = server.requests().join("\n");
    assert!(requests.contains(r#""listen_type":"single""#));
    assert!(
        !requests.contains("track.scrobble"),
        "an unconfigured build must not attempt a last.fm call"
    );
    assert!(harness.parked().await.is_empty());
}

#[tokio::test]
async fn a_flush_replays_a_parked_play_and_drops_it_once_it_lands() {
    // Exactly the two calls the first submission makes — the now-playing ping
    // and the scrobble — fail; everything the flush then sends succeeds.
    let mut replies: Vec<Reply> = (0..2)
        .map(|_| Reply::ok(r#"{"error":11,"message":"service offline"}"#))
        .collect();
    replies.extend(all_accepted());

    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        listen_brainz_token: None,
        ..connected()
    });

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");
    assert_eq!(harness.parked().await.len(), 1, "the play is parked");

    harness
        .scrobbler
        .flush(&harness.pool)
        .await
        .expect("the flush must not fail");

    assert!(
        harness.parked().await.is_empty(),
        "a replayed play that lands is dropped"
    );

    let requests = server.requests().join("\n");
    assert!(
        requests.contains("timestamp=1700000000"),
        "the replay must scrobble the original play time, not the retry time"
    );
}

#[tokio::test]
async fn a_flush_that_fails_again_reschedules_rather_than_dropping() {
    let replies = (0..16)
        .map(|_| Reply::ok(r#"{"error":11,"message":"service offline"}"#))
        .collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        listen_brainz_token: None,
        ..connected()
    });

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");
    let before = harness.parked().await;

    harness
        .scrobbler
        .flush(&harness.pool)
        .await
        .expect("the flush must not fail");

    let after = harness.parked().await;
    assert_eq!(after.len(), 1, "the play is still parked");
    assert_eq!(after[0].attempts, 1, "the attempt was counted");
    assert!(
        after[0].next_attempt_at > before[0].next_attempt_at,
        "the retry was pushed out by the backoff"
    );
    assert_eq!(after[0].id, before[0].id, "the same row was updated");
}

/// v1 checked the master switch inside the flush rather than around its timer,
/// so a user who switches scrobbling off keeps their parked plays instead of
/// burning attempts on them while nothing is connected.
#[tokio::test]
async fn a_flush_does_nothing_while_scrobbling_is_switched_off() {
    let replies = (0..8)
        .map(|_| Reply::ok(r#"{"error":11,"message":"service offline"}"#))
        .collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        listen_brainz_token: None,
        ..connected()
    });

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");
    let sent_while_enabled = server.received();

    harness.set_settings(ScrobbleSettings {
        enabled: false,
        ..harness.settings()
    });
    harness
        .scrobbler
        .flush(&harness.pool)
        .await
        .expect("the flush must not fail");

    assert_eq!(
        server.received(),
        sent_while_enabled,
        "a disabled flush must send nothing"
    );
    let parked = harness.parked().await;
    assert_eq!(parked.len(), 1, "the parked play is kept, not dropped");
    assert_eq!(parked[0].attempts, 0, "and no attempt was burned on it");
}

/// The count the Settings UI shows comes from the table, so it survives a
/// restart the way the queue itself now does.
#[tokio::test]
async fn the_status_counts_the_parked_plays() {
    let replies = (0..8)
        .map(|_| Reply::ok(r#"{"error":11,"message":"service offline"}"#))
        .collect();
    let server = TestServer::start(replies).await;
    let harness = Harness::new(&server, true).await;
    harness.set_settings(ScrobbleSettings {
        listen_brainz_token: None,
        ..connected()
    });

    assert_eq!(
        harness
            .scrobbler
            .status(&harness.pool)
            .await
            .expect("read the status")
            .pending_count,
        0
    );

    harness
        .scrobbler
        .submit_play(&harness.pool, &play())
        .await
        .expect("a failed submission is not an error");

    let status = harness
        .scrobbler
        .status(&harness.pool)
        .await
        .expect("read the status");
    assert_eq!(status.pending_count, 1);
    assert!(status.enabled);
    assert_eq!(status.lastfm_username.as_deref(), Some("alice"));
}
