//! The HTTP failure taxonomy, projected onto core's wire shape.
//!
//! Ported from the `HttpError` class and the ad-hoc `Error`s thrown alongside it
//! in `apps/desktop/src/main/app/http.ts`. v1 had one named class for non-2xx
//! responses and plain `Error`s for everything else, which meant a caller
//! wanting to tell a timeout from a size cap had to match on message text. Here
//! each of those is a variant.
//!
//! **There is no `Aborted` variant.** v1 raised a `DOMException('AbortError')`
//! when an `AbortSignal` fired, because a JavaScript promise has to settle
//! somehow. In Rust, cancelling a request is dropping its future — nothing to
//! report, nobody to report it to — so an abort produces no error at all and
//! the variant would be unconstructible.

use std::borrow::Cow;
use std::time::Duration;

use reqwest::StatusCode;
use reqwest::header::HeaderMap;
use shiranami_core::error::{WireError, codes};

use crate::url_safety::UrlGuardReason;

/// Convenience alias for fallible network operations.
pub type Result<T, E = HttpError> = std::result::Result<T, E>;

/// Everything an outbound request can fail with.
#[derive(Debug, thiserror::Error)]
pub enum HttpError {
    /// The response arrived with a status outside 2xx.
    ///
    /// The message is v1's, verbatim, because it is what a caller that lets the
    /// failure propagate ends up showing.
    #[error("request failed with status {status}: {url}")]
    Status {
        /// The URL requested.
        url: String,
        /// The status returned.
        status: StatusCode,
        /// The response headers.
        ///
        /// Boxed so the enum stays small enough to pass through `Result`
        /// without tripping `clippy::result_large_err` — a `HeaderMap` inline
        /// would make every `Ok` on this crate's happy path pay for it.
        headers: Box<HeaderMap>,
        /// How long the server asked us to wait, clamped by
        /// [`crate::retry_after::RETRY_AFTER_MAX`]. Present on far more than
        /// just 429s, because a 503 may carry it too.
        retry_after: Option<Duration>,
        /// The response body, present only when the caller asked to read it.
        ///
        /// Off by default: reading the body of a failed request costs a round
        /// of buffering on a path that usually only needs the status, and the
        /// callers that *do* want it want it to surface a server-written error
        /// message.
        body_text: Option<String>,
    },

    /// The request did not finish inside its deadline.
    #[error("request timed out after {}ms: {url}", timeout.as_millis())]
    Timeout {
        /// The URL requested.
        url: String,
        /// The deadline that expired.
        timeout: Duration,
    },

    /// The response body grew past the caller's cap and was abandoned.
    #[error("response exceeded max_bytes ({max_bytes}): {url}")]
    TooLarge {
        /// The URL requested.
        url: String,
        /// The cap that was exceeded.
        max_bytes: u64,
    },

    /// The SSRF guard refused the URL, so nothing was sent.
    #[error("refusing to request a disallowed URL ({reason}): {url}")]
    Blocked {
        /// The URL that was refused.
        url: String,
        /// Which rule refused it.
        reason: UrlGuardReason,
    },

    /// The request failed below the status line — DNS, TLS, connection, body.
    #[error("request to {url} failed: {source}")]
    Transport {
        /// The URL requested.
        url: String,
        /// The underlying failure.
        #[source]
        source: reqwest::Error,
    },

    /// The response arrived but was not the JSON the caller asked for.
    #[error("{url} returned a body that is not valid JSON: {source}")]
    Json {
        /// The URL requested.
        url: String,
        /// The underlying parse failure.
        #[source]
        source: serde_json::Error,
    },
}

impl HttpError {
    /// The status, for the variants that got one.
    ///
    /// The 429 check that drives the rate gate's backoff reads through this
    /// rather than matching the variant, so a caller in Phase 12 does not have
    /// to know the enum's shape to ask "was I rate limited?".
    pub fn status(&self) -> Option<StatusCode> {
        match self {
            Self::Status { status, .. } => Some(*status),
            _ => None,
        }
    }

    /// The server-requested backoff, if the failure carried one.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::Status { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    /// Whether this is the rate-limit status the gate backs off on.
    pub fn is_rate_limited(&self) -> bool {
        self.status() == Some(StatusCode::TOO_MANY_REQUESTS)
    }

    /// The response body, when the request asked for it to be read.
    pub fn body_text(&self) -> Option<&str> {
        match self {
            Self::Status { body_text, .. } => body_text.as_deref(),
            _ => None,
        }
    }

    /// The response headers, for the variants that got a response.
    pub fn headers(&self) -> Option<&HeaderMap> {
        match self {
            Self::Status { headers, .. } => Some(headers),
            _ => None,
        }
    }
}

