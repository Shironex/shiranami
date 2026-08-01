//! Lyrics carried inside the audio file's own tags.
//!
//! Ported from `apps/desktop/src/main/services/embedded-lyrics.ts`, which read
//! music-metadata's `common.lyrics` array. `lofty` splits that array across two
//! surfaces, so this module reassembles it:
//!
//! | Source                              | v1 (music-metadata)   | v2 (`lofty`)                        |
//! | ----------------------------------- | --------------------- | ----------------------------------- |
//! | ID3v2 `SYLT` (synchronised)         | `entry.syncText[]`    | an unparsed [`Frame::Binary`]       |
//! | ID3v2 `USLT` (unsynchronised)       | `entry.text`          | [`ItemKey::UnsyncLyrics`]           |
//! | Vorbis `LYRICS`, MP4 `©lyr`, APE    | `entry.text`          | [`ItemKey::Lyrics`] + `UnsyncLyrics` |
//!
//! `SYLT` is the awkward one: lofty deliberately does not parse it into the
//! generic [`Tag`], because ID3v2 overloads nothing else onto `ItemKey::Lyrics`
//! and it declines to invent a conversion. Recovering it therefore needs the
//! *concrete* tag, which in turn needs the concrete file type — hence the
//! three-arm probe below over the ID3v2-carrying formats.
//!
//! Never fails: an unreadable or untagged file is "no embedded lyrics", which
//! is what lets the caller move on to the network. That is v1's behaviour and,
//! unlike the metadata-lookup case the Phase 9 amendment corrected, it is the
//! right one here — a tag parse failure is local and deterministic, not a
//! transient that a retry would resolve.

use std::path::Path;

use lofty::config::ParseOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::id3::v2::{Frame, Id3v2Tag, SynchronizedTextFrame, TimestampFormat};
use lofty::prelude::ItemKey;
use lofty::probe::Probe;
use shiranami_core::models::lyrics::{LyricLine, LyricsResult, LyricsSource};

use crate::lyrics::parse::parse_lrc;

/// Read lyrics embedded in `audio_file`'s tags, or `None` when there are none.
pub fn read_embedded_lyrics(audio_file: &Path) -> Option<LyricsResult> {
    // Synchronised lyrics win outright when present, exactly as v1's
    // `entries.find(e => e.syncText?.length)` did — a timed source is never
    // passed over for an untimed one.
    if let Some(synced) = read_synchronised(audio_file)
        && !synced.is_empty()
    {
        return Some(LyricsResult {
            synced: Some(synced),
            plain: None,
            source: Some(LyricsSource::Embedded),
        });
    }

    let text = longest_text_entry(audio_file)?;

    // Taggers routinely stuff a whole LRC document into the *unsynchronised*
    // frame. v1 sniffed for a timestamp and parsed it, which is what makes
    // embedded synced lyrics work at all for most real files.
    if looks_like_lrc(&text) {
        let lines = parse_lrc(&text);
        if !lines.is_empty() {
            return Some(LyricsResult {
                synced: Some(lines),
                plain: None,
                source: Some(LyricsSource::Embedded),
            });
        }
    }

    Some(LyricsResult {
        synced: None,
        plain: Some(text),
        source: Some(LyricsSource::Embedded),
    })
}

/// Whether `text` opens a line with something shaped like an LRC timestamp.
///
/// Ported from v1's `LRC_TIMESTAMP_RE`, which is deliberately looser than the
/// parser's own pattern: this only decides whether parsing is worth attempting,
/// and [`parse_lrc`] makes the real ruling.
fn looks_like_lrc(text: &str) -> bool {
    text.split('\n').any(|line| {
        let bytes = line.as_bytes();
        // `[d:dd.` or `[dd:dd.`, with `.` or `:` closing it.
        let Some(open) = bytes.iter().position(|byte| *byte == b'[') else {
            return false;
        };
        let rest = &bytes[open + 1..];
        let digits = rest.iter().take_while(|byte| byte.is_ascii_digit()).count();
        if !(1..=2).contains(&digits) || rest.get(digits) != Some(&b':') {
            return false;
        }
        let after = &rest[digits + 1..];
        after
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count()
            == 2
            && matches!(after.get(2), Some(b'.') | Some(b':'))
    })
}

