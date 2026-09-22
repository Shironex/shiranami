//! The embedded-tag source, against real tagged audio files.
//!
//! v1's suite mocked music-metadata's parsed output, so it asserted the shape
//! of a fixture object rather than that lyrics could actually be read out of a
//! file. These write real tags with `lofty` and read them back, which is what
//! catches the mapping this port had to get right: lofty routes ID3v2's `USLT`
//! to `ItemKey::UnsyncLyrics` and *not* to `ItemKey::Lyrics`, while Vorbis
//! reaches both. Reading only the latter would have found nothing in an mp3.

use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::prelude::{ItemKey, TagExt};
use lofty::tag::{Tag, TagType};
use shiranami_core::models::lyrics::LyricsSource;
use shiranami_integrations::lyrics::embedded::read_embedded_lyrics;

/// A copy of `name` in a temp dir, carrying `lyrics` in its lyrics tag.
fn tagged(directory: &Path, name: &str, tag_type: TagType, lyrics: &str) -> PathBuf {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    let destination = directory.join(name);
    std::fs::copy(&source, &destination).expect("copying the fixture");

    let mut tag = Tag::new(tag_type);
    // Both keys, because the two containers map them differently and a fixture
    // should exercise whichever the format actually supports.
    tag.insert_text(ItemKey::UnsyncLyrics, lyrics.to_owned());
    tag.insert_text(ItemKey::Lyrics, lyrics.to_owned());
    tag.save_to_path(&destination, WriteOptions::default())
        .expect("writing the lyrics tag");

    destination
}

fn temp() -> tempfile::TempDir {
    tempfile::tempdir().expect("a temp dir")
}

#[test]
fn reads_plain_lyrics_out_of_an_id3v2_tag() {
    let directory = temp();
    let path = tagged(
        directory.path(),
        "sine.mp3",
        TagType::Id3v2,
        "First line\nSecond line",
    );

    let found = read_embedded_lyrics(&path).expect("embedded lyrics");
    assert_eq!(found.source, Some(LyricsSource::Embedded));
    assert_eq!(found.plain.as_deref(), Some("First line\nSecond line"));
    assert!(found.synced.is_none());
}

#[test]
fn reads_plain_lyrics_out_of_a_vorbis_comment() {
    let directory = temp();
    let path = tagged(
        directory.path(),
        "sine.flac",
        TagType::VorbisComments,
        "Flac lyrics",
    );

    let found = read_embedded_lyrics(&path).expect("embedded lyrics");
    assert_eq!(found.plain.as_deref(), Some("Flac lyrics"));
}

/// The case that makes embedded *synced* lyrics work for most real files:
/// taggers routinely store a whole LRC document in the unsynchronised frame.
#[test]
fn parses_a_raw_lrc_document_stored_in_the_text_frame() {
    let directory = temp();
    let path = tagged(
        directory.path(),
        "sine.mp3",
        TagType::Id3v2,
        "[00:01.00]First\n[00:02.50]Second",
    );

    let found = read_embedded_lyrics(&path).expect("embedded lyrics");
    let synced = found.synced.expect("synced lines");

    assert_eq!(synced.len(), 2);
    assert_eq!(synced[0].time, 1.0);
    assert_eq!(synced[1].time, 2.5);
    assert_eq!(synced[1].text, "Second");
    assert!(found.plain.is_none());
}

/// LRC-*looking* text that yields no parseable lines falls back to plain,
/// rather than becoming an empty synced result the ladder would treat as a hit.
#[test]
fn lrc_looking_text_with_no_parseable_lines_falls_back_to_plain() {
    let directory = temp();
    // Passes the cheap sniff (`[d:dd.`) but every line fails the real parser,
    // because a timestamp must be followed by text.
    let path = tagged(directory.path(), "sine.mp3", TagType::Id3v2, "[00:01.00]");

    let found = read_embedded_lyrics(&path).expect("embedded lyrics");
    assert_eq!(found.plain.as_deref(), Some("[00:01.00]"));
    assert!(found.synced.is_none());
}

#[test]
fn a_file_with_no_lyrics_tag_yields_nothing() {
    let directory = temp();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sine.mp3");
    let path = directory.path().join("untagged.mp3");
    std::fs::copy(&source, &path).expect("copying the fixture");

    assert!(read_embedded_lyrics(&path).is_none());
}

/// An empty tag is absence, not an empty lyric — otherwise the ladder would
/// treat it as a hit and stop before the network.
#[test]
fn an_empty_lyrics_tag_yields_nothing() {
    let directory = temp();
    let path = tagged(directory.path(), "sine.mp3", TagType::Id3v2, "");

    assert!(read_embedded_lyrics(&path).is_none());
}

/// A file that is not audio is "no embedded lyrics", not a failure — the
/// caller's next move is the network either way.
#[test]
fn an_unreadable_file_yields_nothing() {
    let directory = temp();
    let path = directory.path().join("broken.mp3");
    std::fs::write(&path, b"not an mp3 at all").expect("writing the decoy");

    assert!(read_embedded_lyrics(&path).is_none());
}
