//! `media:*` — the renderer's push of now-playing state onto the OS.
//!
//! Two channels, ported from `apps/desktop/src/main/ipc/media.ts`. Both return
//! `void` and neither can fail, which is the whole shape of the namespace: the
//! renderer is telling the shell what it is playing, and what the shell does
//! with that is not the renderer's problem.
//!
//! # This is a fan-out, and v1's fan-out is wider than the channel name suggests
//!
//! `media:playback-state` looks like "update the OS media surface". In v1 its
//! handler did **three** things, and only the first is named by the channel:
//!
//! | v1 did                            | v2 does                                                      |
//! | --------------------------------- | ------------------------------------------------------------ |
//! | `updateTrayWithPlaybackState`     | inside [`crate::seam::MediaControls`] — `tray::TrayModel`      |
//! | `updateDiscordPresence(state)`    | [`crate::seam::Presence::update`], from **here** (see below)   |
//! | `win.setProgressBar(…)` on win32  | inside the seam — `progress::TaskbarProgress`                  |
//!
//! The tray and the taskbar bar are both pure functions of the same
//! [`MediaState`] (`shiranami_media_controls::tray` and `::progress` model them
//! exactly that way), so they are the seam implementation's business in Phase
//! 16 rather than a second and third call from this layer. There is one value
//! and it goes to one place.
//!
//! Discord cannot be folded in the same way, and that is worth stating plainly
//! because it is the one thing about this namespace that would be silently lost
//! by a lane porting only what the channel is called. v1's own comment in
//! `ipc/discord-rpc.ts` says it:
//!
//! > *Normal now-playing updates flow through `media:playback-state` (the media
//! > handler calls `updateDiscordPresence` directly), so the renderer does NOT
//! > use `update-presence` for routine playback. `update-presence` exists only
//! > to force a presence refresh after the settings UI saves.*
//!
//! So `discord-rpc:update-presence` — the `discord` namespace's channel — is
//! the *settings-save* path, and **this** command is the one that renders the
//! presence card for every track the user actually plays. Wiring only the
//! former would leave Rich Presence permanently stuck on whatever was playing
//! when the settings dialog was last closed. That is exactly the class of
//! regression R13 names, so it is ported here, where v1 put it.
//!
//! # `media:clear-state` clears the surface but only *pauses* Discord
//!
//! Another asymmetry taken verbatim: v1's clear handler calls
//! `updateDiscordPresence(null)`, **not** `clearDiscordPresence()`. The
//! difference is real — `update(None)` re-renders "nothing is playing" through
//! the fifteen-second throttle, while `clear` tears the card down — and only
//! `discord-rpc:clear-presence` does the latter. [`crate::seam::Presence`]
//! already draws that distinction, so the port is a one-to-one mapping and not
//! a judgement call.
//!
//! # The album art is dropped on the way to Discord, as it was in v1
//!
//! [`DiscordMusicPresenceActivity`] is [`NowPlaying`] minus `album_art`, and v1
//! agreed in both directions: its presence builder never read the cover, and
//! `discord-rpc:update-presence` padded the missing field back with
//! `albumArt: null` on the way in. The cover is a `http://127.0.0.1:…` URL from
//! the local stream server, which Discord's servers could not fetch even if the
//! card had somewhere to put it.
//!
//! # Nothing here fails, including when nothing is wired
//!
//! `SHIRANAMI_E2E=1` runs with no media controls and no Discord (§2.8 step 7),
//! and until Phase 16 boots them neither is present at all. Both are therefore
//! `Option` in [`crate::state::Deferred`] and an absent one is a **no-op**, not
//! an error: v1's handlers returned `void` and swallowed backend failures, and
//! the renderer pushes this state once a second without awaiting the promise.
//! Rejecting would turn a degraded OS integration into a toast on every track.

use shiranami_core::models::DiscordMusicPresenceActivity;
use shiranami_media_controls::{MediaState, NowPlaying};
use tauri::State;

use crate::error::CommandResult;
use crate::state::{AppState, Deferred};

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::media::media_playback_state,
                crate::commands::media::media_clear_state,
            ]
        }
    };
}
pub(crate) use commands;

