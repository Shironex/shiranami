//! A loopback HTTP server that replays canned responses.
//!
//! Copied from `shiranami-integrations/tests/support/test_server.rs`, itself a
//! copy of `shiranami-net`'s. Copied rather than shared for the reason that file
//! already records: those live in a crate's `tests/` tree, which cargo compiles
//! into that crate's test binaries only and never publishes, so there is nothing
//! here to import. A `shiranami-test-support` crate would have to sit below
//! `net` on the spine while depending on `tokio` for reasons no production build
//! needs.
//!
//! # Why it lives under `share/`
//!
//! Three namespaces in this lane talk to a server — `share` to the share API,
//! `scrobble` to Last.fm and ListenBrainz, `lyrics` to LRCLIB — and `share` is
//! the only one with a module directory of its own, because it is the only one
//! with assembly logic to put in a sibling. One cross-module reference from the
//! other two is cheaper than three copies of a test double, and cheaper than a
//! rank-1 module in the shell that exists only for tests.
//!
//! Deliberately not a real HTTP implementation. It reads one request, records
//! it, and writes back whatever the test queued. Driving a real socket is the
//! point: v1's suite stubbed the transport outright, so it never exercised URL
//! construction, and a wrongly built path would have passed its tests and failed
//! against the real API.

#![allow(dead_code, reason = "each namespace's tests use a different subset")]

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;

/// What the server does for one connection.
pub(crate) enum Reply {
    /// Write these bytes verbatim, then close.
    Raw(String),
    /// Read the request and then never answer, so the caller's timeout fires.
    Hang,
}

impl Reply {
    /// A response with `status`, `body`, and any extra headers.
    pub(crate) fn new(status: u16, headers: &[(&str, &str)], body: &str) -> Self {
        let extra: String = headers
            .iter()
            .map(|(name, value)| format!("{name}: {value}\r\n"))
            .collect();
        Self::Raw(format!(
            "HTTP/1.1 {status} STATUS\r\nContent-Length: {}\r\n{extra}\r\n{body}",
            body.len()
        ))
    }

    /// A 200 carrying `body`.
    pub(crate) fn ok(body: &str) -> Self {
        Self::new(200, &[], body)
    }

    /// A failure response carrying `body`.
    pub(crate) fn failing(status: u16, body: &str) -> Self {
        Self::new(status, &[], body)
    }
}

/// A server bound to an ephemeral loopback port for the lifetime of a test.
pub(crate) struct TestServer {
    address: SocketAddr,
    requests: Arc<Mutex<Vec<String>>>,
}

impl TestServer {
    /// Start a server answering each connection with the next queued reply.
    ///
    /// Connections past the end of the queue get an empty 200, so a test that
    /// under-queues fails on an assertion rather than hanging.
    pub(crate) async fn start(replies: Vec<Reply>) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("binding an ephemeral loopback port");
        let address = listener
            .local_addr()
            .expect("the bound address is readable");
        let requests = Arc::new(Mutex::new(Vec::new()));

        let recorder = Arc::clone(&requests);
        // R16: `tauri::async_runtime::spawn` rather than a bare `tokio::spawn`,
        // the same rule the commands follow. It resolves whichever runtime is
        // current, so it works under `#[tokio::test]` too.
        tauri::async_runtime::spawn(async move {
            let mut queue = replies.into_iter();
            while let Ok((mut stream, _)) = listener.accept().await {
                let request = read_request(&mut stream).await;
                recorder
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .push(request);

                match queue.next().unwrap_or_else(|| Reply::ok("")) {
                    Reply::Raw(bytes) => {
                        let _ = stream.write_all(bytes.as_bytes()).await;
                        let _ = stream.flush().await;
                    }
                    // Hold the connection open without answering, for longer
                    // than any timeout a test sets.
                    Reply::Hang => tokio::time::sleep(Duration::from_secs(3_600)).await,
                }
            }
        });

        Self { address, requests }
    }

    /// The URL of `path` on this server.
    pub(crate) fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.address)
    }

    /// Every request received so far, head and body, as sent.
    pub(crate) fn requests(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// How many requests have been received.
    pub(crate) fn received(&self) -> usize {
        self.requests().len()
    }
}

/// The request line, e.g. `POST /api/share HTTP/1.1`.
pub(crate) fn request_line(request: &str) -> &str {
    request.lines().next().unwrap_or_default()
}

/// Everything after the blank line.
pub(crate) fn request_body(request: &str) -> &str {
    request
        .split_once("\r\n\r\n")
        .map_or("", |(_head, body)| body)
}

/// Read one request: the head, plus a body when `Content-Length` says there is
/// one. Reading exactly as much as was announced is what keeps a body assertion
/// from racing a second TCP segment.
async fn read_request(stream: &mut tokio::net::TcpStream) -> String {
    let mut raw = Vec::new();
    let mut scratch = [0_u8; 1024];

    while !raw.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut scratch).await {
            Ok(0) | Err(_) => return String::from_utf8_lossy(&raw).into_owned(),
            Ok(read) => raw.extend_from_slice(&scratch[..read]),
        }
    }

    let text = String::from_utf8_lossy(&raw).into_owned();
    let announced = text
        .lines()
        .find_map(|line| {
            line.strip_prefix("content-length: ")
                .or_else(|| line.strip_prefix("Content-Length: "))
        })
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let head_len = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map_or(raw.len(), |at| at + 4);

    while raw.len() < head_len + announced {
        match stream.read(&mut scratch).await {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&scratch[..read]),
        }
    }

    String::from_utf8_lossy(&raw).into_owned()
}
