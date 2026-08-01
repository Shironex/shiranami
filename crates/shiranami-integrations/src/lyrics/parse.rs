//! The LRC parser and the two predicates the precedence ladder is phrased in.
//!
//! Ported from `apps/desktop/src/main/services/lyrics-parse.ts`. The format is
//! `[mm:ss.xx]Lyric text`, with two wrinkles that real files carry and the
//! ported tests pin: a line may repeat for a refrain by prefixing **several**
//! timestamps, and the millisecond separator is `.` in most taggers but `:` in
//! some.
//!
//! # Why the character classes are spelled `[0-9]`
//!
//! JavaScript's `\d` is ASCII-only; Rust's is Unicode by default and would
//! accept Devanagari or fullwidth digits, which `parseInt` would then refuse.
//! Spelling the class out removes the divergence at the source rather than
//! relying on an inline flag nobody re-reads. `\s` is deliberately left Unicode
//! in both — JavaScript's `\s` matches NBSP and the line separators too, and
//! lyric files pasted out of browsers carry them.

use std::sync::LazyLock;

use regex::Regex;
use shiranami_core::models::lyrics::{LyricLine, LyricsResult};

/// A whole line: one or more timestamps, then the text.
///
/// Anchored at the start so a stray `[Chorus]` marker mid-file cannot be read
/// as a timestamp, and non-matching lines are skipped entirely.
static LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*((?:\[[0-9]{1,2}:[0-9]{2}[.:][0-9]{2,3}\])+)\s*(.*)")
        .expect("the LRC line pattern is a literal and compiles")
});

/// One timestamp inside the run captured by [`LINE`].
static TIMESTAMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[([0-9]{1,2}):([0-9]{2})[.:]([0-9]{2,3})\]")
        .expect("the LRC timestamp pattern is a literal and compiles")
});

/// Parse an LRC document into timed lines, sorted by time.
///
/// A line carrying several timestamps yields one entry per timestamp — that is
/// how the format spells a repeated refrain, and collapsing them would drop
/// every repeat after the first. Lines that parse but hold only whitespace are
/// dropped: they are spacing in the source file, not a lyric to display.
pub fn parse_lrc(lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();

    for raw in lrc.split('\n') {
        let Some(matched) = LINE.captures(raw) else {
            continue;
        };

        // `.trim()` also disposes of the `\r` a CRLF document leaves behind,
        // which is why this path does not need newline normalisation of its own
        // the way the local-file reader does.
        let text = matched
            .get(2)
            .map_or("", |group| group.as_str())
            .trim()
            .to_owned();
        if text.is_empty() {
            continue;
        }

        let stamps = matched.get(1).map_or("", |group| group.as_str());
        for stamp in TIMESTAMP.captures_iter(stamps) {
            lines.push(LyricLine {
                time: seconds_of(&stamp),
                text: text.clone(),
            });
        }
    }

    // Stable, matching V8's sort, so two timestamps landing on the same second
    // keep the order the file wrote them in.
    lines.sort_by(|a, b| a.time.total_cmp(&b.time));
    lines
}

/// Seconds from the start of the track, for one captured timestamp.
///
/// The fractional field is centiseconds when two digits wide and milliseconds
/// when three — `[00:05.12]` and `[00:05.123]` are 5.12 s and 5.123 s, not the
/// same value read two ways.
fn seconds_of(stamp: &regex::Captures<'_>) -> f64 {
    let field = |index: usize| -> f64 {
        stamp
            .get(index)
            .and_then(|group| group.as_str().parse::<f64>().ok())
            .unwrap_or(0.0)
    };

    let fraction = stamp.get(3).map_or("", |group| group.as_str());
    let millis = if fraction.len() == 2 {
        field(3) * 10.0
    } else {
        field(3)
    };

    field(1) * 60.0 + field(2) + millis / 1000.0
}

