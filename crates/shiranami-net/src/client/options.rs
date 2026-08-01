//! Per-request knobs.
//!
//! Ported from `RawRequestOptions` in `apps/desktop/src/main/app/http.ts`. Every
//! field is optional and the defaults are v1's, so `RequestOptions::default()`
//! is the bare-URL GET that most call sites want.

use std::time::Duration;

use reqwest::Method;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

/// How long a request may take, in full, when the caller states no preference.
///
/// Covers the response body as well as the status line — v1's timer wrapped the
/// whole exchange, and a server that answers instantly and then dribbles bytes
/// forever is the case that makes the distinction matter.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// One outbound request's settings.
#[derive(Debug, Clone)]
pub struct RequestOptions {
    /// HTTP method. Defaults to `GET`.
    pub method: Method,
    /// Extra request headers.
    pub headers: HeaderMap,
    /// A pre-serialised request body, e.g. a JSON string.
    pub body: Option<String>,
    /// Overrides [`DEFAULT_TIMEOUT`].
    pub timeout: Option<Duration>,
    /// Abandon the response once the body passes this many bytes.
    ///
    /// Applies to decoded bytes, as v1's did, so a compressed response is
    /// measured by what it costs us in memory rather than on the wire.
    pub max_bytes: Option<u64>,
    /// Buffer a failing response's body and attach it to the error.
    ///
    /// Off by default: the usual caller only needs the status, and reading a
    /// body we are about to discard is wasted work. On for the callers that
    /// want to surface a server-written error message rather than a generic
    /// one — v1 used it for the share API.
    pub read_error_body: bool,
    /// Run the SSRF guard before sending.
    ///
    /// Off by default, matching v1, where the guard was applied by the two call
    /// sites handling untrusted URLs — the radio proxy and cover-art download —
    /// rather than by the client. Requests to our own fixed hosts do not need a
    /// second name resolution on every call. Turn it on for **any** URL that
    /// came from the renderer, a playlist, or an upstream API response.
    pub guard_url: bool,
}

impl Default for RequestOptions {
    fn default() -> Self {
        Self {
            method: Method::GET,
            headers: HeaderMap::new(),
            body: None,
            timeout: None,
            max_bytes: None,
            read_error_body: false,
            guard_url: false,
        }
    }
}

impl RequestOptions {
    /// A GET whose URL is checked by the SSRF guard first.
    ///
    /// The shape every caller handling an untrusted URL wants, named so that
    /// reaching for it is easier than remembering the field.
    pub fn guarded() -> Self {
        Self {
            guard_url: true,
            ..Self::default()
        }
    }

    /// A POST carrying `body`.
    pub fn post(body: impl Into<String>) -> Self {
        Self {
            method: Method::POST,
            body: Some(body.into()),
            ..Self::default()
        }
    }

    /// Cap the buffered response at `max_bytes`.
    #[must_use]
    pub fn with_max_bytes(mut self, max_bytes: u64) -> Self {
        self.max_bytes = Some(max_bytes);
        self
    }

    /// Read a failing response's body into the error.
    #[must_use]
    pub fn reading_error_body(mut self) -> Self {
        self.read_error_body = true;
        self
    }

    /// Override the timeout.
    #[must_use]
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Add one request header.
    #[must_use]
    pub fn with_header(mut self, name: HeaderName, value: HeaderValue) -> Self {
        self.headers.insert(name, value);
        self
    }

    /// The deadline this request runs under.
    pub fn deadline(&self) -> Duration {
        self.timeout.unwrap_or(DEFAULT_TIMEOUT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_is_an_unguarded_uncapped_get() {
        let options = RequestOptions::default();
        assert_eq!(options.method, Method::GET);
        assert!(options.body.is_none());
        assert!(options.max_bytes.is_none());
        assert!(!options.read_error_body);
        assert!(
            !options.guard_url,
            "the guard stays opt-in, as it was in v1 — turning it on by default \
             would put a second name resolution on every lrclib and iTunes call"
        );
        assert_eq!(options.deadline(), DEFAULT_TIMEOUT);
    }

    #[test]
    fn the_builders_compose() {
        let options = RequestOptions::post("{}")
            .with_max_bytes(1_024)
            .reading_error_body()
            .with_timeout(Duration::from_secs(5));

        assert_eq!(options.method, Method::POST);
        assert_eq!(options.body.as_deref(), Some("{}"));
        assert_eq!(options.max_bytes, Some(1_024));
        assert!(options.read_error_body);
        assert_eq!(options.deadline(), Duration::from_secs(5));
    }

    #[test]
    fn guarded_turns_the_ssrf_check_on() {
        assert!(RequestOptions::guarded().guard_url);
    }
}
