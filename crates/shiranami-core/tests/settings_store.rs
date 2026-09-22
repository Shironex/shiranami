//! Settings-store behaviour, with the v1 `config.json` compatibility contract
//! (architecture §3.4) as the centrepiece.
//!
//! The fixture below is the shape electron-store actually writes: dot notation
//! is on by default, so `player.volume` is nested while `music-folders` is flat,
//! and a key the running version does not model is simply present. Every
//! assertion here is really one question — can v2 open the file v1 left behind
//! without losing anything?

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};
use shiranami_core::store::{MainStoreKey, RendererStoreKey, SettingsStore};

/// A v1 `config.json` covering both nesting styles, the opaque renderer blobs,
/// the secret-bearing key, and a key this version has never heard of.
fn v1_config() -> Value {
    json!({
        "settings": { "discordRpc": true },
        "music-folders": ["/Users/me/Music"],
        "player-state": { "queue": ["a", "b"], "index": 1 },
        "window-bounds": { "x": 100, "y": 80, "width": 1280, "height": 800 },
        "compact-window-bounds": { "x": 40, "y": 40 },
        "theme": "dark",
        "player": { "volume": 0.8, "isMuted": false },
        "app": {
            "language": "pl",
            "onboardingCompleted": true,
            "supportBannerSeen": true,
            "telemetryEnabled": true,
            "performanceMonitoringEnabled": false
        },
        "metadata-enrich": { "skippedIds": ["track-1", "track-2"] },
        "system": { "launchAtStartup": true, "minimizeToTray": false, "closeToTray": true },
        "lyrics": { "preferSyncedFromLrclib": true },
        "downloads": {
            "location": "/Users/me/Music/Shiranami Downloads",
            "queuePaused": false,
            "toolStatusCache": { "ytdlp": "ok", "timestamp": 1_750_000_000_000_i64 }
        },
        "migrations": { "albumArtV1": true },
        "scrobble": {
            "settings": {
                "enabled": true,
                "lastfmSessionKey": "s3cr3t-session-key",
                "lastfmUsername": "shironex",
                "listenBrainzToken": "lb-token"
            }
        },
        "discord-rpc-settings": { "enabled": true, "showTrackDetails": true },
        "a-key-from-a-later-v1-patch": { "kept": true }
    })
}

fn store_with(contents: Option<&Value>) -> (tempfile::TempDir, SettingsStore) {
    let dir = tempfile::tempdir().expect("create a data dir");
    let path = dir.path().join("config.json");
    if let Some(value) = contents {
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(value).expect("encode the fixture"),
        )
        .expect("seed config.json");
    }
    let (store, quarantined) = SettingsStore::load(path);
    assert_eq!(quarantined, None, "a valid fixture must not be quarantined");
    (dir, store)
}

/* --------------------------- v1 compatibility --------------------------- */

#[test]
fn reads_every_renderer_key_out_of_a_v1_config() {
    let (_dir, store) = store_with(Some(&v1_config()));

    assert_eq!(store.get(RendererStoreKey::Theme), Some(json!("dark")));
    assert_eq!(store.get(RendererStoreKey::PlayerVolume), Some(json!(0.8)));
    assert_eq!(
        store.get(RendererStoreKey::PlayerIsMuted),
        Some(json!(false))
    );
    assert_eq!(store.get(RendererStoreKey::AppLanguage), Some(json!("pl")));
    assert_eq!(
        store.get(RendererStoreKey::AppOnboardingCompleted),
        Some(json!(true))
    );
    assert_eq!(
        store.get(RendererStoreKey::MetadataEnrichSkippedIds),
        Some(json!(["track-1", "track-2"]))
    );
    assert_eq!(
        store.get(RendererStoreKey::SystemCloseToTray),
        Some(json!(true))
    );
    assert_eq!(
        store.get(RendererStoreKey::LyricsPreferSyncedFromLrclib),
        Some(json!(true))
    );
    // The opaque blobs come back verbatim rather than being reshaped.
    assert_eq!(
        store.get(RendererStoreKey::MusicFolders),
        Some(json!(["/Users/me/Music"]))
    );
    assert_eq!(
        store.get(RendererStoreKey::WindowBounds),
        Some(json!({ "x": 100, "y": 80, "width": 1280, "height": 800 }))
    );
}

#[test]
fn reads_every_main_only_key_out_of_a_v1_config() {
    let (_dir, store) = store_with(Some(&v1_config()));

    assert_eq!(
        store.get_main(MainStoreKey::MigrationsAlbumArtV1),
        Some(json!(true))
    );
    assert_eq!(
        store.get_main(MainStoreKey::DownloadsQueuePaused),
        Some(json!(false))
    );
    assert_eq!(
        store.get_main(MainStoreKey::CompactWindowBounds),
        Some(json!({ "x": 40, "y": 40 }))
    );
    assert!(
        store
            .get_main(MainStoreKey::DiscordRpcSettings)
            .is_some_and(|value| value["enabled"] == json!(true))
    );
}

