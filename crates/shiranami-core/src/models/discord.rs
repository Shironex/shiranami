//! Discord Rich Presence contracts, ported from
//! `packages/shared/src/types/discord.ts` and its constants sibling.
//!
//! These live in `shiranami-core` rather than in `shiranami-integrations` for
//! the same reason the history wire types did in Phase 7: they cross the IPC
//! boundary, and the `specta` export harness CI diffs is in this crate.
//!
//! The constants below are a **mirror** of `packages/shared`, never a
//! redefinition (§2.2, subsystem 36). `packages/shared` stays TypeScript, and
//! two of these values are load-bearing outside this repo: the client id names
//! a registered application at discord.com/developers, and the image key names
//! an art asset uploaded to it. A test asserts each still matches the
//! TypeScript literal.
//!
//! # Templates as a struct, not a map
//!
//! TypeScript models the per-activity templates as
//! `Record<DiscordMusicActivityType, DiscordPresenceTemplate>` — a total map.
//! [`DiscordPresenceTemplates`] is a three-field struct instead, which
//! serializes to the identical JSON while making "all three activity types have
//! a template" hold by construction rather than by convention. The *partial*
//! forms v1 accepted on the way in — a stored blob missing a key, or an update
//! patching one — get their own explicitly partial types
//! ([`DiscordPresenceTemplatesPatch`], [`DiscordRpcSettingsPatch`]), so the
//! merge that v1 wrote as a spread is a typed operation here.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Shiranami's registered Discord application client id.
///
/// Mirrored from `packages/shared/src/constants/discord.ts`. Presence only
/// renders for an application that exists in the Discord Developer Portal.
pub const SHIRANAMI_DISCORD_CLIENT_ID: &str = "1484544721060761610";

/// Rich Presence art asset key — a name, not a URL.
///
/// Must match an art asset uploaded for [`SHIRANAMI_DISCORD_CLIENT_ID`], or the
/// logo slot renders blank. Shiranami's local album art is served over loopback
/// and is not reachable by Discord, so the static app logo stands in for every
/// presence state.
pub const DISCORD_LARGE_IMAGE_KEY: &str = "shiranami";

/// Landing-page button shown on the presence card.
pub const DISCORD_LANDING_URL: &str = "https://shiranami.app";

/// Discord rich-presence string fields must be at most 128 characters.
pub const DISCORD_MAX_FIELD_LENGTH: usize = 128;

/// Music-player presence states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DiscordMusicActivityType {
    /// A track is playing.
    Playing,
    /// A track is loaded but paused.
    Paused,
    /// Nothing is loaded.
    Idle,
}

/// One status template. `details` is line 1, `state` is line 2.
///
/// The three toggles control whether the track timer, the app logo and the
/// landing button appear in the rendered presence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresenceTemplate {
    /// Line 1 of the presence card. Supports `{title}`/`{artist}`/`{album}`.
    pub details: String,
    /// Line 2 of the presence card. Supports the same tokens.
    pub state: String,
    /// Whether to show the track timer.
    pub show_timestamp: bool,
    /// Whether to show the app logo.
    pub show_large_image: bool,
    /// Whether to show the landing-page button.
    pub show_button: bool,
}

/// One template per activity type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresenceTemplates {
    /// Template used while a track is playing.
    pub playing: DiscordPresenceTemplate,
    /// Template used while a track is paused.
    pub paused: DiscordPresenceTemplate,
    /// Template used while nothing is loaded.
    pub idle: DiscordPresenceTemplate,
}

/// A partial [`DiscordPresenceTemplates`] — the shape v1 accepted on the way in.
///
/// Both a stored blob written by an older build and a settings update may name
/// only some activity types; the missing ones fall back to the current value,
/// exactly as v1's object spread did.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresenceTemplatesPatch {
    /// Replacement template for `playing`, when named.
    #[specta(optional)]
    pub playing: Option<DiscordPresenceTemplate>,
    /// Replacement template for `paused`, when named.
    #[specta(optional)]
    pub paused: Option<DiscordPresenceTemplate>,
    /// Replacement template for `idle`, when named.
    #[specta(optional)]
    pub idle: Option<DiscordPresenceTemplate>,
}

impl Default for DiscordPresenceTemplates {
    /// The defaults from `packages/shared/src/constants/discord.ts`.
    ///
    /// Shiranami has no main-process i18n, so `details` is a literal English
    /// string rather than an `@@i18n:` sentinel. The renderer presents these
    /// verbatim and persists them as-is; resetting a template restores them.
    fn default() -> Self {
        Self {
            playing: DiscordPresenceTemplate {
                details: "Listening to music".to_owned(),
                state: "{title} by {artist}".to_owned(),
                show_timestamp: true,
                show_large_image: true,
                show_button: true,
            },
            paused: DiscordPresenceTemplate {
                details: "Music paused".to_owned(),
                state: "{title} by {artist}".to_owned(),
                show_timestamp: false,
                show_large_image: true,
                show_button: false,
            },
            idle: DiscordPresenceTemplate {
                details: "Idle".to_owned(),
                state: String::new(),
                show_timestamp: false,
                show_large_image: true,
                show_button: false,
            },
        }
    }
}

