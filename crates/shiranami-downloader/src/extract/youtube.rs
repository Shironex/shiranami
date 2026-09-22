//! Reading yt-dlp's `--dump-json` output.
//!
//! One JSON object per line. Malformed lines are skipped rather than failing
//! the batch — a single unparseable entry in a 500-track playlist must not cost
//! the other 499.
//!
//! # The defaults are v1's, including one that looks wrong
//!
//! v1 built each result with JavaScript's `??`, which falls through on `null`
//! and `undefined` only. An empty-string title therefore survives as `""`
//! rather than becoming `"Unknown"`, and that asymmetry is reproduced here.
//!
//! The `url` and `webpage_url` fallbacks interpolate `data.id` **before** its
//! own default is applied, so an entry with no `id` at all yields the literal
//! `https://www.youtube.com/watch?v=undefined`. That is a v1 bug and it is
//! reproduced deliberately: the renderer has been receiving that string for
//! every id-less entry, an entry with no id is unplayable either way, and
//! silently changing the shape is how a downstream `startsWith` check that
//! nobody remembers starts behaving differently. It is pinned by a test so
//! removing it is a decision rather than an accident.

use serde_json::Value;
use shiranami_core::models::SearchResult;

/// Parse newline-delimited `--dump-json` output into results.
pub fn parse_json_lines(stdout: &str) -> Vec<SearchResult> {
    stdout
        .trim()
        .split('\n')
        .filter(|line| !line.is_empty())
        .filter_map(|line| match serde_json::from_str::<Value>(line) {
            Ok(data) => Some(to_result(&data)),
            Err(error) => {
                tracing::debug!(%error, "could not parse a yt-dlp JSON line");
                None
            }
        })
        .collect()
}

/// One JSON object as a [`SearchResult`].
fn to_result(data: &Value) -> SearchResult {
    let id = data.get("id");
    let watch_url = format!("https://www.youtube.com/watch?v={}", js_string(id));

    SearchResult {
        id: string_or(id, ""),
        title: string_or(data.get("title"), "Unknown"),
        // `uploader` first, `channel` second — a flat-playlist entry carries
        // one or the other depending on the extractor.
        uploader: present(data.get("uploader"))
            .or_else(|| present(data.get("channel")))
            .map_or_else(|| "Unknown".to_owned(), js_value_string),
        duration: data.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
        thumbnail: present(data.get("thumbnail"))
            .map(js_value_string)
            .or_else(|| first_thumbnail_url(data))
            .unwrap_or_default(),
        url: string_or(data.get("url"), &watch_url),
        webpage_url: string_or(data.get("webpage_url"), &watch_url),
        // The one field v1 type-checked rather than defaulted: absent from
        // flat-playlist extraction entirely.
        view_count: data.get("view_count").and_then(Value::as_i64),
        match_confidence: None,
        match_flag: None,
    }
}

/// `thumbnails?.[0]?.url`.
fn first_thumbnail_url(data: &Value) -> Option<String> {
    present(data.get("thumbnails")?.as_array()?.first()?.get("url")).map(js_value_string)
}

/// The value, unless it is absent or `null` — JavaScript's `??` test.
fn present(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| !value.is_null())
}

/// The value as a string, or `fallback` when it is absent or `null`.
fn string_or(value: Option<&Value>, fallback: &str) -> String {
    present(value).map_or_else(|| fallback.to_owned(), js_value_string)
}

/// A present value rendered the way JavaScript string interpolation would.
///
/// yt-dlp emits strings for every field read here, so this only matters for
/// output that has gone wrong — at which point rendering `5` as `"5"` rather
/// than discarding it is what v1 did.
fn js_value_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

/// A possibly-absent value rendered as JavaScript interpolation would.
fn js_string(value: Option<&Value>) -> String {
    match value {
        None => "undefined".to_owned(),
        Some(value) => js_value_string(value),
    }
}

