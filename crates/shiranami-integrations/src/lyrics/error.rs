//! The lyrics failure taxonomy.
//!
//! # Why a lookup failure is an error at all
//!
//! v1's `fetchLyrics` could not fail: every path ended in a `LyricsResult`, and
//! a network problem produced the same empty result as a track LRCLIB genuinely
//! does not have. The Phase 9 amendment records why that is wrong for the
//! sibling iTunes lookup — "v1's `catch → return null` made a 429
//! indistinguishable from a genuine miss, and the renderer then added the track
//! to a _persisted_ skip list, permanently marking a rate-limited track
//! unmatchable" — and the same reasoning applies here. A rate-limited lookup
//! must not be cached as "this song has no lyrics".
//!
//! So the distinction v1 already drew *internally* (`null` = failure, not
//! cached; `EMPTY_RESULT` = definitive miss, cached) is promoted to the public
//! signature. [`LyricsError::Lookup`] is raised **only** when nothing else could
//! answer: a local or embedded hit still wins, and a definitive LRCLIB miss is
//! still `Ok` with an empty result.

use std::borrow::Cow;

use shiranami_core::error::{WireError, codes};
use shiranami_net::HttpError;

/// Convenience alias for fallible lyrics operations.
pub type Result<T, E = LyricsError> = std::result::Result<T, E>;

/// A failed LRCLIB round, in a form every waiter can be handed a copy of.
///
/// [`HttpError`] is not `Clone` — it holds a `reqwest::Error` — but request
/// coalescing has to give the same answer to every caller that joined an
/// in-flight lookup. Rather than serialise the fan-out or drop the followers
/// back onto their own request, the failure is summarised at the boundary into
/// exactly the three things anything downstream reads: what to log, and the two
/// signals that decide whether the result may be cached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookupFailure {
    /// The rendered underlying failure, for logs.
    message: String,
    /// The HTTP status, when one arrived.
    status: Option<u16>,
    /// Whether the host answered 429.
    rate_limited: bool,
}

impl LookupFailure {
    /// Summarise an [`HttpError`] at the coalescing boundary.
    pub fn of(error: &HttpError) -> Self {
        Self {
            message: error.to_string(),
            status: error.status().map(|status| status.as_u16()),
            rate_limited: error.is_rate_limited(),
        }
    }

    /// The HTTP status, when the failure got one.
    pub fn status(&self) -> Option<u16> {
        self.status
    }

    /// Whether the host answered 429.
    ///
    /// The signal that separates "slow down" from "broken", and the reason a
    /// failed lookup is never negatively cached.
    pub fn is_rate_limited(&self) -> bool {
        self.rate_limited
    }
}

impl std::fmt::Display for LookupFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

/// Everything lyrics resolution can fail with.
#[derive(Debug, thiserror::Error)]
pub enum LyricsError {
    /// LRCLIB could not be reached, or refused the request, and no local or
    /// embedded source could answer instead.
    ///
    /// Distinct from an empty [`shiranami_core::models::lyrics::LyricsResult`],
    /// which means the lookup succeeded and the song has no lyrics.
    #[error("lyrics lookup failed: {0}")]
    Lookup(LookupFailure),
}

impl WireError for LyricsError {
    fn code(&self) -> Cow<'static, str> {
        // `INTERNAL`, deliberately. There is no lyrics registry in
        // `core::error::codes` — v1 never rejected this channel, so the
        // renderer has no lyrics code to translate. Minting one here would hand
        // the renderer a string it would render raw, which is worse than the
        // fallback it already handles. The structured details below carry what
        // a future lyrics-specific UI would actually branch on.
        Cow::Borrowed(codes::INTERNAL)
    }

    fn details(&self) -> Option<serde_json::Value> {
        let Self::Lookup(failure) = self;
        Some(serde_json::json!({
            "status": failure.status,
            "rateLimited": failure.rate_limited,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::StatusCode;
    use reqwest::header::HeaderMap;
    use shiranami_core::error::ErrorPayload;

    fn status_error(status: StatusCode) -> HttpError {
        HttpError::Status {
            url: "https://lrclib.net/api/search?q=secret".to_owned(),
            status,
            headers: Box::new(HeaderMap::new()),
            retry_after: None,
            body_text: None,
        }
    }

    #[test]
    fn a_summarised_failure_keeps_the_status_and_the_rate_limit_flag() {
        let failure = LookupFailure::of(&status_error(StatusCode::TOO_MANY_REQUESTS));
        assert_eq!(failure.status(), Some(429));
        assert!(failure.is_rate_limited());

        let failure = LookupFailure::of(&status_error(StatusCode::INTERNAL_SERVER_ERROR));
        assert_eq!(failure.status(), Some(500));
        assert!(!failure.is_rate_limited());
    }

    /// A transport failure never got a status, and must not pretend otherwise —
    /// the caching decision reads this.
    #[test]
    fn a_failure_without_a_status_reports_none() {
        let failure = LookupFailure::of(&HttpError::Timeout {
            url: "https://lrclib.net/api/get".to_owned(),
            timeout: std::time::Duration::from_secs(30),
        });
        assert_eq!(failure.status(), None);
        assert!(!failure.is_rate_limited());
    }

    /// A summary is `Clone`, which is the whole reason it exists: every caller
    /// that joined one in-flight lookup gets an equal copy.
    #[test]
    fn a_summary_clones_equal() {
        let failure = LookupFailure::of(&status_error(StatusCode::TOO_MANY_REQUESTS));
        assert_eq!(failure.clone(), failure);
    }

    #[test]
    fn the_wire_payload_carries_a_translatable_code_and_the_rate_limit_flag() {
        let error = LyricsError::Lookup(LookupFailure::of(&status_error(
            StatusCode::TOO_MANY_REQUESTS,
        )));
        let payload = ErrorPayload::of(&error);

        assert_eq!(payload.code, "INTERNAL");
        assert_eq!(
            payload.details.as_ref().map(|d| d["rateLimited"].clone()),
            Some(serde_json::json!(true))
        );
    }

    /// The message may name the URL; the structured payload may not, for the
    /// same reason `shiranami-net` keeps it out — `details` is what gets logged
    /// and forwarded, and a query string can carry a search term or a token.
    #[test]
    fn the_wire_details_never_carry_the_url() {
        let error = LyricsError::Lookup(LookupFailure::of(&status_error(StatusCode::FORBIDDEN)));
        let details =
            serde_json::to_string(&ErrorPayload::of(&error).details).expect("details serialize");

        assert!(!details.contains("lrclib.net"));
        assert!(!details.contains("secret"));
    }
}
