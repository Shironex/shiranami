//! The connect / reconnect / update lifecycle, against a scripted socket.
//!
//! Everything here is a case that cannot be produced on demand against a real
//! Discord: it not running, the socket dropping mid-session, a handshake being
//! refused, and the rate-limit window being crossed.

#[path = "support/discord.rs"]
mod harness;

use std::time::Duration;

use shiranami_core::models::{DiscordMusicPresenceActivity, DiscordRpcSettingsPatch};
use shiranami_integrations::discord::{Pump, RECONNECT_BASE};

use harness::{AFTER_WINDOW, Call, NOW, harness, playing, settle};

#[tokio::test]
async fn a_disabled_service_never_touches_the_socket() {
    let harness = harness(false);
    harness.presence.update_presence(Some(playing()));

    assert_eq!(harness.presence.pump(NOW).await, Pump::Idle);
    assert!(harness.socket.calls().is_empty());
}

#[tokio::test]
async fn enabling_connects_and_shows_the_current_track() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));

    settle(&harness, NOW, 5).await;

    assert!(harness.presence.is_connected());
    let calls = harness.socket.calls();
    assert_eq!(calls.first(), Some(&Call::Connect));

    let shown = harness.socket.activities();
    assert_eq!(shown.len(), 1, "exactly one card was sent");
    assert_eq!(shown[0].details.as_deref(), Some("Listening to music"));
    assert_eq!(shown[0].state.as_deref(), Some("Idol by Yoasobi"));
}

/// The case a user actually hits: Rich Presence left on, Discord not running.
#[tokio::test]
async fn a_missing_discord_backs_off_and_reports_once() {
    let harness = harness(true);
    harness.socket.fail_next_connects(10);
    harness.presence.update_presence(Some(playing()));

    let first = harness.presence.pump(NOW).await;
    assert_eq!(
        first,
        Pump::Again {
            retry_in: RECONNECT_BASE
        },
        "the first retry waits five seconds, not ten"
    );
    assert_eq!(harness.notices.count(), 1, "the user is told once");

    for _ in 0..5 {
        harness.presence.pump(NOW).await;
    }

    assert!(!harness.presence.is_connected());
    assert_eq!(
        harness.notices.count(),
        1,
        "a backoff loop must not become a toast storm"
    );
    assert!(
        harness.socket.activities().is_empty(),
        "nothing is shown while disconnected"
    );
}

#[tokio::test]
async fn the_backoff_doubles_across_repeated_failures() {
    let harness = harness(true);
    harness.socket.fail_next_connects(10);
    harness.presence.update_presence(Some(playing()));

    let mut delays = Vec::new();
    for _ in 0..5 {
        if let Pump::Again { retry_in } = harness.presence.pump(NOW).await {
            delays.push(retry_in);
        }
    }

    assert_eq!(
        delays,
        vec![
            Duration::from_secs(5),
            Duration::from_secs(10),
            Duration::from_secs(20),
            Duration::from_secs(40),
            Duration::from_secs(60),
        ]
    );
}

/// Discord starting up after the app is the ordinary recovery path.
#[tokio::test]
async fn a_discord_that_appears_later_gets_the_current_track() {
    let harness = harness(true);
    harness.socket.fail_next_connects(2);
    harness.presence.update_presence(Some(playing()));

    harness.presence.pump(NOW).await;
    harness.presence.pump(NOW).await;
    assert!(!harness.presence.is_connected());

    settle(&harness, NOW, 5).await;

    assert!(harness.presence.is_connected());
    assert_eq!(
        harness.socket.activities().len(),
        1,
        "the track that was waiting is shown on reconnect"
    );
}

/// The only way a dropped socket is discovered — `discord-rich-presence` has no
/// disconnect event, so a failed write is the signal.
#[tokio::test]
async fn a_failed_update_marks_the_socket_dropped_and_reconnects() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;
    assert!(harness.presence.is_connected());

    harness.socket.fail_next_updates(1);
    harness
        .presence
        .update_presence(Some(DiscordMusicPresenceActivity {
            title: "Racing Into The Night".to_owned(),
            ..playing()
        }));

    // A window later, the update is allowed out — and its write fails, which
    // is the only signal this crate gets that the socket has gone.
    harness.presence.pump(AFTER_WINDOW).await;
    assert!(
        !harness.presence.is_connected(),
        "a failed write is how a dropped socket is noticed"
    );

    // …and the next pumps reconnect and re-send.
    settle(&harness, AFTER_WINDOW, 5).await;
    assert!(harness.presence.is_connected());
    assert!(
        harness
            .socket
            .calls()
            .iter()
            .filter(|call| **call == Call::Connect)
            .count()
            >= 2,
        "the socket was reconnected"
    );
    assert_eq!(
        harness
            .socket
            .activities()
            .last()
            .map(|card| card.state.clone()),
        Some(Some("Racing Into The Night by Yoasobi".to_owned())),
        "and the update that was lost with the socket finally lands"
    );
}

