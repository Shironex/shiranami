//! Saved internet-radio stations, ported from
//! `packages/contracts/src/domain/radio.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The station fields the renderer sends when saving a favourite.
///
/// Optional fields are omitted when the source station carries no value.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioStationInput {
    /// The radio-browser directory's stable station id.
    pub station_uuid: String,
    /// Station name.
    pub name: String,
    /// Advertised stream URL.
    pub url: String,
    /// Stream URL after the directory resolved redirects.
    pub url_resolved: String,
    /// Station homepage.
    #[specta(optional)]
    pub homepage: Option<String>,
    /// Favicon URL.
    #[specta(optional)]
    pub favicon: Option<String>,
    /// Country name.
    #[specta(optional)]
    pub country: Option<String>,
    /// ISO country code.
    #[specta(optional)]
    pub country_code: Option<String>,
    /// Broadcast language.
    #[specta(optional)]
    pub language: Option<String>,
    /// Stream codec ("MP3", "AAC", …).
    #[specta(optional)]
    pub codec: Option<String>,
    /// Stream bitrate in kbps.
    #[specta(optional)]
    pub bitrate: Option<u32>,
    /// Comma-separated tag list.
    #[specta(optional)]
    pub tags: Option<String>,
}

/// A persisted radio favourite, mirroring the `radio_favorites` row.
///
/// The nullable columns come back as `null` rather than absent, which is why
/// every optional field here is nullable instead of optional — the opposite of
/// [`RadioStationInput`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioFavorite {
    /// Primary key (UUID v4).
    pub id: String,
    /// The radio-browser directory's stable station id.
    pub station_uuid: String,
    /// Station name.
    pub name: String,
    /// Advertised stream URL.
    pub url: String,
    /// Stream URL after the directory resolved redirects.
    pub url_resolved: String,
    /// Station homepage.
    pub homepage: Option<String>,
    /// Favicon URL.
    pub favicon: Option<String>,
    /// Country name.
    pub country: Option<String>,
    /// ISO country code.
    pub country_code: Option<String>,
    /// Broadcast language.
    pub language: Option<String>,
    /// Stream codec.
    pub codec: Option<String>,
    /// Stream bitrate in kbps.
    pub bitrate: Option<u32>,
    /// Comma-separated tag list.
    pub tags: Option<String>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
}
