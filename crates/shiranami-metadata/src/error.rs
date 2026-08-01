//! The crate's typed error enum and how it projects onto the wire shape.
//!
//! v1 split its metadata failures across three unrelated conventions. The read
//! path never failed at all — `parseAudioMetadata` caught everything and
//! returned a filename-derived placeholder row. The write path swallowed every
//! per-format failure and logged it, so `metadata:write-tags` answered
//! `{ success: true }` for a `.wav` it could not write, for a missing ffmpeg,
//! and for a genuine I/O error alike. Only the enrich batch carried real error
//! text, and then only as an untyped string in a result field.
//!
//! v2 returns real `Result`s from the crate and lets the command layer decide
//! what the renderer sees. That is a deliberate deviation, recorded in the
//! crate docs: the layer that knows whether a failure is worth a toast is the
//! one holding the request, not the one holding the file handle.
//!
//! No new renderer-visible codes are minted. Every variant lands on a code the
//! frozen registry in `shiranami-core` already declares, so `isIpcError(e)` and
//! the four code registries in `apps/web` need no change for this crate.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

use shiranami_core::error::WireError;
use shiranami_core::error::codes;

/// Convenience alias for fallible metadata operations.
pub type Result<T, E = MetadataError> = std::result::Result<T, E>;

/// The renderer-visible code for "an enrich run is already in progress".
///
/// Ported verbatim from `ENRICH_BUSY_ERROR_CODE` in
/// `apps/desktop/src/main/ipc/metadata-enrich.ts`. This is the one code in this
/// crate that is *not* `INTERNAL`: `apps/web`'s enrich store matches on the
/// literal to show "another run is already going" instead of a failure toast,
/// so it is contract, not diagnostics.
pub const ENRICH_BUSY_CODE: &str = "metadata.enrich_busy";

/// Failures raised by `shiranami-metadata`.
#[derive(Debug, thiserror::Error)]
pub enum MetadataError {
    /// A filesystem operation failed. `operation` is a verb phrase naming what
    /// was being attempted, so the message reads as a sentence.
    #[error("could not {operation} {}: {source}", path.display())]
    Io {
        /// What was being attempted, e.g. `"read the tags of"`.
        operation: &'static str,
        /// The path involved.
        path: PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// The file could not be parsed as a tagged media container.
    ///
    /// v1 folded this into the placeholder row and carried on. v2 reports it,
    /// and the read helper offers [`crate::read::read_metadata_or_placeholder`]
    /// for callers that want v1's behaviour back.
    #[error("could not read the tags of {}: {reason}", path.display())]
    Tag {
        /// The file whose tags could not be read.
        path: PathBuf,
        /// Technical detail from `lofty`, already stringified.
        reason: String,
    },

    /// The container is one we can read but not write.
    ///
    /// Distinct from [`MetadataError::Tag`] because nothing is wrong with the
    /// file: v1 answered `success: true` here and let the database drift away
    /// from the file forever, which is the failure this variant exists to stop.
    #[error("{} is a {format} file, which cannot be written", path.display())]
    UnsupportedForWriting {
        /// The file that cannot be written.
        path: PathBuf,
        /// The container, as the extension named it.
        format: String,
    },

    /// Cover-art bytes could not be decoded, resized or encoded.
    #[error("could not process the cover image: {reason}")]
    Image {
        /// What the codec objected to.
        reason: String,
    },

    /// A lookup or cover download failed at the HTTP layer.
    #[error("metadata lookup failed: {0}")]
    Http(#[from] shiranami_net::HttpError),

    /// An enrich run was requested while another one holds the slot.
    ///
    /// See [`ENRICH_BUSY_CODE`].
    #[error("another metadata enrichment run is already in progress")]
    EnrichBusy,

    /// The operation was cancelled before it finished.
    #[error("the operation was cancelled")]
    Cancelled,

    /// The arguments were structurally valid but semantically wrong.
    #[error("{0}")]
    BadRequest(String),
}

impl MetadataError {
    /// Build a [`MetadataError::Io`] without the caller owning the path first.
    pub(crate) fn io(operation: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            operation,
            path: path.to_path_buf(),
            source,
        }
    }

    /// Build a [`MetadataError::Tag`] from anything `lofty` can display.
    pub(crate) fn tag(path: &Path, reason: impl std::fmt::Display) -> Self {
        Self::Tag {
            path: path.to_path_buf(),
            reason: reason.to_string(),
        }
    }

    /// Build a [`MetadataError::Image`] from anything the codec can display.
    pub(crate) fn image(reason: impl std::fmt::Display) -> Self {
        Self::Image {
            reason: reason.to_string(),
        }
    }

    /// Whether this failure is the caller's cancellation coming back to them.
    ///
    /// The enrich batch reports a cancelled track as a `cancelled` progress
    /// event rather than an `error` one, exactly as v1 did, and this is how it
    /// tells the two apart without matching on error text.
    pub fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }
}

impl WireError for MetadataError {
    fn code(&self) -> Cow<'static, str> {
        match self {
            Self::EnrichBusy => Cow::Borrowed(ENRICH_BUSY_CODE),
            Self::BadRequest(_) => Cow::Borrowed(codes::validation::BAD_REQUEST),
            // Everything else is a file or a network we could not work with.
            // v1 surfaced all of these as a logged warning and a best-effort
            // result, never as a code the renderer matched on, so nothing is
            // added to the frozen registry to describe them.
            Self::Io { .. }
            | Self::Tag { .. }
            | Self::UnsupportedForWriting { .. }
            | Self::Image { .. }
            | Self::Http(_)
            | Self::Cancelled => Cow::Borrowed(codes::INTERNAL),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Read a repo-relative file during a test.
    ///
    /// `CARGO_MANIFEST_DIR` is a build-machine path and is forbidden at
    /// runtime, but a mirror test is exactly the case it exists for. Same
    /// shape as `shiranami-core`'s own `repo_file`, which is `pub(crate)`
    /// there and so not reachable from here.
    fn repo_file(relative: &str) -> String {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        std::fs::read_to_string(root.join(relative))
            .unwrap_or_else(|error| panic!("could not read {relative}: {error}"))
    }

    #[test]
    fn the_enrich_busy_code_still_matches_the_typescript_literal() {
        // `apps/web` matches this string to distinguish "already running" from
        // a real failure. If v1's constant moves, this test is the only thing
        // that notices before a user sees the wrong toast.
        let source = repo_file("apps/desktop/src/main/ipc/metadata-enrich.ts");

        assert!(
            source.contains(&format!("'{ENRICH_BUSY_CODE}'")),
            "ENRICH_BUSY_CODE no longer appears in v1's enrich handler"
        );
    }

    #[test]
    fn an_unsupported_container_is_internal_not_bad_request() {
        // A `.wav` write is not the caller sending nonsense — the arguments
        // were fine and the container simply cannot hold them. Mapping it to
        // BAD_REQUEST would make the renderer blame the user's input.
        let error = MetadataError::UnsupportedForWriting {
            path: PathBuf::from("/music/song.xyz"),
            format: "xyz".to_owned(),
        };

        assert_eq!(error.code(), codes::INTERNAL);
    }

    #[test]
    fn only_cancellation_reports_itself_as_cancelled() {
        assert!(MetadataError::Cancelled.is_cancelled());
        assert!(!MetadataError::BadRequest("nope".to_owned()).is_cancelled());
    }
}
