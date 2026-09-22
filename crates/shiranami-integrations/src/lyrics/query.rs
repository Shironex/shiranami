//! Search-query construction and the query-string encoder LRCLIB is fed.
//!
//! Ported from `buildSearchQueries` in
//! `apps/desktop/src/main/services/lyrics-service.ts`, plus the encoding the
//! `lrclib-api` package applied on its way out.

/// Build the search queries to try, most specific first.
///
/// Track metadata is routinely imprecise — the commonest shape by far is a
/// title field holding the whole `ARTIST - TITLE` string lifted from a
/// filename, with the artist field either duplicating it or empty. Each variant
/// is a different guess at where the real title ends, and they are tried in
/// order until one returns a hit.
///
/// Duplicates are dropped case-insensitively, so `buildSearchQueries("Song",
/// "Song")` issues one request rather than two identical ones.
pub fn build_search_queries(title: &str, artist: &str) -> Vec<String> {
    let mut queries: Vec<String> = Vec::new();
    let mut seen: Vec<String> = Vec::new();

    let mut add = |candidate: String| {
        let normalized = collapse_whitespace(candidate.trim());
        if normalized.is_empty() {
            return;
        }
        let folded = normalized.to_lowercase();
        if seen.contains(&folded) {
            return;
        }
        seen.push(folded);
        queries.push(normalized);
    };

    // 1. The full "title artist" pair — right when the metadata is right.
    add(format!("{title} {artist}"));
    // 2. The title alone, which is often already "ARTIST - SONG".
    add(title.to_owned());

    // 3/4. Split on either dash and try both halves in both orders. The
    // reversal is what catches "ARTIST - TITLE" written into the title field:
    // LRCLIB indexes by title, so the half that is really the title has to lead.
    for separator in [" - ", " \u{2013} "] {
        if !title.contains(separator) {
            continue;
        }
        let parts: Vec<&str> = title
            .split(separator)
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect();

        add(parts.join(" "));
        if let [first, second] = parts.as_slice() {
            add(format!("{second} {first}"));
        }
    }

    queries
}

/// Collapse every run of whitespace to one space.
///
/// Unicode-aware, matching JavaScript's `\s`: a title pasted out of a browser
/// carries NBSP, and leaving it in makes two spellings of one query.
fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_space = false;
    for character in value.chars() {
        if character.is_whitespace() {
            in_space = true;
            continue;
        }
        if in_space && !out.is_empty() {
            out.push(' ');
        }
        in_space = false;
        out.push(character);
    }
    out
}

/// Percent-encode `value` exactly as JavaScript's `encodeURIComponent` does.
///
/// Not `form_urlencoded`, which is the encoder `url::Url::query_pairs_mut`
/// reaches for: that spells a space `+`, and this spells it `%20`. LRCLIB is
/// what v1 sent `%20` to, and a server that takes `+` literally would search
/// for a different string. The unreserved set below is the one the ECMAScript
/// spec fixes for `encodeURIComponent`, including the four marks — `!~*'()` —
/// that RFC 3986 would escape and it does not.
pub fn encode_uri_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut buffer = [0_u8; 4];

    for character in value.chars() {
        if character.is_ascii_alphanumeric() || "-_.!~*'()".contains(character) {
            out.push(character);
            continue;
        }
        for byte in character.encode_utf8(&mut buffer).as_bytes() {
            out.push('%');
            out.push_str(&format!("{byte:02X}"));
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_title_and_artist_as_the_first_query() {
        let queries = build_search_queries("Song", "Artist");
        assert_eq!(queries.first().map(String::as_str), Some("Song Artist"));
    }

    #[test]
    fn includes_the_title_alone() {
        let queries = build_search_queries("Song", "Artist");
        assert!(queries.iter().any(|query| query == "Song"));
    }

    #[test]
    fn splits_a_title_containing_a_hyphen_separator() {
        let queries = build_search_queries("Artist - Song", "Other");
        assert!(queries.iter().any(|query| query == "Artist Song"));
        assert!(queries.iter().any(|query| query == "Song Artist"));
    }

    #[test]
    fn handles_the_en_dash_separator() {
        let queries = build_search_queries("Artist \u{2013} Song", "Other");
        assert!(queries.iter().any(|query| query == "Artist Song"));
        assert!(queries.iter().any(|query| query == "Song Artist"));
    }

    /// Every extra query is another round trip through a 250 ms rate gate, so
    /// the dedupe is a latency guard as much as a tidiness one.
    #[test]
    fn deduplicates_case_insensitively() {
        let queries = build_search_queries("Song", "Song");
        let folded: Vec<String> = queries.iter().map(|q| q.to_lowercase()).collect();

        let mut unique = folded.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(folded.len(), unique.len());
    }

    #[test]
    fn collapses_runs_of_whitespace_including_non_breaking_spaces() {
        let queries = build_search_queries("Song\u{a0}\u{a0}Title  ", " Artist ");
        assert_eq!(
            queries.first().map(String::as_str),
            Some("Song Title Artist")
        );
    }

    /// A three-part title has no unambiguous reversal, so only the joined form
    /// is added — v1 guarded the reversal on `parts.length === 2`.
    #[test]
    fn a_three_part_title_is_joined_but_not_reversed() {
        let queries = build_search_queries("A - B - C", "");
        assert!(queries.iter().any(|query| query == "A B C"));
        assert!(!queries.iter().any(|query| query == "C A B"));
    }

    #[test]
    fn an_empty_query_is_never_added() {
        assert!(build_search_queries("", "").is_empty());
        assert!(build_search_queries("   ", "  ").is_empty());
    }

    #[test]
    fn encodes_spaces_as_percent_twenty_not_plus() {
        assert_eq!(encode_uri_component("a b"), "a%20b");
    }

    /// The four marks `encodeURIComponent` leaves alone that a strict RFC-3986
    /// encoder would escape. Getting these wrong would change the bytes v1 sent.
    #[test]
    fn leaves_the_ecmascript_unreserved_set_alone() {
        assert_eq!(encode_uri_component("-_.!~*'()"), "-_.!~*'()");
        assert_eq!(encode_uri_component("azAZ09"), "azAZ09");
    }

    #[test]
    fn escapes_the_delimiters_that_would_break_the_query_string() {
        assert_eq!(encode_uri_component("a&b=c?d#e"), "a%26b%3Dc%3Fd%23e");
        assert_eq!(encode_uri_component("a/b"), "a%2Fb");
    }

    /// Multi-byte characters are encoded per UTF-8 byte, uppercase-hex, which
    /// is what `encodeURIComponent` emits.
    #[test]
    fn encodes_non_ascii_as_uppercase_utf8_percent_escapes() {
        assert_eq!(encode_uri_component("é"), "%C3%A9");
        assert_eq!(encode_uri_component("日本"), "%E6%97%A5%E6%9C%AC");
    }
}
