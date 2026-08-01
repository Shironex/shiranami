//! Last.fm request signing.
//!
//! Ported from `lastfmSignatureBase` in
//! `apps/desktop/src/main/scrobble/scrobble-payload.ts` and the `signLastfm`
//! helper that hashes it. Every authenticated Last.fm call carries an `api_sig`
//! computed as md5 over the parameters, and getting any part of it wrong
//! produces a generic "invalid signature" from the API with nothing to say
//! which part — so the scheme is pinned by exact-output vectors rather than by
//! description.
//!
//! The scheme, exactly:
//!
//! 1. take every signed parameter, excluding `format`, `callback` and `api_sig`
//!    itself;
//! 2. sort by parameter name;
//! 3. concatenate `name` immediately followed by `value`, with no separator of
//!    any kind;
//! 4. append the shared secret;
//! 5. md5 the UTF-8 bytes of that, lowercase hex.
//!
//! `md5` is Last.fm's choice, not ours — see the workspace manifest's note.

use std::collections::BTreeMap;

use md5::{Digest, Md5};

/// A Last.fm parameter map, kept sorted by name so signing is order-free.
///
/// A `BTreeMap` rather than a sort at signing time: byte order over the keys is
/// the same order `Array.prototype.sort()` produced in v1, because every
/// Last.fm parameter name is lowercase ASCII. Holding the map sorted means the
/// signature cannot depend on insertion order, which is the mistake that
/// produces an intermittently invalid signature.
pub type LastfmParams = BTreeMap<&'static str, String>;

/// Parameters excluded from the signature base, per the Last.fm spec.
///
/// `api_sig` is excluded because it does not exist yet; `format` and `callback`
/// because Last.fm says so — they are transport concerns, not request content.
const UNSIGNED: [&str; 3] = ["format", "callback", "api_sig"];

/// The string that gets md5'd: `name`+`value` in name order, then the secret.
pub fn signature_base(params: &LastfmParams, secret: &str) -> String {
    let mut base = String::new();
    for (name, value) in params {
        if UNSIGNED.contains(name) {
            continue;
        }
        base.push_str(name);
        base.push_str(value);
    }
    base.push_str(secret);
    base
}

/// The `api_sig` for `params`: lowercase hex md5 of [`signature_base`].
pub fn api_sig(params: &LastfmParams, secret: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(signature_base(params, secret).as_bytes());
    format!("{:x}", hasher.finalize())
}

/// `params` plus `api_sig` and `format=json`, urlencoded.
///
/// The one output both callers want: v1 posted this as the request body for
/// submissions and appended it as a query string for the auth calls, from the
/// same `URLSearchParams`. `url::form_urlencoded` applies the same
/// application/x-www-form-urlencoded rules `URLSearchParams` does, including
/// encoding a space as `+`.
pub fn signed_query(params: &LastfmParams, secret: &str) -> String {
    let signature = api_sig(params, secret);

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    for (name, value) in params {
        serializer.append_pair(name, value);
    }
    serializer.append_pair("api_sig", &signature);
    serializer.append_pair("format", "json");
    serializer.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(pairs: &[(&'static str, &str)]) -> LastfmParams {
        pairs
            .iter()
            .map(|(name, value)| (*name, (*value).to_owned()))
            .collect()
    }

    /// v1's `scrobble-payload.test.ts`, first case, verbatim.
    #[test]
    fn the_base_sorts_by_name_concatenates_and_appends_the_secret() {
        let base = signature_base(&params(&[("b", "2"), ("a", "1")]), "SECRET");
        assert_eq!(base, "a1b2SECRET");
    }

    /// v1's second case. Excluding these three is Last.fm's rule; including
    /// `format` would make every request fail with an invalid signature.
    #[test]
    fn format_callback_and_api_sig_are_excluded_from_the_base() {
        let base = signature_base(
            &params(&[("a", "1"), ("format", "json"), ("api_sig", "x")]),
            "S",
        );
        assert_eq!(base, "a1S");

        let with_callback = signature_base(&params(&[("a", "1"), ("callback", "cb")]), "S");
        assert_eq!(with_callback, "a1S");
    }

    /// The signature is a 32-character lowercase hex digest — v1's third case,
    /// tightened from a shape assertion into the exact value, so that a change
    /// of hash, of encoding, or of the concatenation rule fails here rather
    /// than at Last.fm.
    #[test]
    fn the_signature_is_the_md5_of_the_base() {
        let signed = params(&[("method", "track.scrobble"), ("sk", "k")]);
        let signature = api_sig(&signed, "s");

        assert_eq!(signature_base(&signed, "s"), "methodtrack.scrobbleskks");
        // md5("methodtrack.scrobbleskks")
        assert_eq!(signature, "1eb36df18cc8a809bf786b128602d6c6");
        assert_eq!(signature.len(), 32);
        assert!(signature.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(signature, signature.to_lowercase());
    }

    /// A realistic scrobble, signed end to end. This is the vector that would
    /// catch a reordering, a stray separator, or a secret appended in the wrong
    /// place — none of which the small cases above can see.
    #[test]
    fn a_full_scrobble_signs_to_a_known_value() {
        let signed = params(&[
            ("method", "track.scrobble"),
            ("api_key", "APIKEY"),
            ("sk", "SESSION"),
            ("artist", "Nujabes"),
            ("track", "Aruarian Dance"),
            ("album", "Modal Soul"),
            ("duration", "247"),
            ("timestamp", "1700000000"),
        ]);

        assert_eq!(
            signature_base(&signed, "SECRET"),
            "albumModal Soulapi_keyAPIKEYartistNujabesduration247methodtrack.scrobble\
             skSESSIONtimestamp1700000000trackAruarian DanceSECRET"
        );
        assert_eq!(
            api_sig(&signed, "SECRET"),
            "23c58fa8a1664aea0ca4dfdf7a3d7a5a"
        );
    }

    /// Non-ASCII values are signed as UTF-8 bytes, which is what `update(base,
    /// 'utf8')` did. A Latin-1 or UTF-16 reading here would break signing for
    /// every Japanese track title in the library and nowhere else.
    #[test]
    fn non_ascii_values_are_signed_as_utf8() {
        let signed = params(&[("artist", "坂本龍一"), ("track", "Merry Christmas")]);
        assert_eq!(
            signature_base(&signed, "S"),
            "artist坂本龍一trackMerry ChristmasS"
        );
        assert_eq!(api_sig(&signed, "S"), "4f6dc8abf8702c55c1806d7761799ff7");
    }

    /// The query carries the signature and the JSON format flag, and encodes a
    /// space as `+` — `URLSearchParams`' rule, which v1 relied on implicitly.
    #[test]
    fn the_signed_query_adds_the_signature_and_the_json_flag() {
        let signed = params(&[("method", "auth.getSession"), ("track", "Aruarian Dance")]);
        let query = signed_query(&signed, "SECRET");

        assert!(query.contains("track=Aruarian+Dance"));
        assert!(query.contains("method=auth.getSession"));
        assert!(query.contains(&format!("api_sig={}", api_sig(&signed, "SECRET"))));
        assert!(query.ends_with("&format=json"));
    }

    /// The signature does not depend on how the map was built.
    #[test]
    fn insertion_order_cannot_change_the_signature() {
        let forwards = params(&[("a", "1"), ("b", "2"), ("c", "3")]);
        let backwards = params(&[("c", "3"), ("b", "2"), ("a", "1")]);
        assert_eq!(api_sig(&forwards, "S"), api_sig(&backwards, "S"));
    }
}
