//! What this crate can fail with, and the codes those failures cross on.
//!
//! Two vocabularies meet here. Most variants project onto a `downloader.*` or
//! `playlist.*` code that the renderer already translates; one does not, and
//! that one is the interesting case.
//!
//! [`DownloaderError::YtDlp`] carries a code **computed at runtime** by
//! [`crate::spawn::classify`]. When yt-dlp fails for a reason v1 taught us to
//! recognise, the code is one of the three frozen `yt_dlp_*` literals in
//! [`shiranami_core::error::codes::yt_dlp`] and the renderer shows a translated
//! sentence. When it fails for any other reason, v1 put the *tail of yt-dlp's
//! own output* where the code would be and the renderer showed it verbatim.
//! That is deliberately preserved: an untranslated line of technical English
//! from the tool tells a user more than "download failed" ever did. It is also
//! why [`shiranami_core::error::WireError::code`] returns a `Cow` — this is the
//! variant that needs the owned half.

use std::borrow::Cow;

use shiranami_core::error::WireError;
use shiranami_core::error::codes;

/// Convenience alias for fallible downloader operations.
pub type Result<T, E = DownloaderError> = std::result::Result<T, E>;

/// Failures the downloader raises, ported from the `IpcError` codes v1's
/// `ipc/downloader.ts` and `ipc/playlist.ts` constructed inline.
///
/// v1 declared these as string literals at the throw site rather than in
/// `packages/contracts`, which is why they are mirrored here rather than in
/// core's registry — but they are just as frozen, and a test in this module
/// re-reads them from the v1 sources so a rename fails the build.
#[derive(Debug, thiserror::Error)]
pub enum DownloaderError {
    /// A URL that reached a yt-dlp argument was not `http(s)`.
    ///
    /// The argument-injection guard, and the reason it is an error type rather
    /// than a filter: yt-dlp reads any argument starting with `-` as an option,
    /// so a `--exec=<cmd>` value arriving from a tampered share payload or a
    /// scraped playlist is remote code execution. Refusing loudly is the only
    /// correct answer.
    #[error("{message}")]
    InvalidUrl {
        /// What was refused, phrased for the user.
        message: String,
    },

    /// yt-dlp exited non-zero.
    ///
    /// `code` is either a frozen `yt_dlp_*` literal or the tail of the tool's
    /// own output — see the module docs.
    #[error("{code}")]
    YtDlp {
        /// The classification, or the raw output tail.
        code: String,
    },

    /// yt-dlp succeeded but printed no stream URL.
    #[error("No stream URL returned")]
    NoStreamUrl,

    /// Installing a managed binary failed.
    #[error("{message}")]
    InstallFailed {
        /// The underlying reason, already rendered.
        message: String,
    },

    /// The URL names no provider this crate can extract from.
    #[error("{message}")]
    UnsupportedUrl {
        /// What was refused, phrased for the user.
        message: String,
    },

    /// The playlist page could not be fetched — private, or gone.
    #[error("{message}")]
    PrivatePlaylist {
        /// What went wrong, phrased for the user.
        message: String,
    },

    /// The playlist resolved but held no tracks.
    #[error("{message}")]
    NoTracks {
        /// What went wrong, phrased for the user.
        message: String,
    },

    /// A child process could not be run, or did not finish.
    #[error("could not {operation}: {source}")]
    Process {
        /// What was being attempted, e.g. `"read the yt-dlp version"`.
        operation: &'static str,
        /// The underlying failure.
        #[source]
        source: crate::spawn::ProcessError,
    },

