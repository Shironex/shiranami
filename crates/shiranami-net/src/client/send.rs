//! The shared client and the single request core every call goes through.
//!
//! Ported from `requestBufferRaw` / `runGated` / `requestText` / `requestBuffer`
//! / `requestJson` in `apps/desktop/src/main/app/http.ts`.
//!
//! # Logging
//!
//! v1 logged a **warning on every non-2xx response**, and the Phase 1b
//! amendment records what that cost: the v2 update manifest is expected to 404
//! while dormant, so the shared helper would have written a warning a day,
//! forever, for a working system. The bridge release had to bypass the helper
//! entirely to avoid it.
//!
//! So the client warns about exactly one thing: a rate-limit backoff it applied
//! on its own initiative, which nothing else will report. Every other outcome —
//! success, 404, 500, timeout, transport failure — is a `debug` line and a
//! returned error. Whether a 404 from lrclib is routine (no lyrics for this
//! track) or alarming is a question only the caller can answer, and the whole
//! lesson is that the client must not answer it.

use std::sync::Arc;

use reqwest::{Client, Response};
use serde::de::DeserializeOwned;
use url::Url;

use crate::client::options::RequestOptions;
use crate::error::{HttpError, Result};
use crate::gate::{HostGates, MinIntervalGate};
use crate::retry_after::{DEFAULT_429_BACKOFF, parse_retry_after};
use crate::url_safety::UrlGuard;

/// Identifies us to the hosts we call.
///
/// v1 inherited Chromium's User-Agent from `electron.net` without asking for
/// one. reqwest sends none at all, and `api.github.com` answers 403 to a request
/// without one — a silent break in the yt-dlp updater that would only surface as
/// "updates stopped working".
const USER_AGENT: &str = concat!("shiranami/", env!("CARGO_PKG_VERSION"));

/// The one outbound HTTP client. Cheap to clone; clones share a connection pool.
#[derive(Debug, Clone)]
pub struct HttpClient {
    inner: Client,
    /// The redirect-less sibling backing [`HttpClient::stream`]. reqwest's
    /// redirect policy is per-client, so the radio proxy's manual hop loop needs
    /// its own; see `client::stream`.
    unredirected: Client,
    gates: Arc<HostGates>,
    guard: UrlGuard,
}

impl HttpClient {
    /// Build a client with the system resolver behind its SSRF guard.
    pub fn new() -> Result<Self> {
        Self::with_guard(UrlGuard::system())
    }

    /// Build a client whose guard resolves through `guard`'s resolver.
    pub fn with_guard(guard: UrlGuard) -> Result<Self> {
        let inner = Client::builder()
            .user_agent(USER_AGENT)
            // Redirects are followed by default, which is right for the API
            // calls this client makes. The radio proxy needs each hop
            // re-validated instead, so Phase 8 drives its own manual loop
            // rather than loosening the policy here.
            .build()
            .map_err(|source| HttpError::ClientInit { source })?;

        Ok(Self {
            inner,
            unredirected: crate::client::stream::build_unredirected(USER_AGENT)?,
            gates: Arc::new(HostGates::new()),
            guard,
        })
    }

    /// The SSRF guard, so callers needing hop-by-hop checks share this instance.
    pub fn guard(&self) -> &UrlGuard {
        &self.guard
    }

    /// The redirect-less client, for [`HttpClient::stream`].
    pub(super) fn unredirected(&self) -> &Client {
        &self.unredirected
    }

    /// The rate gate `url`'s host runs under, if it has one.
    ///
    /// Replaces v1's `getLrclibGate()`. The lyrics service reaches its lrclib
    /// gate through this so its library calls are spaced by the same clock as
    /// the requests this client makes.
    pub fn gate_for_url(&self, url: &str) -> Option<Arc<MinIntervalGate>> {
        let parsed = Url::parse(url).ok()?;
        self.gates.for_host(parsed.host_str()?)
    }

    /// Fetch `url` and return the buffered body.
    pub async fn bytes(&self, url: &str, options: RequestOptions) -> Result<Vec<u8>> {
        if options.guard_url
            && let Err(reason) = self.guard.check(url).await
        {
            return Err(HttpError::Blocked {
                url: url.to_owned(),
                reason,
            });
        }

        match self.gate_for_url(url) {
            Some(gate) => {
                let gated = Arc::clone(&gate);
                gate.run(|| async move {
                    let outcome = self.execute(url, &options).await;
                    back_off_if_rate_limited(&gated, url, outcome.as_ref().err());
                    outcome
                })
                .await
            }
            // No gate for this host, or the URL will not parse. v1 ran ungated
            // in both cases and let the request itself produce the clearer
            // failure, rather than inventing a parse error here.
            None => self.execute(url, &options).await,
        }
    }