impl DiscordPresenceTemplates {
    /// The template for one activity type.
    pub fn for_activity(&self, activity: DiscordMusicActivityType) -> &DiscordPresenceTemplate {
        match activity {
            DiscordMusicActivityType::Playing => &self.playing,
            DiscordMusicActivityType::Paused => &self.paused,
            DiscordMusicActivityType::Idle => &self.idle,
        }
    }

    /// Apply a patch, keeping the current template for every unnamed key.
    #[must_use]
    pub fn patched(mut self, patch: DiscordPresenceTemplatesPatch) -> Self {
        if let Some(playing) = patch.playing {
            self.playing = playing;
        }
        if let Some(paused) = patch.paused {
            self.paused = paused;
        }
        if let Some(idle) = patch.idle {
            self.idle = idle;
        }
        self
    }
}

/// Persisted Discord RPC settings.
///
/// Lives behind [`crate::store::MainStoreKey::DiscordRpcSettings`]; the
/// renderer reads and writes it through dedicated commands rather than the
/// generic store surface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcSettings {
    /// Master switch for Rich Presence.
    pub enabled: bool,
    /// Show the track title/artist lines on Discord.
    pub show_track_details: bool,
    /// Show the elapsed/remaining track timer.
    pub show_elapsed_time: bool,
    /// When true, the per-activity templates drive the presence text.
    pub use_custom_templates: bool,
    /// The per-activity templates.
    pub templates: DiscordPresenceTemplates,
}

impl Default for DiscordRpcSettings {
    /// v1's `DEFAULT_SETTINGS`: off, but with the display toggles on, so that
    /// enabling it once produces a useful presence with no further setup.
    fn default() -> Self {
        Self {
            enabled: false,
            show_track_details: true,
            show_elapsed_time: true,
            use_custom_templates: false,
            templates: DiscordPresenceTemplates::default(),
        }
    }
}

/// A partial [`DiscordRpcSettings`] — what the settings UI sends.
///
/// Every key is optional because the renderer patches individual fields.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcSettingsPatch {
    /// New value for the master switch, when named.
    #[specta(optional)]
    pub enabled: Option<bool>,
    /// New value for the track-details toggle, when named.
    #[specta(optional)]
    pub show_track_details: Option<bool>,
    /// New value for the elapsed-time toggle, when named.
    #[specta(optional)]
    pub show_elapsed_time: Option<bool>,
    /// New value for the custom-templates toggle, when named.
    #[specta(optional)]
    pub use_custom_templates: Option<bool>,
    /// Templates to replace, when named.
    #[specta(optional)]
    pub templates: Option<DiscordPresenceTemplatesPatch>,
}

impl DiscordRpcSettings {
    /// Apply a patch, keeping the current value for every unnamed key.
    #[must_use]
    pub fn patched(mut self, patch: DiscordRpcSettingsPatch) -> Self {
        if let Some(enabled) = patch.enabled {
            self.enabled = enabled;
        }
        if let Some(show_track_details) = patch.show_track_details {
            self.show_track_details = show_track_details;
        }
        if let Some(show_elapsed_time) = patch.show_elapsed_time {
            self.show_elapsed_time = show_elapsed_time;
        }
        if let Some(use_custom_templates) = patch.use_custom_templates {
            self.use_custom_templates = use_custom_templates;
        }
        if let Some(templates) = patch.templates {
            self.templates = self.templates.patched(templates);
        }
        self
    }
}

