//! A loopback HTTP server the binary-manager tests download from.
//!
//! Every host these managers fetch from redirects — GitHub to
//! `objects.githubusercontent.com`, both ffmpeg hosts to a CDN — so the
//! redirect loop is not an edge case to stub around, it is the normal path.
//! A stubbed client would exercise none of it.
//!
//! Deliberately not a real HTTP implementation: it reads one request, replies
//! with whatever the test queued, and closes.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// What the server does for one connection.
pub(crate) enum Reply {
    /// A 200 carrying these bytes, with a `Content-Length`.
    Body(Vec<u8>),
    /// A 200 carrying these bytes and **no** `Content-Length`, so the caller
    /// cannot compute progress.
    BodyWithoutLength(Vec<u8>),
    /// A redirect to `location`.
    Redirect {
        /// The status to send, 301/302/307/308.
        status: u16,
        /// The `Location` header value; may be relative.
        location: String,
    },
    /// A failure status with an empty body.
    Failing(u16),
}

impl Reply {
    fn render(&self) -> Vec<u8> {
        match self {
            Self::Body(body) => {
                let mut raw = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .into_bytes();
                raw.extend_from_slice(body);
                raw
            }
            Self::BodyWithoutLength(body) => {
                // No length and no chunked framing: the body ends when the
                // connection does, which is legal HTTP/1.1 for a response.
                let mut raw = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
                raw.extend_from_slice(body);
                raw
            }
            Self::Redirect { status, location } => format!(
                "HTTP/1.1 {status} MOVED\r\nLocation: {location}\r\nContent-Length: 0\r\n\
                 Connection: close\r\n\r\n"
            )
            .into_bytes(),
            Self::Failing(status) => {
                format!("HTTP/1.1 {status} NOPE\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .into_bytes()
            }
        }
    }
}

/// A server bound to an ephemeral loopback port for the lifetime of a test.
pub(crate) struct TestServer {
    address: SocketAddr,
    paths: Arc<Mutex<Vec<String>>>,
}

impl TestServer {
    /// Start a server answering each connection with the next queued reply.
    ///
    /// Connections past the end of the queue get a 500, so a test that
    /// under-queues fails on an assertion rather than hanging.
    pub(crate) async fn start(replies: Vec<Reply>) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("binding an ephemeral loopback port");
        let address = listener
            .local_addr()
            .expect("the bound address is readable");
        let paths = Arc::new(Mutex::new(Vec::new()));

        let recorder = Arc::clone(&paths);
        tokio::spawn(async move {
            let mut queue = replies.into_iter();
            while let Ok((mut stream, _)) = listener.accept().await {
                let request = read_head(&mut stream).await;
                if let Some(path) = request_path(&request) {
                    recorder
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .push(path);
                }

                let reply = queue.next().unwrap_or(Reply::Failing(500));
                let _ = stream.write_all(&reply.render()).await;
                let _ = stream.flush().await;
                let _ = stream.shutdown().await;
            }
        });

        Self { address, paths }
    }

    /// The URL of `path` on this server.
    pub(crate) fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.address)
    }

    /// Every request path received so far, in order.
    pub(crate) fn paths(&self) -> Vec<String> {
        self.paths
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

/// Read the request head, up to the blank line.
async fn read_head(stream: &mut tokio::net::TcpStream) -> String {
    let mut raw = Vec::new();
    let mut scratch = [0_u8; 1024];

    while !raw.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut scratch).await {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&scratch[..read]),
        }
    }

    String::from_utf8_lossy(&raw).into_owned()
}

/// The path out of a request line like `GET /asset HTTP/1.1`.
fn request_path(request: &str) -> Option<String> {
    request
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)
        .map(str::to_owned)
}
