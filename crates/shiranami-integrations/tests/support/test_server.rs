//! A loopback HTTP server that replays canned responses.
//!
//! v1's suite stubbed `electron.net.request` outright, so the code under test
//! never produced or parsed a byte of HTTP. Driving a real socket instead costs
//! about a hundred lines and covers what a stub cannot: bodies arriving in
//! pieces, a connection that answers a status line and then goes quiet, and the
//! actual parsing.
//!
//! Deliberately not a real HTTP implementation. It reads one request, records
//! it, and writes back whatever the test queued.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// What the server does for one connection.
///
/// `shiranami-net`'s original also carries a `Hang` variant for driving a
/// caller's timeout. It is dropped here: the deadlines these services run under
/// are 8 s (weather) and 30 s (everything else), which is far too long to spend
/// in a unit suite, and `shiranami-net` already proves the timeout path.
pub(crate) enum Reply {
    /// Write these bytes verbatim, then close.
    Raw(String),
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
        tokio::spawn(async move {
            let mut queue = replies.into_iter();
            while let Ok((mut stream, _)) = listener.accept().await {
                let request = read_request(&mut stream).await;
                recorder
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .push(request);

                let Reply::Raw(bytes) = queue.next().unwrap_or_else(|| Reply::ok(""));
                let _ = stream.write_all(bytes.as_bytes()).await;
                let _ = stream.flush().await;
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
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    /// How many requests have been received.
    pub(crate) fn received(&self) -> usize {
        self.requests().len()
    }
}

/// Read one request: the head, plus a body when `Content-Length` says there is
/// one. Reading exactly as much as was announced is what keeps the POST body
/// assertion from racing a second TCP segment.
async fn read_request(stream: &mut tokio::net::TcpStream) -> String {
    let mut raw = Vec::new();
    let mut scratch = [0_u8; 1024];

    // The head, up to the blank line.
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
                .or(line.strip_prefix("Content-Length: "))
        })
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let head_len = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map_or(raw.len(), |at| at + 4);

    // Then whatever body has not arrived yet.
    while raw.len() < head_len + announced {
        match stream.read(&mut scratch).await {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&scratch[..read]),
        }
    }

    String::from_utf8_lossy(&raw).into_owned()
}