/// The now-playing snapshot the presence builder consumes.
///
/// Mirrors the relevant fields of the main-process playback state, kept
/// independent — as v1 kept it — so the builder stays pure and the crate that
/// owns OS media controls is not a dependency of the crate that owns Discord.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscordMusicPresenceActivity {
    /// Whether playback is running.
    pub is_playing: bool,
    /// Track title.
    pub title: String,
    /// Track artist.
    pub artist: String,
    /// Track album.
    pub album: String,
    /// Total track length in seconds.
    #[specta(type = Number)]
    pub duration: f64,
    /// Current playhead position in seconds.
    #[specta(type = Number)]
    pub current_time: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::repo_file;

    fn shared_constants() -> String {
        repo_file("packages/shared/src/constants/discord.ts")
    }

    /// The mirror half of "a Rust mirror with an equality test, never a
    /// redefinition". The client id and the image key both name things that
    /// exist outside this repo, so drift here renders a blank presence card
    /// with nothing in any log to say why.
    #[test]
    fn the_constants_mirror_packages_shared() {
        let ts = shared_constants();
        for (name, value) in [
            ("SHIRANAMI_DISCORD_CLIENT_ID", SHIRANAMI_DISCORD_CLIENT_ID),
            ("DISCORD_LARGE_IMAGE_KEY", DISCORD_LARGE_IMAGE_KEY),
            ("DISCORD_LANDING_URL", DISCORD_LANDING_URL),
        ] {
            let declaration = format!("export const {name} = '{value}';");
            assert!(
                ts.contains(&declaration),
                "packages/shared no longer declares `{declaration}`"
            );
        }
        assert!(
            ts.contains(&format!(
                "export const DISCORD_MAX_FIELD_LENGTH = {DISCORD_MAX_FIELD_LENGTH};"
            )),
            "the field-length cap has drifted from packages/shared"
        );
    }

    /// The defaults are persisted verbatim the first time a user saves, and a
    /// "reset template" button restores them, so they are a contract too.
    #[test]
    fn the_default_templates_mirror_packages_shared() {
        let ts = shared_constants();
        let defaults = DiscordPresenceTemplates::default();

        for template in [&defaults.playing, &defaults.paused, &defaults.idle] {
            assert!(
                ts.contains(&format!("details: '{}'", template.details)),
                "packages/shared no longer declares the default details `{}`",
                template.details
            );
        }
        assert!(ts.contains("state: '{title} by {artist}'"));
        assert_eq!(
            defaults.idle.state, "",
            "the idle template shows no second line"
        );
    }

    /// Only `playing` shows a timer and a button by default — a frozen timer on
    /// a paused card reads as a bug, which is why the toggles differ per state.
    #[test]
    fn only_the_playing_template_shows_a_timer_and_a_button() {
        let defaults = DiscordPresenceTemplates::default();
        assert!(defaults.playing.show_timestamp && defaults.playing.show_button);
        assert!(!defaults.paused.show_timestamp && !defaults.paused.show_button);
        assert!(!defaults.idle.show_timestamp && !defaults.idle.show_button);
        for template in [&defaults.playing, &defaults.paused, &defaults.idle] {
            assert!(template.show_large_image, "the logo shows in every state");
        }
    }

    /// The struct must serialize to the same object the `Record` did, or a
    /// settings blob written by v1 stops loading.
    #[test]
    fn templates_serialize_as_the_record_typescript_declares() {
        let json = serde_json::to_value(DiscordPresenceTemplates::default()).expect("serialize");
        for key in ["playing", "paused", "idle"] {
            assert!(json.get(key).is_some(), "missing the `{key}` key");
        }
        assert_eq!(json["playing"]["showTimestamp"], serde_json::json!(true));
        assert_eq!(json["playing"]["showLargeImage"], serde_json::json!(true));
        assert_eq!(json["playing"]["showButton"], serde_json::json!(true));
    }

    #[test]
    fn a_patch_replaces_only_the_keys_it_names() {
        let patched = DiscordRpcSettings::default().patched(DiscordRpcSettingsPatch {
            enabled: Some(true),
            ..DiscordRpcSettingsPatch::default()
        });
        assert!(patched.enabled);
        assert!(
            patched.show_track_details,
            "an unnamed key keeps its current value"
        );
        assert_eq!(patched.templates, DiscordPresenceTemplates::default());
    }

    /// v1 merged templates per activity type, not per field within a template.
    #[test]
    fn a_template_patch_replaces_whole_activity_templates() {
        let replacement = DiscordPresenceTemplate {
            details: "Custom".to_owned(),
            state: String::new(),
            show_timestamp: false,
            show_large_image: false,
            show_button: false,
        };
        let patched = DiscordRpcSettings::default().patched(DiscordRpcSettingsPatch {
            templates: Some(DiscordPresenceTemplatesPatch {
                playing: Some(replacement.clone()),
                ..DiscordPresenceTemplatesPatch::default()
            }),
            ..DiscordRpcSettingsPatch::default()
        });

        assert_eq!(patched.templates.playing, replacement);
        assert_eq!(
            patched.templates.paused,
            DiscordPresenceTemplates::default().paused,
            "an unnamed activity type keeps its current template whole"
        );
    }

    #[test]
    fn for_activity_selects_the_matching_template() {
        let templates = DiscordPresenceTemplates::default();
        assert_eq!(
            templates.for_activity(DiscordMusicActivityType::Paused),
            &templates.paused
        );
        assert_eq!(
            templates.for_activity(DiscordMusicActivityType::Idle),
            &templates.idle
        );
    }

    /// v1's defaults, which decide what a user sees the first time they enable
    /// Rich Presence without opening the template editor.
    #[test]
    fn the_settings_default_to_off_with_the_display_toggles_on() {
        let settings = DiscordRpcSettings::default();
        assert!(!settings.enabled);
        assert!(settings.show_track_details);
        assert!(settings.show_elapsed_time);
        assert!(!settings.use_custom_templates);
    }
}