/// The credentials §3.4 keeps in this file for v2.0 have to survive the move,
/// or every user re-authenticates Last.fm during the migration release.
#[test]
fn reads_the_scrobble_credentials_v1_stored() {
    let (_dir, store) = store_with(Some(&v1_config()));
    let scrobble = store.scrobble_settings();

    assert!(scrobble.enabled);
    assert_eq!(
        scrobble.lastfm_session_key.as_deref(),
        Some("s3cr3t-session-key")
    );
    assert_eq!(scrobble.lastfm_username.as_deref(), Some("shironex"));
    assert_eq!(scrobble.listen_brainz_token.as_deref(), Some("lb-token"));
}

/// A write must not silently drop the parts of the document this version does
/// not model — including whatever a later v1.x patch adds while v2 is in
/// development.
#[test]
fn preserves_unmodelled_keys_across_a_write() {
    let (dir, store) = store_with(Some(&v1_config()));

    store
        .set(RendererStoreKey::Theme, json!("light"))
        .expect("write the theme");

    let written: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join("config.json")).expect("read back"))
            .expect("parse the written file");

    assert_eq!(written["theme"], json!("light"), "the write landed");
    assert_eq!(
        written["a-key-from-a-later-v1-patch"],
        json!({ "kept": true }),
        "an unmodelled key must survive the round trip"
    );
    assert_eq!(
        written["scrobble"]["settings"]["lastfmSessionKey"],
        json!("s3cr3t-session-key"),
        "unrelated secrets must not be disturbed by an unrelated write"
    );
}

#[test]
fn writing_one_nested_key_leaves_its_siblings_alone() {
    let (_dir, store) = store_with(Some(&v1_config()));
    store
        .set(RendererStoreKey::PlayerVolume, json!(0.25))
        .expect("write the volume");

    assert_eq!(store.get(RendererStoreKey::PlayerVolume), Some(json!(0.25)));
    assert_eq!(
        store.get(RendererStoreKey::PlayerIsMuted),
        Some(json!(false))
    );
}

/* ------------------------------ typed reads ----------------------------- */

#[test]
fn treats_a_blank_downloads_location_as_unset() {
    let (_dir, store) = store_with(Some(&json!({ "downloads": { "location": "   " } })));
    assert_eq!(
        store.downloads_location(),
        None,
        "a blank string means the platform default, exactly as in v1"
    );
}

#[test]
fn reads_a_configured_downloads_location() {
    let (_dir, store) = store_with(Some(&v1_config()));
    assert_eq!(
        store.downloads_location(),
        Some(std::path::PathBuf::from(
            "/Users/me/Music/Shiranami Downloads"
        ))
    );
}

/// A fresh install must never initialise Sentry, so an absent key is a hard no.
#[test]
fn telemetry_is_off_until_explicitly_enabled() {
    let (_dir, store) = store_with(None);
    assert!(!store.telemetry_enabled());

    store
        .set(RendererStoreKey::AppTelemetryEnabled, json!(true))
        .expect("grant consent");
    assert!(store.telemetry_enabled());
}

/// v1 only touched the OS login item when the stored value was a boolean, so
/// "never set" must stay distinguishable from "set to false".
#[test]
fn launch_at_startup_distinguishes_unset_from_false() {
    let (_dir, store) = store_with(None);
    assert_eq!(store.launch_at_startup(), None);

    store
        .set(RendererStoreKey::SystemLaunchAtStartup, json!(false))
        .expect("write the preference");
    assert_eq!(store.launch_at_startup(), Some(false));
}

/* ------------------------- absent and corrupt files ---------------------- */

#[test]
fn a_missing_file_starts_from_defaults_without_erroring() {
    let (_dir, store) = store_with(None);
    assert_eq!(store.get(RendererStoreKey::Theme), None);
    store
        .set(RendererStoreKey::Theme, json!("system"))
        .expect("the first write creates the file");
    assert_eq!(store.get(RendererStoreKey::Theme), Some(json!("system")));
}

