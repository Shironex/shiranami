//! The share failure taxonomy.
//!
//! Every variant maps onto a literal in
//! [`shiranami_core::error::codes::share`] or
//! [`shiranami_core::error::codes::validation`] — a frozen vocabulary the
//! renderer has translations for. This enum is the whole share vocabulary, not
//! only the part this crate raises: the four "not in the library" variants
//! belong to the command layer, which reads the database, but they are share's
//! codes and this is share's error type.

use std::borrow::Cow;

use shiranami_core::error::{WireError, codes};
use shiranami_net::HttpError;

use crate::share::dto::FieldIssue;

/// Convenience alias for fallible share operations.
pub type Result<T, E = ShareError> = std::result::Result<T, E>;

/// Everything sharing and importing can fail with.
#[derive(Debug, thiserror::Error)]
pub enum ShareError {
    /// The track to share is not in the library. Raised by the command layer.
    #[error("track not found")]
    TrackNotFound,

    /// No YouTube candidate matched the track. Raised by the command layer.
    #[error("could not find YouTube match for this track")]
    NoYoutubeMatch,

    /// The playlist to share is not in the library. Raised by the command layer.
    #[error("playlist not found")]
    PlaylistNotFound,

    /// The playlist has no tracks. Raised by the command layer.
    #[error("playlist has no tracks")]
    PlaylistEmpty,

    /// Not one track in the playlist matched. Raised by the command layer.
    #[error("could not find YouTube matches for any tracks")]
    NoMatchesForAnyTrack,

    /// The server's response did not match the share contract.
    #[error("received invalid share data from the server")]
    InvalidResponse {
        /// Which fields failed.
        issues: Vec<FieldIssue>,
    },

    /// The outbound body failed the contract before it was sent.
    ///
    /// Not a user error — it means the desktop body shape has drifted from the
    /// server's schema, and it is reported locally so that shows up as a
    /// specific field rather than as an opaque 400.
    #[error("outbound share request failed contract validation")]
    BadRequest {
        /// Which fields failed.
        issues: Vec<FieldIssue>,
    },

    /// The share code is not a shape the server issues.
    #[error("{code} is not a valid share code")]
    MalformedCode {
        /// The rejected code.
        code: String,
    },

    /// The server answered with an error status.
    ///
    /// `message` is the server's own `message` field when its body carried one,
    /// which is v1's behaviour: the API writes actionable messages ("this share
    /// has expired") and collapsing them to the status text would lose them.
    #[error("{message}")]
    Server {
        /// The server's message, or `HTTP <status>` when it wrote none.
        message: String,
        /// The status returned.
        status: u16,
    },

    /// The share API could not be reached.
    #[error("share request failed: {source}")]
    Transport {
        /// The underlying failure.
        #[source]
        source: Box<HttpError>,
    },
}

impl ShareError {
    /// Project an [`HttpError`] onto the share taxonomy.
    ///
    /// A response *with* a status becomes [`Self::Server`], carrying the
    /// server's `message` field when the body held one — v1 parsed the body for
    /// exactly that and fell back to `HTTP <status>`. Everything below the
    /// status line stays [`Self::Transport`].
    pub fn from_http(error: HttpError) -> Self {
        let Some(status) = error.status() else {
            return Self::Transport {
                source: Box::new(error),
            };
        };

        let message = error
            .body_text()
            .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
            .and_then(|body| {
                body.get("message")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
            })
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));

        Self::Server {
            message,
            status: status.as_u16(),
        }
    }
}

