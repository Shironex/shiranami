//! The settings key space, split by who is allowed to touch it.
//!
//! Architecture §3.4: *"the renderer-writable key allowlist
//! (`RENDERER_STORE_KEYS`) becomes a Rust enum; main-only keys
//! (`discord-rpc-settings`, `downloads.*`, `migrations.albumArtV1`,
//! `scrobble.settings`) are unreachable from `store_get` / `store_set` by
//! construction, as today."*
//!
//! v1 enforced this at the IPC boundary with a zod enum, which rejected an
//! unlisted key at runtime. Making [`RendererStoreKey`] the *parameter type* of
//! the store commands moves the same guarantee to deserialization: a payload
//! naming `scrobble.settings` fails to parse into the enum, so the handler body
//! is never entered and the secret is unreachable rather than merely unread.
//!
//! Both enums carry the electron-store **dot paths**, because the on-disk
//! document is nested — electron-store has dot notation on by default, so
//! `player.volume` lives at `{"player":{"volume":…}}` while `music-folders`
//! (no dot) is a flat top-level key. Reading a v1 `config.json` in place
//! depends on honouring that distinction exactly.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A settings key the renderer may read, write and delete.
///
/// The serialized form is the dot path, so this deserializes directly from the
/// string the renderer sends today and no translation table is needed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum RendererStoreKey {
    /// Opaque renderer settings blob.
    #[serde(rename = "settings")]
    Settings,
    /// Opaque music-folder list.
    #[serde(rename = "music-folders")]
    MusicFolders,
    /// Opaque persisted player state.
    #[serde(rename = "player-state")]
    PlayerState,
    /// Output volume, 0..1.
    #[serde(rename = "player.volume")]
    PlayerVolume,
    /// Whether output is muted.
    #[serde(rename = "player.isMuted")]
    PlayerIsMuted,
    /// Colour theme: `light`, `dark` or `system`.
    #[serde(rename = "theme")]
    Theme,
    /// Opaque main-window bounds.
    #[serde(rename = "window-bounds")]
    WindowBounds,
    /// UI language tag.
    #[serde(rename = "app.language")]
    AppLanguage,
    /// Whether onboarding has been completed.
    #[serde(rename = "app.onboardingCompleted")]
    AppOnboardingCompleted,
    /// Whether the support banner has been dismissed.
    #[serde(rename = "app.supportBannerSeen")]
    AppSupportBannerSeen,
    /// Telemetry consent. Watched by the Sentry gate.
    #[serde(rename = "app.telemetryEnabled")]
    AppTelemetryEnabled,
    /// Whether performance monitoring is on.
    #[serde(rename = "app.performanceMonitoringEnabled")]
    AppPerformanceMonitoringEnabled,
    /// Track ids the user excluded from metadata enrichment.
    #[serde(rename = "metadata-enrich.skippedIds")]
    MetadataEnrichSkippedIds,
    /// Whether to register an OS login item. Watched by the login-item gate.
    #[serde(rename = "system.launchAtStartup")]
    SystemLaunchAtStartup,
    /// Whether minimizing hides to the tray.
    #[serde(rename = "system.minimizeToTray")]
    SystemMinimizeToTray,
    /// Whether closing hides to the tray.
    #[serde(rename = "system.closeToTray")]
    SystemCloseToTray,
    /// Whether to prefer LRCLIB's synced lyrics over local files.
    #[serde(rename = "lyrics.preferSyncedFromLrclib")]
    LyricsPreferSyncedFromLrclib,
}

