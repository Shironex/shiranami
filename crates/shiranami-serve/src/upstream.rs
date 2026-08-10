//! The seam between the radio proxy's redirect logic and the network.
//!
//! The proxy's interesting behaviour is a loop: request, notice a 3xx, resolve
//! the `Location`, **re-run the SSRF guard on the new URL**, request again, up
//! to five times. That loop is the security boundary, and testing it against a
//! real station would mean testing it against whatever a real station does
//! today.
//!
//! So the network is a trait with one method. The tests drive a fake that
//! answers with any redirect chain they like — including one that lands on a
//! private address — while the guard deciding whether to follow it stays the
//! real [`shiranami_net::url_safety::UrlGuard`] over a canned resolver. The
//! refusal test therefore exercises the real address classifier; only the
//! transport is fake.

use std::future::Future;
use std::pin::Pin;

use axum::http::header::{CONTENT_TYPE, LOCATION, USER_AGENT};
use axum::http::{HeaderMap, HeaderName, HeaderValue};
use bytes::Bytes;
use futures_util::stream::{self, BoxStream, StreamExt};
use shiranami_net::{HttpClient, RequestOptions};

/// A body that has not been read.
///
/// A stream rather than a buffer because a radio station never stops sending:
/// `Vec<u8>` here would be an out-of-memory bug with a timer on it.
pub type ChunkStream = BoxStream<'static, Result<Bytes, UpstreamError>>;

/// The future a [`RadioUpstream`] returns.
pub type FetchFuture<'a> =
    Pin<Box<dyn Future<Output = Result<UpstreamHead, UpstreamError>> + Send + 'a>>;

/// Why an upstream request failed.
#[derive(Debug, Clone, Copy, thiserror::Error)]
pub enum UpstreamError {
    /// The station could not be reached, or the connection broke mid-stream.
    #[error("upstream transport failure")]
    Transport,
}

/// A response head from a station, with its body still unread.
pub struct UpstreamHead {
    /// The status the station answered with.
    pub status: u16,
    /// The response headers — `Location` on a hop, `Content-Type` at the end.
    pub headers: HeaderMap,
    /// The unread body.
    pub body: ChunkStream,
}

impl UpstreamHead {
    /// The `Location` header, when present and readable.
    ///
    /// An unreadable one counts as absent, which ends the hop loop and forwards
    /// the 3xx as-is rather than guessing at a destination.
    pub fn location(&self) -> Option<&str> {
        self.headers.get(LOCATION)?.to_str().ok()
    }

    /// The `Content-Type` header, when present and readable.
    pub fn content_type(&self) -> Option<&str> {
        self.headers.get(CONTENT_TYPE)?.to_str().ok()
    }

    /// The ICY metadata period in bytes, when the station granted one.
    ///
    /// `None` means the body is plain audio and must be forwarded untouched —
    /// which covers a station that ignored our `Icy-MetaData: 1`, one that has
    /// no metadata to send, and any response whose header we cannot make sense
    /// of. Every one of those is ordinary, so none of them is logged.
    ///
    /// A zero is folded into `None` deliberately. It would otherwise describe a
    /// period of no length at all, and a de-framer counting down from zero
    /// would read every byte of audio as a metadata length byte — silence, from
    /// a header a station had no reason to think was load-bearing.
    pub fn metaint(&self) -> Option<usize> {
        let raw = self.headers.get(ICY_METAINT)?.to_str().ok()?;
        raw.trim().parse::<usize>().ok().filter(|value| *value > 0)
    }
}

/// How the radio proxy reaches a station.
///
/// One method, and it does **not** follow redirects: following them is the
/// caller's job, because the guard call between hops is the caller's job.
pub trait RadioUpstream: Send + Sync {
    /// Request `url`, returning the head with the body unread.
    fn fetch<'a>(&'a self, url: &'a str) -> FetchFuture<'a>;
}

/// How we identify to stations. v1 sent `Shiranami/<version>`.
const RADIO_USER_AGENT: &str = concat!("Shiranami/", env!("CARGO_PKG_VERSION"));

/// The header that asks a station to interleave metadata into the audio.
const ICY_METADATA: HeaderName = HeaderName::from_static("icy-metadata");

/// The header a station answers it with: the audio period between blocks.
const ICY_METAINT: HeaderName = HeaderName::from_static("icy-metaint");

/// What we ask for. v1 sent `0`; the flip to `1` is only safe because the route
/// pairs it with a de-framer — hence a named constant with a test on it.
const ICY_METADATA_WANTED: HeaderValue = HeaderValue::from_static("1");

/// The production upstream: `shiranami-net`'s redirect-less streaming request.
#[derive(Debug, Clone)]
pub struct NetUpstream {
    client: HttpClient,
}

