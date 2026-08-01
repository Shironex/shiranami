//! Applying [`WriteTagsOptions`] to a `lofty` tag.
//!
//! # The field mapping
//!
//! v1 needed three libraries and an ffmpeg subprocess to cover the formats, and
//! spelled the mapping out three times. `lofty`'s `ItemKey` is one spelling
//! that each container resolves natively, and it resolves to exactly the frames
//! v1 wrote:
//!
//! | Field         | `ItemKey`       | ID3v2 (mp3/wav) | Vorbis (flac/ogg/opus) | MP4 (m4a) |
//! | ------------- | --------------- | --------------- | ---------------------- | --------- |
//! | title         | `TrackTitle`    | `TIT2`          | `TITLE`                | `©nam`    |
//! | artist        | `TrackArtist`   | `TPE1`          | `ARTIST`               | `©ART`    |
//! | album artist  | `AlbumArtist`   | `TPE2`          | `ALBUMARTIST`          | `aART`    |
//! | album         | `AlbumTitle`    | `TALB`          | `ALBUM`                | `©alb`    |
//! | genre         | `Genre`         | `TCON`          | `GENRE`                | `©gen`    |
//! | year          | `RecordingDate` | `TDRC`†         | `DATE`                 | `©day`    |
//! | track number  | `TrackNumber`   | `TRCK`          | `TRACKNUMBER`          | `trkn`    |
//! | disc number   | `DiscNumber`    | `TPOS`          | `DISCNUMBER`           | `disk`    |
//! | cover         | picture         | `APIC` type 3   | `METADATA_BLOCK_PICTURE` | `covr`  |
//!
//! † v1's node-id3 wrote ID3v2.3's `TYER`. `lofty` models the year as v2.4's
//! `TDRC` and splits it back into `TYER`/`TDAT`/`TIME` when it writes a v2.3
//! tag — and upgrades `TYER` to `TDRC` on read. Both directions therefore match
//! v1, and music-metadata mapped both spellings onto `common.year` anyway.
//!
//! Every row is asserted against a real file in `tests/tag_roundtrip.rs`; the
//! table is documentation, the tests are the contract.

use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::ItemKey;
use lofty::tag::Tag;

use crate::write::options::{FieldEdit, WriteTagsOptions};

/// Apply every requested edit to `tag`.
///
/// Edits are applied in place onto the file's existing tag, so frames nobody
/// asked about survive. v1's FLAC path did the opposite — it rebuilt the whole
/// Vorbis comment block from the eight fields it knew, silently erasing
/// `REPLAYGAIN_*`, `MUSICBRAINZ_*`, `COMPOSER`, `ISRC` and every custom key.
/// Preserving them is a deliberate deviation, and the safe direction.
pub(crate) fn apply(tag: &mut Tag, options: &WriteTagsOptions) {
    text(tag, ItemKey::TrackTitle, options.title.clone());
    text(tag, ItemKey::TrackArtist, options.artist.clone());
    text(tag, ItemKey::AlbumArtist, options.album_artist.clone());
    text(tag, ItemKey::AlbumTitle, options.album.clone());
    text(tag, ItemKey::Genre, options.genre.clone());

    number(tag, ItemKey::RecordingDate, &options.year);
    number(tag, ItemKey::TrackNumber, &options.track_number);
    number(tag, ItemKey::DiscNumber, &options.disc_number);

    if let Some(cover) = &options.cover {
        set_cover(tag, cover);
    }
}

/// Set, clear or leave a text field.
fn text(tag: &mut Tag, key: ItemKey, edit: FieldEdit<String>) {
    match edit.normalized() {
        FieldEdit::Keep => {}
        FieldEdit::Clear => tag.remove_key(key),
        FieldEdit::Set(value) => {
            // `insert_text` replaces rather than appends, which is what a tag
            // editor means. It returns false for a key the container cannot
            // express; nothing in the table above is in that position, and
            // `tests/tag_roundtrip.rs` proves it per format.
            tag.insert_text(key, value);
        }
    }
}

/// Set, clear or leave a numeric field.
///
/// Numbers are written as bare decimal strings, never as `n/total`. v1 did the
/// same (`String(trackNumber)`), and writing a total the user never supplied
/// would invent data.
fn number(tag: &mut Tag, key: ItemKey, edit: &FieldEdit<i32>) {
    match edit {
        FieldEdit::Keep => {}
        FieldEdit::Clear => tag.remove_key(key),
        FieldEdit::Set(value) => {
            tag.insert_text(key, value.to_string());
        }
    }
}

/// Replace the embedded cover with `bytes`.
///
/// Written as picture type 3 (front cover) with the description v1 used, so a
/// file round-trips through both versions unchanged in that respect. Every
/// existing picture is removed first: leaving the old one behind would make
/// `picture[0]` — which is what the read path takes — nondeterministic.
fn set_cover(tag: &mut Tag, bytes: &[u8]) {
    let mime = sniff_mime(bytes);

    // `remove_picture_type` only removes the matching type, so a file holding a
    // back cover keeps it; that matches v1, whose ffmpeg path replaced the
    // attached picture and whose id3 path replaced the APIC.
    tag.remove_picture_type(PictureType::CoverFront);

    // `unchecked` skips lofty's own format validation, because `sniff_mime`
    // has already identified the bytes and the caller may legitimately be
    // embedding a format lofty has no parser for.
    tag.push_picture(
        Picture::unchecked(bytes.to_vec())
            .pic_type(PictureType::CoverFront)
            .mime_type(mime)
            // v1's node-id3 path wrote `description: 'Cover'`; the flac path
            // wrote an empty one. The ID3 spelling is kept because it is the
            // one a user is most likely to already have on disk.
            .description("Cover")
            .build(),
    );
}

