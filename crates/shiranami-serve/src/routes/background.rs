//! `GET /{token}/background/{name}` — the user's imported app background.
//!
//! A v2-born route with no v1 protocol behind it. It exists because the webview
//! has no filesystem reach at all: there is no `fs` plugin, the asset protocol
//! is not enabled, and `convertFileSrc` is used nowhere. A wallpaper the user
//! picked therefore reaches `background-image` the same way album art reaches
//! `<img>` — over this loopback server, behind the session token. That also
//! means the CSP needs nothing new: `img-src` already carries `http:`, which
//! covers `http://127.0.0.1:*`.
//!
//! Two deliberate differences from [`crate::routes::art`], which it otherwise
//! mirrors:
//!
//! - **No cache.** There is exactly one background and the browser holds it
//!   behind an immutable header from the first request. An LRU entry here would
//!   be a second copy of a file with a hit rate of one.
//! - **Always streamed.** A wallpaper is allowed to be twenty megabytes, where a
//!   cover is a few hundred kilobytes. Reading it whole to hand it over once
//!   buys nothing and costs its own size in resident memory.
//!
//! The name guard is [`crate::routes::image_file::safe_name`], shared with the
//! art route, and the containment re-check below is the same second opinion the
//! art route keeps for the same reason.

use axum::body::Body;
use axum::extract::{Path as UrlPath, State};
use axum::response::Response;
use shiranami_core::paths::is_path_within;
use tokio_util::io::ReaderStream;

use crate::error::ServeError;
use crate::routes::audio::CHUNK_SIZE;
use crate::routes::image_file::{image_response, open_regular_file, safe_name};
use crate::state::ServeState;

/// Serve the imported background, or its frozen still.
///
/// Both are ordinary files in the same directory, so one route covers them:
/// which of the two the renderer asks for is a rendering decision, and this
/// layer has no opinion about reduced motion.
pub async fn handle(
    State(state): State<ServeState>,
    UrlPath((token, name)): UrlPath<(String, String)>,
) -> Result<Response, ServeError> {
    if !state.token_matches(&token) {
        return Err(ServeError::NotFound);
    }

    let name = safe_name("background", &name)?;
    let path = state.background_dir().join(&name);

    // Always true given the name check above — which is the point: this
    // assertion is what makes that check's failure a refusal rather than an
    // escape.
    if !is_path_within(&path, state.background_dir()) {
        tracing::warn!("background route refused a name that escaped the background directory");
        return Err(ServeError::Forbidden);
    }

    let (file, size) = open_regular_file("background", &path).await?;

    tracing::debug!(size, "background route serving");

    let body = Body::from_stream(ReaderStream::with_capacity(file, CHUNK_SIZE));
    Ok(image_response(&name, size, body))
}
