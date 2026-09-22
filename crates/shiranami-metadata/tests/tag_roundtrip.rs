//! Read → write → read round-trips against real files, one per container.
//!
//! Phase 9's done-criteria name three things this file proves: a tag round-trip
//! per format, that `albumArtist` never falls back to `artist`, and that art
//! extraction works against fixtures.
//!
//! The mapping table in `src/write/tags.rs` is documentation; these tests are
//! the contract. They assert the **on-disk frame identifiers** — `TPE2`,
//! `aART`, `ALBUMARTIST` — rather than just round-tripping through `ItemKey`,
//! because an `ItemKey` round-trip would pass even if lofty and v1 disagreed
//! about which frame the field lives in, and a v1 install reading a v2-written
//! file would then see nothing.

#[path = "support/audio.rs"]
mod audio;

use std::path::Path;

use lofty::file::TaggedFileExt;
use lofty::prelude::{Accessor, ItemKey};
use lofty::tag::Tag;
use shiranami_metadata::write::{FieldEdit, WriteTagsOptions, write_tags};
use shiranami_metadata::{read_metadata, read_metadata_or_placeholder};

/// Everything a full edit sets, so a round-trip covers every mapped field.
fn full_edit() -> WriteTagsOptions {
    WriteTagsOptions {
        title: FieldEdit::Set("Racing Into The Night".to_owned()),
        artist: FieldEdit::Set("YOASOBI".to_owned()),
        album_artist: FieldEdit::Set("Various Artists".to_owned()),
        album: FieldEdit::Set("THE BOOK".to_owned()),
        genre: FieldEdit::Set("J-Pop".to_owned()),
        year: FieldEdit::Set(2020),
        track_number: FieldEdit::Set(3),
        disc_number: FieldEdit::Set(2),
        cover: None,
    }
}

/// Assert that a logical field lands in the on-disk identifier v1 used, and
/// that the value survives a round-trip through it.
///
/// Three independent checks, because any one alone is weak. `map_key` proves
/// the *mapping* — that lofty resolves this field to the frame v1 wrote — but
/// says nothing about what reached the file. Searching the written bytes for
/// the identifier proves the frame really is on disk, but not that it holds the
/// right value. `get_string` closes the third side.
///
/// The reverse direction (`ItemKey::from_key`) is deliberately not used: ID3v2
/// maps `TRCK` to both `TrackNumber` and `TrackTotal`, so it is ambiguous for
/// exactly the fields most worth checking.
#[track_caller]
fn assert_frame(
    tag: &Tag,
    bytes: &[u8],
    tag_type: lofty::tag::TagType,
    key: ItemKey,
    frame: &str,
    expected: &str,
) {
    assert_eq!(
        key.map_key(tag_type),
        Some(frame),
        "{key:?} no longer maps to the {frame} identifier v1 wrote"
    );
    // MP4 atom names are four *bytes*, and the `©` in `©nam` is the single byte
    // 0xA9 on disk — not the two bytes UTF-8 would give it. Every identifier
    // here is Latin-1, so mapping each char to one byte is the on-disk form for
    // ID3 and Vorbis too.
    let on_disk: Vec<u8> = frame
        .chars()
        .map(|c| u8::try_from(u32::from(c)).expect("tag identifiers are Latin-1"))
        .collect();
    assert!(
        bytes.windows(on_disk.len()).any(|window| window == on_disk),
        "the {frame} identifier is not present in the written file"
    );
    assert_eq!(
        tag.get_string(key),
        Some(expected),
        "{frame} did not round-trip"
    );
}

fn primary_tag(path: &Path) -> Tag {
    let tagged = lofty::read_from_path(path).expect("the written file re-reads");
    tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .cloned()
        .expect("the written file carries a tag")
}

#[test]
fn every_container_round_trips_a_full_edit() {
    let directory = tempfile::tempdir().expect("a temp dir");

    let mut paths: Vec<_> = audio::CONTAINERS
        .iter()
        .map(|(name, _)| audio::scratch(directory.path(), name))
        .collect();
    // v1 could not write WAV at all and answered `success: true` anyway; v2
    // can, so it is held to the same standard as the rest.
    paths.push(audio::wav(directory.path(), "sine.wav"));

    for path in paths {
        let name = path.file_name().expect("a filename").to_string_lossy();

        write_tags(&path, &full_edit(), None)
            .unwrap_or_else(|error| panic!("{name}: the write failed: {error}"));

        let metadata = read_metadata(&path, None)
            .unwrap_or_else(|error| panic!("{name}: the re-read failed: {error}"));

        assert_eq!(metadata.title, "Racing Into The Night", "{name}: title");
        assert_eq!(metadata.artist, "YOASOBI", "{name}: artist");
        assert_eq!(
            metadata.album_artist.as_deref(),
            Some("Various Artists"),
            "{name}: album artist"
        );
        assert_eq!(metadata.album, "THE BOOK", "{name}: album");
        assert_eq!(metadata.genre, "J-Pop", "{name}: genre");
        assert_eq!(metadata.year, Some(2020), "{name}: year");
        assert_eq!(metadata.track_number, Some(3), "{name}: track number");
        assert_eq!(metadata.disc_number, Some(2), "{name}: disc number");
    }
}