    /// Fetch `url` and decode the body as UTF-8.
    ///
    /// Lossy, as v1's `buffer.toString('utf-8')` was: a malformed byte becomes
    /// U+FFFD rather than failing a request whose body is otherwise readable.
    pub async fn text(&self, url: &str, options: RequestOptions) -> Result<String> {
        let body = self.bytes(url, options).await?;
        Ok(String::from_utf8_lossy(&body).into_owned())
    }

    /// Fetch `url` and deserialize the body.
    pub async fn json<T: DeserializeOwned>(&self, url: &str, options: RequestOptions) -> Result<T> {
        let body = self.text(url, options).await?;
        serde_json::from_str(&body).map_err(|source| HttpError::Json {
            url: url.to_owned(),
            source,
        })
    }

    /// Send one request under its deadline. The gate, if any, wraps this.
    async fn execute(&self, url: &str, options: &RequestOptions) -> Result<Vec<u8>> {
        let timeout = options.deadline();

        // The deadline covers the body read, not just the status line. reqwest's
        // own `timeout` would too, but doing it here keeps the failure a
        // `Timeout` with the deadline in it rather than a transport error the
        // caller has to interrogate.
        match tokio::time::timeout(timeout, self.exchange(url, options)).await {
            Ok(result) => result,
            Err(_elapsed) => {
                tracing::debug!(url, timeout_ms = timeout.as_millis(), "request timed out");
                Err(HttpError::Timeout {
                    url: url.to_owned(),
                    timeout,
                })
            }
        }
    }

    async fn exchange(&self, url: &str, options: &RequestOptions) -> Result<Vec<u8>> {
        let mut request = self
            .inner
            .request(options.method.clone(), url)
            .headers(options.headers.clone());
        if let Some(body) = options.body.clone() {
            request = request.body(body);
        }

        let response = request.send().await.map_err(|source| {
            tracing::debug!(url, %source, "request failed before a status arrived");
            HttpError::Transport {
                url: url.to_owned(),
                source,
            }
        })?;

        let status = response.status();
        let headers = response.headers().clone();
        let failed = !status.is_success();

        if failed && !options.read_error_body {
            tracing::debug!(url, status = status.as_u16(), "request returned a failure");
            return Err(HttpError::Status {
                url: url.to_owned(),
                status,
                headers: Box::new(headers.clone()),
                retry_after: parse_retry_after(&headers),
                body_text: None,
            });
        }

        let body = collect_body(url, response, options.max_bytes).await?;

        if failed {
            tracing::debug!(
                url,
                status = status.as_u16(),
                "request returned a failure, body read"
            );
            return Err(HttpError::Status {
                url: url.to_owned(),
                status,
                headers: Box::new(headers.clone()),
                retry_after: parse_retry_after(&headers),
                body_text: Some(String::from_utf8_lossy(&body).into_owned()),
            });
        }

        tracing::debug!(
            url,
            status = status.as_u16(),
            bytes = body.len(),
            "request ok"
        );
        Ok(body)
    }
}

/// Buffer a response body, abandoning it if it grows past `max_bytes`.
///
/// Dropping the [`Response`] on the oversize path closes the connection, which
/// is what stops a hostile or misconfigured server from streaming until we run
/// out of memory — v1 called `request.abort()` for the same reason.
async fn collect_body(
    url: &str,
    mut response: Response,
    max_bytes: Option<u64>,
) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|source| HttpError::Transport {
                url: url.to_owned(),
                source,
            })?;
        let Some(chunk) = chunk else { break };

        if let Some(max_bytes) = max_bytes {
            let total = buffer.len().saturating_add(chunk.len()) as u64;
            if total > max_bytes {
                tracing::debug!(url, max_bytes, "response exceeded its size cap");
                return Err(HttpError::TooLarge {
                    url: url.to_owned(),
                    max_bytes,
                });
            }
        }

        buffer.extend_from_slice(&chunk);
    }

    Ok(buffer)
}

