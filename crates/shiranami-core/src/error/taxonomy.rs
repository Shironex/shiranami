//! The workspace error taxonomy and its wire form.
//!
//! Architecture §2.3 sets the shape: a `thiserror` enum per crate, rendered onto
//! a serializable `{ code, message, details }` payload at the command boundary,
//! with nightcore's warning attached — *"do not end up with neither a typed enum
//! nor a wire taxonomy"*. [`WireError`] is what keeps both halves: each crate
//! keeps its own typed enum and states how it projects onto the one wire shape,
//! so Phase 14's commands need no per-namespace conversion code.

use std::borrow::Cow;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Unknown;

use crate::error::codes;

/// Convenience alias for fallible core operations.
pub type Result<T, E = CoreError> = std::result::Result<T, E>;

/// The serializable form every rejected command returns.
///
/// v1 encoded this same triple as JSON behind an `__IPC_ERROR__` sentinel inside
/// an `Error` message, because Electron's `invoke` only serialises a rejection's
/// `name` and `message`. Tauri rejects with a real payload, so the sentinel is
/// deleted server-side (decision D9) and this struct crosses directly. The
/// renderer-side shape is unchanged, which is what lets `isIpcError(e)`,
/// `e.code` and `e.details` keep working through the Phase 15 shim.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    /// Stable, renderer-matchable code from [`crate::error::codes`].
    pub code: String,
    /// Human-readable message. Technical English; the renderer prefers its own
    /// translation of `code` and falls back to this.
    pub message: String,
    /// Structured extras for codes that carry them.
    #[specta(optional, type = Option<Unknown>)]
    pub details: Option<serde_json::Value>,
}

impl ErrorPayload {
    /// Project any [`WireError`] onto the wire shape.
    pub fn of<E: WireError + ?Sized>(error: &E) -> Self {
        Self {
            code: error.code().into_owned(),
            message: error.to_string(),
            details: error.details(),
        }
    }
}

/// Implemented by every crate's error enum so it can cross the command boundary.
///
/// The blanket projection lives in [`ErrorPayload::of`]; implementors only state
/// their code and any structured extras. Keeping this a trait rather than a
/// single workspace-wide enum is what lets `shiranami-net`, `shiranami-db` and
/// the rest own their own typed variants without core having to know them.
pub trait WireError: std::error::Error {
    /// The stable code the renderer matches on.
    ///
    /// Returns a [`Cow`] so the common case — a `&'static str` from
    /// [`crate::error::codes`] — allocates nothing, while a code computed at
    /// runtime (yt-dlp classification) can still be returned.
    fn code(&self) -> Cow<'static, str>;

    /// Structured extras for codes that carry them. Defaults to none.
    ///
    /// Never put a secret here: this payload reaches the renderer verbatim.
    fn details(&self) -> Option<serde_json::Value> {
        None
    }
}

/// Failures raised by `shiranami-core` itself.
///
/// Deliberately small. Core does no network, database or child-process I/O, so
/// its surface is the settings file, the path guards and the renderer-key
/// allowlist. Crates above it define their own enums rather than extending this
/// one.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// A filesystem operation failed. `operation` is a verb phrase naming what
    /// was being attempted, so the message reads as a sentence.
    #[error("could not {operation} {}: {source}", path.display())]
    Io {
        /// What was being attempted, e.g. `"read the settings file"`.
        operation: &'static str,
        /// The path involved.
        path: PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// A JSON document on disk could not be parsed.
    ///
    /// Callers must [`crate::store::atomic::quarantine_corrupt`] before falling
    /// back to defaults — otherwise the next write persists those defaults over
    /// recoverable data.
    #[error("{} is not valid JSON: {source}", path.display())]
    Json {
        /// The document that failed to parse.
        path: PathBuf,
        /// The underlying parse failure.
        #[source]
        source: serde_json::Error,
    },

    /// A path lies outside every allowed root and matches no known track.
    #[error("path is outside every allowed root: {}", path.display())]
    PathNotAllowed {
        /// The rejected path, as the caller supplied it.
        path: PathBuf,
    },

    /// The renderer asked for a settings key it may not touch.
    #[error("`{key}` is not readable or writable by the renderer")]
    StoreKeyNotAllowed {
        /// The rejected key.
        key: String,
    },

    /// The arguments were structurally valid but semantically wrong.
    #[error("{0}")]
    BadRequest(String),
}

impl WireError for CoreError {
    fn code(&self) -> Cow<'static, str> {
        match self {
            // A path or key rejection is an authorization outcome, not a
            // malformed request — v1 raised FORBIDDEN for both.
            Self::PathNotAllowed { .. } | Self::StoreKeyNotAllowed { .. } => {
                Cow::Borrowed(codes::validation::FORBIDDEN)
            }
            Self::BadRequest(_) => Cow::Borrowed(codes::validation::BAD_REQUEST),
            Self::Io { .. } | Self::Json { .. } => Cow::Borrowed(codes::INTERNAL),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::ErrorKind;

    #[test]
    fn a_denied_path_is_forbidden_not_a_bad_request() {
        let error = CoreError::PathNotAllowed {
            path: PathBuf::from("/etc/passwd"),
        };
        let payload = ErrorPayload::of(&error);
        assert_eq!(payload.code, "FORBIDDEN");
        assert!(payload.message.contains("/etc/passwd"));
        assert_eq!(payload.details, None);
    }

    #[test]
    fn an_unclassified_failure_still_carries_a_code() {
        let error = CoreError::Io {
            operation: "read the settings file",
            path: PathBuf::from("/tmp/config.json"),
            source: std::io::Error::new(ErrorKind::PermissionDenied, "denied"),
        };
        let payload = ErrorPayload::of(&error);
        assert_eq!(
            payload.code, "INTERNAL",
            "every rejection is code-bearing so the renderer's switch stays exhaustive"
        );
        assert!(payload.message.contains("read the settings file"));
    }

    /// The renderer reads `code` / `message` / `details` off the rejection, so
    /// the serialized key casing is contract, not an implementation detail.
    #[test]
    fn the_wire_form_serializes_the_three_contract_keys() {
        let payload = ErrorPayload {
            code: codes::share::TRACK_NOT_FOUND.to_owned(),
            message: "no such track".to_owned(),
            details: Some(serde_json::json!({ "trackId": "abc" })),
        };
        let json = serde_json::to_value(&payload).expect("serialize the payload");
        assert_eq!(json["code"], "share.track_not_found");
        assert_eq!(json["message"], "no such track");
        assert_eq!(json["details"]["trackId"], "abc");
    }

    /// `details` is optional on the wire; an absent one must round-trip rather
    /// than fail deserialization (architecture §2.3: wire structs are strictly
    /// additive and tolerate an absent field).
    #[test]
    fn the_wire_form_tolerates_an_absent_details() {
        let payload: ErrorPayload =
            serde_json::from_str(r#"{"code":"FORBIDDEN","message":"nope"}"#)
                .expect("parse a payload with no details");
        assert_eq!(payload.details, None);
    }
}
