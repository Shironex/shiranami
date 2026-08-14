//! `GET /{token}/art/{name}` — v1's `shiranami-art://art/{hash}.jpg`.
//!
//! Album art is content-addressed: the name is a truncated SHA-256 of the
//! resized bytes plus `.jpg`, so the same cover is one file however many tracks
//! reference it, and the URL for a given cover never changes. That is what makes
//! `Cache-Control: immutable` correct here and wrong on the audio route — the
//! bytes behind this name genuinely cannot change.
//!
//! Containment is a name check rather than [`shiranami_core::paths::FoldersCache`]:
//! there is exactly one directory in play, so the question is not "is this path
//! inside an allowed root" but "is this a bare file name at all". v1 used
//! `path.basename`; this refuses the traversal outright instead of silently
//! rewriting it, and then re-checks the joined path for containment anyway,
//! because a guard that depends on one function being right is a guard with one
//! point of failure.
//!
//! That name check now lives in [`crate::routes::image_file`], shared with the
//! background route. The containment re-check below deliberately did not move
//! with it: its value is being a *second* opinion, which it stops being the
//! moment it sits in the same function as the first.

use axum::body::Body;
use axum::extract::{Path as UrlPath, State};
use axum::response::Response;
use bytes::Bytes;
use shiranami_core::paths::is_path_within;
use tokio::io::AsyncReadExt as _;
use tokio_util::io::ReaderStream;

use crate::art_cache::DEFAULT_MAX_BYTES;
use crate::error::ServeError;
use crate::routes::audio::CHUNK_SIZE;
use crate::routes::image_file::{image_response, open_regular_file, safe_name};
use crate::state::ServeState;

/// Serve one cached album-art file.
pub async fn handle(
    State(state): State<ServeState>,
    UrlPath((token, name)): UrlPath<(String, String)>,
) -> Result<Response, ServeError> {
    if !state.token_matches(&token) {
        return Err(ServeError::NotFound);
    }

    let name = safe_name("art", &name)?;
    let path = state.art_dir().join(&name);

    // The joined path must still be under the art directory. It always is, given
    // the name check above — which is the point: this assertion is what makes
    // the name check's failure a refusal rather than an escape.
    if !is_path_within(&path, state.art_dir()) {
        tracing::warn!("art route refused a name that escaped the art directory");
        return Err(ServeError::Forbidden);
    }

    if let Some(cached) = state.art_cache().get(&name) {
        tracing::debug!(size = cached.len(), hit = true, "art route serving");
        return Ok(image_response(
            &name,
            cached.len() as u64,
            Body::from(cached),
        ));
    }

    let (mut file, size) = open_regular_file("art", &path).await?;

    // Anything past the cache budget is streamed and never held: reading it to
    // populate a cache that would immediately refuse it is the worst of both.
    if size > DEFAULT_MAX_BYTES as u64 {
        tracing::debug!(size, hit = false, streamed = true, "art route serving");
        let body = Body::from_stream(ReaderStream::with_capacity(file, CHUNK_SIZE));
        return Ok(image_response(&name, size, body));
    }

    tracing::debug!(size, hit = false, streamed = false, "art route serving");

    // Read the handle we already hold rather than opening the path a second
    // time. The stat this route now does ahead of the open is what makes a
    // directory refuse identically on every platform, and it is worth one
    // syscall — but only if the open it guards is then actually used.
    //
    // `size` is a capacity hint, not a promise: `read_to_end` reads whatever is
    // there, and the length that reaches the wire is taken from the bytes below,
    // so a file that changed under us cannot produce a Content-Length that
    // disagrees with the body.
    let mut buffer = Vec::with_capacity(size as usize);
    file.read_to_end(&mut buffer)
        .await
        .map_err(|_| ServeError::NotFound)?;

    let bytes = Bytes::from(buffer);
    state.art_cache().insert(name.clone(), bytes.clone());

    Ok(image_response(&name, bytes.len() as u64, Body::from(bytes)))
}
