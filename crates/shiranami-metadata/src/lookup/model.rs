//! What a metadata lookup returns.
//!
//! Ported from `MetadataLookupResult` in
//! `packages/contracts/src/ipc/metadata.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Where a lookup result came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum LookupSource {
    /// The iTunes Search API.
    Itunes,
    /// A yt-dlp search, supplying a thumbnail when iTunes had no cover.
    ///
    /// This crate never produces it directly — yt-dlp lives above it in the
    /// crate spine. See [`crate::lookup::LookupFallback`].
    Youtube,
    /// Nothing matched.
    None,
    /// The result of an enrich *preview*, which proposes fields without
    /// writing them.
    Preview,
}

/// A candidate set of tags for a track.
///
/// Every field is optional because iTunes omits them freely, and because
/// `computeUpdatedFields` treats an absent value as "no suggestion" rather than
/// "clear this".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MetadataLookupResult {
    /// Matched title.
    ///
    /// Carried for display only: enrich never writes it. v1's
    /// `computeUpdatedFields` touches artist, album, genre, year and track
    /// number and deliberately not this, so a lookup cannot rename a track.
    #[specta(optional)]
    pub title: Option<String>,
    /// Matched artist.
    #[specta(optional)]
    pub artist: Option<String>,
    /// Matched album.
    #[specta(optional)]
    pub album: Option<String>,
    /// Matched genre.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Matched release year.
    #[specta(optional)]
    pub year: Option<i32>,
    /// Matched position within the album.
    #[specta(optional)]
    pub track_number: Option<i32>,
    /// URL of a cover to download, already upscaled where possible.
    #[specta(optional)]
    pub cover_image_url: Option<String>,
    /// Which backend produced this.
    pub source: LookupSource,
    /// How well the match scored, in `0.0..=1.0`.
    ///
    /// `Number` rather than the default float mapping: specta emits a bare float
    /// as `number | null`, because `serde_json` writes a NaN as `null`. v1's
    /// contract declares `confidence: number` and the score is a ratio of
    /// string-similarity counts, so the `null` branch is uninhabited — and a
    /// required field the renderer must narrow before comparing it to
    /// `MIN_CONFIDENCE` is a worse contract than the one being ported. The same
    /// treatment `shiranami_core::models::TrackMetadata` gives `duration`.
    #[specta(type = Number)]
    pub confidence: f64,
}

impl MetadataLookupResult {
    /// The "nothing matched" result.
    ///
    /// v1 returned `{ source: 'none', confidence: 0 }` rather than `null`, and
    /// the enrich batch keys on `source === 'none'` to report
    /// `'No metadata found'`.
    pub fn none() -> Self {
        Self {
            title: None,
            artist: None,
            album: None,
            genre: None,
            year: None,
            track_number: None,
            cover_image_url: None,
            source: LookupSource::None,
            confidence: 0.0,
        }
    }

    /// Whether this result carries a match at all.
    pub fn is_match(&self) -> bool {
        self.source != LookupSource::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_empty_result_is_not_a_match() {
        let none = MetadataLookupResult::none();

        assert!(!none.is_match());
        assert_eq!(none.confidence, 0.0);
        assert_eq!(none.source, LookupSource::None);
    }

    #[test]
    fn the_source_serialises_as_v1_spelled_it() {
        // `apps/web` switches on these strings.
        let json = |source| serde_json::to_string(&source).expect("serialises");

        assert_eq!(json(LookupSource::Itunes), r#""itunes""#);
        assert_eq!(json(LookupSource::Youtube), r#""youtube""#);
        assert_eq!(json(LookupSource::None), r#""none""#);
        assert_eq!(json(LookupSource::Preview), r#""preview""#);
    }
}
