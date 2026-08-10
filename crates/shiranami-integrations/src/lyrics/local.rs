//! Sidecar lyric files: the "local-first lyrics" source added in v0.24.
//!
//! Ported from `apps/desktop/src/main/services/local-lyrics.ts`. A lyric file
//! lives next to its audio file and shares its basename — `Song.mp3` is served
//! by `Song.lrc` or `Song.txt`, either beside it or inside a `Lyrics/` (or
//! `lyrics/`) subfolder. Six locations are probed in a fixed order, and the
//! order is the precedence: `.lrc` everywhere before `.txt` anywhere, because a
//! timed file is strictly more useful than an untimed one.
//!
//! The one non-obvious rule is the **timestampless `.lrc`**. A `.lrc` with no
//! parseable timestamps is not discarded and is not returned immediately
//! either: it is held back as a last resort so a later candidate — a properly
//! timed `.lrc` in `Lyrics/`, or any `.txt` — can still win. Returning it
//! eagerly would let one mislabelled file mask a good one.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use shiranami_core::models::lyrics::{LyricsResult, LyricsSource};

use crate::lyrics::parse::{normalize_newlines, parse_lrc, strip_bom};

/// Metadata keys a lyric file may open with, as an anchored `Key: value` line.
///
/// An allowlist rather than a general `Key: value` shape on purpose: dialogue
/// and duet lines ("He: Hello", "She: Hi") are ordinary lyrics that a general
/// rule would eat. Every entry here is a tagging convention, not a word a
/// lyricist writes at the start of a line.
static HEADER_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^(?:Artist|Title|Album|Author|Lyrics|By|Offset|Composer|Year|Writer|Track):\s*.+$",
    )
    .expect("the lyric-header pattern is a literal and compiles")
});

/// Past this width a `Key: value` line is a lyric that happens to hold a colon,
/// not metadata. v1's value, unchanged.
const MAX_HEADER_LINE_LENGTH: usize = 120;

/// Strip a leading `Key: value` metadata block from plain-text lyrics.
///
/// Stops at the first line that is not a known header — including a blank one.
/// Two guards keep it from eating the song: a block with no body after it is
/// left alone (the whole file was header-shaped, so it is all the user has),
/// and a block that consumed nothing returns the input untouched.
pub fn strip_lyrics_header(content: &str) -> String {
    let lines: Vec<&str> = content.split('\n').collect();

    let consumed = lines
        .iter()
        // `encode_utf16` rather than `chars`, because v1 measured
        // `String.prototype.length`, which counts UTF-16 code units. The two
        // disagree only past the BMP, and only for a line near the cap — but
        // agreeing exactly costs nothing.
        .take_while(|line| line.encode_utf16().count() < MAX_HEADER_LINE_LENGTH)
        .take_while(|line| HEADER_LINE.is_match(line))
        .count();

    if consumed == 0 {
        return content.to_owned();
    }

    let rest = &lines[consumed..];
    if !rest.iter().any(|line| !line.trim().is_empty()) {
        // Header with nothing behind it: the file is metadata all the way down,
        // and returning "" would show the user an empty lyrics pane.
        return content.to_owned();
    }

    // One blank separator between the block and the body is conventional; drop
    // exactly one, so deliberate spacing in the lyric itself survives.
    let body = match rest.first() {
        Some(first) if first.trim().is_empty() => &rest[1..],
        _ => rest,
    };

    body.join("\n").trim_end().to_owned()
}

/// The six probed locations for `audio_file`'s lyrics, in precedence order.
fn candidate_paths(audio_file: &Path) -> Vec<PathBuf> {
    let Some(directory) = audio_file.parent() else {
        return Vec::new();
    };
    let Some(stem) = audio_file.file_stem() else {
        return Vec::new();
    };

    let mut candidates = Vec::with_capacity(6);
    for extension in ["lrc", "txt"] {
        // Concatenated rather than `with_extension`, which would read the stem
        // of `Song. Pt. 2.mp3` as already carrying an extension of ` 2` and
        // produce `Song. Pt.lrc`. v1 built the name by interpolation and looked
        // for `Song. Pt. 2.lrc`; a dotted title is common enough in track names
        // that the difference is a real miss, not a curiosity.
        let mut name = stem.to_os_string();
        name.push(".");
        name.push(extension);
        let name = PathBuf::from(name);

        candidates.push(directory.join(&name));
        candidates.push(directory.join("Lyrics").join(&name));
        candidates.push(directory.join("lyrics").join(&name));
    }
    candidates
}