impl WireError for ShareError {
    fn code(&self) -> Cow<'static, str> {
        Cow::Borrowed(match self {
            Self::TrackNotFound => codes::share::TRACK_NOT_FOUND,
            Self::NoYoutubeMatch => codes::share::NO_YOUTUBE_MATCH,
            Self::PlaylistNotFound => codes::share::PLAYLIST_NOT_FOUND,
            Self::PlaylistEmpty => codes::share::PLAYLIST_EMPTY,
            Self::NoMatchesForAnyTrack => codes::share::NO_MATCHES_FOR_ANY_TRACK,
            Self::InvalidResponse { .. } => codes::share::INVALID_RESPONSE,
            Self::BadRequest { .. } | Self::MalformedCode { .. } => codes::validation::BAD_REQUEST,
            // v1 threw a plain `Error` for both, so neither reached a code
            // registry and the renderer showed the message. `INTERNAL` is the
            // honest equivalent — there is no share code for "the server is
            // having a bad day", and inventing one would give the renderer a
            // string it has no translation for.
            Self::Server { .. } | Self::Transport { .. } => codes::INTERNAL,
        })
    }

    fn details(&self) -> Option<serde_json::Value> {
        match self {
            Self::InvalidResponse { issues } | Self::BadRequest { issues } => {
                Some(serde_json::json!(
                    issues
                        .iter()
                        .map(|issue| serde_json::json!({
                            "path": issue.path,
                            "message": issue.message,
                        }))
                        .collect::<Vec<_>>()
                ))
            }
            Self::Server { status, .. } => Some(serde_json::json!({ "status": status })),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::StatusCode;
    use reqwest::header::HeaderMap;
    use shiranami_core::error::ErrorPayload;

    fn status_error(status: StatusCode, body: Option<&str>) -> HttpError {
        HttpError::Status {
            url: "https://api.shiranami.app/api/share/abc".to_owned(),
            status,
            headers: Box::new(HeaderMap::new()),
            retry_after: None,
            body_text: body.map(str::to_owned),
        }
    }

    #[test]
    fn each_variant_carries_its_frozen_registry_code() {
        let expected = [
            (ShareError::TrackNotFound, "share.track_not_found"),
            (ShareError::NoYoutubeMatch, "share.no_youtube_match"),
            (ShareError::PlaylistNotFound, "share.playlist_not_found"),
            (ShareError::PlaylistEmpty, "share.playlist_empty"),
            (
                ShareError::NoMatchesForAnyTrack,
                "share.no_matches_for_any_track",
            ),
        ];

        for (error, code) in expected {
            assert_eq!(ErrorPayload::of(&error).code, code);
        }
    }

    #[test]
    fn an_invalid_response_carries_the_share_code_and_the_failing_paths() {
        let error = ShareError::InvalidResponse {
            issues: vec![FieldIssue {
                path: "payload.title".to_owned(),
                message: "must not be empty".to_owned(),
            }],
        };
        let payload = ErrorPayload::of(&error);

        assert_eq!(payload.code, "share.invalid_response");
        assert_eq!(
            payload.details.as_ref().map(|d| d[0]["path"].clone()),
            Some(serde_json::json!("payload.title"))
        );
    }

    #[test]
    fn a_drifted_outbound_body_is_a_validation_failure() {
        let error = ShareError::BadRequest { issues: Vec::new() };
        assert_eq!(ErrorPayload::of(&error).code, "BAD_REQUEST");
    }

    #[test]
    fn a_malformed_code_is_a_validation_failure() {
        let error = ShareError::MalformedCode {
            code: "../admin".to_owned(),
        };
        assert_eq!(ErrorPayload::of(&error).code, "BAD_REQUEST");
        assert!(error.to_string().contains("../admin"));
    }

    /// The API writes actionable messages; surfacing the status text instead
    /// would turn "this share has expired" into "Not Found".
    #[test]
    fn the_servers_own_message_is_surfaced() {
        let error = ShareError::from_http(status_error(
            StatusCode::NOT_FOUND,
            Some(r#"{"message":"This share has expired"}"#),
        ));

        assert_eq!(error.to_string(), "This share has expired");
        assert_eq!(ErrorPayload::of(&error).code, "INTERNAL");
    }

    #[test]
    fn a_non_json_error_body_falls_back_to_the_status() {
        let error = ShareError::from_http(status_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            Some("<html>502 Bad Gateway</html>"),
        ));
        assert_eq!(error.to_string(), "HTTP 500");
    }

    #[test]
    fn a_json_body_without_a_message_falls_back_to_the_status() {
        let error = ShareError::from_http(status_error(
            StatusCode::BAD_REQUEST,
            Some(r#"{"error":"x"}"#),
        ));
        assert_eq!(error.to_string(), "HTTP 400");
    }

    #[test]
    fn an_unread_error_body_falls_back_to_the_status() {
        let error = ShareError::from_http(status_error(StatusCode::FORBIDDEN, None));
        assert_eq!(error.to_string(), "HTTP 403");
    }

    #[test]
    fn a_failure_below_the_status_line_stays_a_transport_failure() {
        let error = ShareError::from_http(HttpError::Timeout {
            url: "https://api.shiranami.app/api/share".to_owned(),
            timeout: std::time::Duration::from_secs(30),
        });

        assert!(matches!(error, ShareError::Transport { .. }));
        assert_eq!(ErrorPayload::of(&error).code, "INTERNAL");
        assert_eq!(ErrorPayload::of(&error).details, None);
    }
}
