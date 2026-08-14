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

use axum::Router;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::error::ServeError;
use crate::routes::{art, audio, background, radio};
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
#[derive(Debug)]
pub struct ServeHandle {
    address: SocketAddr,
    token: SessionToken,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
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
    /// Called from `ExitRequested`. Idempotent by construction — the sender is
    /// taken, so a second call has nothing to send and simply awaits the task.
    pub async fn shutdown(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let _ = (&mut self.task).await;
    }
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
        shutdown: Some(sender),
        task,
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
        .route("/{token}/background/{name}", get(background::handle))
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