/// The first `.lrc` candidate that already exists on disk, if any.
///
/// The question write-back asks before it writes anything: *is one of the
/// user's own timed files already answering for this track?* It is answered
/// from [`candidate_paths`] rather than from a path this module builds a second
/// time, because the whole safety of "never overwrite" rests on asking about the
/// same six locations the reader consults. A `Lyrics/Song.lrc` the user
/// hand-timed outranks nothing if a fresh sibling `Song.lrc` appears above it in
/// the ladder — so *any* existing `.lrc` stops the write, not just one at the
/// target path.
///
/// `.txt` candidates deliberately do not stop it. A plain-text file is only ever
/// reached when the ladder found no timing at all, and the one path that fetches
/// from the directory despite holding a local `.txt` is the user having asked
/// for exactly that with `lyrics.preferSyncedFromLrclib`.
///
/// Synchronous: it is called from inside `spawn_blocking` beside the write.
pub fn existing_lrc_sidecar(audio_file: &Path) -> Option<PathBuf> {
    candidate_paths(audio_file)
        .into_iter()
        .filter(|candidate| {
            candidate
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("lrc"))
        })
        // `try_exists` rather than `exists`: a permission error on a NAS share
        // is not "there is no file there", and treating it as one is how a
        // write-back lands on top of something it could not see.
        .find(|candidate| candidate.try_exists().unwrap_or(true))
}

/// Load lyrics from a sidecar file, or `None` when no candidate exists.
///
/// Never fails: an unreadable candidate is logged and skipped, because the
/// caller's next move is the network either way and a permissions problem on
/// one file must not deny the track its lyrics.
pub async fn load_local_lyrics(audio_file: &Path) -> Option<LyricsResult> {
    // The raw text of the first timestampless `.lrc` seen, held as a last
    // resort while better candidates are still possible.
    let mut lrc_plain_fallback: Option<String> = None;

    for candidate in candidate_paths(audio_file) {
        let Some(raw) = read_candidate(&candidate).await else {
            continue;
        };
        let content = normalize_newlines(strip_bom(&raw));

        let is_lrc = candidate
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("lrc"));

        if !is_lrc {
            tracing::debug!(candidate = %candidate.display(), "loaded plain lyrics");
            return Some(LyricsResult {
                synced: None,
                plain: Some(strip_lyrics_header(&content)),
                source: Some(LyricsSource::LocalTxt),
            });
        }

        let synced = parse_lrc(&content);
        if !synced.is_empty() {
            tracing::debug!(candidate = %candidate.display(), "loaded synced lyrics");
            return Some(LyricsResult {
                synced: Some(synced),
                plain: None,
                source: Some(LyricsSource::LocalLrc),
            });
        }

        if lrc_plain_fallback.is_none() {
            tracing::debug!(
                candidate = %candidate.display(),
                "`.lrc` had no timestamps, keeping it as a fallback"
            );
            lrc_plain_fallback = Some(content);
        }
    }

    // Nothing better turned up, so show the timestampless `.lrc` as plain text.
    // It keeps its `local-lrc` source: the file the user edited is what the
    // result came from, whatever it turned out to contain.
    lrc_plain_fallback.map(|plain| LyricsResult {
        synced: None,
        plain: Some(plain),
        source: Some(LyricsSource::LocalLrc),
    })
}

