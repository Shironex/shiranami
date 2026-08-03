//! Binding, the router, and the handle the shell holds.
//!
//! `127.0.0.1` and port 0, never a fixed port and never `0.0.0.0`. The bind
//! address is the first half of the containment story — a server on `0.0.0.0`
//! is a file server for the coffee shop — and the ephemeral port is the second:
//! a fixed port would let a page that has learned one session's token keep
//! guessing at the next, and would collide with a second copy of the app.
//!
//! The port is not a secret. `lsof` finds it in a second, and any local process
//! can scan the loopback range. The token in the path is the credential; see
//! [`crate::token`].

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Mutex;

use axum::Router;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::error::ServeError;
use crate::routes::{art, audio, radio};
use crate::state::{ServeConfig, ServeState};
use crate::token::SessionToken;

/// Why the server could not be started.
#[derive(Debug, thiserror::Error)]
pub enum StartError {
    /// The loopback interface could not be bound.
    #[error("could not bind the loopback stream server: {source}")]
    Bind {
        /// The underlying failure.
        #[from]
        source: std::io::Error,
    },
}

/// A running server: where it is, how to address it, and how to stop it.
///
/// # Why the two stop-halves sit behind mutexes
///
/// [`Self::shutdown`] takes `&self`, and it has to: the shell keeps this handle
/// in an `Arc` so a command can read the origin and the token, which means the
/// only reference available at exit is a shared one. An owned `shutdown(self)`
/// forced the caller to unwrap that `Arc` first, and unwrapping an `Arc` the
/// app's own state still holds can never succeed — so the graceful path was
/// unreachable in the shipped binary, and said so in the log every time. The
/// mutexes buy `&self` for the two fields that must be consumed exactly once;
/// nothing else about the handle needs them.
#[derive(Debug)]
pub struct ServeHandle {
    address: SocketAddr,
    token: SessionToken,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl ServeHandle {
    /// The address the server bound, port included.
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    /// The port the OS assigned.
    pub fn port(&self) -> u16 {
        self.address.port()
    }

    /// The scheme and authority, without the token: `http://127.0.0.1:<port>`.
    ///
    /// Handed to the webview beside the token rather than pre-joined, so the
    /// renderer holds the credential as its own value and can keep it out of
    /// everything that is not a URL. [`Self::base_url`] is the join of the two,
    /// and a test pins them together so the shapes cannot drift apart.
    pub fn origin(&self) -> String {
        format!("http://{}", self.address)
    }

    /// The prefix every URL the webview builds starts with, token included.
    ///
    /// The one string the renderer needs: `${base}/audio?path=…` replaces
    /// `shiranami-audio://play?path=…`, and the two other routes hang off it the
    /// same way.
    pub fn base_url(&self) -> String {
        format!("{}/{}", self.origin(), self.token.as_str())
    }

    /// This session's token, for the command that hands it to the webview.
    pub fn token(&self) -> &SessionToken {
        &self.token
    }

    /// Stop accepting, let in-flight responses finish, and wait for the task.
    ///
    /// Called from `ExitRequested`, through a shared reference — see the type's
    /// own docs for why that is not negotiable. Idempotent by construction: both
    /// halves are *taken*, so a second call finds nothing to send and no task to
    /// await and returns immediately.
    pub async fn shutdown(&self) {
        // Both guards are released before the await below. Holding a
        // `std::sync::MutexGuard` across an await point would make this future
        // `!Send`, and `block_on` from the exit handler needs it to be `Send`.
        if let Some(shutdown) = take(&self.shutdown) {
            let _ = shutdown.send(());
        }
        if let Some(task) = take(&self.task) {
            let _ = task.await;
        }
    }
}

/// Take the contents of a mutex, recovering from a poisoned one.
///
/// A panic elsewhere that poisoned either lock is not a reason to skip the
/// shutdown it was holding — the value behind it is still exactly what needs
/// consuming, and refusing to read it would leak the listener the process is
/// about to drop anyway.
fn take<T>(slot: &Mutex<Option<T>>) -> Option<T> {
    slot.lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
}

/// Bind the loopback server and start serving.
///
/// Mints the session token itself: a caller cannot pass one in, so a caller
/// cannot pass a predictable one.
///
/// # Errors
///
/// [`StartError::Bind`] when the loopback interface cannot be bound.
pub async fn start(config: ServeConfig) -> Result<ServeHandle, StartError> {
    let token = SessionToken::generate();
    let state = ServeState::new(config, token.clone());

    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let address = listener.local_addr()?;

    let (sender, receiver) = oneshot::channel();
    let app = router(state);

    let task = tokio::spawn(async move {
        let served = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = receiver.await;
            })
            .await;
        if let Err(error) = served {
            tracing::error!(%error, "the loopback stream server stopped");
        }
    });

    tracing::debug!(port = address.port(), "loopback stream server listening");

    Ok(ServeHandle {
        address,
        token,
        shutdown: Mutex::new(Some(sender)),
        task: Mutex::new(Some(task)),
    })
}

/// The routes, with the CORS layer wrapped around all of them.
///
/// The layer is applied to the `Router` rather than to each route so it also
/// covers the fallback and the method-not-allowed responses axum produces
/// itself. Those are exactly the responses a per-handler header set forgets, and
/// a 405 without `Access-Control-Allow-Origin` reaches the renderer as an opaque
/// CORS failure rather than as the 405 it is.
pub fn router(state: ServeState) -> Router {
    Router::new()
        .route("/{token}/audio", get(audio::handle))
        .route("/{token}/art/{name}", get(art::handle))
        .route("/{token}/radio", get(radio::handle))
        .fallback(unknown)
        .layer(axum::middleware::from_fn(crate::cors::apply))
        .with_state(state)
}

/// Anything else. 404 with no hint, like a wrong token: a process probing the
/// port learns neither which routes exist nor whether it guessed the token.
async fn unknown() -> ServeError {
    ServeError::NotFound
}