/// A settings key only the main process may touch.
///
/// Never exposed as a command parameter. `scrobble.settings` is the reason the
/// split is load-bearing: it holds the Last.fm session key and the ListenBrainz
/// token, which must never cross the command boundary in either direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MainStoreKey {
    /// Discord Rich Presence configuration.
    #[serde(rename = "discord-rpc-settings")]
    DiscordRpcSettings,
    /// Compact-mode window position.
    #[serde(rename = "compact-window-bounds")]
    CompactWindowBounds,
    /// Configured downloads directory; blank or absent means the default.
    #[serde(rename = "downloads.location")]
    DownloadsLocation,
    /// Cached yt-dlp/ffmpeg availability probe.
    #[serde(rename = "downloads.toolStatusCache")]
    DownloadsToolStatusCache,
    /// Whether the download queue is paused across restarts.
    #[serde(rename = "downloads.queuePaused")]
    DownloadsQueuePaused,
    /// Whether the one-shot album-art migration has run.
    #[serde(rename = "migrations.albumArtV1")]
    MigrationsAlbumArtV1,
    /// Scrobbling credentials. **Secret-bearing.**
    #[serde(rename = "scrobble.settings")]
    ScrobbleSettings,
    /// Whether the one-time v2 crossover ping has fired.
    #[serde(rename = "v2.crossoverPinged")]
    V2CrossoverPinged,
    /// The imported custom background: file name, poster still, dimensions.
    ///
    /// Main-only for two reasons. The renderer allowlist is pinned to v1's
    /// tuple, so a renderer key would fail the mirror test — but the stronger
    /// reason is that this value *names a file the serve route will open*.
    /// Renderer-writable would mean the renderer chooses that name.
    #[serde(rename = "appearance.customBackground")]
    AppearanceCustomBackground,
}

impl RendererStoreKey {
    /// Every renderer-writable key, in the order the TypeScript tuple lists them.
    pub const ALL: [Self; 17] = [
        Self::Settings,
        Self::MusicFolders,
        Self::PlayerState,
        Self::PlayerVolume,
        Self::PlayerIsMuted,
        Self::Theme,
        Self::WindowBounds,
        Self::AppLanguage,
        Self::AppOnboardingCompleted,
        Self::AppSupportBannerSeen,
        Self::AppTelemetryEnabled,
        Self::AppPerformanceMonitoringEnabled,
        Self::MetadataEnrichSkippedIds,
        Self::SystemLaunchAtStartup,
        Self::SystemMinimizeToTray,
        Self::SystemCloseToTray,
        Self::LyricsPreferSyncedFromLrclib,
    ];

    /// The electron-store dot path this key lives at in the document.
    ///
    /// Kept identical to the `serde` rename by a test, rather than derived from
    /// it at runtime — the wire name and the document path are the same string
    /// by design, and a test says so without leaking one per call.
    pub fn path(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::MusicFolders => "music-folders",
            Self::PlayerState => "player-state",
            Self::PlayerVolume => "player.volume",
            Self::PlayerIsMuted => "player.isMuted",
            Self::Theme => "theme",
            Self::WindowBounds => "window-bounds",
            Self::AppLanguage => "app.language",
            Self::AppOnboardingCompleted => "app.onboardingCompleted",
            Self::AppSupportBannerSeen => "app.supportBannerSeen",
            Self::AppTelemetryEnabled => "app.telemetryEnabled",
            Self::AppPerformanceMonitoringEnabled => "app.performanceMonitoringEnabled",
            Self::MetadataEnrichSkippedIds => "metadata-enrich.skippedIds",
            Self::SystemLaunchAtStartup => "system.launchAtStartup",
            Self::SystemMinimizeToTray => "system.minimizeToTray",
            Self::SystemCloseToTray => "system.closeToTray",
            Self::LyricsPreferSyncedFromLrclib => "lyrics.preferSyncedFromLrclib",
        }
    }
}

impl MainStoreKey {
    /// Every main-only key.
    pub const ALL: [Self; 9] = [
        Self::DiscordRpcSettings,
        Self::CompactWindowBounds,
        Self::DownloadsLocation,
        Self::DownloadsToolStatusCache,
        Self::DownloadsQueuePaused,
        Self::MigrationsAlbumArtV1,
        Self::ScrobbleSettings,
        Self::V2CrossoverPinged,
        Self::AppearanceCustomBackground,
    ];