/// Read one candidate, distinguishing "not there" from "there but unreadable".
///
/// A missing file is the overwhelmingly common case and says nothing; anything
/// else is the "my lyrics file isn't detected" support ticket, so it is logged
/// at a level that survives into the shipped log.
async fn read_candidate(candidate: &Path) -> Option<String> {
    match tokio::fs::read_to_string(candidate).await {
        Ok(raw) => Some(raw),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
            ) =>
        {
            None
        }
        Err(error) => {
            tracing::warn!(
                candidate = %candidate.display(),
                %error,
                "failed to read a lyric file that exists"
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn strips_a_simple_header_with_a_blank_separator() {
        let input = "Artist: Gary Moore\nTitle: Still Got The Blues\n\nWoke up this morning";
        assert_eq!(strip_lyrics_header(input), "Woke up this morning");
    }

    #[test]
    fn returns_the_original_when_nothing_looks_like_a_header() {
        let input = "Just some lyrics\nSecond line";
        assert_eq!(strip_lyrics_header(input), input);
    }

    /// A file that is nothing but headers is still the only thing the user has.
    #[test]
    fn returns_the_original_when_the_whole_file_is_header_shaped() {
        let input = "Title: X\nArtist: Y";
        assert_eq!(strip_lyrics_header(input), input);
    }

    #[test]
    fn does_not_strip_section_markers() {
        let input = "[Chorus]\nSing a song";
        assert_eq!(strip_lyrics_header(input), input);
    }

    /// The reason the key list is an allowlist and not a `Key: value` shape.
    #[test]
    fn does_not_strip_duet_dialogue_lines() {
        let input = "He: Hello there\nShe: Hi\nTogether now";
        assert_eq!(strip_lyrics_header(input), input);
    }

    #[test]
    fn header_matching_is_case_insensitive() {
        assert_eq!(
            strip_lyrics_header("aRtIsT: Someone\n\nBody"),
            "Body".to_owned()
        );
    }

    /// A `Key:` with no value is not a header — it is much more likely a lyric.
    #[test]
    fn a_key_with_no_value_is_not_a_header() {
        let input = "Title:\nBody line";
        assert_eq!(strip_lyrics_header(input), input);
    }

    /// Past the width cap a `Key: value` line is body text holding a colon.
    #[test]
    fn an_over_long_header_line_stops_the_block() {
        let long = format!("Title: {}", "x".repeat(MAX_HEADER_LINE_LENGTH));
        let input = format!("{long}\n\nBody");
        assert_eq!(strip_lyrics_header(&input), input);
    }

    #[test]
    fn only_one_blank_separator_is_consumed() {
        assert_eq!(strip_lyrics_header("Title: X\n\n\nBody"), "\nBody");
    }

    #[test]
    fn trailing_whitespace_is_trimmed_from_the_stripped_body() {
        assert_eq!(strip_lyrics_header("Title: X\n\nBody\n\n  "), "Body");
    }

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("a temp dir")
    }

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("creating the parent dir");
        }
        fs::write(path, contents).expect("writing the fixture");
    }

    #[tokio::test]
    async fn loads_a_sibling_lrc_as_synced_lyrics() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.lrc"), "[00:01.00]Hello");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalLrc));
        assert_eq!(found.synced.as_ref().map(Vec::len), Some(1));
        assert!(found.plain.is_none());
    }

    #[tokio::test]
    async fn loads_a_sibling_txt_with_bom_crlf_and_header_stripped() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(
            &dir.path().join("Song.txt"),
            "\u{feff}Artist: Someone\r\n\r\nFirst line\r\nSecond line",
        );

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalTxt));
        assert_eq!(found.plain.as_deref(), Some("First line\nSecond line"));
    }

    #[tokio::test]
    async fn falls_back_to_plain_when_an_lrc_has_no_timestamps() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.lrc"), "Just words\nNo timestamps");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalLrc));
        assert_eq!(found.plain.as_deref(), Some("Just words\nNo timestamps"));
        assert!(found.synced.is_none());
    }

    /// The held-back fallback exists precisely so a real candidate can overtake
    /// it. A timestampless `.lrc` beside the track must lose to a `.txt`.
    #[tokio::test]
    async fn prefers_a_txt_over_a_timestampless_lrc() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.lrc"), "No timestamps here");
        write(&dir.path().join("Song.txt"), "The real lyrics");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalTxt));
        assert_eq!(found.plain.as_deref(), Some("The real lyrics"));
    }

    /// …and to a *timed* `.lrc` further down the candidate list.
    #[tokio::test]
    async fn a_timed_lrc_in_a_subfolder_beats_a_timestampless_sibling() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.lrc"), "No timestamps here");
        write(
            &dir.path().join("Lyrics").join("Song.lrc"),
            "[00:02.00]Timed",
        );

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalLrc));
        assert_eq!(found.synced.as_ref().map(Vec::len), Some(1));
    }

    #[tokio::test]
    async fn finds_lyrics_in_a_capitalised_subfolder() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Lyrics").join("Song.lrc"), "[00:01.00]Sub");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalLrc));
    }

    #[tokio::test]
    async fn finds_a_txt_in_a_lowercase_subfolder() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("lyrics").join("Song.txt"), "Sub plain");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalTxt));
        assert_eq!(found.plain.as_deref(), Some("Sub plain"));
    }

    #[tokio::test]
    async fn prefers_a_sibling_lrc_over_a_sibling_txt() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.lrc"), "[00:01.00]Timed");
        write(&dir.path().join("Song.txt"), "Plain");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.source, Some(LyricsSource::LocalLrc));
    }

    /// Matching is by basename. A `Lyrics.txt` sitting in the folder belongs to
    /// no track in particular and must not be adopted by all of them.
    #[tokio::test]
    async fn ignores_lyric_files_whose_basename_does_not_match() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Other.lrc"), "[00:01.00]Not mine");

        assert!(load_local_lyrics(&audio).await.is_none());
    }

    #[tokio::test]
    async fn returns_nothing_when_no_lyric_file_exists() {
        let dir = temp_dir();
        assert!(
            load_local_lyrics(&dir.path().join("Song.mp3"))
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn returns_a_header_only_txt_unchanged_rather_than_empty() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        write(&dir.path().join("Song.txt"), "Title: X\nArtist: Y");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.plain.as_deref(), Some("Title: X\nArtist: Y"));
    }

    /// A directory where a lyric file should be is `ENOTDIR`/`EISDIR` territory,
    /// not a crash and not a stopped search.
    #[tokio::test]
    async fn a_directory_in_a_candidate_slot_is_skipped() {
        let dir = temp_dir();
        let audio = dir.path().join("Song.mp3");
        fs::create_dir_all(dir.path().join("Song.lrc")).expect("creating the decoy dir");
        write(&dir.path().join("Song.txt"), "Real lyrics");

        let found = load_local_lyrics(&audio).await.expect("a result");
        assert_eq!(found.plain.as_deref(), Some("Real lyrics"));
    }

    #[test]
    fn the_candidate_order_is_lrc_everywhere_then_txt_everywhere() {
        let candidates = candidate_paths(Path::new("/music/Song.mp3"));
        let names: Vec<String> = candidates
            .iter()
            .map(|path| {
                path.strip_prefix("/music")
                    .unwrap_or(path)
                    .display()
                    .to_string()
                    .replace('\\', "/")
            })
            .collect();

        assert_eq!(
            names,
            vec![
                "Song.lrc",
                "Lyrics/Song.lrc",
                "lyrics/Song.lrc",
                "Song.txt",
                "Lyrics/Song.txt",
                "lyrics/Song.txt",
            ]
        );
    }

    /// A dotted title must keep everything but the final extension, or
    /// `Song. Pt. 2.mp3` would look for `Song. Pt.lrc`.
    #[test]
    fn only_the_final_extension_is_replaced() {
        let candidates = candidate_paths(Path::new("/music/Song. Pt. 2.mp3"));
        assert_eq!(
            candidates.first().and_then(|path| path.file_name()),
            Some(std::ffi::OsStr::new("Song. Pt. 2.lrc"))
        );
    }
}