impl NetUpstream {
    /// Wrap the shared HTTP client.
    pub fn new(client: HttpClient) -> Self {
        Self { client }
    }
}

impl RadioUpstream for NetUpstream {
    fn fetch<'a>(&'a self, url: &'a str) -> FetchFuture<'a> {
        Box::pin(async move {
            let options = RequestOptions::guarded()
                .with_header(USER_AGENT, HeaderValue::from_static(RADIO_USER_AGENT))
                // v1 declined metadata (`0`) because asking for it and then
                // ignoring it splices frame bytes into the decoder's input.
                // v2 asks, and `crate::icy` de-frames — the route pairs this
                // header with a `Deframer` whenever the station answers with an
                // `icy-metaint`, and forwards the body untouched when it does
                // not. Changing this to `1` without that pairing is the bug the
                // v1 comment was describing.
                .with_header(ICY_METADATA, ICY_METADATA_WANTED);

            let response = self
                .client
                .stream(url, options)
                .await
                .map_err(|_| UpstreamError::Transport)?;

            let status = response.status().as_u16();
            let headers = response.headers().clone();

            // `None` for the state after a failure, so a caller that keeps
            // polling gets end-of-stream rather than the same error forever.
            let body = stream::unfold(Some(response), |state| async move {
                let mut response = state?;
                match response.chunk().await {
                    Ok(Some(chunk)) => Some((Ok(chunk), Some(response))),
                    Ok(None) => None,
                    Err(_) => Some((Err(UpstreamError::Transport), None)),
                }
            })
            .boxed();

            Ok(UpstreamHead {
                status,
                headers,
                body,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_user_agent_names_the_app_and_its_version() {
        assert!(RADIO_USER_AGENT.starts_with("Shiranami/"));
        assert!(
            RADIO_USER_AGENT.len() > "Shiranami/".len(),
            "a bare app name tells a station nothing about which build is calling"
        );
    }

    #[test]
    fn the_icy_headers_are_spelled_the_way_stations_expect() {
        assert_eq!(ICY_METADATA.as_str(), "icy-metadata");
        assert_eq!(ICY_METAINT.as_str(), "icy-metaint");
    }

    /// v1 sent `0` here. Sending `1` is only correct while
    /// `routes::radio::respond` runs the body through a `Deframer` — flipping
    /// it back to `0` would silently cost every now-playing title, and leaving
    /// it at `1` with the de-framer removed would corrupt every stream.
    #[test]
    fn metadata_is_requested_rather_than_declined() {
        assert_eq!(ICY_METADATA_WANTED.to_str().expect("ascii"), "1");
    }

    /// The three refusals, each of which must leave the body untouched rather
    /// than start a de-framer against a period that is not there.
    #[test]
    fn an_absent_or_useless_metaint_reads_as_none() {
        let head = |value: Option<&'static str>| {
            let mut headers = HeaderMap::new();
            if let Some(value) = value {
                headers.insert(ICY_METAINT, HeaderValue::from_static(value));
            }
            UpstreamHead {
                status: 200,
                headers,
                body: stream::empty().boxed(),
            }
        };

        assert_eq!(head(None).metaint(), None, "no header at all");
        assert_eq!(head(Some("0")).metaint(), None, "a period of no length");
        assert_eq!(head(Some("banana")).metaint(), None, "not a number");
        assert_eq!(head(Some("-16000")).metaint(), None, "not a length");
    }

    #[test]
    fn a_metaint_is_read_and_tolerates_padding() {
        let mut headers = HeaderMap::new();
        headers.insert(ICY_METAINT, HeaderValue::from_static("  16000 "));

        let head = UpstreamHead {
            status: 200,
            headers,
            body: stream::empty().boxed(),
        };

        assert_eq!(head.metaint(), Some(16000));
    }

    #[test]
    fn a_head_reads_the_headers_it_needs() {
        let mut headers = HeaderMap::new();
        headers.insert(LOCATION, HeaderValue::from_static("http://elsewhere/live"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("audio/mpeg"));

        let head = UpstreamHead {
            status: 302,
            headers,
            body: stream::empty().boxed(),
        };

        assert_eq!(head.location(), Some("http://elsewhere/live"));
        assert_eq!(head.content_type(), Some("audio/mpeg"));
    }

    #[test]
    fn an_unreadable_location_reads_as_absent() {
        let mut headers = HeaderMap::new();
        headers.insert(
            LOCATION,
            HeaderValue::from_bytes(b"http://\xff\xfe/live")
                .expect("a valid header, invalid UTF-8"),
        );

        let head = UpstreamHead {
            status: 302,
            headers,
            body: stream::empty().boxed(),
        };

        assert_eq!(
            head.location(),
            None,
            "guessing at an unreadable destination is how a hop skips the guard"
        );
    }
}