/// Drop a leading UTF-8 BOM.
///
/// Windows editors write one, and left in place it becomes part of the first
/// lyric line — or, worse, defeats the `^` anchor on the first timestamp.
pub fn strip_bom(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

/// Collapse CRLF and lone CR to LF.
///
/// Ported from `normalizeNewlines`. Classic Mac line endings still turn up in
/// lyric files downloaded from old archives, and a lone CR would otherwise make
/// the whole file one unparseable line.
pub fn normalize_newlines(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

/// Whether `result` carries at least one timed line.
pub fn has_synced_lyrics(result: Option<&LyricsResult>) -> bool {
    result.is_some_and(|found| found.synced.as_ref().is_some_and(|l| !l.is_empty()))
}

/// Whether `result` carries non-empty plain text.
pub fn has_plain_lyrics(result: Option<&LyricsResult>) -> bool {
    result.is_some_and(|found| found.plain.as_ref().is_some_and(|text| !text.is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::models::lyrics::LyricsSource;

    fn times(lines: &[LyricLine]) -> Vec<f64> {
        lines.iter().map(|line| line.time).collect()
    }

    fn texts(lines: &[LyricLine]) -> Vec<&str> {
        lines.iter().map(|line| line.text.as_str()).collect()
    }

    #[test]
    fn parses_standard_mm_ss_xx_lines() {
        let parsed = parse_lrc("[01:23.45]Hello world\n[02:34.56]Second line");
        assert_eq!(times(&parsed), vec![83.45, 154.56]);
        assert_eq!(texts(&parsed), vec!["Hello world", "Second line"]);
    }

    #[test]
    fn parses_three_digit_milliseconds() {
        let parsed = parse_lrc("[00:05.123]Three digit ms");
        assert_eq!(times(&parsed), vec![5.123]);
    }

    /// Two digits are centiseconds and three are milliseconds. Reading `.12` as
    /// 12 ms would put every line 108 ms early, which is small enough to ship
    /// unnoticed and exactly wrong.
    #[test]
    fn two_and_three_digit_fractions_scale_differently() {
        assert_eq!(times(&parse_lrc("[00:05.12]x")), vec![5.12]);
        assert_eq!(times(&parse_lrc("[00:05.012]x")), vec![5.012]);
    }

    #[test]
    fn returns_nothing_for_empty_input() {
        assert!(parse_lrc("").is_empty());
    }

    #[test]
    fn skips_malformed_lines() {
        let parsed = parse_lrc("not a lyric\n[01:00.00]Valid line\n[bad]Also bad");
        assert_eq!(times(&parsed), vec![60.0]);
        assert_eq!(texts(&parsed), vec!["Valid line"]);
    }

    #[test]
    fn sorts_lines_by_time() {
        let parsed = parse_lrc("[02:00.00]Second\n[01:00.00]First\n[03:00.00]Third");
        assert_eq!(texts(&parsed), vec!["First", "Second", "Third"]);
    }

    #[test]
    fn skips_lines_whose_text_is_only_whitespace() {
        let parsed = parse_lrc("[01:00.00]   \n[02:00.00]Has text");
        assert_eq!(times(&parsed), vec![120.0]);
        assert_eq!(texts(&parsed), vec!["Has text"]);
    }

    /// A refrain is spelled by stacking timestamps on one line. Each must become
    /// its own entry, or every repeat after the first silently disappears.
    #[test]
    fn emits_one_entry_per_timestamp_on_multi_timestamp_lines() {
        let parsed = parse_lrc("[02:03.04][01:02.03]Repeated line");
        assert_eq!(times(&parsed), vec![62.03, 123.04]);
        assert_eq!(texts(&parsed), vec!["Repeated line", "Repeated line"]);
    }

    #[test]
    fn accepts_a_colon_as_the_millisecond_separator() {
        let parsed = parse_lrc("[00:05:12]Colon separator");
        assert_eq!(times(&parsed), vec![5.12]);
        assert_eq!(texts(&parsed), vec!["Colon separator"]);
    }

    #[test]
    fn accepts_single_digit_minutes() {
        assert_eq!(times(&parse_lrc("[1:30.00]Single digit")), vec![90.0]);
    }

    /// CRLF input reaches this parser unnormalised on the LRCLIB path, where the
    /// body is used as the server sent it. `trim()` is what absorbs the `\r`.
    #[test]
    fn a_crlf_document_does_not_leave_carriage_returns_in_the_text() {
        let parsed = parse_lrc("[01:00.00]Hello\r\n[02:00.00]World\r\n");
        assert_eq!(texts(&parsed), vec!["Hello", "World"]);
    }

    /// JavaScript's `\d` is ASCII-only, and Rust's is not. A fullwidth digit
    /// must not be read as a timestamp — `parseInt` would have refused it, so
    /// accepting it here would invent lines v1 never produced.
    #[test]
    fn non_ascii_digits_are_not_timestamps() {
        assert!(parse_lrc("[０１:２３.４５]Fullwidth").is_empty());
    }

    /// A section marker is not a timestamp, and the anchor is what keeps it out.
    #[test]
    fn section_markers_are_not_timestamps() {
        assert!(parse_lrc("[Chorus]\n[Verse 1]").is_empty());
    }

    /// The pattern is anchored, so a timestamp appearing mid-line is text.
    #[test]
    fn a_timestamp_after_other_text_does_not_match() {
        assert!(parse_lrc("sung at [01:00.00]Hello").is_empty());
    }

    /// Three-digit minutes are out of format; accepting them would let a stray
    /// bracketed number become a lyric at an absurd timestamp.
    #[test]
    fn out_of_format_timestamps_are_rejected() {
        assert!(parse_lrc("[100:00.00]Too many minutes").is_empty());
        assert!(parse_lrc("[01:5.00]Too few seconds").is_empty());
        assert!(parse_lrc("[01:00.1]Too few fraction digits").is_empty());
        assert!(parse_lrc("[01:00.1234]Too many fraction digits").is_empty());
    }

    #[test]
    fn strips_a_leading_bom_and_nothing_else() {
        assert_eq!(strip_bom("\u{feff}[01:00.00]x"), "[01:00.00]x");
        assert_eq!(strip_bom("plain"), "plain");
        assert_eq!(strip_bom("a\u{feff}b"), "a\u{feff}b");
    }

    #[test]
    fn normalizes_crlf_and_lone_cr() {
        assert_eq!(normalize_newlines("a\r\nb\rc\nd"), "a\nb\nc\nd");
    }

    #[test]
    fn the_predicates_read_emptiness_as_absence() {
        let empty = LyricsResult {
            synced: None,
            plain: None,
            source: None,
        };
        assert!(!has_synced_lyrics(Some(&empty)));
        assert!(!has_plain_lyrics(Some(&empty)));
        assert!(!has_synced_lyrics(None));
        assert!(!has_plain_lyrics(None));

        // An empty vector and an empty string are "nothing found", not "found
        // something blank" — v1's predicates checked length for this reason.
        let blank = LyricsResult {
            synced: Some(Vec::new()),
            plain: Some(String::new()),
            source: Some(LyricsSource::Lrclib),
        };
        assert!(!has_synced_lyrics(Some(&blank)));
        assert!(!has_plain_lyrics(Some(&blank)));

        let full = LyricsResult {
            synced: Some(vec![LyricLine {
                time: 1.0,
                text: "x".to_owned(),
            }]),
            plain: Some("y".to_owned()),
            source: Some(LyricsSource::LocalLrc),
        };
        assert!(has_synced_lyrics(Some(&full)));
        assert!(has_plain_lyrics(Some(&full)));
    }
}
