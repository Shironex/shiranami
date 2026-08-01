//! The one request whose body is *not* buffered, and whose redirects are *not*
//! followed.
//!
//! Everything else in this crate fetches a document: a lyrics JSON, a release
//! manifest, a cover image. [`HttpClient::bytes`] buffers those, caps them with
//! `maxBytes`, and lets reqwest follow redirects, because for a document that is
//! all correct.
//!
//! A radio stream is neither. It has no end — buffering it is an out-of-memory
//! bug on a timer — and its redirects are the exact hops the SSRF guard has to
//! re-check, which cannot happen inside a policy the connector applies for us.
//! So this module adds the missing primitive rather than letting
//! `shiranami-serve` build a second HTTP client: "no other crate constructs a
//! client" is the invariant that keeps the User-Agent, the proxy settings and
//! the TLS stack in one place, and it is worth one extra module here to keep.
//!
//! The caller drives the redirect loop itself. That is deliberate — this crate
//! cannot decide how many hops a caller tolerates, and the guard call between
//! hops belongs where the refusal is turned into a response.

use bytes::Bytes;
use reqwest::header::{HeaderMap, LOCATION};
use reqwest::{Client, Response, StatusCode};

use crate::client::options::RequestOptions;
use crate::client::send::HttpClient;
use crate::error::{HttpError, Result};

/// A response whose head has arrived and whose body has not been read.
///
/// Held rather than consumed so the caller can look at the status and the
/// `Location` header — deciding whether this is a hop or the destination —
/// before committing to reading a body that may never end.
#[derive(Debug)]
pub struct StreamedResponse {
    status: StatusCode,
    headers: HeaderMap,
    url: String,
    response: Response,
}

impl StreamedResponse {
    /// The response status.
    pub fn status(&self) -> StatusCode {
        self.status
    }

    /// The response headers.
    pub fn headers(&self) -> &HeaderMap {
        &self.headers
    }

    /// The `Location` header, when it is present and valid UTF-8.
    ///
    /// A header that is not valid UTF-8 reads as absent: it cannot be resolved
    /// against the current URL, and a caller that treated "unreadable" as
    /// "no redirect" by accident would be one that forwards a 302 body.
    pub fn location(&self) -> Option<&str> {
        self.headers.get(LOCATION)?.to_str().ok()
    }

    /// The next body chunk, or `None` once the body ends.
    ///
    /// Deliberately a chunk pump rather than a `Stream`: it keeps `futures` out
    /// of this crate's public API, and the one caller wraps it in whatever
    /// stream shape its own framework wants.
    ///
    /// # Errors
    ///
    /// Returns [`HttpError::Transport`] if the connection fails mid-body.
    pub async fn chunk(&mut self) -> Result<Option<Bytes>> {
        self.response
            .chunk()
            .await
            .map_err(|source| HttpError::Transport {
                url: self.url.clone(),
                source,
            })
    }
}

impl HttpClient {
    /// Send one request, streaming the body and following **no** redirects.
    ///
    /// The timeout covers the response head only. It cannot cover the body:
    /// the body is a live radio stream, and a deadline on it would disconnect
    /// every listener at the thirty-second mark.
    ///
    /// Honours [`RequestOptions::guard_url`] exactly as [`HttpClient::bytes`]
    /// does, so a caller re-checking each hop gets the check applied to the URL
    /// it is about to request and not merely to the one it started from.
    ///
    /// # Errors
    ///
    /// [`HttpError::Blocked`] when the guard refuses the URL, [`HttpError::Timeout`]
    /// when no status arrives in time, and [`HttpError::Transport`] when the
    /// exchange fails.
    pub async fn stream(&self, url: &str, options: RequestOptions) -> Result<StreamedResponse> {
        if options.guard_url
            && let Err(reason) = self.guard().check(url).await
        {
            return Err(HttpError::Blocked {
                url: url.to_owned(),
                reason,
            });
        }

        let timeout = options.deadline();
        match tokio::time::timeout(timeout, self.exchange_streaming(url, &options)).await {
            Ok(result) => result,
            Err(_elapsed) => {
                tracing::debug!(url, timeout_ms = timeout.as_millis(), "stream head timed out");
                Err(HttpError::Timeout {
                    url: url.to_owned(),
                    timeout,
                })
            }
        }
    }

    async fn exchange_streaming(
        &self,
        url: &str,
        options: &RequestOptions,
    ) -> Result<StreamedResponse> {
        let response = self
            .unredirected()
            .request(options.method.clone(), url)
            .headers(options.headers.clone())
            .send()
            .await
            .map_err(|source| {
                tracing::debug!(url, %source, "stream request failed before a status arrived");
                HttpError::Transport {
                    url: url.to_owned(),
                    source,
                }
            })?;

        let status = response.status();
        let headers = response.headers().clone();
        tracing::debug!(url, status = status.as_u16(), "stream head received");

        Ok(StreamedResponse {
            status,
            headers,
            url: url.to_owned(),
            response,
        })
    }
}

/// Build the redirect-less sibling of the shared client.
///
/// A second [`Client`] means a second connection pool, which is the price of
/// reqwest's redirect policy being client-wide rather than per-request. It is
/// the right price: the alternative is turning redirect-following off for the
/// API callers that legitimately need it.
pub(super) fn build_unredirected(user_agent: &'static str) -> Result<Client> {
    Client::builder()
        .user_agent(user_agent)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|source| HttpError::ClientInit { source })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::url_safety::UrlGuard;
    use crate::url_safety::resolver::testing::StaticResolver;
    use std::sync::Arc;

    #[tokio::test]
    async fn a_guarded_stream_of_a_private_address_never_leaves_the_process() {
        let guard = UrlGuard::with_resolver(Arc::new(StaticResolver::new()));
        let client = HttpClient::with_guard(guard).expect("the client builds");

        let error = client
            .stream("http://127.0.0.1:9/live", RequestOptions::guarded())
            .await
            .expect_err("loopback is refused");

        assert!(
            matches!(error, HttpError::Blocked { .. }),
            "a blocked URL must fail as Blocked, not as a transport error — a \
             transport error would mean the connection was attempted"
        );
    }
}
