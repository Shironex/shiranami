//! The two defensive strategies behind the `__NEXT_DATA__` parse.
//!
//! Both exist because the embed page is somebody else's HTML and it will change
//! again. Neither is reached while the primary parse produces a real artist.
//!
//! # The bracket-depth scan, and the regex that could not do it
//!
//! v1's first attempt at strategy 2 was a non-greedy regex,
//! `"trackList"\s*:\s*\[([\s\S]*?)\]`. Non-greedy stops at the **first** `]`,
//! and a real track carries `"contentRatings":{"labels":["EXPLICIT"]}` — so the
//! capture ended inside the first track and parsed as nothing at all. The
//! fallback yielded zero tracks on every real page for its entire life.
//!
//! Counting bracket depth is what fixes it, and counting has to skip brackets
//! that appear **inside strings** — a track titled `Bad Habits [Remix]` would
//! otherwise close the array early. The string skip has to honour backslash
//! escapes for the same reason.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::extract::spotify::{SpotifyTrack, map_embed_track};

/// The `__NEXT_DATA__` script tag's contents.
static NEXT_DATA: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>"#)
        .expect("a literal pattern in this module compiles")
});

/// Any script tag's contents.
static SCRIPT_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<script[^>]*>(.*?)</script>")
        .expect("a literal pattern in this module compiles")
});

/// A `"title": "…"` followed by an `"artists": [ … ]`.
static TITLE_ARTISTS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)"title"\s*:\s*"([^"]+)"(?s:.)*?"artists"\s*:\s*\[(.*?)\]"#)
        .expect("a literal pattern in this module compiles")
});

/// The first `"name": "…"` in a fragment.
static ARTIST_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""name"\s*:\s*"([^"]+)""#).expect("a literal pattern in this module compiles")
});

/// The raw JSON inside the `__NEXT_DATA__` script tag.
pub fn next_data_blob(html: &str) -> Option<&str> {
    NEXT_DATA
        .captures(html)
        .and_then(|captured| captured.get(1))
        .map(|blob| blob.as_str())
}

/// Strategy 2: every top-level `"trackList": [ … ]` array anywhere in the page.
pub fn scan_track_lists(html: &str) -> Vec<SpotifyTrack> {
    const KEY: &str = "\"trackList\"";

    let bytes = html.as_bytes();
    let mut tracks = Vec::new();
    let mut from = 0;

    while let Some(offset) = html[from..].find(KEY) {
        let key_at = from + offset;
        let mut cursor = key_at + KEY.len();

        cursor = skip_whitespace(bytes, cursor);
        if bytes.get(cursor) != Some(&b':') {
            from = key_at + 1;
            continue;
        }
        cursor += 1;

        cursor = skip_whitespace(bytes, cursor);
        if bytes.get(cursor) != Some(&b'[') {
            from = key_at + 1;
            continue;
        }

        let start = cursor;
        let end = match array_end(bytes, start) {
            Some(end) => end,
            None => {
                from = key_at + 1;
                continue;
            }
        };
        from = end;

        let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&html[start..end]) else {
            continue;
        };

        tracks.extend(
            items
                .iter()
                .filter(|item| item.is_object())
                .filter_map(map_embed_track),
        );
    }

    tracks
}

/// Advance past spaces, tabs and line breaks.
fn skip_whitespace(bytes: &[u8], mut at: usize) -> usize {
    while matches!(bytes.get(at), Some(b' ' | b'\t' | b'\n' | b'\r')) {
        at += 1;
    }
    at
}

/// The index just past the `]` that closes the array opening at `start`.
///
/// Counts depth, skipping brackets inside strings and honouring `\` escapes.
fn array_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0_usize;
    let mut at = start;

    while at < bytes.len() {
        match bytes[at] {
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(at + 1);
                }
            }
            b'"' => {
                at += 1;
                while at < bytes.len() && bytes[at] != b'"' {
                    if bytes[at] == b'\\' {
                        at += 1;
                    }
                    at += 1;
                }
                if at >= bytes.len() {
                    return None;
                }
            }
            _ => {}
        }
        at += 1;
    }

    None
}

