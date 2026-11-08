//! The accept loop: hyper driven directly rather than through `axum::serve`.
//!
//! `axum::serve` has no knob for how long a client may take to send its
//! request, so one slow client per socket could hold connections open forever
//! (slowloris). Driving hyper's HTTP/1 builder directly gives:
//!
//! - a [`HEADER_READ_TIMEOUT`] for every request head. hyper starts that
//!   clock whenever it waits for the next head, so it also closes an idle
//!   keep-alive connection;
//! - a [`BODY_READ_TIMEOUT`] for the body, which is read in full (it is at
//!   most a few KiB) *before* the request takes an in-flight slot, so a
//!   client trickling its body never holds one;
//! - [`MAX_CONNECTIONS`] per socket and [`MAX_CONNECTIONS_PER_ADDRESS`] per
//!   client address, past which a connection is dropped as soon as it is
//!   accepted;
//! - [`MAX_IN_FLIGHT`] requests being handled at once.
//!
//! Everything else (routing, extractors, `ConnectInfo`) stays axum's.

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{StatusCode, header};
use axum::response::Response;
use hyper::body::Incoming;
use hyper_util::rt::{TokioIo, TokioTimer};
use shiranami_core::sync::lock_or_recover;
use tokio::net::TcpListener;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use tower::ServiceExt as _;
use tower::limit::ConcurrencyLimit;

use crate::routes::MAX_BODY_BYTES;

/// How long a client has to send a complete request head, and how long an
/// idle keep-alive connection stays open.
pub const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// How long a client has to send the rest of its request body once the head
/// is in.
pub const BODY_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// Open connections per listening socket, at most. A phone uses a handful.
pub const MAX_CONNECTIONS: usize = 64;

/// Open connections from one client address per listening socket, at most,
/// so a single host cannot take every [`MAX_CONNECTIONS`] slot.
pub const MAX_CONNECTIONS_PER_ADDRESS: usize = 8;

/// Requests being handled at once across every socket (until their response
/// head is ready; a streaming audio body does not hold a slot). Requests over
/// it wait rather than fail. A request takes a slot only once its body is in.
pub const MAX_IN_FLIGHT: usize = 16;

/// The router behind the shared in-flight limit.
pub(crate) fn limited(router: Router) -> ConcurrencyLimit<Router> {
    ConcurrencyLimit::new(router, MAX_IN_FLIGHT)
}

/// Connections open per client address on one socket.
#[derive(Default)]
struct PerAddress(Mutex<HashMap<IpAddr, usize>>);

/// One counted connection; dropping it gives the slot back.
struct AddressSlot {
    counts: Arc<PerAddress>,
    ip: IpAddr,
}

impl PerAddress {
    fn try_take(self: &Arc<Self>, ip: IpAddr) -> Option<AddressSlot> {
        let mut counts = lock_or_recover(&self.0);
        let count = counts.entry(ip).or_insert(0);
        if *count >= MAX_CONNECTIONS_PER_ADDRESS {
            return None;
        }
        *count += 1;
        Some(AddressSlot {
            counts: Arc::clone(self),
            ip,
        })
    }
}

impl Drop for AddressSlot {
    fn drop(&mut self) {
        let mut counts = lock_or_recover(&self.counts.0);
        if let Some(count) = counts.get_mut(&self.ip) {
            *count -= 1;
            if *count == 0 {
                counts.remove(&self.ip);
            }
        }
    }
}

/// Accept on `listener` until `stop`, serving each connection with `router`.
pub(crate) async fn serve(
    listener: TcpListener,
    router: ConcurrencyLimit<Router>,
    stop: CancellationToken,
) {
    let slots = Arc::new(Semaphore::new(MAX_CONNECTIONS));
    let per_address = Arc::new(PerAddress::default());
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
        let Some(address_slot) = per_address.try_take(remote.ip()) else {
            tracing::debug!("sync: per-address connection cap reached, dropping a connection");
            drop(stream);
            continue;
        };
        let Ok(slot) = Arc::clone(&slots).try_acquire_owned() else {
            tracing::debug!("sync: connection cap reached, dropping a connection");
            drop(stream);
            continue;
        };
        let router = router.clone();
        let stop = stop.clone();
        tokio::spawn(async move {
            let _slots = (slot, address_slot);
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
    let service = hyper::service::service_fn(move |request: hyper::Request<Incoming>| {
        handle(request, remote, router.clone())
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

/// Read the whole body under [`BODY_READ_TIMEOUT`], then hand the request to
/// the router, whose in-flight limit is only waited on from that point.
async fn handle(
    request: hyper::Request<Incoming>,
    remote: SocketAddr,
    router: ConcurrencyLimit<Router>,
) -> Result<Response, Infallible> {
    let (mut parts, body) = request.into_parts();
    parts.extensions.insert(ConnectInfo(remote));
    let declared = parts
        .headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    if declared.is_some_and(|length| length > MAX_BODY_BYTES as u64) {
        // Refused unread, before the client has sent any of it.
        return Ok(status(StatusCode::PAYLOAD_TOO_LARGE));
    }
    let read = axum::body::to_bytes(Body::new(body), MAX_BODY_BYTES);
    let bytes = match tokio::time::timeout(BODY_READ_TIMEOUT, read).await {
        Ok(Ok(bytes)) => bytes,
        // A chunked body past the cap, or a client gone mid-body.
        Ok(Err(_)) => return Ok(status(StatusCode::PAYLOAD_TOO_LARGE)),
        Err(_) => return Ok(status(StatusCode::REQUEST_TIMEOUT)),
    };
    router
        .oneshot(hyper::Request::from_parts(parts, Body::from(bytes)))
        .await
}

fn status(code: StatusCode) -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = code;
    response
}
