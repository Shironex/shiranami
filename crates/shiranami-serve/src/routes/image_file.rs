//! The name guard and response shape shared by every route that serves one
//! image out of one app-owned directory.
//!
//! Two routes fit that description — [`crate::routes::art`] and
//! [`crate::routes::background`] — and they ask the same question: *is this a
//! bare image file name, and if so what does a response carrying it look like*.
//! The guard lives here once rather than once per route on purpose. Two copies
//! of a path-traversal check are two things to keep right, and the second copy
//! is the one that gets a fix late or not at all.
//!
//! What is deliberately **not** shared is containment: each route re-checks the
//! joined path against its own directory. That check is cheap, and its whole
//! value is being a second opinion about [`safe_name`] — folding it in here
//! would collapse the two guards into one and take the redundancy with it.

use axum::body::Body;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::error::ServeError;
use crate::media_types::{extension_of, image_mime};

/// A year, and a promise never to revalidate.
///
/// Sound only because both callers name files by a hash of their contents: the
/// bytes behind a given name genuinely cannot change. It is wrong on the audio
/// route for exactly that reason, and would be wrong here the moment a caller
/// started reusing a name.
pub(crate) const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// The requested file name, if it is a file name and not a path.
///
/// Rejects rather than sanitises. `path.basename('../../etc/passwd')` returns
/// `passwd`, which is a *different file that exists* — sanitising turns an
/// attack into a wrong answer, and a wrong answer is harder to notice than a
/// 403.
pub(crate) fn safe_name(route: &'static str, name: &str) -> Result<String, ServeError> {
    let refuse = |reason: &str| {
        tracing::warn!(route, reason, "refused a name");
        ServeError::Forbidden
    };

    if name.is_empty() {
        return Err(ServeError::BadRequest("missing file name"));
    }
    // Both separators, on every platform: a Windows-style name reaching a Unix
    // build must not be treated as an innocent file name with backslashes in it.
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(refuse("separator in name"));
    }
    if name == "." || name == ".." {
        return Err(refuse("relative name"));
    }
    if !crate::media_types::is_image_path(std::path::Path::new(name)) {
        return Err(refuse("non-image extension"));
    }

    Ok(name.to_owned())
}

/// An image response with the immutable cache header.
pub(crate) fn image_response(name: &str, length: u64, body: Body) -> Response {
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
        safe_name("test", name).expect_err("the name must be refused")
    }

    #[test]
    fn a_content_addressed_name_is_accepted() {
        assert_eq!(
            safe_name("test", "6f1ed002ab5595859014ebf0951522d9.jpg").expect("a hash name is fine"),
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

    /// The directories behind both callers hold images. A name that is not one
    /// is refused before anything opens it, which is what stops a route serving
    /// the settings file if one ever lands beside the covers.
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

    /// The background route stores `.gif` and `.webp`, so the shared guard has
    /// to accept them — a name check that only knew about album art would refuse
    /// every animated wallpaper.
    #[test]
    fn every_format_the_background_importer_stores_is_accepted() {
        for name in ["bg-abc.png", "bg-abc.jpg", "bg-abc.webp", "bg-abc.gif"] {
            assert!(safe_name("test", name).is_ok(), "{name}");
        }
    }

    #[test]
    fn the_cache_header_is_the_immutable_one() {
        assert!(IMMUTABLE.contains("immutable"));
        assert!(IMMUTABLE.contains("max-age=31536000"));
    }
}