/// Extend `gate` when the host answered 429.
///
/// Only 429 extends it. v1 was explicit about this and a test pinned it: a 500
/// is the server having a bad time, not the server asking us to slow down, and
/// parking the host for a minute over one would make a transient outage look
/// like a much longer one.
fn back_off_if_rate_limited(gate: &MinIntervalGate, url: &str, error: Option<&HttpError>) {
    let Some(error) = error.filter(|error| error.is_rate_limited()) else {
        return;
    };

    let backoff = error.retry_after().unwrap_or(DEFAULT_429_BACKOFF);
    // The one warning the client issues on its own: it has just parked this
    // host for up to five minutes, and no caller is in a position to report it.
    tracing::warn!(
        url,
        backoff_ms = backoff.as_millis(),
        "rate limited, backing off"
    );
    gate.bump_by(backoff);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retry_after::RETRY_AFTER_MAX;
    use reqwest::StatusCode;
    use reqwest::header::HeaderMap;
    use std::time::Duration;
    use tokio::time::Instant;

    fn failure(status: StatusCode, retry_after: Option<Duration>) -> HttpError {
        HttpError::Status {
            url: "https://lrclib.net/api/search".to_owned(),
            status,
            headers: Box::new(HeaderMap::new()),
            retry_after,
            body_text: None,
        }
    }

    /// How long the gate makes the next caller wait, on a paused clock.
    async fn wait_imposed_by(gate: &MinIntervalGate) -> u128 {
        let start = Instant::now();
        gate.run(|| async {}).await;
        start.elapsed().as_millis()
    }

    /// The ported "on 429 with Retry-After: 3, next call waits 3000 ms".
    #[tokio::test(start_paused = true)]
    async fn a_rate_limit_with_a_hint_backs_off_by_that_hint() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        let error = failure(StatusCode::TOO_MANY_REQUESTS, Some(Duration::from_secs(3)));

        back_off_if_rate_limited(&gate, "https://lrclib.net/x", Some(&error));

        assert_eq!(wait_imposed_by(&gate).await, 3_000);
    }

    /// The ported "429 without Retry-After uses the 60 s fallback".
    #[tokio::test(start_paused = true)]
    async fn a_rate_limit_without_a_hint_falls_back_to_a_minute() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        let error = failure(StatusCode::TOO_MANY_REQUESTS, None);

        back_off_if_rate_limited(&gate, "https://lrclib.net/x", Some(&error));

        assert_eq!(
            wait_imposed_by(&gate).await,
            DEFAULT_429_BACKOFF.as_millis()
        );
    }

    /// The ported "non-429 error (500) does not bump the gate". A server having
    /// a bad minute is not a server asking us to slow down.
    #[tokio::test(start_paused = true)]
    async fn a_server_error_does_not_back_off() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        let error = failure(StatusCode::INTERNAL_SERVER_ERROR, None);

        back_off_if_rate_limited(&gate, "https://lrclib.net/x", Some(&error));

        assert_eq!(wait_imposed_by(&gate).await, 0, "the gate stays open");
    }

    #[tokio::test(start_paused = true)]
    async fn a_success_does_not_back_off() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        back_off_if_rate_limited(&gate, "https://lrclib.net/x", None);
        assert_eq!(wait_imposed_by(&gate).await, 0);
    }

    /// A non-status failure cannot carry a retry hint, so it must not be
    /// mistaken for a rate limit.
    #[tokio::test(start_paused = true)]
    async fn a_timeout_does_not_back_off() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        let error = HttpError::Timeout {
            url: "https://lrclib.net/x".to_owned(),
            timeout: Duration::from_secs(30),
        };

        back_off_if_rate_limited(&gate, "https://lrclib.net/x", Some(&error));

        assert_eq!(wait_imposed_by(&gate).await, 0);
    }

    /// A hostile `Retry-After` reaches the gate already clamped, because the
    /// clamp lives in the parser rather than here. Pinned so that moving the
    /// parse would not silently hand the gate an unbounded value.
    #[tokio::test(start_paused = true)]
    async fn an_extreme_hint_arrives_already_clamped() {
        let gate = MinIntervalGate::new(Duration::from_millis(250));
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", "999999".parse().expect("valid header value"));
        let error = HttpError::Status {
            url: "https://lrclib.net/x".to_owned(),
            status: StatusCode::TOO_MANY_REQUESTS,
            retry_after: parse_retry_after(&headers),
            headers: Box::new(headers),
            body_text: None,
        };

        back_off_if_rate_limited(&gate, "https://lrclib.net/x", Some(&error));

        assert_eq!(wait_imposed_by(&gate).await, RETRY_AFTER_MAX.as_millis());
    }

    #[test]
    fn the_user_agent_names_the_app_and_its_version() {
        assert!(USER_AGENT.starts_with("shiranami/"));
        assert!(
            USER_AGENT.len() > "shiranami/".len(),
            "api.github.com answers 403 to a request with no User-Agent"
        );
    }

    #[test]
    fn gate_lookup_matches_the_host_table() {
        let client = HttpClient::new().expect("the client builds");
        assert!(
            client
                .gate_for_url("https://lrclib.net/api/search")
                .is_some()
        );
        assert!(client.gate_for_url("https://api.shiranami.app/x").is_none());
        assert!(
            client.gate_for_url("not a url").is_none(),
            "an unparseable URL is ungated, and fails later with a clearer message"
        );
    }
}