#[test]
fn the_id3_frames_are_the_ones_v1_wrote() {
    // v1's node-id3 mapping: title→TIT2, artist→TPE1, performerInfo→TPE2,
    // album→TALB, genre→TCON, trackNumber→TRCK, partOfSet→TPOS.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.mp3");
    write_tags(&path, &full_edit(), None).expect("the write succeeds");

    let bytes = std::fs::read(&path).expect("the written file is readable");
    let tagged = lofty::read_from_path(&path).expect("the file re-reads");
    let id3 = tagged
        .tag(lofty::tag::TagType::Id3v2)
        .expect("an mp3 carries an ID3v2 tag");

    for (key, frame, expected) in [
        (ItemKey::TrackTitle, "TIT2", "Racing Into The Night"),
        (ItemKey::TrackArtist, "TPE1", "YOASOBI"),
        (ItemKey::AlbumArtist, "TPE2", "Various Artists"),
        (ItemKey::AlbumTitle, "TALB", "THE BOOK"),
        (ItemKey::Genre, "TCON", "J-Pop"),
        (ItemKey::TrackNumber, "TRCK", "3"),
        (ItemKey::DiscNumber, "TPOS", "2"),
    ] {
        assert_frame(
            id3,
            &bytes,
            lofty::tag::TagType::Id3v2,
            key,
            frame,
            expected,
        );
    }
}

#[test]
fn the_mp4_atoms_are_the_ones_v1_wrote() {
    // v1 reached these through ffmpeg's `-metadata album_artist=…`, which its
    // MP4 muxer writes as `aART`. The atom is what a v1 install reads back.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.m4a");
    write_tags(&path, &full_edit(), None).expect("the write succeeds");

    let bytes = std::fs::read(&path).expect("the written file is readable");
    let tagged = lofty::read_from_path(&path).expect("the file re-reads");
    let ilst = tagged
        .tag(lofty::tag::TagType::Mp4Ilst)
        .expect("an m4a carries an ilst");

    for (key, atom, expected) in [
        (ItemKey::TrackTitle, "\u{a9}nam", "Racing Into The Night"),
        (ItemKey::TrackArtist, "\u{a9}ART", "YOASOBI"),
        (ItemKey::AlbumArtist, "aART", "Various Artists"),
        (ItemKey::AlbumTitle, "\u{a9}alb", "THE BOOK"),
        (ItemKey::Genre, "\u{a9}gen", "J-Pop"),
    ] {
        assert_frame(
            ilst,
            &bytes,
            lofty::tag::TagType::Mp4Ilst,
            key,
            atom,
            expected,
        );
    }

    // `trkn` and `disk` are binary atoms rather than text frames, so they are
    // checked through the read path instead of `get_string`.
    let metadata = read_metadata(&path, None).expect("the re-read succeeds");
    assert_eq!(metadata.track_number, Some(3));
    assert_eq!(metadata.disc_number, Some(2));
}

#[test]
fn the_vorbis_comments_are_the_ones_v1_wrote() {
    // v1's flac-tagger upper-cased every key it wrote, and ffmpeg's Ogg muxer
    // wrote ALBUMARTIST/TRACKNUMBER/DISCNUMBER upper-case too.
    let directory = tempfile::tempdir().expect("a temp dir");

    for name in ["sine.flac", "sine.ogg"] {
        let path = audio::scratch(directory.path(), name);
        write_tags(&path, &full_edit(), None).expect("the write succeeds");

        let bytes = std::fs::read(&path).expect("the written file is readable");
        let tagged = lofty::read_from_path(&path).expect("the file re-reads");
        let vorbis = tagged
            .tag(lofty::tag::TagType::VorbisComments)
            .expect("a Vorbis container carries comments");

        for (key, comment, expected) in [
            (ItemKey::TrackTitle, "TITLE", "Racing Into The Night"),
            (ItemKey::TrackArtist, "ARTIST", "YOASOBI"),
            (ItemKey::AlbumArtist, "ALBUMARTIST", "Various Artists"),
            (ItemKey::AlbumTitle, "ALBUM", "THE BOOK"),
            (ItemKey::Genre, "GENRE", "J-Pop"),
            (ItemKey::TrackNumber, "TRACKNUMBER", "3"),
            (ItemKey::DiscNumber, "DISCNUMBER", "2"),
            (ItemKey::RecordingDate, "DATE", "2020"),
        ] {
            assert_frame(
                vorbis,
                &bytes,
                lofty::tag::TagType::VorbisComments,
                key,
                comment,
                expected,
            );
        }
    }
}

