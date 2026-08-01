//! Reading and writing the scrobbling settings, and the gate over them.
//!
//! Ported from `getSettings` / `setSettings` / `activeTargets` /
//! `getScrobbleStatus` in `apps/desktop/src/main/scrobble/scrobbler.ts`.
//!
//! The blob behind `scrobble.settings` holds the Last.fm session key and the
//! ListenBrainz token, which is why that key is main-only (§3.4) and why
//! nothing in this module returns it. [`status`] is the whole renderer-visible
//! surface: four booleans, a display name, and a count.

use shiranami_core::error::CoreError;
use shiranami_core::models::ScrobbleStatus;
use shiranami_core::store::{MainStoreKey, ScrobbleSettings, SettingsStore};
use shiranami_db::repo::scrobble_queue::ScrobbleTargets;

/// Which backends a play should be submitted to right now.
///
/// Three conditions, all v1's, in v1's order: the master switch is on, and each
/// backend has the credentials it needs. Last.fm additionally needs the
/// application credential this build may not have — `lastfm_configured` is that
/// answer, passed in rather than read here so this stays a pure function of the
/// settings.
pub fn active_targets(settings: &ScrobbleSettings, lastfm_configured: bool) -> ScrobbleTargets {
    if !settings.enabled {
        return ScrobbleTargets::NONE;
    }

    ScrobbleTargets {
        lastfm: lastfm_configured && has_credential(settings.lastfm_session_key.as_deref()),
        listenbrainz: has_credential(settings.listen_brainz_token.as_deref()),
    }
}

/// The renderer-visible connection status.
///
/// `pending` is the parked-scrobble count, which lives in the database rather
/// than in these settings, so the caller supplies it.
///
/// Deliberately **not** a function of whether this build has a Last.fm
/// application credential. v1 reported `Boolean(settings.lastfmSessionKey)` and
/// nothing more, so a user who connected under a configured build still reads
/// as connected under one that is not; the alternative would silently disown a
/// stored session over a packaging difference. [`active_targets`] is where the
/// build's configuration does gate behaviour, because that is where sending
/// without a signature would actually fail.
pub fn status(settings: &ScrobbleSettings, pending: u32) -> ScrobbleStatus {
    ScrobbleStatus {
        enabled: settings.enabled,
        lastfm_connected: has_credential(settings.lastfm_session_key.as_deref()),
        lastfm_username: settings.lastfm_username.clone(),
        listen_brainz_connected: has_credential(settings.listen_brainz_token.as_deref()),
        pending_count: pending,
    }
}

/// Persist `settings` under the main-only key.
///
/// # Errors
///
/// Returns [`CoreError`] when the settings file could not be written.
pub fn save(store: &SettingsStore, settings: &ScrobbleSettings) -> Result<(), CoreError> {
    let value = serde_json::to_value(settings).map_err(|source| CoreError::Json {
        path: store.path().to_path_buf(),
        source,
    })?;
    store.set_main(MainStoreKey::ScrobbleSettings, value)
}

/// A credential is present when it is stored and not blank.
///
/// v1 tested truthiness, which rejects `null`, `undefined` and `""` alike; an
/// `Option<String>` covers the first two and the emptiness check the third.
fn has_credential(value: Option<&str>) -> bool {
    value.is_some_and(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connected() -> ScrobbleSettings {
        ScrobbleSettings {
            enabled: true,
            lastfm_session_key: Some("SK".to_owned()),
            lastfm_username: Some("alice".to_owned()),
            listen_brainz_token: Some("TOKEN".to_owned()),
        }
    }

    /// The master switch beats every other condition — v1's first line.
    #[test]
    fn nothing_is_submitted_while_the_master_switch_is_off() {
        let settings = ScrobbleSettings {
            enabled: false,
            ..connected()
        };
        assert_eq!(active_targets(&settings, true), ScrobbleTargets::NONE);
    }

    #[test]
    fn both_backends_are_targets_when_both_are_connected() {
        assert_eq!(active_targets(&connected(), true), ScrobbleTargets::BOTH);
    }

    /// The configuration this port has to keep working: a build with no Last.fm
    /// application credential still scrobbles to ListenBrainz.
    #[test]
    fn listenbrainz_still_works_in_a_build_with_no_lastfm_credential() {
        assert_eq!(
            active_targets(&connected(), false),
            ScrobbleTargets::LISTENBRAINZ
        );
    }

    #[test]
    fn a_disconnected_backend_is_not_a_target() {
        let lastfm_only = ScrobbleSettings {
            listen_brainz_token: None,
            ..connected()
        };
        assert_eq!(active_targets(&lastfm_only, true), ScrobbleTargets::LASTFM);

        let neither = ScrobbleSettings {
            lastfm_session_key: None,
            listen_brainz_token: None,
            ..connected()
        };
        assert_eq!(active_targets(&neither, true), ScrobbleTargets::NONE);
    }

    /// A blank credential is no credential. v1 tested truthiness, so `""` never
    /// counted as connected.
    #[test]
    fn a_blank_credential_does_not_count_as_connected() {
        let blank = ScrobbleSettings {
            lastfm_session_key: Some(String::new()),
            listen_brainz_token: Some(String::new()),
            ..connected()
        };
        assert_eq!(active_targets(&blank, true), ScrobbleTargets::NONE);
        assert!(!status(&blank, 0).lastfm_connected);
        assert!(!status(&blank, 0).listen_brainz_connected);
    }

    /// The status is the only thing the renderer sees, and it carries no
    /// secrets — asserted by serializing it and looking for them.
    #[test]
    fn the_status_never_carries_a_credential() {
        let json = serde_json::to_string(&status(&connected(), 3)).expect("serialize");
        assert!(
            !json.contains("SK"),
            "the session key leaked into the status"
        );
        assert!(!json.contains("TOKEN"), "the token leaked into the status");
        assert!(
            json.contains("alice"),
            "the display name is meant to be there"
        );
    }

    #[test]
    fn the_status_reports_the_pending_count_it_is_given() {
        assert_eq!(status(&connected(), 7).pending_count, 7);
        assert_eq!(status(&connected(), 0).pending_count, 0);
    }

    /// A stored session survives a build without the application credential, so
    /// the user is not silently disconnected by a packaging change.
    #[test]
    fn a_stored_session_still_reads_as_connected_without_an_api_key() {
        assert!(status(&connected(), 0).lastfm_connected);
    }
}