/// The source playlist's title, from the first line that carries one.
///
/// Flat-playlist entries repeat `playlist_title` (and `playlist`) on every
/// line, so only the first parseable one is needed. Scanned line by line rather
/// than split into a vector: a playlist with thousands of entries is several
/// megabytes, and this reads at most one line of it.
pub fn playlist_title(stdout: &str) -> Option<String> {
    for line in stdout.split('\n') {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let Ok(data) = serde_json::from_str::<Value>(line) else {
            continue;
        };

        let title = data
            .get("playlist_title")
            .and_then(Value::as_str)
            .or_else(|| data.get("playlist").and_then(Value::as_str));

        if let Some(title) = title {
            let trimmed = title.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_owned());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_json_lines() {
        let input = [
            r#"{"id":"1","title":"Song A","uploader":"Artist A","duration":180}"#,
            r#"{"id":"2","title":"Song B","channel":"Artist B","duration":240}"#,
        ]
        .join("\n");

        let results = parse_json_lines(&input);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Song A");
        assert_eq!(
            results[1].uploader, "Artist B",
            "`channel` is the fallback when `uploader` is absent"
        );
    }

    #[test]
    fn skips_malformed_json_lines() {
        let input =
            "{\"id\":\"1\",\"title\":\"Valid\"}\nnot-json\n{\"id\":\"2\",\"title\":\"Also Valid\"}";

        assert_eq!(
            parse_json_lines(input).len(),
            2,
            "one bad line in a 500-track playlist must not cost the other 499"
        );
    }

    #[test]
    fn skips_empty_lines() {
        let input = "{\"id\":\"1\",\"title\":\"Song\"}\n\n\n{\"id\":\"2\",\"title\":\"Song2\"}";
        assert_eq!(parse_json_lines(input).len(), 2);
    }

    #[test]
    fn returns_nothing_for_empty_input() {
        assert!(parse_json_lines("").is_empty());
    }

    #[test]
    fn provides_defaults_for_missing_fields() {
        let results = parse_json_lines(r#"{"id":"x"}"#);

        assert_eq!(results[0].title, "Unknown");
        assert_eq!(results[0].uploader, "Unknown");
        assert_eq!(results[0].duration, 0.0);
        assert_eq!(results[0].thumbnail, "");
        assert_eq!(results[0].url, "https://www.youtube.com/watch?v=x");
        assert_eq!(results[0].view_count, None);
    }

    #[test]
    fn a_null_field_takes_the_default_but_an_empty_string_does_not() {
        let results = parse_json_lines(r#"{"id":"x","title":"","uploader":null,"duration":null}"#);

        assert_eq!(
            results[0].title, "",
            "`??` falls through on null and undefined only — an empty title \
             stays empty, as it did in v1"
        );
        assert_eq!(results[0].uploader, "Unknown");
        assert_eq!(results[0].duration, 0.0);
    }

    #[test]
    fn falls_back_to_the_first_thumbnail_in_the_list() {
        let results = parse_json_lines(
            r#"{"id":"x","thumbnails":[{"url":"https://i.ytimg.com/a.jpg"},{"url":"b.jpg"}]}"#,
        );

        assert_eq!(results[0].thumbnail, "https://i.ytimg.com/a.jpg");
    }

    #[test]
    fn an_entry_with_no_id_keeps_v1s_undefined_watch_url() {
        let results = parse_json_lines(r#"{"title":"No id here"}"#);

        assert_eq!(
            results[0].url, "https://www.youtube.com/watch?v=undefined",
            "v1 interpolated `data.id` before applying its own default, so \
             this string has been reaching the renderer all along — pinned \
             so that changing it is a decision"
        );
        assert_eq!(
            results[0].webpage_url,
            "https://www.youtube.com/watch?v=undefined"
        );
        assert_eq!(results[0].id, "", "the id field itself still defaults");
    }

    #[test]
    fn only_a_numeric_view_count_is_carried() {
        assert_eq!(
            parse_json_lines(r#"{"id":"x","view_count":1234567}"#)[0].view_count,
            Some(1_234_567)
        );
        assert_eq!(
            parse_json_lines(r#"{"id":"x","view_count":"lots"}"#)[0].view_count,
            None,
            "v1 type-checked this one field rather than defaulting it"
        );
    }

    #[test]
    fn a_view_count_beyond_u32_survives() {
        assert_eq!(
            parse_json_lines(r#"{"id":"x","view_count":5000000000}"#)[0].view_count,
            Some(5_000_000_000),
            "popular videos exceed u32, which is why the model holds an i64"
        );
    }

    #[test]
    fn reads_the_playlist_title_from_the_first_line_that_carries_one() {
        let stdout = [
            r#"{"id":"1","title":"A"}"#,
            r#"{"id":"2","title":"B","playlist_title":"  My Mix  "}"#,
            r#"{"id":"3","title":"C","playlist_title":"Another"}"#,
        ]
        .join("\n");

        assert_eq!(playlist_title(&stdout), Some("My Mix".to_owned()));
    }

    #[test]
    fn falls_back_to_the_playlist_field() {
        assert_eq!(
            playlist_title(r#"{"id":"1","playlist":"Fallback Name"}"#),
            Some("Fallback Name".to_owned())
        );
    }

    #[test]
    fn a_blank_or_absent_playlist_title_reads_as_none() {
        assert_eq!(playlist_title(r#"{"id":"1","playlist_title":"   "}"#), None);
        assert_eq!(playlist_title(r#"{"id":"1"}"#), None);
        assert_eq!(
            playlist_title("not-json\n"),
            None,
            "a single video URL produces no playlist title at all"
        );
    }
}