/// `media:playback-state` — show this track on every OS surface.
///
/// The parameter is named `playback` rather than v1's `state` only because
/// `state` is taken by the managed-state extractor; the shim calls positionally
/// and the argument's *shape* — v1's seven-key `MediaPlaybackState` — is what
/// has to match, which [`NowPlaying`] pins with its own test.
#[tauri::command]
#[specta::specta]
pub async fn media_playback_state(
    state: State<'_, AppState>,
    playback: NowPlaying,
) -> CommandResult<()> {
    publish(state.deferred(), playback).await;
    Ok(())
}

/// `media:clear-state` — take the app off the OS surfaces.
#[tauri::command]
#[specta::specta]
pub async fn media_clear_state(state: State<'_, AppState>) -> CommandResult<()> {
    clear(state.deferred()).await;
    Ok(())
}

/// v1's `media:playback-state` fan-out.
///
/// Extracted from the command for the reason `weather::validate_query` is: a
/// test can reach it with a [`Deferred`] holding the recording doubles and no
/// Tauri runtime anywhere. The alternative is a copy of the fan-out in the test,
/// which is a copy that can quietly stop matching the one that runs.
///
/// Order is v1's: the media surface (which carries the tray and the taskbar bar
/// with it) before Discord.
async fn publish(deferred: &Deferred, playback: NowPlaying) {
    if let Some(controls) = &deferred.media_controls {
        controls.publish(MediaState::Loaded(playback.clone())).await;
    }
    if let Some(presence) = &deferred.discord {
        presence.update(Some(presence_activity(&playback))).await;
    }
}

/// v1's `media:clear-state` fan-out. See the module docs for why Discord gets
/// `update(None)` here rather than `clear`.
async fn clear(deferred: &Deferred) {
    if let Some(controls) = &deferred.media_controls {
        controls.clear().await;
    }
    if let Some(presence) = &deferred.discord {
        presence.update(None).await;
    }
}

