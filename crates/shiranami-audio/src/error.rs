//! The crate's typed error enum and how it projects onto the wire shape.
//!
//! v1's addon had no error channel at all: `waveform.fromFile` returned `null`
//! and `loudness.fromFile` returned `{ status: 'undecodable' }`, both of which
//! the caller silently swallowed. That was load-bearing, because dr_libs read
//! only wav/flac/mp3 and "undecodable" was the normal outcome for half the
//! library — it selected the ffmpeg fallback rather than reporting a fault.
//!
//! symphonia's coverage deletes that fallback (architecture §2.9), so a decode
//! failure stops being routine and becomes a real error. It is reported as one
//! here, and the caller decides whether the user ever sees it.
//!
//! No new renderer-visible codes are minted: every variant lands on a code the
//! frozen registry in `shiranami-core` already declares, so the Phase 15 shim
//! and `apps/web`'s `isIpcError(e)` matching need no change for this crate.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

use shiranami_core::error::WireError;
use shiranami_core::error::codes;

/// Convenience alias for fallible audio operations.
pub type Result<T, E = AudioError> = std::result::Result<T, E>;

/// Failures raised by `shiranami-audio`.
///
/// The enum deliberately carries no `symphonia` or `ebur128` type. Architecture
/// §2.9 keeps this crate's public API FFI-shaped so a `cc`-built C++ core could
/// be swapped back in behind it without touching callers, and a leaked decoder
/// error type would be exactly the seam that makes that impossible.
#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    /// A filesystem operation failed. `operation` is a verb phrase naming what
    /// was being attempted, so the message reads as a sentence.
    #[error("could not {operation} {}: {source}", path.display())]
    Io {
        /// What was being attempted, e.g. `"open the audio file"`.
        operation: &'static str,
        /// The path involved.
        path: PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// The container or bitstream could not be read.
    ///
    /// Either the file is not a media container we recognise, or it is one and
    /// its contents are damaged. Both are the user's file being unreadable, not
    /// a missing feature — see [`AudioError::UnsupportedCodec`] for that.
    #[error("could not decode {}: {reason}", path.display())]
    Decode {
        /// The file that failed to decode.
        path: PathBuf,
        /// Technical detail from the decoder, already stringified.
        reason: String,
    },

    /// The container was read but holds no audio track.
    #[error("{} holds no audio track", path.display())]
    NoAudioTrack {
        /// The file that carried no audio.
        path: PathBuf,
    },

    /// The audio track uses a codec this build cannot decode.
    ///
    /// Distinct from [`AudioError::Decode`] because it is a coverage gap rather
    /// than a damaged file: Opus and WMA are the two extensions v1 accepted that
    /// symphonia does not cover (see the crate docs).
    #[error("{} uses a codec this build cannot decode: {reason}", path.display())]
    UnsupportedCodec {
        /// The file whose codec is not covered.
        path: PathBuf,
        /// Which codec, as the decoder registry named it.
        reason: String,
    },

    /// The loudness analyser rejected the stream.
    ///
    /// Raised when the channel count or sample rate is outside what EBU R128
    /// can be initialised for — not when the audio is merely silent, which is a
    /// successful measurement of nothing.
    #[error("loudness analysis failed: {reason}")]
    Analysis {
        /// What the analyser objected to.
        reason: String,
    },

    /// The arguments were structurally valid but semantically wrong.
    #[error("{0}")]
    BadRequest(String),
}

impl AudioError {
    /// Build an [`AudioError::Io`] without the caller owning the path first.
    pub(crate) fn io(operation: &'static str, path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            operation,
            path: path.to_path_buf(),
            source,
        }
    }

    /// Build an [`AudioError::Decode`] from anything the decoder can display.
    pub(crate) fn decode(path: &Path, reason: impl std::fmt::Display) -> Self {
        Self::Decode {
            path: path.to_path_buf(),
            reason: reason.to_string(),
        }
    }
}

impl WireError for AudioError {
    fn code(&self) -> Cow<'static, str> {
        match self {
            Self::BadRequest(_) => Cow::Borrowed(codes::validation::BAD_REQUEST),
            // Every other variant is a file we could not analyse. v1 surfaced
            // that as an absent waveform and an unset `loudness_lufs`, never as
            // a code the renderer matched on, so nothing is added to the frozen
            // registry to describe it.
            Self::Io { .. }
            | Self::Decode { .. }
            | Self::NoAudioTrack { .. }
            | Self::UnsupportedCodec { .. }
            | Self::Analysis { .. } => Cow::Borrowed(codes::INTERNAL),
        }
    }
}
