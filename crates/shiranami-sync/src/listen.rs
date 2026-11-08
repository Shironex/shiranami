//! The accept loop: hyper driven directly rather than through `axum::serve`.
//!
//! `axum::serve` has no knob for how long a client may take to send its
//! request head, so one slow client per socket could hold connections open
//! forever (slowloris). Driving hyper's HTTP/1 builder directly gives a
//! [`HEADER_READ_TIMEOUT`], and the loop refuses connections past
//! [`MAX_CONNECTIONS`] instead of accepting without bound; [`MAX_IN_FLIGHT`]
//! bounds the requests being handled at once. Everything else
//! (routing, extractors, `ConnectInfo`) stays axum's.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::ConnectInfo;
use hyper::body::Incoming;
use hyper_util::rt::{TokioIo, TokioTimer};
use tokio::net::TcpListener;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use tower::ServiceExt as _;
use tower::limit::ConcurrencyLimit;

/// How long a client has to send a complete request head.
pub const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// Open connections per listening socket, at most. A phone uses a handful.
pub const MAX_CONNECTIONS: usize = 64;

/// Requests being handled at once across every socket (until their response
/// head is ready; a streaming audio body does not hold a slot). Requests over
/// it wait rather than fail.
pub const MAX_IN_FLIGHT: usize = 16;

/// The router behind the shared in-flight limit.
pub(crate) fn limited(router: Router) -> ConcurrencyLimit<Router> {
    ConcurrencyLimit::new(router, MAX_IN_FLIGHT)
}

/// Accept on `listener` until `stop`, serving each connection with `router`.
pub(crate) async fn serve(
    listener: TcpListener,
    router: ConcurrencyLimit<Router>,
    stop: CancellationToken,
) {
    let slots = Arc::new(Semaphore::new(MAX_CONNECTIONS));
    loop {
        let accepted = tokio::select! {
            () = stop.cancelled() => break,
            accepted = listener.accept() => accepted,
        };
        let (stream, remote) = match accepted {
            Ok(pair) => pair,
            Err(error) => {
                // EMFILE and friends: back off instead of spinning.
                tracing::debug!(%error, "sync: accept failed");
                tokio::time::sleep(Duration::from_millis(50)).await;
                continue;
            }
        };
        let Ok(slot) = Arc::clone(&slots).try_acquire_owned() else {
            tracing::debug!("sync: connection cap reached, dropping a connection");
            drop(stream);
            continue;
        };
        let router = router.clone();
        let stop = stop.clone();
        tokio::spawn(async move {
            let _slot = slot;
            connection(stream, remote, router, stop).await;
        });
    }
}

async fn connection(
    stream: tokio::net::TcpStream,
    remote: SocketAddr,
    router: ConcurrencyLimit<Router>,
    stop: CancellationToken,
) {
    let service = hyper::service::service_fn(move |mut request: hyper::Request<Incoming>| {
        request.extensions_mut().insert(ConnectInfo(remote));
        router.clone().oneshot(request)
    });
    let mut builder = hyper::server::conn::http1::Builder::new();
    builder
        .timer(TokioTimer::new())
        .header_read_timeout(HEADER_READ_TIMEOUT);
    let conn = builder.serve_connection(TokioIo::new(stream), service);
    tokio::pin!(conn);
    tokio::select! {
        result = conn.as_mut() => {
            if let Err(error) = result {
                tracing::debug!(%error, "sync: a connection ended with an error");
            }
        }
        () = stop.cancelled() => {
            conn.as_mut().graceful_shutdown();
            let _ = conn.await;
        }
    }
}