/// The longest non-empty lyrics string across every tag in the file.
///
/// v1 sorted its text entries by length and took the first, on the reasoning
/// that a file carrying both a stub and a full lyric means the full one. Both
/// [`ItemKey`] variants are read because lofty maps ID3v2's `USLT` only to
/// `UnsyncLyrics`, while Vorbis and MP4 reach `Lyrics` as well.
fn longest_text_entry(audio_file: &Path) -> Option<String> {
    let tagged = match lofty::read_from_path(audio_file) {
        Ok(tagged) => tagged,
        Err(error) => {
            tracing::warn!(path = %audio_file.display(), %error, "failed to parse file for lyrics");
            return None;
        }
    };

    tagged
        .tags()
        .iter()
        .flat_map(|tag| {
            [ItemKey::Lyrics, ItemKey::UnsyncLyrics]
                .into_iter()
                .filter_map(move |key| tag.get_string(key))
        })
        .filter(|text| !text.is_empty())
        .max_by_key(|text| text.chars().count())
        .map(str::to_owned)
}

/// Timed lines from an ID3v2 `SYLT` frame, when the file has one.
fn read_synchronised(audio_file: &Path) -> Option<Vec<LyricLine>> {
    let tag = read_id3v2(audio_file)?;

    for frame in &tag {
        let Frame::Binary(binary) = frame else {
            continue;
        };
        if frame.id().as_str() != "SYLT" {
            continue;
        }

        let Ok(sylt) = SynchronizedTextFrame::parse(&binary.data, frame.flags()) else {
            tracing::debug!(path = %audio_file.display(), "SYLT frame did not parse");
            continue;
        };

        // Only millisecond timestamps are convertible. The alternative format
        // counts MPEG frames, which needs a frame rate this layer does not
        // have; v1's music-metadata reported milliseconds and nothing else, so
        // skipping is what reproduces it rather than inventing a scale.
        if sylt.timestamp_format != TimestampFormat::MS {
            tracing::debug!(
                path = %audio_file.display(),
                "SYLT frame uses MPEG-frame timestamps; skipping"
            );
            continue;
        }

        let mut lines: Vec<LyricLine> = sylt
            .content
            .iter()
            .map(|(at, text)| LyricLine {
                time: f64::from(*at) / 1000.0,
                text: text.clone(),
            })
            .collect();

        if !lines.is_empty() {
            lines.sort_by(|a, b| a.time.total_cmp(&b.time));
            return Some(lines);
        }
    }

    None
}

/// The concrete ID3v2 tag, for the formats that can carry one.
///
/// Needed only for `SYLT`; every other source is reachable through the generic
/// tag. The probe is cheap — it reads the file's magic, not its audio.
fn read_id3v2(audio_file: &Path) -> Option<Id3v2Tag> {
    use lofty::file::FileType;

    let probe = Probe::open(audio_file).ok()?.guess_file_type().ok()?;
    let file_type = probe.file_type()?;

    // ID3v2 lives in these three containers. Anything else cannot hold a SYLT
    // frame at all, so opening it a second time would be wasted work.
    if !matches!(file_type, FileType::Mpeg | FileType::Aiff | FileType::Wav) {
        return None;
    }

    let mut reader = std::fs::File::open(audio_file).ok()?;
    let options = ParseOptions::new();

    match file_type {
        FileType::Mpeg => lofty::mpeg::MpegFile::read_from(&mut reader, options)
            .ok()
            .and_then(|file| file.id3v2().cloned()),
        FileType::Aiff => lofty::iff::aiff::AiffFile::read_from(&mut reader, options)
            .ok()
            .and_then(|file| file.id3v2().cloned()),
        FileType::Wav => lofty::iff::wav::WavFile::read_from(&mut reader, options)
            .ok()
            .and_then(|file| file.id3v2().cloned()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_lrc_shaped_text() {
        assert!(looks_like_lrc("[01:23.45]Hello"));
        assert!(looks_like_lrc("[1:23.45]Hello"));
        assert!(looks_like_lrc("[00:05:12]Colon"));
        assert!(looks_like_lrc("first line\n[00:05.12]second"));
    }

    #[test]
    fn does_not_mistake_plain_text_or_section_markers_for_lrc() {
        assert!(!looks_like_lrc("Just some lyrics"));
        assert!(!looks_like_lrc("[Chorus]"));
        assert!(!looks_like_lrc(""));
        assert!(!looks_like_lrc("[123:45.67]too many minutes"));
        assert!(!looks_like_lrc("[01:2.45]too few seconds"));
    }

    /// A file that does not exist is "no embedded lyrics", not an error — the
    /// caller's next move is the network either way.
    #[test]
    fn a_missing_file_yields_nothing() {
        assert!(read_embedded_lyrics(Path::new("/nonexistent/track.mp3")).is_none());
    }

    #[test]
    fn a_file_that_is_not_audio_yields_nothing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("not-audio.mp3");
        std::fs::write(&path, b"this is not an mp3").expect("writing the fixture");

        assert!(read_embedded_lyrics(&path).is_none());
        assert!(read_id3v2(&path).is_none());
    }
}
