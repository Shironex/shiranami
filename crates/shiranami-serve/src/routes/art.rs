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

use axum::body::Body;
use axum::extract::{Path as UrlPath, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use shiranami_core::paths::is_path_within;
use tokio_util::io::ReaderStream;

use crate::art_cache::DEFAULT_MAX_BYTES;
use crate::error::ServeError;
use crate::media_types::{extension_of, image_mime, is_image_path};
use crate::routes::audio::CHUNK_SIZE;
use crate::state::ServeState;

/// A year, and a promise never to revalidate. Sound only because the name is a
/// hash of the contents.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// Serve one cached album-art file.
pub async fn handle(
    State(state): State<ServeState>,
    UrlPath((token, name)): UrlPath<(String, String)>,
) -> Result<Response, ServeError> {
    if !state.token_matches(&token) {
        return Err(ServeError::NotFound);
    }

    let name = safe_name(&name)?;
    let path = state.art_dir().join(&name);

    // The joined path must still be under the art directory. It always is, given
    // the name check above — which is the point: this assertion is what makes
    // the name check's failure a refusal rather than an escape.
    if !is_path_within(&path, state.art_dir()) {
        tracing::warn!("art route refused a name that escaped the art directory");
        return Err(ServeError::Forbidden);
    }

    if let Some(cached) = state.art_cache().get(&name) {
        return Ok(image_response(
            &name,
            cached.len() as u64,
            Body::from(cached),
        ));
    }

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| ServeError::NotFound)?;
    let metadata = file.metadata().await.map_err(|_| ServeError::NotFound)?;
    if !metadata.is_file() {
        return Err(ServeError::NotAFile);
    }
    let size = metadata.len();

    // Anything past the cache budget is streamed and never held: reading it to
    // populate a cache that would immediately refuse it is the worst of both.
    if size > DEFAULT_MAX_BYTES as u64 {
        let body = Body::from_stream(ReaderStream::with_capacity(file, CHUNK_SIZE));
        return Ok(image_response(&name, size, body));
    }

    let bytes = Bytes::from(
        tokio::fs::read(&path)
            .await
            .map_err(|_| ServeError::NotFound)?,
    );
    state.art_cache().insert(name.clone(), bytes.clone());

    Ok(image_response(&name, bytes.len() as u64, Body::from(bytes)))
}

/// The requested file name, if it is a file name and not a path.
///
/// Rejects rather than sanitises. `path.basename('../../etc/passwd')` returns
/// `passwd`, which is a *different file that exists* — sanitising turns an
/// attack into a wrong answer, and a wrong answer is harder to notice than a
/// 403.
fn safe_name(name: &str) -> Result<String, ServeError> {
    let refuse = |reason: &str| {
        tracing::warn!(reason, "art route refused a name");
        ServeError::Forbidden
    };

    if name.is_empty() {
        return Err(ServeError::BadRequest("missing art name"));
    }
    // Both separators, on every platform: a Windows-style name reaching a Unix
    // build must not be treated as an innocent file name with backslashes in it.
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(refuse("separator in name"));
    }
    if name == "." || name == ".." {
        return Err(refuse("relative name"));
    }
    if !is_image_path(std::path::Path::new(name)) {
        return Err(refuse("non-image extension"));
    }

    Ok(name.to_owned())
}

fn image_response(name: &str, length: u64, body: Body) -> Response {
    let content_type = extension_of(std::path::Path::new(name))
        .map_or(crate::media_types::DEFAULT_IMAGE_MIME, |extension| {
            image_mime(&extension)
        });

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_owned()),
            (header::CONTENT_LENGTH, length.to_string()),
            (header::CACHE_CONTROL, IMMUTABLE.to_owned()),
        ],
        body,
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn refused(name: &str) -> ServeError {
        safe_name(name).expect_err("the name must be refused")
    }

    #[test]
    fn a_content_addressed_name_is_accepted() {
        assert_eq!(
            safe_name("6f1ed002ab5595859014ebf0951522d9.jpg").expect("a hash name is fine"),
            "6f1ed002ab5595859014ebf0951522d9.jpg"
        );
    }

    /// Every traversal shape is refused, not rewritten.
    #[test]
    fn traversal_is_refused_rather_than_stripped() {
        for name in [
            "../secrets.jpg",
            "../../etc/passwd.jpg",
            "..\\..\\windows\\system32\\config.jpg",
            "subdir/cover.jpg",
            "/etc/passwd.jpg",
            "..",
            ".",
        ] {
            assert!(
                matches!(refused(name), ServeError::Forbidden),
                "`{name}` must be refused"
            );
        }
    }

    /// The art directory holds images. A name that is not one is refused before
    /// anything opens it, which is what stops the route serving the settings
    /// file if one ever lands beside the covers.
    #[test]
    fn a_non_image_extension_is_refused() {
        for name in ["config.json", "library.db", "cover", "cover.txt"] {
            assert!(matches!(refused(name), ServeError::Forbidden));
        }
    }

    #[test]
    fn an_empty_name_is_a_bad_request() {
        assert!(matches!(refused(""), ServeError::BadRequest(_)));
    }

    #[test]
    fn a_null_byte_is_refused() {
        assert!(matches!(refused("cover\0.jpg"), ServeError::Forbidden));
    }

    #[test]
    fn the_cache_header_is_the_immutable_one() {
        assert!(IMMUTABLE.contains("immutable"));
        assert!(IMMUTABLE.contains("max-age=31536000"));
    }
}