/// [`NowPlaying`] as Discord's presence builder wants it: the same fields minus
/// the cover, which nothing on that path has ever read.
fn presence_activity(playback: &NowPlaying) -> DiscordMusicPresenceActivity {
    DiscordMusicPresenceActivity {
        is_playing: playback.is_playing,
        title: playback.title.clone(),
        artist: playback.artist.clone(),
        album: playback.album.clone(),
        duration: playback.duration,
        current_time: playback.current_time,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seam::fake::{RecordingMediaControls, RecordingPresence};
    use std::sync::Arc;

    fn track() -> NowPlaying {
        NowPlaying {
            is_playing: true,
            title: "Yoru ni Kakeru".to_owned(),
            artist: "YOASOBI".to_owned(),
            album: "THE BOOK".to_owned(),
            duration: 261.0,
            current_time: 42.5,
            album_art: Some("http://127.0.0.1:9/t/art/beef.jpg".to_owned()),
        }
    }

    /// Both seams present, which is what a booted desktop looks like.
    fn wired() -> (Deferred, Arc<RecordingMediaControls>, Arc<RecordingPresence>) {
        let controls = Arc::new(RecordingMediaControls::default());
        let presence = Arc::new(RecordingPresence::default());
        let deferred = Deferred {
            media_controls: Some(Arc::clone(&controls) as Arc<_>),
            discord: Some(Arc::clone(&presence) as Arc<_>),
            ..Deferred::default()
        };
        (deferred, controls, presence)
    }

    #[tokio::test]
    async fn a_playback_push_reaches_the_os_media_surface() {
        let (deferred, controls, _presence) = wired();

        publish(&deferred, track()).await;

        assert_eq!(
            controls.published(),
            vec![MediaState::Loaded(track())],
            "the seam receives v1's payload unchanged"
        );
        assert_eq!(controls.clear_count(), 0);
    }

    /// The regression this module exists to prevent: Rich Presence for routine
    /// playback travels `media:playback-state`, not `discord-rpc:update-presence`.
    #[tokio::test]
    async fn a_playback_push_also_renders_the_discord_card() {
        let (deferred, _controls, presence) = wired();

        publish(&deferred, track()).await;

        assert_eq!(
            presence.updates(),
            vec![Some(DiscordMusicPresenceActivity {
                is_playing: true,
                title: "Yoru ni Kakeru".to_owned(),
                artist: "YOASOBI".to_owned(),
                album: "THE BOOK".to_owned(),
                duration: 261.0,
                current_time: 42.5,
            })],
            "v1's media handler called updateDiscordPresence directly"
        );
    }

    #[tokio::test]
    async fn clearing_takes_the_app_off_the_media_surface() {
        let (deferred, controls, _presence) = wired();

        clear(&deferred).await;

        assert_eq!(controls.clear_count(), 1);
        assert!(controls.published().is_empty());
    }

    /// v1's clear handler called `updateDiscordPresence(null)`, not
    /// `clearDiscordPresence()`. `update(None)` re-renders "nothing playing"
    /// through the fifteen-second throttle; `clear` tears the card down, and
    /// only `discord-rpc:clear-presence` does that.
    #[tokio::test]
    async fn clearing_pauses_the_discord_card_rather_than_tearing_it_down() {
        let (deferred, _controls, presence) = wired();

        clear(&deferred).await;

        assert_eq!(
            presence.updates(),
            vec![None],
            "an update carrying nothing, not a clear"
        );
        assert_eq!(
            presence.clear_count(),
            0,
            "`clear` belongs to discord-rpc:clear-presence, not to this channel"
        );
    }

    /// `SHIRANAMI_E2E=1` and every pre-Phase-16 run have neither seam. v1's
    /// handlers returned `void` and swallowed backend failures; a rejection here
    /// would become a toast on every track change.
    #[tokio::test]
    async fn neither_command_fails_when_nothing_is_wired() {
        let empty = Deferred::default();

        publish(&empty, track()).await;
        clear(&empty).await;
    }

    /// Only one of the two seams present is a real state — Discord is optional
    /// for the user, media controls are compiled out on Linux — so neither
    /// branch may depend on the other having run.
    #[tokio::test]
    async fn each_seam_is_driven_independently_of_the_other() {
        let controls = Arc::new(RecordingMediaControls::default());
        let only_controls = Deferred {
            media_controls: Some(Arc::clone(&controls) as Arc<_>),
            ..Deferred::default()
        };
        publish(&only_controls, track()).await;
        assert_eq!(controls.published().len(), 1);

        let presence = Arc::new(RecordingPresence::default());
        let only_presence = Deferred {
            discord: Some(Arc::clone(&presence) as Arc<_>),
            ..Deferred::default()
        };
        publish(&only_presence, track()).await;
        assert_eq!(presence.updates().len(), 1);
    }

    /// The cover is dropped rather than carried and ignored: v1's presence
    /// builder never read it, and it is a loopback URL Discord's servers could
    /// not fetch.
    #[test]
    fn the_discord_activity_is_the_playback_state_minus_the_cover() {
        let activity = presence_activity(&track());

        let keys: Vec<String> = serde_json::to_value(&activity)
            .expect("the activity serializes")
            .as_object()
            .expect("as an object")
            .keys()
            .cloned()
            .collect();

        assert!(
            !keys.iter().any(|key| key == "albumArt"),
            "v1 padded this field back with null on the way in; it never went out"
        );
    }

    /// The argument shape the shim forwards straight through. Pinned here as
    /// well as in `shiranami_media_controls::state` because *this* is the
    /// signature the renderer's `sendPlaybackState` lands on.
    #[test]
    fn the_command_argument_is_v1s_media_playback_state() {
        let parsed: NowPlaying = serde_json::from_str(
            r#"{"isPlaying":true,"title":"Yoru ni Kakeru","artist":"YOASOBI",
                "album":"THE BOOK","duration":261,"currentTime":42.5,
                "albumArt":"http://127.0.0.1:9/t/art/beef.jpg"}"#,
        )
        .expect("v1's payload parses");

        assert_eq!(parsed, track());
    }

    /// A deliberate, recorded widening. v1's zod schema had
    /// `albumArt: z.string().nullable()` **without** `.optional()`, so an absent
    /// key was a `BAD_REQUEST`; serde reads a missing `Option` as `None`. The
    /// renderer always sends the key (`albumArt: currentTrack.albumArt ?? null`),
    /// so nothing observable changes — but the port accepts strictly more than
    /// v1 did here, and that is worth a test saying so rather than a surprise.
    #[test]
    fn an_absent_cover_key_is_accepted_where_v1_refused_it() {
        let parsed: NowPlaying = serde_json::from_str(
            r#"{"isPlaying":false,"title":"t","artist":"a","album":"b",
                "duration":1,"currentTime":0}"#,
        )
        .expect("serde reads a missing Option as None");

        assert_eq!(parsed.album_art, None);
    }
}
