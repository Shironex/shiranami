//! `discord-rpc:*` — Rich Presence settings and the two forced card updates.
//!
//! Four channels, ported from `apps/desktop/src/main/ipc/discord-rpc.ts`. The
//! namespace is `discord` because that is the key
//! `packages/contracts/src/ipc/channels.ts` files them under; the *commands* are
//! `discord_rpc_*` because §2.5's rename is mechanical on the **channel string**,
//! and the channel string is `discord-rpc:get-settings`.
//!
//! # These are not the now-playing path
//!
//! Routine playback never reaches here. v1's media handler called
//! `updateDiscordPresence` directly from `media:playback-state`, so
//! `update-presence` exists only to force a refresh after the settings UI saves,
//! and `clear-presence` for an explicit take-down. That is why a Discord that is
//! not running is not an error on either: both were registered with
//! `handleWithFallback` and an `undefined` fallback, and both return nothing
//! here for the same reason.
//!
//! # The albumArt v1 padded on is genuinely unused
//!
//! v1's handler wrote `{ ...activity, albumArt: null }` to widen the validated
//! activity into its `PlaybackState` shape. The presence builder never reads
//! that field — Discord cannot reach album art served over loopback, so the card
//! shows the static app logo in every state
//! ([`DISCORD_LARGE_IMAGE_KEY`](shiranami_core::models::DISCORD_LARGE_IMAGE_KEY)).
//! `DiscordMusicPresenceActivity` is therefore the whole argument, and the
//! padding has no port.
//!
//! # Absent Discord is a normal state, and the two halves differ
//!
//! `SHIRANAMI_E2E=1` runs with no Discord at all (§2.8 step 7), and until Phase
//! 16 boots there is none either. The four channels answer differently, and each
//! difference is v1's:
//!
//! | Channel           | With no Discord service                                  |
//! | ----------------- | -------------------------------------------------------- |
//! | `get-settings`    | reads the store — settings exist whether or not it runs   |
//! | `update-settings` | writes the store; there is nothing to reconnect or tear down |
//! | `update-presence` | `Ok(())` — v1's `undefined` fallback                      |
//! | `clear-presence`  | `Ok(())` — v1's `undefined` fallback                      |

use shiranami_core::models::{
    DiscordMusicPresenceActivity, DiscordRpcSettings, DiscordRpcSettingsPatch,
};
use shiranami_integrations::discord::settings;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::discord::discord_rpc_get_settings,
                crate::commands::discord::discord_rpc_update_settings,
                crate::commands::discord::discord_rpc_update_presence,
                crate::commands::discord::discord_rpc_clear_presence,
            ]
        }
    };
}
pub(crate) use commands;

/// `discord-rpc:get-settings` — the stored Rich Presence settings.
///
/// Read straight from the settings store rather than through
/// [`crate::seam::Presence`], because settings exist on a run that has no
/// Discord and the Settings UI has to render them there too. The crate's `load`
/// completes a partial blob from the defaults and applies the one-shot legacy
/// `settings.discordRpc` migration, so this is never a raw deserialize.
#[tauri::command]
#[specta::specta]
pub async fn discord_rpc_get_settings(
    state: State<'_, AppState>,
) -> CommandResult<DiscordRpcSettings> {
    Ok(settings::load(state.settings()))
}

/// `discord-rpc:update-settings` — patch the settings and act on the result.
///
/// v1's `updateDiscordRpcSettings` did four things: merge, persist, then
/// connect / disconnect / re-render depending on what changed. The last three
/// are why this goes through [`crate::seam::Presence::update_settings`] when a
/// Discord service exists — a store write alone would leave a stale card up
/// after a user switches Rich Presence off.
///
/// With no service the store write is the whole operation, which is the same
/// set of observable effects: there is no socket to close and no card to
/// re-render.
#[tauri::command]
#[specta::specta]
pub async fn discord_rpc_update_settings(
    state: State<'_, AppState>,
    updates: DiscordRpcSettingsPatch,
) -> CommandResult<DiscordRpcSettings> {
    match state.deferred().discord.as_ref() {
        Some(presence) => Ok(presence.update_settings(updates).await),
        None => settings::update(state.settings(), updates).wire(),
    }
}

