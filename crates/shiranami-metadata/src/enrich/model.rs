//! The enrich flow's wire types.
//!
//! Ported from `packages/contracts/src/ipc/metadata.ts`. Field names match the
//! TypeScript exactly through `#[serde(rename_all = "camelCase")]`, because
//! `apps/web`'s enrich store reads them directly.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::lookup::LookupSource;

/// A track offered up for enrichment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichTrackInput {
    /// Database id, echoed back on the result so the caller can match them up.
    pub id: String,
    /// Where the file is, for the tag write.
    pub file_path: PathBuf,
    /// Current title — the search term, never overwritten.
    pub title: String,
    /// Current artist.
    pub artist: String,
    /// Current album.
    pub album: String,
    /// Current cover, which decides whether a new one is downloaded.
    pub album_art: Option<String>,
    /// Current genre.
    pub genre: String,
    /// Current year.
    pub year: Option<i32>,
    /// Current track number.
    pub track_number: Option<i32>,
}

/// What enrichment proposes to change.
///
/// `None` means "no suggestion", never "clear this" — enrichment only ever
/// fills or replaces, so there is no way for it to empty a field the user has
/// set.
///
/// **`title` is deliberately absent.** v1's `computeUpdatedFields` touches
/// artist, album, genre, year and track number and never the title, so
/// enrichment cannot rename a track out from under the user. The lookup result
/// still carries one, for display.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichUpdatedFields {
    /// Proposed artist.
    #[specta(optional)]
    pub artist: Option<String>,
    /// Proposed album.
    #[specta(optional)]
    pub album: Option<String>,
    /// Proposed genre.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Proposed year.
    #[specta(optional)]
    pub year: Option<i32>,
    /// Proposed track number.
    #[specta(optional)]
    pub track_number: Option<i32>,
    /// The cache URL of a newly downloaded cover.
    #[specta(optional)]
    pub album_art: Option<String>,
}

impl EnrichUpdatedFields {
    /// Whether anything at all is proposed.
    pub fn is_empty(&self) -> bool {
        self.artist.is_none()
            && self.album.is_none()
            && self.genre.is_none()
            && self.year.is_none()
            && self.track_number.is_none()
            && self.album_art.is_none()
    }
}

/// What enrichment did to one track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichTrackResult {
    /// The input's id.
    pub id: String,
    /// Whether a match was found.
    ///
    /// Match presence, **not** field count: a match that proposes nothing new
    /// still succeeded. v1 states this outright in a comment, and the renderer
    /// relies on it — a `false` here is what lands the track on the persisted
    /// skip list.
    pub success: bool,
    /// The proposed changes.
    pub updated_fields: EnrichUpdatedFields,
    /// Which backend matched.
    pub source: LookupSource,
    /// The match score, when there was a match.
    #[specta(optional)]
    pub confidence: Option<f64>,
    /// Why it failed, when it did.
    #[specta(optional)]
    pub error: Option<String>,
}

impl EnrichTrackResult {
    /// The "nothing matched" result. v1's `error: 'No metadata found'`.
    pub fn no_match(id: &str) -> Self {
        Self {
            id: id.to_owned(),
            success: false,
            updated_fields: EnrichUpdatedFields::default(),
            source: LookupSource::None,
            confidence: None,
            error: Some("No metadata found".to_owned()),
        }
    }

    /// A failed track. One failure never aborts the batch.
    pub fn failed(id: &str, error: impl std::fmt::Display) -> Self {
        Self {
            id: id.to_owned(),
            success: false,
            updated_fields: EnrichUpdatedFields::default(),
            source: LookupSource::None,
            confidence: None,
            error: Some(error.to_string()),
        }
    }
}

/// Where a track has got to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EnrichStatus {
    /// Looking the track up.
    Searching,
    /// Fetching a cover.
    Downloading,
    /// Writing tags to the file.
    Writing,
    /// Finished successfully.
    Done,
    /// Finished with a failure.
    Error,
    /// The run was cancelled. Emitted **once** per run, not once per track.
    Cancelled,
}

/// One progress tick.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichProgress {
    /// How far along the run is.
    ///
    /// For in-flight statuses this is `min(completed + 1, total)`, so several
    /// concurrent tracks report the same number; for `done`/`error` it is the
    /// completed count, which never goes backwards. Reproduced from v1 because
    /// the renderer's progress bar is tuned to it.
    pub current: usize,
    /// How many tracks the run covers.
    pub total: usize,
    /// The track's title, for display.
    pub track_name: String,
    /// What is happening.
    pub status: EnrichStatus,
    /// The match score. Populated on `done` only.
    #[specta(optional)]
    pub confidence: Option<f64>,
    /// Which backend matched. Populated on `done` only.
    #[specta(optional)]
    pub source: Option<LookupSource>,
}

/// Whether a run writes anything or only proposes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EnrichMode {
    /// Propose changes without touching the file.
    #[default]
    Preview,
    /// Apply them.
    Apply,
}

/// How a run behaves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct EnrichOptions {
    /// Preview or apply.
    pub mode: EnrichMode,
    /// Whether to write tags back to the file. Only meaningful in
    /// [`EnrichMode::Apply`].
    pub write_to_file: bool,
    /// Fill only the fields that are missing, rather than overwriting.
    pub only_missing: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_status_serialises_as_v1_spelled_it() {
        let json = |status| serde_json::to_string(&status).expect("serialises");

        assert_eq!(json(EnrichStatus::Searching), r#""searching""#);
        assert_eq!(json(EnrichStatus::Downloading), r#""downloading""#);
        assert_eq!(json(EnrichStatus::Writing), r#""writing""#);
        assert_eq!(json(EnrichStatus::Done), r#""done""#);
        assert_eq!(json(EnrichStatus::Error), r#""error""#);
        assert_eq!(json(EnrichStatus::Cancelled), r#""cancelled""#);
    }

    #[test]
    fn the_no_match_result_carries_v1s_message() {
        let result = EnrichTrackResult::no_match("abc");

        assert!(!result.success);
        assert_eq!(result.source, LookupSource::None);
        assert_eq!(result.error.as_deref(), Some("No metadata found"));
        assert!(result.updated_fields.is_empty());
    }

    #[test]
    fn updated_fields_serialise_in_camel_case() {
        let json = serde_json::to_string(&EnrichUpdatedFields {
            track_number: Some(3),
            album_art: Some("shiranami-art://art/x.jpg".to_owned()),
            ..Default::default()
        })
        .expect("serialises");

        assert!(json.contains("\"trackNumber\":3"), "{json}");
        assert!(json.contains("\"albumArt\""), "{json}");
    }
}