/// A drop is not a login failure, so the reconnect after it can still tell the
/// user if Discord has genuinely gone away.
#[tokio::test]
async fn a_drop_followed_by_a_refused_reconnect_is_still_reported() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;

    harness.socket.fail_next_updates(1);
    harness.socket.fail_next_connects(5);
    harness.presence.update_presence(Some(playing()));

    harness.presence.pump(AFTER_WINDOW).await; // the write fails
    harness.presence.pump(AFTER_WINDOW).await; // the reconnect fails

    assert_eq!(harness.notices.count(), 1);
}

/// Discord rate-limits presence updates to one per fifteen seconds, and a burst
/// of track changes is exactly what would trip it.
#[tokio::test]
async fn a_second_update_inside_the_rate_limit_window_is_made_to_wait() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;
    assert_eq!(harness.socket.activities().len(), 1);

    harness
        .presence
        .update_presence(Some(DiscordMusicPresenceActivity {
            title: "Racing Into The Night".to_owned(),
            ..playing()
        }));

    let outcome = harness.presence.pump(NOW).await;
    let Pump::Again { retry_in } = outcome else {
        panic!("expected the update to be held back, got {outcome:?}");
    };
    assert!(
        retry_in > Duration::from_secs(14) && retry_in <= Duration::from_secs(15),
        "the wait is the remainder of the window, got {retry_in:?}"
    );
    assert_eq!(
        harness.socket.activities().len(),
        1,
        "nothing more reached discord"
    );
}

/// Coalescing: while an update is waiting out the rate limit, a newer one
/// replaces it, so a user skipping through tracks does not queue up a backlog
/// of stale cards.
#[tokio::test]
async fn a_newer_update_replaces_one_that_is_still_waiting() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;

    for title in ["Second", "Third", "Fourth"] {
        harness
            .presence
            .update_presence(Some(DiscordMusicPresenceActivity {
                title: title.to_owned(),
                ..playing()
            }));
        harness.presence.pump(NOW).await;
    }

    assert_eq!(
        harness.socket.activities().len(),
        1,
        "only the first card has gone out; the rest coalesced into one pending update"
    );

    // Once the window passes, exactly one more card goes out, and it is the
    // newest — not a backlog of three replayed in order.
    settle(&harness, AFTER_WINDOW, 5).await;

    let shown = harness.socket.activities();
    assert_eq!(shown.len(), 2, "the backlog collapsed into a single update");
    assert_eq!(
        shown[1].state.as_deref(),
        Some("Fourth by Yoasobi"),
        "the newest snapshot is the one that reaches discord"
    );
}

#[tokio::test]
async fn switching_rich_presence_off_clears_the_card_and_closes_the_socket() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;
    assert!(harness.presence.is_connected());

    harness
        .presence
        .update_settings(DiscordRpcSettingsPatch {
            enabled: Some(false),
            ..DiscordRpcSettingsPatch::default()
        })
        .await;

    assert!(!harness.presence.is_connected());
    let calls = harness.socket.calls();
    assert!(
        calls.contains(&Call::ClearActivity),
        "the card comes down immediately rather than going stale"
    );
    assert!(calls.contains(&Call::Close));

    assert_eq!(harness.presence.pump(NOW).await, Pump::Idle);
}

/// Switching off and on again must be able to report a fresh failure rather
/// than staying silent about a Discord that is still missing.
#[tokio::test]
async fn re_enabling_can_report_a_new_failure() {
    let harness = harness(true);
    harness.socket.fail_next_connects(20);
    harness.presence.update_presence(Some(playing()));

    harness.presence.pump(NOW).await;
    harness.presence.pump(NOW).await;
    assert_eq!(harness.notices.count(), 1);

    harness
        .presence
        .update_settings(DiscordRpcSettingsPatch {
            enabled: Some(false),
            ..DiscordRpcSettingsPatch::default()
        })
        .await;
    harness
        .presence
        .update_settings(DiscordRpcSettingsPatch {
            enabled: Some(true),
            ..DiscordRpcSettingsPatch::default()
        })
        .await;

    harness.presence.pump(NOW).await;
    assert_eq!(
        harness.notices.count(),
        2,
        "a fresh enable earns a fresh report"
    );
}

/// A settings change re-renders the card, but through the throttle — v1 was
/// careful that saving settings could not bypass Discord's rate limit.
#[tokio::test]
async fn a_settings_change_re_renders_without_bypassing_the_rate_limit() {
    let harness = harness(true);
    harness.presence.update_presence(Some(playing()));
    settle(&harness, NOW, 5).await;
    assert_eq!(harness.socket.activities().len(), 1);

    harness
        .presence
        .update_settings(DiscordRpcSettingsPatch {
            show_track_details: Some(false),
            ..DiscordRpcSettingsPatch::default()
        })
        .await;

    assert!(
        matches!(harness.presence.pump(NOW).await, Pump::Again { .. }),
        "the re-render is held back by the rate limit like any other update"
    );
    assert_eq!(harness.socket.activities().len(), 1);
}

#[tokio::test]
async fn clearing_the_presence_shows_the_idle_card() {
    let harness = harness(true);
    harness.presence.clear_presence();

    settle(&harness, NOW, 5).await;

    let shown = harness.socket.activities();
    assert_eq!(shown.len(), 1);
    assert_eq!(
        shown[0].details.as_deref(),
        Some("Idle"),
        "an idle presence is a card, not the absence of one"
    );
    assert_eq!(shown[0].state, None);
}