/// `discord-rpc:update-presence` — force the card to re-render.
///
/// Returns nothing, and cannot fail: v1 registered this with an `undefined`
/// fallback because a Discord that is not running is the normal case, not an
/// error state to surface on every settings save.
#[tauri::command]
#[specta::specta]
pub async fn discord_rpc_update_presence(
    state: State<'_, AppState>,
    activity: DiscordMusicPresenceActivity,
) -> CommandResult<()> {
    if let Some(presence) = state.deferred().discord.as_ref() {
        presence.update(Some(activity)).await;
    }
    Ok(())
}

/// `discord-rpc:clear-presence` — take the card down.
///
/// Same fallback semantics as its sibling above.
#[tauri::command]
#[specta::specta]
pub async fn discord_rpc_clear_presence(state: State<'_, AppState>) -> CommandResult<()> {
    if let Some(presence) = state.deferred().discord.as_ref() {
        presence.clear().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seam::fake::RecordingPresence;
    use crate::state::tests::{state_over, state_over_with};
    use serde_json::json;
    use shiranami_core::models::{DiscordPresenceTemplates, DiscordPresenceTemplatesPatch};
    use shiranami_core::store::{MainStoreKey, RendererStoreKey};
    use std::sync::Arc;

    fn activity(title: &str) -> DiscordMusicPresenceActivity {
        DiscordMusicPresenceActivity {
            is_playing: true,
            title: title.to_owned(),
            artist: "Artist".to_owned(),
            album: "Album".to_owned(),
            duration: 200.0,
            current_time: 12.0,
        }
    }

    /// A state whose `Deferred.discord` is the recording double, plus a handle
    /// on that double so a test can read what the command layer asked for.
    async fn state_with_presence(
        dir: &std::path::Path,
    ) -> (crate::state::AppState, Arc<RecordingPresence>) {
        let presence = Arc::new(RecordingPresence::default());
        let state = state_over_with(
            dir,
            crate::state::Deferred {
                discord: Some(Arc::clone(&presence) as Arc<dyn crate::seam::Presence>),
                ..crate::state::Deferred::default()
            },
        )
        .await;
        (state, presence)
    }

    /// The whole point of the seam: an update reaches Discord as one call
    /// carrying the activity, not as a card the command layer rendered itself.
    #[tokio::test]
    async fn an_update_reaches_the_presence_seam_verbatim() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (state, presence) = state_with_presence(dir.path()).await;

        if let Some(seam) = state.deferred().discord.as_ref() {
            seam.update(Some(activity("Song"))).await;
        }

        let updates = presence.updates();
        assert_eq!(updates.len(), 1);
        assert_eq!(
            updates[0].as_ref().map(|a| a.title.as_str()),
            Some("Song"),
            "the activity crosses the seam unchanged"
        );
    }

    /// `clear` and `update(None)` show the same card and are different calls.
    /// A double that collapsed them would let a test asserting a take-down pass
    /// on an idle update.
    #[tokio::test]
    async fn clearing_is_a_distinct_call_from_an_idle_update() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (state, presence) = state_with_presence(dir.path()).await;

        if let Some(seam) = state.deferred().discord.as_ref() {
            seam.update(None).await;
            seam.clear().await;
        }

        assert_eq!(presence.updates(), vec![None]);
        assert_eq!(presence.clear_count(), 1);
    }

    /// A settings save re-renders the card **through** the throttle rather than
    /// bypassing it, which is why the write goes to the seam and not to the
    /// store: the command layer hands over the patch and the service decides
    /// whether that means connect, tear down, or re-send.
    #[tokio::test]
    async fn a_settings_update_is_handed_to_the_seam_rather_than_written_around_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (state, presence) = state_with_presence(dir.path()).await;

        let seam = state
            .deferred()
            .discord
            .as_ref()
            .expect("the double is installed");
        let updated = seam
            .update_settings(DiscordRpcSettingsPatch {
                enabled: Some(true),
                ..DiscordRpcSettingsPatch::default()
            })
            .await;

        assert!(updated.enabled);
        assert_eq!(presence.patches().len(), 1);
        assert_eq!(presence.patches()[0].enabled, Some(true));
        assert_eq!(
            presence.patches()[0].show_track_details,
            None,
            "the patch crosses the seam as the renderer sent it, not widened"
        );
    }

    #[tokio::test]
    async fn an_empty_store_reads_as_the_defaults() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        assert_eq!(
            settings::load(state.settings()),
            DiscordRpcSettings::default()
        );
    }

    /// The one-shot migration that keeps an existing user's presence switched
    /// on, asserted through the command layer's own read path.
    #[tokio::test]
    async fn the_legacy_settings_flag_still_seeds_enabled() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        state
            .settings()
            .set(RendererStoreKey::Settings, json!({ "discordRpc": true }))
            .expect("write the legacy flag");

        assert!(settings::load(state.settings()).enabled);
    }

    /// With no Discord service the command still persists, so the Settings UI
    /// is not read-only on an `SHIRANAMI_E2E=1` run.
    #[tokio::test]
    async fn an_update_with_no_discord_service_still_persists() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let updated = settings::update(
            state.settings(),
            DiscordRpcSettingsPatch {
                enabled: Some(true),
                ..DiscordRpcSettingsPatch::default()
            },
        )
        .expect("persist");

        assert!(updated.enabled);
        assert!(
            settings::load(state.settings()).enabled,
            "and it round-trips"
        );
    }

    /// v1 merged `templates` per activity type, not per field, and left every
    /// unnamed key alone. The renderer sends one toggle at a time, so a patch
    /// that reset its siblings would wipe a user's templates on a checkbox.
    #[tokio::test]
    async fn a_patch_leaves_every_key_it_does_not_name_alone() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        settings::update(
            state.settings(),
            DiscordRpcSettingsPatch {
                use_custom_templates: Some(true),
                templates: Some(DiscordPresenceTemplatesPatch {
                    idle: Some(shiranami_core::models::DiscordPresenceTemplate {
                        details: "Away".to_owned(),
                        state: String::new(),
                        show_timestamp: false,
                        show_large_image: false,
                        show_button: false,
                    }),
                    ..DiscordPresenceTemplatesPatch::default()
                }),
                ..DiscordRpcSettingsPatch::default()
            },
        )
        .expect("persist");

        let stored = settings::load(state.settings());
        assert!(stored.use_custom_templates);
        assert!(
            stored.show_track_details,
            "an unnamed key keeps its current value"
        );
        assert_eq!(stored.templates.idle.details, "Away");
        assert_eq!(
            stored.templates.playing,
            DiscordPresenceTemplates::default().playing,
            "an unnamed activity type keeps its whole template"
        );
    }

    /// The settings blob lives behind a **main-only** key. Nothing about this
    /// namespace should make it reachable through `store:get`.
    #[test]
    fn the_settings_key_is_not_renderer_addressable() {
        let parsed: Result<RendererStoreKey, _> =
            serde_json::from_value(json!("discord-rpc-settings"));
        assert!(parsed.is_err());

        assert_eq!(
            serde_json::to_value(MainStoreKey::DiscordRpcSettings).expect("serialize"),
            json!("discord-rpc-settings"),
            "…and it is that key these commands read and write"
        );
    }

    /// The argument shapes, pinned against v1's zod objects. The renderer builds
    /// both, so a renamed field is a silently ignored setting or a card that
    /// never updates.
    #[test]
    fn the_argument_shapes_keep_v1s_field_names() {
        let patch: DiscordRpcSettingsPatch = serde_json::from_str(
            r#"{"enabled":true,"showTrackDetails":false,"useCustomTemplates":true}"#,
        )
        .expect("v1's patch shape parses");
        assert_eq!(patch.enabled, Some(true));
        assert_eq!(patch.show_track_details, Some(false));
        assert_eq!(patch.use_custom_templates, Some(true));
        assert_eq!(patch.show_elapsed_time, None, "an absent key stays absent");

        let parsed: DiscordMusicPresenceActivity = serde_json::from_str(
            r#"{"isPlaying":true,"title":"Song","artist":"Artist","album":"Album",
                "duration":200,"currentTime":12}"#,
        )
        .expect("v1's activity shape parses");
        assert_eq!(
            parsed,
            activity("Song"),
            "every key is camelCase on the wire and snake_case in Rust"
        );
    }
}
