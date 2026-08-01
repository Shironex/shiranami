//! Query-string reading, with v1's decoding rules rather than a generic one.
//!
//! v1 read both the audio path and the radio URL through `URLSearchParams`,
//! which is **form-urlencoded**: `+` decodes to a space. That is not the same as
//! percent-decoding, and the difference is not academic — a file named
//! `Track+Remix.mp3` round-trips correctly only because `encodeURIComponent`
//! emits `%2B` for a literal `+` and the reader turns `+` back into a space.
//! A reader that percent-decoded instead would resolve a different path for
//! every track with a `+` or a space in its name.

use axum::http::Uri;

/// The first value of `name` in `uri`'s query string, form-urlencoded.
///
/// Returns `None` for an absent parameter and `Some("")` for a present but
/// empty one, so a caller can tell "no `?path=`" from "`?path=`" — v1 refused
/// both, but with different log lines.
pub fn first(uri: &Uri, name: &str) -> Option<String> {
    let query = uri.query()?;
    url::form_urlencoded::parse(query.as_bytes())
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uri(query: &str) -> Uri {
        format!("/token/audio?{query}")
            .parse()
            .expect("a valid test URI")
    }

    #[test]
    fn a_missing_parameter_is_none() {
        assert_eq!(first(&uri("other=1"), "path"), None);
        assert_eq!(first(&"/token/audio".parse().expect("valid"), "path"), None);
    }

    #[test]
    fn an_empty_parameter_is_present_and_empty() {
        assert_eq!(first(&uri("path="), "path").as_deref(), Some(""));
    }

    #[test]
    fn percent_escapes_are_decoded() {
        assert_eq!(
            first(&uri("path=%2Fmusic%2FTrack.mp3"), "path").as_deref(),
            Some("/music/Track.mp3")
        );
    }

    /// The rule that separates this from percent-decoding, and the reason the
    /// module exists at all.
    #[test]
    fn a_plus_decodes_to_a_space_as_url_search_params_did() {
        assert_eq!(
            first(&uri("path=%2Fmusic%2FTrack+Two.mp3"), "path").as_deref(),
            Some("/music/Track Two.mp3")
        );
    }

    /// And the other half: a literal `+` in a filename arrives escaped, so it
    /// survives. `encodeURIComponent('a+b')` is `a%2Bb`.
    #[test]
    fn an_escaped_plus_stays_a_plus() {
        assert_eq!(
            first(&uri("path=%2Fmusic%2FTrack%2BRemix.mp3"), "path").as_deref(),
            Some("/music/Track+Remix.mp3")
        );
    }

    #[test]
    fn the_first_of_a_repeated_parameter_wins() {
        assert_eq!(
            first(&uri("path=/a.mp3&path=/b.mp3"), "path").as_deref(),
            Some("/a.mp3")
        );
    }

    #[test]
    fn other_parameters_are_ignored() {
        assert_eq!(
            first(&uri("t=1&path=%2Fa.mp3&z=9"), "path").as_deref(),
            Some("/a.mp3")
        );
    }
}