/// Identify the image format from its magic bytes.
///
/// v1 took a MIME string from the caller and, on the enrich path, guessed it
/// from the URL (`url.includes('.png') ? 'image/png' : 'image/jpeg'`) — so a
/// PNG served from an extensionless URL was embedded as `image/jpeg`. Sniffing
/// removes that class of mistake, and the cache ignored the declared MIME
/// anyway.
fn sniff_mime(bytes: &[u8]) -> MimeType {
    match bytes {
        [0xFF, 0xD8, 0xFF, ..] => MimeType::Jpeg,
        [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, ..] => MimeType::Png,
        [b'G', b'I', b'F', b'8', ..] => MimeType::Gif,
        [b'B', b'M', ..] => MimeType::Bmp,
        [
            b'R',
            b'I',
            b'F',
            b'F',
            _,
            _,
            _,
            _,
            b'W',
            b'E',
            b'B',
            b'P',
            ..,
        ] => MimeType::Unknown("image/webp".to_owned()),
        // v1's default when it had nothing better, and the format the cache
        // stores everything as.
        _ => MimeType::Jpeg,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lofty::tag::TagType;

    fn tag_with_title(title: &str) -> Tag {
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::TrackTitle, title.to_owned());
        tag
    }

    #[test]
    fn keep_leaves_an_existing_value_alone() {
        let mut tag = tag_with_title("Original");
        apply(&mut tag, &WriteTagsOptions::default());

        assert_eq!(tag.get_string(ItemKey::TrackTitle), Some("Original"));
    }

    #[test]
    fn clear_removes_the_frame() {
        let mut tag = tag_with_title("Original");
        apply(
            &mut tag,
            &WriteTagsOptions {
                title: FieldEdit::Clear,
                ..Default::default()
            },
        );

        assert_eq!(tag.get_string(ItemKey::TrackTitle), None);
    }

    #[test]
    fn an_empty_string_clears_rather_than_storing_emptiness() {
        let mut tag = tag_with_title("Original");
        apply(
            &mut tag,
            &WriteTagsOptions {
                title: FieldEdit::Set(String::new()),
                ..Default::default()
            },
        );

        assert_eq!(tag.get_string(ItemKey::TrackTitle), None);
    }

    #[test]
    fn a_number_is_written_bare_not_as_a_fraction() {
        // v1 wrote `String(n)`. Emitting `7/12` would invent a total the user
        // never gave.
        let mut tag = Tag::new(TagType::Id3v2);
        apply(
            &mut tag,
            &WriteTagsOptions {
                track_number: FieldEdit::Set(7),
                disc_number: FieldEdit::Set(2),
                year: FieldEdit::Set(2024),
                ..Default::default()
            },
        );

        assert_eq!(tag.get_string(ItemKey::TrackNumber), Some("7"));
        assert_eq!(tag.get_string(ItemKey::DiscNumber), Some("2"));
        assert_eq!(tag.get_string(ItemKey::RecordingDate), Some("2024"));
    }

    #[test]
    fn a_number_is_never_written_as_the_literal_string_null() {
        // v1 has this exact test, guarding a real JavaScript footgun.
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::TrackNumber, "3".to_owned());
        apply(
            &mut tag,
            &WriteTagsOptions {
                track_number: FieldEdit::Clear,
                ..Default::default()
            },
        );

        assert_eq!(tag.get_string(ItemKey::TrackNumber), None);
    }

    #[test]
    fn foreign_items_survive_an_edit() {
        // The deviation from v1's FLAC path, asserted.
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.insert_text(ItemKey::Composer, "Someone".to_owned());
        tag.insert_text(ItemKey::TrackTitle, "Before".to_owned());

        apply(
            &mut tag,
            &WriteTagsOptions {
                title: FieldEdit::Set("After".to_owned()),
                ..Default::default()
            },
        );

        assert_eq!(tag.get_string(ItemKey::TrackTitle), Some("After"));
        assert_eq!(
            tag.get_string(ItemKey::Composer),
            Some("Someone"),
            "v1's FLAC writer erased every comment it did not know about"
        );
    }

    #[test]
    fn a_cover_replaces_the_previous_front_cover() {
        let mut tag = Tag::new(TagType::Id3v2);
        apply(
            &mut tag,
            &WriteTagsOptions {
                cover: Some(vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]),
                ..Default::default()
            },
        );
        assert_eq!(tag.picture_count(), 1);

        apply(
            &mut tag,
            &WriteTagsOptions {
                cover: Some(vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 9]),
                ..Default::default()
            },
        );

        assert_eq!(
            tag.picture_count(),
            1,
            "the old front cover was not replaced"
        );
        let picture = &tag.pictures()[0];
        assert_eq!(picture.pic_type(), PictureType::CoverFront);
        assert_eq!(picture.mime_type(), Some(&MimeType::Png));
    }

    #[test]
    fn the_image_format_is_sniffed_from_the_bytes() {
        assert_eq!(sniff_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), MimeType::Jpeg);
        assert_eq!(
            sniff_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            MimeType::Png
        );
        assert_eq!(sniff_mime(b"GIF89a...."), MimeType::Gif);
        assert_eq!(sniff_mime(b"BM......"), MimeType::Bmp);
        assert_eq!(
            sniff_mime(b"RIFF\0\0\0\0WEBPVP8 "),
            MimeType::Unknown("image/webp".to_owned())
        );
        // v1's fallback, for bytes nothing recognises.
        assert_eq!(sniff_mime(b"nonsense"), MimeType::Jpeg);
    }
}
