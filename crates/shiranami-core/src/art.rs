//! The canonical database form of a cover-art value, and the loopback URL that
//! must never reach a column.
//!
//! §2.4 replaced v1's three custom URI schemes with one loopback HTTP server,
//! and decided that `tracks.album_art` keeps holding the v1 string
//! (`shiranami-art://art/<hash>.jpg`) while the renderer rewrites it onto
//! `http://127.0.0.1:<port>/<token>/art/<hash>.jpg` for display. That rewrite is
//! **one-directional by contract**: the loopback form names a port and a session
//! token that die with the process, so a row holding one is a row that resolves
//! to `ECONNREFUSED` on the next launch and — worse — no longer parses as a
//! cache reference, which is how the album-art prune came to read a full cache
//! as entirely unreferenced and delete it.
//!
//! Two crates need the same judgement and neither may depend on the other:
//! `shiranami-db` has to refuse a non-canonical value at the point of writing
//! it, and `shiranami-metadata`'s prune has to recognise one rather than
//! mistake it for a remote cover. So the parsing lives here, at rank 0, and
//! migration `0007_canonical_album_art.sql` reproduces the same rule in SQL for
//! the rows written before the boundary was sealed.

use std::borrow::Cow;

/// The URL prefix every cache-backed art value carries in the database.
///
/// v1 stored a full URL rather than a bare hash, and `shiranami-metadata` keeps
/// producing exactly this prefix; the constant lives here because the write
/// guard and the prune both have to spell it and neither crate can import the
/// other's copy.
pub const ART_URL_PREFIX: &str = "shiranami-art://art/";

/// The path segment `shiranami-serve` serves covers under, as it appears
/// between the session token and the file name.
const ART_SEGMENT: &str = "/art/";

/// Origins the loopback media server can be addressed on.
///
/// `serve_info` reports `http://127.0.0.1:<port>`, which is the only origin the
/// shipping renderer builds. `localhost` and the IPv6 literal are listed anyway
/// because recognising one costs nothing and failing to recognise one costs a
/// cover cache.
const LOOPBACK_ORIGINS: &[&str] = &[
    "http://127.0.0.1:",
    "http://localhost:",
    "http://[::1]:",
    "https://127.0.0.1:",
    "https://localhost:",
    "https://[::1]:",
];

/// Whether `value` addresses this machine's loopback media server.
///
/// Deliberately origin-shaped rather than "contains 127.0.0.1": a remote cover
/// hosted on a domain that merely mentions the address is a normal `https://`
/// URL and stays one.
#[must_use]
pub fn is_loopback_url(value: &str) -> bool {
    LOOPBACK_ORIGINS
        .iter()
        .any(|origin| value.starts_with(origin))
}

/// The cache file name a loopback art URL addresses, if it is one.
///
/// Returns `None` for every other value, including a loopback URL for a
/// different route (`/audio`, `/radio`) — those name no cache file, and
/// answering for them would let an audio URL masquerade as a cover.
///
/// The last `/art/` is taken rather than the first: the session token is 64 hex
/// characters and so cannot contain the segment, but reading from the right
/// means a token that somehow did could not shift the match. The name is then
/// reduced to its final path component and cut at `?` or `#`, so a query string
/// or a traversal attempt reduces to the same basename
/// `shiranami_metadata::art::file_name_from_url` already produces.
#[must_use]
pub fn loopback_art_file_name(value: &str) -> Option<&str> {
    if !is_loopback_url(value) {
        return None;
    }

    let (_, tail) = value.rsplit_once(ART_SEGMENT)?;
    let path = tail.split(['?', '#']).next().unwrap_or_default();
    let name = path.rsplit('/').next().unwrap_or_default();

    (!name.is_empty()).then_some(name)
}

/// The form of `value` that belongs in the database.
///
/// A loopback art URL becomes the `shiranami-art://` URL for the same cache
/// file; **everything else is returned untouched**, because the column
/// legitimately holds remote `https://` covers and legacy `data:` URLs and a
/// guard that reshaped those would be a worse bug than the one it prevents.
#[must_use]
pub fn canonical_art_url(value: &str) -> Cow<'_, str> {
    match loopback_art_file_name(value) {
        Some(name) => Cow::Owned(format!("{ART_URL_PREFIX}{name}")),
        None => Cow::Borrowed(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact shape the bug wrote: a live session's origin and token.
    #[test]
    fn a_loopback_art_url_reduces_to_the_canonical_form() {
        let token = "a".repeat(64);
        let stored = format!("http://127.0.0.1:60241/{token}/art/abc123.jpg");

        assert_eq!(loopback_art_file_name(&stored), Some("abc123.jpg"));
        assert_eq!(canonical_art_url(&stored), "shiranami-art://art/abc123.jpg");
    }

    #[test]
    fn any_port_and_any_token_are_recognised() {
        for url in [
            "http://127.0.0.1:1/t/art/x.jpg",
            "http://127.0.0.1:65535/0123456789abcdef/art/x.jpg",
            "http://localhost:50346/deadbeef/art/x.jpg",
            "http://[::1]:8080/tok/art/x.jpg",
        ] {
            assert_eq!(
                canonical_art_url(url),
                "shiranami-art://art/x.jpg",
                "{url} was not recognised"
            );
        }
    }

    #[test]
    fn a_query_string_or_fragment_is_not_part_of_the_name() {
        assert_eq!(
            canonical_art_url("http://127.0.0.1:60241/tok/art/x.jpg?v=2"),
            "shiranami-art://art/x.jpg"
        );
        assert_eq!(
            canonical_art_url("http://127.0.0.1:60241/tok/art/x.jpg#frag"),
            "shiranami-art://art/x.jpg"
        );
    }

    #[test]
    fn a_traversal_attempt_reduces_to_its_basename() {
        assert_eq!(
            loopback_art_file_name("http://127.0.0.1:60241/tok/art/../../etc/passwd"),
            Some("passwd")
        );
    }

    /// The half that matters most: nothing else is touched.
    #[test]
    fn every_other_value_is_returned_unchanged() {
        for url in [
            "shiranami-art://art/abc123.jpg",
            "https://example.com/cover.jpg",
            "https://127.0.0.1.example.com/cover.jpg",
            "data:image/png;base64,AA",
            "",
            "abc123.jpg",
        ] {
            assert_eq!(canonical_art_url(url), url);
            assert_eq!(loopback_art_file_name(url), None);
        }
    }

    /// A loopback URL for a different route names no cache file.
    #[test]
    fn a_loopback_url_that_is_not_an_art_url_is_not_a_cache_reference() {
        assert_eq!(
            loopback_art_file_name("http://127.0.0.1:60241/tok/audio?path=%2Fmusic%2Fa.mp3"),
            None
        );
        assert_eq!(
            loopback_art_file_name("http://127.0.0.1:60241/tok/art/"),
            None
        );
    }

    /// Borrowed for the common case, so the write guard allocates only when it
    /// actually has something to repair.
    #[test]
    fn an_already_canonical_value_is_not_reallocated() {
        assert!(matches!(
            canonical_art_url("shiranami-art://art/abc123.jpg"),
            Cow::Borrowed(_)
        ));
    }
}