#[test]
fn an_untouched_frame_survives_a_partial_edit() {
    // The read-modify-write property. v1's FLAC path failed this outright.
    let directory = tempfile::tempdir().expect("a temp dir");

    for (name, _) in audio::CONTAINERS {
        let path = audio::scratch(directory.path(), name);
        write_tags(&path, &full_edit(), None).expect("the first write succeeds");

        write_tags(
            &path,
            &WriteTagsOptions {
                title: FieldEdit::Set("Renamed".to_owned()),
                ..Default::default()
            },
            None,
        )
        .expect("the second write succeeds");

        let metadata = read_metadata(&path, None).expect("the re-read succeeds");
        assert_eq!(metadata.title, "Renamed", "{name}");
        assert_eq!(metadata.artist, "YOASOBI", "{name}: artist was clobbered");
        assert_eq!(metadata.album, "THE BOOK", "{name}: album was clobbered");
        assert_eq!(
            metadata.track_number,
            Some(3),
            "{name}: track number was clobbered"
        );
    }
}

#[test]
fn a_foreign_comment_survives_a_flac_edit() {
    // v1's flac-tagger rebuilt the whole comment block from the eight fields it
    // knew, erasing REPLAYGAIN_*, MUSICBRAINZ_* and every custom key. This is
    // the deliberate deviation, pinned.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.flac");

    {
        let mut tagged = lofty::read_from_path(&path).expect("the fixture reads");
        let mut tag = tagged
            .remove(lofty::tag::TagType::VorbisComments)
            .unwrap_or_else(|| Tag::new(lofty::tag::TagType::VorbisComments));
        tag.insert_text(ItemKey::Composer, "Ayase".to_owned());
        tag.insert_text(ItemKey::Isrc, "JPXX01234567".to_owned());
        use lofty::prelude::TagExt as _;
        tag.save_to_path(&path, lofty::config::WriteOptions::default())
            .expect("the seed write succeeds");
    }

    write_tags(&path, &full_edit(), None).expect("the edit succeeds");

    let tag = primary_tag(&path);
    assert_eq!(tag.get_string(ItemKey::Composer), Some("Ayase"));
    assert_eq!(tag.get_string(ItemKey::Isrc), Some("JPXX01234567"));
    assert_eq!(
        tag.get_string(ItemKey::TrackTitle),
        Some("Racing Into The Night")
    );
}

#[test]
fn clearing_a_field_removes_it_from_every_container() {
    let directory = tempfile::tempdir().expect("a temp dir");

    for (name, _) in audio::CONTAINERS {
        let path = audio::scratch(directory.path(), name);
        write_tags(&path, &full_edit(), None).expect("the first write succeeds");

        write_tags(
            &path,
            &WriteTagsOptions {
                year: FieldEdit::Clear,
                track_number: FieldEdit::Clear,
                disc_number: FieldEdit::Clear,
                ..Default::default()
            },
            None,
        )
        .expect("the clear succeeds");

        let metadata = read_metadata(&path, None).expect("the re-read succeeds");
        assert_eq!(metadata.year, None, "{name}: year survived a clear");
        assert_eq!(metadata.track_number, None, "{name}: track number survived");
        assert_eq!(metadata.disc_number, None, "{name}: disc number survived");
        // The rest is untouched, so a clear is not a reset.
        assert_eq!(metadata.artist, "YOASOBI", "{name}");
    }
}