impl WireError for HttpError {
    fn code(&self) -> Cow<'static, str> {
        // Every variant maps to `INTERNAL`, and deliberately so. The four code
        // registries in `core::error::codes` are a *frozen* vocabulary the
        // renderer has translations for; minting `net.timeout` here would give
        // the renderer a code it cannot translate, which is strictly worse than
        // the fallback it already handles. The crates above this one — share,
        // downloader, lyrics — wrap an `HttpError` in their own enum and map it
        // onto the registry entry that means something to a user, which is the
        // layer where "the request failed" becomes "we could not reach the
        // share server".
        Cow::Borrowed(codes::INTERNAL)
    }

    fn details(&self) -> Option<serde_json::Value> {
        // Only the two fields a renderer could act on. The URL is deliberately
        // left out even though `message` carries it: `details` is the field
        // that gets logged and forwarded structurally, and a query string can
        // hold a token — scrobble and share both sign requests. Keeping the URL
        // out of the structured payload keeps it out of that path by
        // construction rather than by everyone remembering.
        let Self::Status {
            status,
            retry_after,
            ..
        } = self
        else {
            return None;
        };

        Some(serde_json::json!({
            "status": status.as_u16(),
            // `as_millis` is a `u128`; the clamp already keeps every value far
            // inside `u64`, so the fallback is unreachable rather than lossy.
            "retryAfterMs": retry_after
                .map(|wait| u64::try_from(wait.as_millis()).unwrap_or(u64::MAX)),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::ErrorPayload;

    fn rate_limited() -> HttpError {
        HttpError::Status {
            url: "https://lrclib.net/api/search".to_owned(),
            status: StatusCode::TOO_MANY_REQUESTS,
            headers: Box::new(HeaderMap::new()),
            retry_after: Some(Duration::from_secs(3)),
            body_text: None,
        }
    }

    /// The ported `HttpError` construction test: status, URL and retry hint all
    /// survive, and the rendered message still names the status, because a
    /// caller that just logs the error is the common case.
    #[test]
    fn a_status_failure_keeps_its_status_url_and_retry_hint() {
        let error = rate_limited();
        assert_eq!(error.status(), Some(StatusCode::TOO_MANY_REQUESTS));
        assert_eq!(error.retry_after(), Some(Duration::from_secs(3)));
        assert!(error.is_rate_limited());
        assert!(error.to_string().contains("429"));
        assert!(error.to_string().contains("https://lrclib.net/api/search"));
    }

    #[test]
    fn non_status_failures_report_no_status_and_no_retry_hint() {
        let timeout = HttpError::Timeout {
            url: "https://example.com/".to_owned(),
            timeout: Duration::from_secs(30),
        };
        assert_eq!(timeout.status(), None);
        assert_eq!(timeout.retry_after(), None);
        assert!(!timeout.is_rate_limited());
        assert!(timeout.to_string().contains("30000ms"));
    }

    #[test]
    fn a_blocked_url_names_the_rule_that_refused_it() {
        let error = HttpError::Blocked {
            url: "http://169.254.169.254/".to_owned(),
            reason: UrlGuardReason::PrivateIp,
        };
        assert!(error.to_string().contains("private-ip"));
    }

    /// Every rejection is code-bearing so the renderer's `switch (err.code)`
    /// stays exhaustive, exactly as core's taxonomy requires.
    #[test]
    fn every_variant_crosses_the_wire_with_a_code() {
        let payload = ErrorPayload::of(&rate_limited());
        assert_eq!(payload.code, "INTERNAL");
        assert_eq!(
            payload.details.as_ref().map(|d| d["status"].clone()),
            Some(serde_json::json!(429))
        );
        assert_eq!(
            payload.details.as_ref().map(|d| d["retryAfterMs"].clone()),
            Some(serde_json::json!(3000))
        );
    }

    /// The structured payload must never become a place a signed URL leaks
    /// into. The message may name the URL; `details` may not.
    #[test]
    fn the_wire_details_never_carry_the_url() {
        let error = HttpError::Status {
            url: "https://ws.audioscrobbler.com/2.0/?api_sig=secret".to_owned(),
            status: StatusCode::FORBIDDEN,
            headers: Box::new(HeaderMap::new()),
            retry_after: None,
            body_text: None,
        };
        let payload = ErrorPayload::of(&error);
        let details = serde_json::to_string(&payload.details).expect("details serialize");
        assert!(!details.contains("api_sig"), "details leaked a signed URL");
        assert!(!details.contains("audioscrobbler"));
    }

    #[test]
    fn a_failure_without_a_status_carries_no_details() {
        let error = HttpError::TooLarge {
            url: "https://i.ytimg.com/vi/abc/hqdefault.jpg".to_owned(),
            max_bytes: 10 * 1024 * 1024,
        };
        assert_eq!(ErrorPayload::of(&error).details, None);
    }
}