/// The defaults-over-corruption bug D17 exists to prevent: without quarantine,
/// the next write persists `{}` over a file that still holds the user's
/// scrobble credentials.
#[test]
fn quarantines_a_corrupt_file_before_falling_back_to_defaults() {
    let dir = tempfile::tempdir().expect("create a data dir");
    let path = dir.path().join("config.json");
    let corrupt = br#"{"scrobble":{"settings":{"lastfmSessionKey":"s3cr3t"#;
    std::fs::write(&path, corrupt).expect("seed a corrupt file");

    let (store, quarantined) = SettingsStore::load(path.clone());
    let backup = quarantined.expect("a corrupt file must be quarantined");

    assert_eq!(
        std::fs::read(&backup).expect("read the backup"),
        corrupt,
        "the original bytes are preserved verbatim for recovery"
    );

    store
        .set(RendererStoreKey::Theme, json!("dark"))
        .expect("write after recovery");
    assert_eq!(
        std::fs::read(&backup).expect("read the backup again"),
        corrupt,
        "the later write must not reach the quarantined bytes"
    );
}

/// Valid JSON that is not an object is as unusable as a parse failure, and just
/// as recoverable, so it takes the same route.
#[test]
fn quarantines_a_file_that_parses_but_is_not_an_object() {
    let dir = tempfile::tempdir().expect("create a data dir");
    let path = dir.path().join("config.json");
    std::fs::write(&path, b"[1,2,3]").expect("seed an array");

    let (_store, quarantined) = SettingsStore::load(path);
    assert!(quarantined.is_some());
}

/* --------------------------------- 0600 --------------------------------- */

/// R22: the file holds plaintext secrets, so it must never exist at the default
/// umask — including for the temp-file window that actually receives the bytes.
#[cfg(unix)]
#[test]
fn the_written_file_is_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let (dir, store) = store_with(None);
    store
        .set(RendererStoreKey::Theme, json!("dark"))
        .expect("write the settings");

    let mode = std::fs::metadata(dir.path().join("config.json"))
        .expect("stat the settings file")
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
}

/* ------------------------------ change bus ------------------------------ */

#[test]
fn publishes_a_change_when_the_value_actually_changes() {
    let (_dir, store) = store_with(Some(&v1_config()));
    let seen = Arc::new(AtomicUsize::new(0));

    let counter = Arc::clone(&seen);
    store
        .bus()
        .subscribe(RendererStoreKey::AppTelemetryEnabled.path(), move |event| {
            assert_eq!(event.previous, Some(json!(true)));
            assert_eq!(event.current, Some(json!(false)));
            assert!(!event.is_enabled());
            counter.fetch_add(1, Ordering::SeqCst);
        });

    store
        .set(RendererStoreKey::AppTelemetryEnabled, json!(false))
        .expect("revoke consent");
    assert_eq!(seen.load(Ordering::SeqCst), 1);
}

/// electron-store's `onDidChange` fires on change, not on write. Re-publishing
/// an identical value would make the Sentry gate tear down and rebuild a client
/// for nothing.
#[test]
fn does_not_publish_when_the_value_is_unchanged() {
    let (_dir, store) = store_with(Some(&v1_config()));
    let seen = Arc::new(AtomicUsize::new(0));

    let counter = Arc::clone(&seen);
    store
        .bus()
        .subscribe(RendererStoreKey::Theme.path(), move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });

    store
        .set(RendererStoreKey::Theme, json!("dark"))
        .expect("write the same value back");
    assert_eq!(seen.load(Ordering::SeqCst), 0);
}

#[test]
fn publishes_a_deletion_as_an_absent_current_value() {
    let (_dir, store) = store_with(Some(&v1_config()));
    let seen = Arc::new(AtomicUsize::new(0));

    let counter = Arc::clone(&seen);
    store
        .bus()
        .subscribe(RendererStoreKey::Theme.path(), move |event| {
            assert_eq!(event.previous, Some(json!("dark")));
            assert_eq!(event.current, None);
            counter.fetch_add(1, Ordering::SeqCst);
        });

    store
        .delete(RendererStoreKey::Theme)
        .expect("delete the theme");
    assert_eq!(seen.load(Ordering::SeqCst), 1);
    assert_eq!(store.get(RendererStoreKey::Theme), None);
}

/// A listener that reads the store back must not deadlock against the write
/// that notified it — the login-item handler is one line away from doing this.
#[test]
fn a_listener_may_read_the_store_while_being_notified() {
    let dir = tempfile::tempdir().expect("create a data dir");
    let (store, _) = SettingsStore::load(dir.path().join("config.json"));
    let store = Arc::new(store);

    let reentrant = Arc::clone(&store);
    store
        .bus()
        .subscribe(RendererStoreKey::SystemLaunchAtStartup.path(), move |_| {
            assert_eq!(reentrant.launch_at_startup(), Some(true));
        });

    store
        .set(RendererStoreKey::SystemLaunchAtStartup, json!(true))
        .expect("write the preference");
}