#[test]
fn album_artist_never_falls_back_to_artist() {
    // A Phase 9 done-criterion, stated in the plan as its own bullet. v1
    // carries a comment explaining it: an untagged various-artists album would
    // otherwise take a per-track album artist and fragment into one album per
    // track at grouping time.
    let directory = tempfile::tempdir().expect("a temp dir");

    for (name, _) in audio::CONTAINERS {
        let path = audio::scratch(directory.path(), name);
        write_tags(
            &path,
            &WriteTagsOptions {
                artist: FieldEdit::Set("YOASOBI".to_owned()),
                ..Default::default()
            },
            None,
        )
        .expect("the write succeeds");

        let metadata = read_metadata(&path, None).expect("the read succeeds");
        assert_eq!(metadata.artist, "YOASOBI", "{name}");
        assert_eq!(
            metadata.album_artist, None,
            "{name}: album artist fell back to artist, which fragments albums"
        );
    }
}

#[test]
fn an_untagged_file_reads_as_the_unknown_sentinels() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::wav(directory.path(), "untitled.wav");

    let metadata = read_metadata(&path, None).expect("an untagged file still reads");

    assert_eq!(
        metadata.title, "untitled",
        "the filename is the title fallback"
    );
    assert_eq!(metadata.artist, shiranami_core::UNKNOWN_ARTIST);
    assert_eq!(metadata.album, shiranami_core::UNKNOWN_ALBUM);
    assert_eq!(metadata.album_artist, None);
    assert_eq!(metadata.genre, "");
    assert!(metadata.duration > 0.0, "the properties still parse");
}

#[test]
fn an_embedded_cover_is_extracted_into_the_art_cache() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let data_dir = directory.path().join("data");
    let cover = audio::jpeg_cover();

    for (name, _) in audio::CONTAINERS {
        let path = audio::scratch(directory.path(), name);

        let outcome = write_tags(
            &path,
            &WriteTagsOptions {
                cover: Some(cover.clone()),
                ..Default::default()
            },
            Some(&data_dir),
        )
        .unwrap_or_else(|error| panic!("{name}: embedding the cover failed: {error}"));

        let url = outcome
            .album_art_url
            .unwrap_or_else(|| panic!("{name}: no cache URL was returned"));
        assert!(url.starts_with("shiranami-art://art/"), "{name}: {url}");

        // And reading the file back finds the same cached entry, which is the
        // property the library scan depends on.
        let metadata = read_metadata(&path, Some(&data_dir))
            .unwrap_or_else(|error| panic!("{name}: the re-read failed: {error}"));
        assert_eq!(
            metadata.album_art.as_deref(),
            Some(url.as_str()),
            "{name}: extraction produced a different cache entry than embedding did"
        );
    }
}

#[test]
fn reading_without_a_data_dir_skips_cover_extraction() {
    // The enrich preview path: it wants the text fields and must not write into
    // the cache for a change the user has not accepted yet.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.mp3");
    write_tags(
        &path,
        &WriteTagsOptions {
            cover: Some(audio::jpeg_cover()),
            ..Default::default()
        },
        None,
    )
    .expect("the write succeeds");

    let metadata = read_metadata(&path, None).expect("the read succeeds");
    assert_eq!(metadata.album_art, None);
}

#[test]
fn a_directory_is_a_read_error_not_a_panic() {
    let directory = tempfile::tempdir().expect("a temp dir");

    assert!(read_metadata(directory.path(), None).is_err());
    assert_eq!(
        read_metadata_or_placeholder(directory.path(), None).artist,
        shiranami_core::UNKNOWN_ARTIST
    );
}

#[test]
fn a_duration_is_read_for_every_container() {
    // v1 did not pass `duration: true` to music-metadata, so a VBR MP3 with no
    // Xing header reported `0`. lofty computes it, which is strictly better and
    // is called out here so the difference is deliberate rather than noticed
    // later as a scan diff.
    let directory = tempfile::tempdir().expect("a temp dir");

    for (name, _) in audio::CONTAINERS {
        let path = audio::scratch(directory.path(), name);
        let metadata = read_metadata(&path, None).expect("the read succeeds");

        assert!(
            metadata.duration > 0.0,
            "{name}: duration came back as {}",
            metadata.duration
        );
    }
}

#[test]
fn the_accessor_and_the_read_path_agree() {
    // Guards the ItemKey choices in `read.rs` against lofty's own convenience
    // accessors, which resolve the same fields independently.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.flac");
    write_tags(&path, &full_edit(), None).expect("the write succeeds");

    let tag = primary_tag(&path);
    let metadata = read_metadata(&path, None).expect("the read succeeds");

    assert_eq!(tag.title().as_deref(), Some(metadata.title.as_str()));
    assert_eq!(tag.artist().as_deref(), Some(metadata.artist.as_str()));
    assert_eq!(tag.album().as_deref(), Some(metadata.album.as_str()));
    assert_eq!(tag.genre().as_deref(), Some(metadata.genre.as_str()));
}