    /// A filesystem operation failed.
    #[error("could not {operation} {}: {source}", path.display())]
    Io {
        /// What was being attempted, e.g. `"create the binary directory"`.
        operation: &'static str,
        /// The path involved.
        path: std::path::PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// An HTTP exchange failed.
    #[error("could not {operation}: {source}")]
    Http {
        /// What was being attempted, e.g. `"download yt-dlp"`.
        operation: &'static str,
        /// The underlying failure.
        #[source]
        source: shiranami_net::HttpError,
    },

    /// A downloaded archive could not be read.
    #[error("could not extract {}: {source}", path.display())]
    Archive {
        /// The archive involved.
        path: std::path::PathBuf,
        /// The underlying failure.
        #[source]
        source: zip::result::ZipError,
    },

    /// A database write behind the queue failed.
    #[error("could not {operation}: {source}")]
    Database {
        /// What was being attempted, e.g. `"persist the queue item"`.
        operation: &'static str,
        /// The underlying failure.
        #[source]
        source: shiranami_db::DbError,
    },
}

/// Codes v1 constructed inline at its `IpcError` throw sites.
pub mod code {
    /// A URL reaching yt-dlp was not `http(s)`.
    pub const INVALID_URL: &str = "downloader.invalid_url";
    /// yt-dlp failed to resolve a stream URL.
    pub const STREAM_URL_FAILED: &str = "downloader.stream_url_failed";
    /// yt-dlp resolved nothing at all.
    pub const NO_STREAM_URL: &str = "downloader.no_stream_url";
    /// A managed binary could not be installed.
    pub const INSTALL_FAILED: &str = "downloader.install_failed";
}

impl WireError for DownloaderError {
    fn code(&self) -> Cow<'static, str> {
        match self {
            Self::InvalidUrl { .. } => Cow::Borrowed(code::INVALID_URL),
            // The one runtime-computed code. A classified failure carries a
            // frozen literal; an unclassified one carries yt-dlp's own words.
            Self::YtDlp { code } => Cow::Owned(code.clone()),
            Self::NoStreamUrl => Cow::Borrowed(code::NO_STREAM_URL),
            Self::InstallFailed { .. } => Cow::Borrowed(code::INSTALL_FAILED),
            Self::UnsupportedUrl { .. } => Cow::Borrowed(codes::playlist::UNSUPPORTED_URL),
            Self::PrivatePlaylist { .. } => Cow::Borrowed(codes::playlist::PRIVATE_PLAYLIST),
            Self::NoTracks { .. } => Cow::Borrowed(codes::playlist::NO_TRACKS),
            // Everything below is an infrastructure failure with no
            // user-meaningful classification, which is exactly what core's
            // fallback code is for (Phase 3 amendment).
            Self::Process { .. }
            | Self::Io { .. }
            | Self::Http { .. }
            | Self::Archive { .. }
            | Self::Database { .. } => Cow::Borrowed(codes::INTERNAL),
        }
    }
}

impl DownloaderError {
    /// The refusal every yt-dlp argument site raises for a non-`http(s)` URL.
    pub(crate) fn invalid_url(message: &str) -> Self {
        Self::InvalidUrl {
            message: message.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The `downloader.*` codes never lived in `packages/contracts` — v1 built
    /// them at the `new IpcError(...)` call site. They are renderer-visible
    /// contract all the same, so they get the same mirror test core gives the
    /// registries it does own: rename one on either side and this fails rather
    /// than shipping a code with no translation behind it.
    #[test]
    fn the_downloader_codes_mirror_the_v1_throw_sites() {
        let source = crate::testing::repo_file("apps/desktop/src/main/ipc/downloader.ts");

        for expected in [
            code::INVALID_URL,
            code::STREAM_URL_FAILED,
            code::NO_STREAM_URL,
            code::INSTALL_FAILED,
        ] {
            assert!(
                source.contains(&format!("'{expected}'")),
                "apps/desktop/src/main/ipc/downloader.ts no longer throws `{expected}` — \
                 the Rust mirror has drifted from the literal the renderer matches on"
            );
        }
    }

    #[test]
    fn an_unclassified_yt_dlp_failure_carries_its_own_output_as_the_code() {
        let error = DownloaderError::YtDlp {
            code: "ERROR: unable to download webpage".to_owned(),
        };

        assert_eq!(error.code(), "ERROR: unable to download webpage");
        assert_eq!(
            error.to_string(),
            "ERROR: unable to download webpage",
            "the message is the code for this variant — v1 put the tail of \
             yt-dlp's output in front of the user verbatim"
        );
    }

    #[test]
    fn a_classified_yt_dlp_failure_carries_the_frozen_literal() {
        let error = DownloaderError::YtDlp {
            code: codes::yt_dlp::AGE_RESTRICTED.to_owned(),
        };

        assert_eq!(error.code(), "yt_dlp_age_restricted");
    }

    #[test]
    fn infrastructure_failures_fall_back_to_the_internal_code() {
        let error = DownloaderError::Io {
            operation: "create the binary directory",
            path: std::path::PathBuf::from("/tmp/bin"),
            source: std::io::Error::other("disk on fire"),
        };

        assert_eq!(error.code(), codes::INTERNAL);
    }
}
