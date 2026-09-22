//! The two fakes, and the guard that is deliberately not one.
//!
//! [`TestResolver`] and [`FakeUpstream`] stand in for DNS and the network so a
//! redirect chain can be a fixture rather than whatever a radio station does
//! today. The SSRF guard itself is the real one, over these canned answers, so a
//! refusal test exercises the real address classifier.

use std::collections::HashMap;
use std::io;
use std::net::IpAddr;
use std::sync::Mutex;

use axum::http::{HeaderMap, HeaderName, HeaderValue};
use bytes::Bytes;
use futures_util::stream::{self, StreamExt};
use shiranami_net::url_safety::{ResolveFuture, Resolver};
use shiranami_serve::upstream::{FetchFuture, RadioUpstream, UpstreamError, UpstreamHead};

/// The DNS seam, canned — the same shape as `shiranami-net`'s own `StaticResolver`,
/// which is `#[cfg(test)]` and therefore invisible from here.
pub struct TestResolver {
    answers: HashMap<String, Vec<IpAddr>>,
}

impl TestResolver {
    pub fn new() -> Self {
        Self {
            answers: HashMap::new(),
        }
    }

    /// Answer `host` with `addresses`.
    #[must_use]
    pub fn answering(mut self, host: &str, addresses: &[&str]) -> Self {
        self.answers.insert(
            host.to_owned(),
            addresses
                .iter()
                .map(|address| address.parse().expect("a test address literal"))
                .collect(),
        );
        self
    }
}

impl Default for TestResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl Resolver for TestResolver {
    fn resolve<'a>(&'a self, host: &'a str) -> ResolveFuture<'a> {
        let answer = self.answers.get(host).cloned().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("no canned answer for {host}"),
            )
        });
        Box::pin(async move { answer })
    }
}

/// What a scripted station answers with.
pub struct Reply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: ReplyBody,
}

/// The body shape a scripted station sends.
pub enum ReplyBody {
    /// A fixed sequence of chunks, then end-of-stream.
    Chunks(Vec<Bytes>),
    /// Chunks that never stop — a live stream, for asserting the proxy does not
    /// wait for the end before answering.
    Endless(Bytes),
    /// A connection that breaks after the head.
    Broken,
}

impl Reply {
    /// A 200 carrying `body` as one chunk.
    pub fn ok(content_type: &str, body: &str) -> Self {
        Self {
            status: 200,
            headers: vec![("content-type", content_type.to_owned())],
            body: ReplyBody::Chunks(vec![Bytes::from(body.to_owned())]),
        }
    }

    /// A redirect to `location`.
    pub fn redirect(status: u16, location: &str) -> Self {
        Self {
            status,
            headers: vec![("location", location.to_owned())],
            body: ReplyBody::Chunks(Vec::new()),
        }
    }

    /// A failing status.
    pub fn failure(status: u16) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: ReplyBody::Chunks(Vec::new()),
        }
    }

    /// A 200 whose body never ends.
    pub fn endless(chunk: &str) -> Self {
        Self {
            status: 200,
            headers: vec![("content-type", "audio/mpeg".to_owned())],
            body: ReplyBody::Endless(Bytes::from(chunk.to_owned())),
        }
    }
}

/// A station that answers from a script and records what it was asked for.
pub struct FakeUpstream {
    replies: Mutex<HashMap<String, Reply>>,
    requested: Mutex<Vec<String>>,
}

impl FakeUpstream {
    pub fn new() -> Self {
        Self {
            replies: Mutex::new(HashMap::new()),
            requested: Mutex::new(Vec::new()),
        }
    }

    /// Script `url` to answer with `reply`.
    #[must_use]
    pub fn answering(self, url: &str, reply: Reply) -> Self {
        self.replies
            .lock()
            .expect("the test lock is not poisoned")
            .insert(url.to_owned(), reply);
        self
    }

    /// Every URL the proxy actually requested, in order.
    ///
    /// The assertion that matters for the guard: a URL that never appears here
    /// is one no request went out for.
    pub fn requested(&self) -> Vec<String> {
        self.requested
            .lock()
            .expect("the test lock is not poisoned")
            .clone()
    }
}

impl Default for FakeUpstream {
    fn default() -> Self {
        Self::new()
    }
}

impl RadioUpstream for FakeUpstream {
    fn fetch<'a>(&'a self, url: &'a str) -> FetchFuture<'a> {
        Box::pin(async move {
            self.requested
                .lock()
                .expect("the test lock is not poisoned")
                .push(url.to_owned());

            let mut replies = self.replies.lock().expect("the test lock is not poisoned");
            let Some(reply) = replies.remove(url) else {
                return Err(UpstreamError::Transport);
            };

            let mut headers = HeaderMap::new();
            for (name, value) in &reply.headers {
                headers.insert(
                    HeaderName::from_static(name),
                    HeaderValue::from_str(value).expect("a valid test header value"),
                );
            }

            let body = match reply.body {
                ReplyBody::Chunks(chunks) => stream::iter(chunks.into_iter().map(Ok)).boxed(),
                ReplyBody::Endless(chunk) => stream::unfold(chunk, |chunk| async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1)).await;
                    Some((Ok(chunk.clone()), chunk))
                })
                .boxed(),
                ReplyBody::Broken => stream::iter(vec![Err(UpstreamError::Transport)]).boxed(),
            };

            Ok(UpstreamHead {
                status: reply.status,
                headers,
                body,
            })
        })
    }
}
