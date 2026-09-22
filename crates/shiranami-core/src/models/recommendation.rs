//! Recommendation contracts, ported from
//! `packages/contracts/src/domain/recommendation.ts`.
//!
//! The renderer is read-only over these: it consumes precomputed shelves from
//! the cache and never triggers scoring or yt-dlp itself.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

use crate::models::weather::WeatherCondition;

/// Time-to-live for a cached shelf before it counts as stale (24 hours).
pub const RECOMMENDATION_TTL_MS: i64 = 24 * 60 * 60 * 1000;

/// Maximum number of similar tracks returned for a "More like this" request.
pub const SIMILAR_TRACKS_MAX: usize = 50;

/// Shelf identifiers: one cache row and one renderer section per kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum RecommendationKind {
    /// "Recommended from your library" — existing local tracks.
    Library,
    /// "Discover new music" — YouTube RD-mix results not in the library.
    Discover,
}

/// A track on the "Recommended from your library" shelf.
///
/// `track_id` is the local `tracks.id`, so the renderer plays it through the
/// normal library queue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRecommendation {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display title.
    pub title: String,
    /// Display artist.
    pub artist: String,
    /// Display album.
    pub album: String,
    /// Cached cover URL.
    pub album_art: Option<String>,
}

/// A track on the "Discover new music" shelf, pulled from a YouTube RD mix and
/// **not** in the local library.
///
/// The renderer routes a click through the existing search/download flow, so no
/// new playback path is needed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverRecommendation {
    /// YouTube video id.
    pub youtube_id: String,
    /// Video title.
    pub title: String,
    /// Channel name.
    pub uploader: String,
    /// Thumbnail URL.
    pub thumbnail: String,
    /// Watch URL, for the download/import path.
    pub url: String,
}

/// The "Recommended from your library" shelf.
///
/// TypeScript models both shelves as one generic `RecommendationShelf<TKind,
/// TItem>` so the `kind` discriminant is tied to the item type. Rust has no
/// string-literal types and `specta` 2.0.0-rc.25 does not ship literal
/// datatypes, so the two shelves are separate concrete structs instead. The wire
/// shape is unchanged; only the exported `kind` widens from the literal
/// `"library"` to [`RecommendationKind`], and the field it arrives in
/// ([`RecommendationShelves::library`]) already names the shelf.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryShelf {
    /// Always [`RecommendationKind::Library`].
    pub kind: RecommendationKind,
    /// The ranked tracks. Empty is a valid, quiet result.
    pub items: Vec<LibraryRecommendation>,
    /// ISO-8601 instant the shelf was produced; `None` when never generated.
    pub generated_at: Option<String>,
    /// Computed at read time: older than [`RECOMMENDATION_TTL_MS`].
    pub stale: bool,
}

/// The "Discover new music" shelf. See [`LibraryShelf`] for why this is a
/// separate struct rather than a generic instantiation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverShelf {
    /// Always [`RecommendationKind::Discover`].
    pub kind: RecommendationKind,
    /// The discovered tracks. Empty means yt-dlp returned nothing or degraded,
    /// which the shelf renders as a quiet empty state, never an error.
    pub items: Vec<DiscoverRecommendation>,
    /// ISO-8601 instant the shelf was produced; `None` when never generated.
    pub generated_at: Option<String>,
    /// Computed at read time: older than [`RECOMMENDATION_TTL_MS`].
    pub stale: bool,
}

/// Both shelves, as returned by the single read channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationShelves {
    /// The library-affinity shelf.
    pub library: LibraryShelf,
    /// The discovery shelf.
    pub discover: DiscoverShelf,
}

/// One result of a "More like this" / song-radio request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SimilarTrackResult {
    /// Local `tracks.id`, so the renderer plays it through the normal queue.
    pub track_id: String,
    /// Raw score from the similarity core; higher is closer.
    #[specta(type = Number)]
    pub similarity: f64,
}

/// Weather buckets the renderer passes to the smart-mix generator.
///
/// TypeScript declares this as its own union that is kept "structurally
/// compatible" with the Open-Meteo one. Rust can express that intent exactly, so
/// this is a re-export of [`WeatherCondition`] rather than a second enum that
/// could drift from it.
pub type SmartMixWeather = WeatherCondition;

/// Contextual signals the renderer collects and passes to the smart-mix channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartMixSignals {
    /// Local hour of day, 0–23.
    pub hour: u8,
    /// Current weather; omitted when the user has not opted in, in which case
    /// the generator degrades to time and decade mixes.
    #[specta(optional)]
    pub weather: Option<SmartMixWeather>,
}

/// Which flavour of mix was generated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SmartMixKind {
    /// Low-energy instrumental focus mix.
    Focus,
    /// Late-night listening.
    LateNight,
    /// Morning listening.
    Morning,
    /// Weather-driven: rain.
    RainyDay,
    /// Weather-driven: clear skies.
    SunnyDay,
    /// Weather-driven: snow.
    SnowyDay,
    /// Grouped by release decade.
    Decade,
}

/// One generated mood, activity or decade mix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartMixResult {
    /// Stable id for the mix within a generation run.
    pub id: String,
    /// Which flavour of mix this is.
    pub kind: SmartMixKind,
    /// i18n key for the title, in the `mixes` namespace.
    pub title_key: String,
    /// i18n key for the description, in the `mixes` namespace.
    pub desc_key: String,
    /// Set only for [`SmartMixKind::Decade`] mixes.
    #[specta(optional)]
    pub decade: Option<u32>,
    /// Local `tracks.id`s, ranked most-played first.
    pub track_ids: Vec<String>,
}
