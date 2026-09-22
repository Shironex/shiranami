//! The types `updater:*` puts on the wire.
//!
//! Four of them, and none has a home in `shiranami-core::models` yet for the
//! reason the parent module gives: there is no updater crate to own them. They
//! are ported field for field from `packages/contracts/src/ipc/preload-api.ts`,
//! including the two fields no renderer code reads.

use std::borrow::Cow;

use serde::{Deserialize, Serialize};
use shiranami_core::error::{WireError, codes};
use specta::Type;
use specta_typescript::Number;

/// What `updater:check-for-updates` answers.
///
/// v1's return type was the inline object `{ enabled: boolean }`, and `enabled`
/// means "this build has a working updater", not "an update was found" — the
/// answer to *that* arrives as an event. `useUpdater` reads only this field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterCheck {
    /// Whether this build can update itself at all.
    pub enabled: bool,
}

impl UpdaterCheck {
    /// v1's dev and macOS answer, and the answer when no updater is wired.
    pub const DISABLED: Self = Self { enabled: false };
    /// A check ran, whatever it found.
    pub const ENABLED: Self = Self { enabled: true };
}

/// Release metadata for `updater:update-available` and
/// `updater:update-downloaded`.
///
/// A field-for-field port of `UpdateInfo` in
/// `packages/contracts/src/ipc/preload-api.ts`, which v1 assembled from
/// electron-updater's own `UpdateInfo` — dropping everything else it carried,
/// and flattening `releaseNotes` on the way (see [`UpdateInfo::release_notes`]).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The version being offered, as the manifest spells it.
    pub version: String,
    /// The release notes, or `None` when the release has none.
    ///
    /// electron-updater typed this `string | Array<ReleaseNoteInfo> | null` and
    /// v1 normalised it before sending: an array became its entries' `note`
    /// fields joined by a blank line, an empty value became `null`. The wire
    /// type is therefore `string | null`, and the key is always present.
    pub release_notes: Option<String>,
    /// The release timestamp, as a string, exactly as the manifest carries it.
    ///
    /// Never parsed on either side of the boundary in v1, so it stays a string
    /// rather than becoming an instant that would have to round-trip.
    pub release_date: String,
}

/// Byte progress for `updater:download-progress`.
///
/// Ported from electron-updater's `ProgressInfo`, minus `delta`, which v1 did
/// not forward. Every field is a JavaScript `number`: `transferred` and `total`
/// are byte counts and `percent` is 0–100 (the renderer does
/// `Math.round(p.percent)`), so they are `f64` here rather than integer types
/// that specta would emit as `bigint`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    /// Current transfer rate in bytes per second.
    #[specta(type = Number)]
    pub bytes_per_second: f64,
    /// Percentage complete, 0–100.
    #[specta(type = Number)]
    pub percent: f64,
    /// Bytes received so far.
    #[specta(type = Number)]
    pub transferred: f64,
    /// Total bytes to receive.
    #[specta(type = Number)]
    pub total: f64,
}

/// A failure from the updater, on its way to the renderer as a rejection.
///
/// v1 let these cross as plain `Error`s, so `isIpcError(e)` was false for them
/// and the renderer's `switch (err.code)` saw `undefined`. §2.6 makes every
/// rejection code-bearing, and there is no updater entry in the frozen
/// registries, so these carry [`codes::INTERNAL`] — the code that exists exactly
/// for failures with no registry entry.
///
/// Hand-written rather than derived because `thiserror` is not a dependency of
/// the shell and adding one for a single-variant newtype is not worth a manifest
/// entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdaterFailure(pub String);

impl UpdaterFailure {
    /// Build a failure from anything that can describe itself.
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl std::fmt::Display for UpdaterFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for UpdaterFailure {}

impl WireError for UpdaterFailure {
    fn code(&self) -> Cow<'static, str> {
        Cow::Borrowed(codes::INTERNAL)
    }
}

/// A realistic release, shared by every suite in this namespace.
///
/// Module-level and `pub(super)` rather than a fixture inside each `tests`
/// module: the same release has to appear in the contract's byte assertions, the
/// event table and the lifecycle test, and three copies of it are three things
/// that can disagree about what an `UpdateInfo` looks like.
#[cfg(test)]
pub(super) fn sample_release() -> UpdateInfo {
    UpdateInfo {
        version: "2.1.0".to_owned(),
        release_notes: Some("Faster scans.".to_owned()),
        release_date: "2026-08-01T12:00:00.000Z".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::WireResultExt as _;
    use serde_json::json;

    fn info() -> UpdateInfo {
        sample_release()
    }

    /// v1's `{ enabled: boolean }`, which is the whole return type.
    #[test]
    fn the_check_result_is_v1s_enabled_flag() {
        assert_eq!(
            serde_json::to_value(UpdaterCheck::ENABLED).expect("serialize"),
            json!({ "enabled": true })
        );
        assert_eq!(
            serde_json::to_value(UpdaterCheck::DISABLED).expect("serialize"),
            json!({ "enabled": false })
        );
    }

    /// The three keys `sendToRenderer` carried, in v1's camelCase. The renderer
    /// reads `version`; the other two are on the wire and stay there.
    #[test]
    fn update_info_keeps_v1s_three_keys() {
        assert_eq!(
            serde_json::to_value(info()).expect("serialize"),
            json!({
                "version": "2.1.0",
                "releaseNotes": "Faster scans.",
                "releaseDate": "2026-08-01T12:00:00.000Z",
            })
        );
    }

    /// `parseReleaseNotes` returned `null`, not `undefined`, for a release with
    /// no notes — so the key is present and null rather than absent.
    #[test]
    fn absent_release_notes_serialize_as_null_rather_than_disappearing() {
        let json = serde_json::to_value(UpdateInfo {
            release_notes: None,
            ..info()
        })
        .expect("serialize");

        assert_eq!(json.get("releaseNotes"), Some(&serde_json::Value::Null));
    }

    /// Four keys, and `delta` — which electron-updater's `ProgressInfo` carries
    /// and v1 did not forward — is still absent.
    #[test]
    fn download_progress_keeps_v1s_four_keys_and_no_delta() {
        let progress = UpdateDownloadProgress {
            bytes_per_second: 1_048_576.0,
            percent: 42.5,
            transferred: 4_456_448.0,
            total: 10_485_760.0,
        };

        assert_eq!(
            serde_json::to_value(progress).expect("serialize"),
            json!({
                "bytesPerSecond": 1_048_576.0,
                "percent": 42.5,
                "transferred": 4_456_448.0,
                "total": 10_485_760.0,
            })
        );
    }

    /// A failure crosses code-bearing, which v1's did not: it let updater errors
    /// through as plain `Error`s, so `isIpcError(e)` was false and the
    /// renderer's `switch (err.code)` saw `undefined`.
    #[test]
    fn a_failure_crosses_with_the_internal_code() {
        let failed: Result<(), _> = Err(UpdaterFailure::new("signature verification failed"));

        let payload = failed.wire().expect_err("the failure survives");

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("signature verification failed"));
    }
}