/// Strategy 3: title/artists pairs out of every script body.
pub fn sweep_scripts(html: &str) -> Vec<SpotifyTrack> {
    let mut tracks = Vec::new();

    for block in SCRIPT_BLOCK.captures_iter(html) {
        let Some(content) = block.get(1) else {
            continue;
        };

        for pair in TITLE_ARTISTS.captures_iter(content.as_str()) {
            let (Some(title), Some(artists)) = (pair.get(1), pair.get(2)) else {
                continue;
            };

            let title = title.as_str().trim();
            if title.is_empty() {
                continue;
            }

            let artist = ARTIST_NAME
                .captures(artists.as_str())
                .and_then(|captured| captured.get(1))
                .map(|name| name.as_str().trim())
                .filter(|name| !name.is_empty())
                .unwrap_or(crate::extract::spotify::UNKNOWN_ARTIST);

            tracks.push(SpotifyTrack {
                title: title.to_owned(),
                artist: artist.to_owned(),
                album: None,
                // This strategy recovers no duration, which the matcher scores
                // as neutral rather than as a mismatch.
                duration_sec: None,
                isrc: None,
            });
        }
    }

    tracks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bracket_scan_survives_the_nested_array_that_defeated_the_old_regex() {
        // `"labels":["EXPLICIT"]` is the exact shape that made a non-greedy
        // `\[([\s\S]*?)\]` capture end inside the first track.
        let html = r#"<html><body><script>
var data = {"trackList":[
  {"title":"Song One","subtitle":"Artist A","duration":180000,"contentRatings":{"labels":["EXPLICIT"]}},
  {"title":"Song Two","subtitle":"Artist B","duration":240000,"contentRatings":{"labels":[]}}
]}</script></body></html>"#;

        let tracks = scan_track_lists(html);

        assert_eq!(tracks.len(), 2);
        assert_eq!(
            tracks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(),
            vec!["Song One", "Song Two"]
        );
        assert_eq!(
            tracks.iter().map(|t| t.artist.as_str()).collect::<Vec<_>>(),
            vec!["Artist A", "Artist B"]
        );
    }

    #[test]
    fn a_bracket_inside_a_title_does_not_close_the_array() {
        let html =
            r#"<script>{"trackList":[{"title":"Bad Habits [Remix]","subtitle":"A"}]}</script>"#;

        let tracks = scan_track_lists(html);

        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Bad Habits [Remix]");
    }

    #[test]
    fn an_escaped_quote_inside_a_title_does_not_end_the_string_scan() {
        let html =
            r#"<script>{"trackList":[{"title":"He said \"hi\" [x]","subtitle":"A"}]}</script>"#;

        let tracks = scan_track_lists(html);

        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, r#"He said "hi" [x]"#);
    }

    #[test]
    fn a_track_list_key_that_is_not_an_array_is_skipped() {
        let html =
            r#"<script>{"trackList":null,"trackList":[{"title":"Real","subtitle":"A"}]}</script>"#;

        let tracks = scan_track_lists(html);

        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Real");
    }

    #[test]
    fn an_unterminated_array_yields_nothing_rather_than_hanging() {
        assert!(scan_track_lists(r#"<script>{"trackList":[{"title":"x""#).is_empty());
    }

    #[test]
    fn the_script_sweep_reads_title_and_the_first_artist_name() {
        let html = r#"<script>
          {"title":"Sweep Me","artists":[{"name":"First"},{"name":"Second"}]}
        </script>"#;

        let tracks = sweep_scripts(html);

        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Sweep Me");
        assert_eq!(tracks[0].artist, "First");
        assert_eq!(tracks[0].duration_sec, None);
    }

    #[test]
    fn the_script_sweep_names_an_artistless_pair_unknown() {
        let html = r#"<script>{"title":"Anon","artists":[]}</script>"#;

        assert_eq!(sweep_scripts(html)[0].artist, "Unknown");
    }

    #[test]
    fn the_next_data_blob_is_found_by_its_id_attribute() {
        let html = r#"<script id="other">nope</script><script id="__NEXT_DATA__" type="application/json">{"a":1}</script>"#;

        assert_eq!(next_data_blob(html), Some(r#"{"a":1}"#));
        assert_eq!(next_data_blob("<html></html>"), None);
    }
}
