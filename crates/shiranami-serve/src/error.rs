//! The refusals, and how little they say.
//!
//! Ported from the three v1 protocol handlers, whose bodies (`Forbidden`,
//! `Not a file`, `Not found`, `Bad request`, `Internal error`) are asserted by
//! tests still living in `apps/desktop/src/main/protocols/*.test.ts`. Keeping
//! the literals keeps that suite usable as a conformance check.
//!
//! v1's sixth body, `Aborted` with the non-standard 499, has no counterpart —
//! see [`crate::routes::radio`] for why an HTTP server has nobody to send it to.
//!
//! The deliberate silence is v1's too: a refusal never names its reason. A page
//! that could tell "extension not allowed" from "outside the allowed roots" from
//! "no such file" could map the user's disk one request at a time. Reasons go to
//! the log at `warn`; the wire gets a bare status.

use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

/// Why a request is not being answered with bytes.
#[derive(Debug, Clone, thiserror::Error)]
pub enum ServeError {
    /// A required query parameter was missing or unusable.
    #[error("bad request")]
    BadRequest(&'static str),

    /// Refused by the extension allowlist, the containment guard, or the art
    /// route's name check. One variant for all three, on purpose.
    #[error("forbidden")]
    Forbidden,

    /// The path resolves to something that is not a regular file.
    #[error("not a file")]
    NotAFile,

    /// No such file, or it could not be opened.
    #[error("not found")]
    NotFound,

    /// The Range header was understood and cannot be met. Carries the entity
    /// length, because RFC 7233 §4.4 requires `Content-Range: bytes * /len` on a
    /// 416 and a client cannot recover without it.
    #[error("range not satisfiable")]
    RangeNotSatisfiable {
        /// The current length of the entity.
        total: u64,
    },

    /// The upstream radio station answered, unsuccessfully. Its status is
    /// forwarded — unlike our own refusals, this one is not ours to hide.
    #[error("upstream error: {status}")]
    Upstream {
        /// The status the station returned.
        status: StatusCode,
    },

    /// Anything unexpected. Never carries the cause to the wire.
    #[error("internal error")]
    Internal,
}

impl ServeError {
    /// The status this refusal is sent as.
    pub fn status(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Forbidden | Self::NotAFile => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::RangeNotSatisfiable { .. } => StatusCode::RANGE_NOT_SATISFIABLE,
            Self::Upstream { status } => *status,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// The body text, matching v1's literals.
    fn body(&self) -> String {
        match self {
            Self::BadRequest(detail) => format!("Bad request: {detail}"),
            Self::Forbidden => "Forbidden".to_owned(),
            Self::NotAFile => "Not a file".to_owned(),
            Self::NotFound => "Not found".to_owned(),
            Self::RangeNotSatisfiable { .. } => "Range not satisfiable".to_owned(),
            Self::Upstream { status } => format!("Upstream error: {}", status.as_u16()),
            Self::Internal => "Internal error".to_owned(),
        }
    }
}

impl IntoResponse for ServeError {
    fn into_response(self) -> Response {
        let mut response = (self.status(), self.body()).into_response();

        // The only refusal that carries a header, because it is the only one a
        // conforming client can act on: `bytes */len` tells it how long the
        // entity actually is so it can ask again.
        if let Self::RangeNotSatisfiable { total } = self
            && let Ok(value) = format!("bytes */{total}").parse()
        {
            response.headers_mut().insert(header::CONTENT_RANGE, value);
        }

        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_statuses_are_v1s() {
        assert_eq!(
            ServeError::BadRequest("missing path").status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(ServeError::Forbidden.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            ServeError::NotAFile.status(),
            StatusCode::FORBIDDEN,
            "v1 answered a directory with 403, not 404 — it exists, it is refused"
        );
        assert_eq!(ServeError::NotFound.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            ServeError::Internal.status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            ServeError::RangeNotSatisfiable { total: 10 }.status(),
            StatusCode::RANGE_NOT_SATISFIABLE
        );
    }

    #[test]
    fn an_upstream_failure_forwards_its_own_status() {
        let error = ServeError::Upstream {
            status: StatusCode::SERVICE_UNAVAILABLE,
        };
        assert_eq!(error.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(error.body(), "Upstream error: 503");
    }

    /// The point of the single `Forbidden` variant: three different refusals,
    /// one indistinguishable response.
    #[test]
    fn a_refusal_never_names_its_reason() {
        assert_eq!(ServeError::Forbidden.body(), "Forbidden");
        for body in [
            ServeError::Forbidden.body(),
            ServeError::NotFound.body(),
            ServeError::NotAFile.body(),
        ] {
            assert!(
                !body.contains('/') && !body.contains('\\'),
                "a refusal body must not echo a path back: {body}"
            );
        }
    }

    #[test]
    fn a_416_carries_the_entity_length() {
        let response = ServeError::RangeNotSatisfiable { total: 1_234 }.into_response();
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok()),
            Some("bytes */1234"),
            "RFC 7233 §4.4: without this the client cannot learn the real length"
        );
    }

    #[test]
    fn no_other_refusal_carries_a_content_range() {
        for error in [
            ServeError::Forbidden,
            ServeError::NotFound,
            ServeError::Internal,
        ] {
            let response = error.into_response();
            assert!(response.headers().get(header::CONTENT_RANGE).is_none());
        }
    }
}