    /// The electron-store dot path this key lives at in the document.
    ///
    /// See [`RendererStoreKey::path`] for why this is a match rather than a
    /// `serde` round-trip.
    pub fn path(self) -> &'static str {
        match self {
            Self::DiscordRpcSettings => "discord-rpc-settings",
            Self::CompactWindowBounds => "compact-window-bounds",
            Self::DownloadsLocation => "downloads.location",
            Self::DownloadsToolStatusCache => "downloads.toolStatusCache",
            Self::DownloadsQueuePaused => "downloads.queuePaused",
            Self::MigrationsAlbumArtV1 => "migrations.albumArtV1",
            Self::ScrobbleSettings => "scrobble.settings",
            Self::V2CrossoverPinged => "v2.crossoverPinged",
            Self::AppearanceCustomBackground => "appearance.customBackground",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::repo_file;

    /// Parse the `RENDERER_STORE_KEYS` tuple out of the TypeScript source.
    fn typescript_allowlist() -> Vec<String> {
        let source = repo_file("apps/desktop/src/main/ipc/schemas/store.ts");
        let start = source
            .find("const RENDERER_STORE_KEYS = [")
            .expect("the allowlist tuple must still exist");
        let body = &source[start..];
        let end = body
            .find("] as const;")
            .expect("the tuple must be terminated");

        body[..end]
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim().trim_end_matches(',');
                trimmed
                    .strip_prefix('\'')
                    .and_then(|rest| rest.strip_suffix('\''))
                    .map(str::to_owned)
            })
            .collect()
    }

    /// The whole security property is that this list matches. A key the Rust
    /// enum gained but TypeScript never allowed would widen the renderer's
    /// reach; one it lost would break a working renderer call.
    #[test]
    fn the_renderer_allowlist_matches_the_typescript_tuple_exactly() {
        let rust: Vec<String> = RendererStoreKey::ALL
            .iter()
            .map(|key| key.path().to_owned())
            .collect();
        assert_eq!(
            rust,
            typescript_allowlist(),
            "the Rust allowlist has drifted from RENDERER_STORE_KEYS"
        );
    }

    /// The complement of the property above: every main-only key must be absent
    /// from the renderer allowlist. `scrobble.settings` appearing there would
    /// hand the renderer a Last.fm session key.
    #[test]
    fn no_main_only_key_appears_in_the_renderer_allowlist() {
        let allowlist = typescript_allowlist();
        for key in MainStoreKey::ALL {
            assert!(
                !allowlist.contains(&key.path().to_owned()),
                "{} is main-only but appears in RENDERER_STORE_KEYS",
                key.path()
            );
        }
    }

    /// Main-only keys are unreachable by construction: the renderer sends a
    /// string, and a string naming a main-only key does not parse into
    /// [`RendererStoreKey`], so no handler body ever runs.
    #[test]
    fn a_main_only_key_does_not_deserialize_into_a_renderer_key() {
        for key in MainStoreKey::ALL {
            let json = format!("\"{}\"", key.path());
            assert!(
                serde_json::from_str::<RendererStoreKey>(&json).is_err(),
                "{} must not parse as a renderer-writable key",
                key.path()
            );
        }
    }

    #[test]
    fn renderer_keys_round_trip_through_their_dot_paths() {
        for key in RendererStoreKey::ALL {
            let parsed: RendererStoreKey =
                serde_json::from_str(&format!("\"{}\"", key.path())).expect("parse the dot path");
            assert_eq!(parsed, key);
        }
    }

    /// `path()` is hand-written, so this is what stops it drifting from the
    /// `serde` rename beside it — the two are the same string by design.
    #[test]
    fn every_path_equals_its_serde_rename() {
        for key in RendererStoreKey::ALL {
            let serialized = serde_json::to_string(&key).expect("serialize the key");
            assert_eq!(serialized, format!("\"{}\"", key.path()));
        }
        for key in MainStoreKey::ALL {
            let serialized = serde_json::to_string(&key).expect("serialize the key");
            assert_eq!(serialized, format!("\"{}\"", key.path()));
        }
    }
}
