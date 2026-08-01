//! Domain models — the shared vocabulary ported from `packages/contracts/src/domain`.
//!
//! Every type here crosses the IPC boundary, so three properties are load-bearing
//! and are pinned by tests in [`crate::bindings`] rather than left to review:
//!
//! 1. **Casing.** The renderer has always seen camelCase keys, so every struct
//!    carries `#[serde(rename_all = "camelCase")]`. The Rust field names stay
//!    snake_case; only the wire form is renamed.
//! 2. **Optionality.** The TypeScript sources distinguish `foo: T | null`
//!    (key always present) from `foo?: T` (key may be absent). Both become
//!    `Option<T>` in Rust; the latter additionally carries `#[specta(optional)]`
//!    so the generated TypeScript keeps the `?`.
//! 3. **Numbers.** `specta` widens `f64` to `number | null` (serde_json renders
//!    a NaN as `null`) and refuses 64-bit integers outright to prevent silent
//!    precision loss. Fields whose TypeScript type is a plain `number` therefore
//!    carry `#[specta(type = Number)]`, which overrides the *exported* type
//!    without touching the Rust one. Small integers (`i32`/`u32`) need no
//!    override.
//!
//! One deliberate, recorded widening: because `#[serde(skip_serializing_if)]`
//! requires `specta`'s phased export mode — which would split every type into a
//! separate input and output form and double the binding surface — an absent
//! optional field serializes as an explicit `null` rather than being omitted.
//! The generated `foo?: T | null` describes that honestly, and every renderer
//! consumer of these fields tests truthiness, for which `null` and `undefined`
//! behave identically.

pub mod dependencies;
pub mod discord;
pub mod download_queue;
pub mod folder;
pub mod history;
pub mod lyrics;
pub mod media;
pub mod patch;
pub mod playlist;
pub mod radio;
pub mod recommendation;
pub mod scrobble;
pub mod smart_playlist;
pub mod track;
pub mod weather;

pub use dependencies::{InstallDependenciesResult, Tool, ToolInstallResult};
pub use discord::{
    DISCORD_LANDING_URL, DISCORD_LARGE_IMAGE_KEY, DISCORD_MAX_FIELD_LENGTH,
    DiscordMusicActivityType, DiscordMusicPresenceActivity, DiscordPresenceTemplate,
    DiscordPresenceTemplates, DiscordPresenceTemplatesPatch, DiscordRpcSettings,
    DiscordRpcSettingsPatch, SHIRANAMI_DISCORD_CLIENT_ID,
};
pub use download_queue::{
    DownloadQueueItem, DownloadQueueSnapshot, DownloadQueueStatus, EnqueueDownloadInput,
};
pub use folder::WatchedFolder;
pub use history::{
    ListeningActivityPoint, ListeningAlbumStat, ListeningHistoryEntry,
    ListeningHourlyActivityPoint, ListeningStatsArtist, ListeningStatsSummary, ListeningStatsTrack,
    PlayHistoryRecord, RecordPlayInput, WeeklyInsights,
};
pub use lyrics::{LyricLine, LyricsResult, LyricsSource};
pub use media::{MatchFlag, PlaylistExtractResult, SearchResult, TrackMetadata};
pub use patch::{Patch, double_option};
pub use playlist::{
    Playlist, PlaylistCreateInput, PlaylistCreateWithTracksInput, PlaylistUpdateInput,
};
pub use radio::{RadioFavorite, RadioStationInput};
pub use recommendation::{
    DiscoverRecommendation, DiscoverShelf, LibraryRecommendation, LibraryShelf,
    RECOMMENDATION_TTL_MS, RecommendationKind, RecommendationShelves, SIMILAR_TRACKS_MAX,
    SimilarTrackResult, SmartMixKind, SmartMixResult, SmartMixSignals, SmartMixWeather,
};
pub use scrobble::{LastfmAuthStart, ScrobbleConnectError, ScrobbleConnectResult, ScrobbleStatus};
pub use smart_playlist::{
    SmartPlaylist, SmartPlaylistDefinition, SmartPlaylistField, SmartPlaylistMatchType,
    SmartPlaylistOperator, SmartPlaylistRule,
};
pub use track::{DisplayTrack, NewTrack, Track, TrackCreateInput, TrackUpdateInput};
pub use weather::{GeocodeResult, WeatherCondition, WeatherCurrent};
