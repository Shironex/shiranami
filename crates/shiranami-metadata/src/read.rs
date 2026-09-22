//! Reading tags off a file into a [`TrackMetadata`].
//!
//! Ported from `parseAudioMetadata` in
//! `apps/desktop/src/main/services/metadata-service.ts` and its near-identical
//! twin `parseFile` in `apps/desktop/src/main/workers/scan-utility.ts`. The two
//! differed only in cover-error handling; v2 keeps the scan utility's, which
//! treats a failed cover write as a missing cover rather than downgrading the
//! whole track to a placeholder row.
//!
//! Every fallback here is v1's, reproduced operator-for-operator, because they
//! are what the grouping and display layers already assume. The two that look
//! like mistakes but are not:
//!
//! - **`album_artist` never falls back to `artist`.** v1 carries a comment
//!   explaining why, and Phase 9's done-criteria name it explicitly: an
//!   untagged various-artists album would otherwise get a per-track album
//!   artist and fragment into one album per track at grouping time. `None`
//!   means "untagged", which the grouping layer keys on the album title alone.
//! - **Track and disc numbers treat `0` as absent.** music-metadata's
//!   `normalizeTrack` ends in `parseInt(...) || null`, so a literal `TRCK: "0"`
//!   already arrived as `null` in v1 and the database has no zeroes in it.

use std::path::Path;

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::ItemKey;
use lofty::tag::Tag;
use shiranami_core::models::TrackMetadata;
use shiranami_core::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};

use crate::error::{MetadataError, Result};

/// Read a file's tags, saving any embedded cover into the art cache.
///
/// `data_dir` is the app data directory; the cover lands in its `album-art`
/// subdirectory and the returned `album_art` is the `shiranami-art://` URL for
/// it, exactly as v1 stored. Pass `None` to skip cover extraction entirely,
/// which is what a metadata-only read (an enrich preview, say) wants.
///
/// Unlike v1 this returns a real error when the file cannot be parsed. See
/// [`read_metadata_or_placeholder`] for v1's never-fails behaviour.
pub fn read_metadata(path: &Path, data_dir: Option<&Path>) -> Result<TrackMetadata> {
    let tagged = lofty::read_from_path(path).map_err(|error| MetadataError::tag(path, error))?;

    // v1 read `common.*`, which music-metadata populates by merging every tag
    // in the file. `primary_tag` is the container's native tag (ID3v2 in an
    // MP3, Vorbis comments in a FLAC); `first_tag` catches a file that only
    // carries a secondary one, e.g. an MP3 with nothing but ID3v1.
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let album_art = match (data_dir, tag) {
        (Some(data_dir), Some(tag)) => embedded_cover(tag, data_dir),
        _ => None,
    };

    Ok(TrackMetadata {
        title: tag
            .and_then(|tag| non_empty(tag.get_string(ItemKey::TrackTitle)))
            .unwrap_or_else(|| file_stem(path)),
        artist: tag
            .and_then(|tag| non_empty(tag.get_string(ItemKey::TrackArtist)))
            .unwrap_or_else(|| UNKNOWN_ARTIST.to_owned()),
        // The only trimmed field, and the only one that stays `None` rather
        // than taking a display fallback.
        album_artist: tag
            .and_then(|tag| tag.get_string(ItemKey::AlbumArtist))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
        album: tag
            .and_then(|tag| non_empty(tag.get_string(ItemKey::AlbumTitle)))
            .unwrap_or_else(|| UNKNOWN_ALBUM.to_owned()),
        duration: tagged.properties().duration().as_secs_f64(),
        // v1 took `common.genre[0]` — the first genre only, the rest discarded.
        genre: tag
            .and_then(|tag| non_empty(tag.get_string(ItemKey::Genre)))
            .unwrap_or_default(),
        year: tag.and_then(year_of),
        track_number: tag.and_then(|tag| leading_number(tag, ItemKey::TrackNumber)),
        disc_number: tag.and_then(|tag| leading_number(tag, ItemKey::DiscNumber)),
        album_art,
    })
}

/// v1's never-fails read: any parse failure becomes a filename-derived
/// placeholder row rather than an error.
///
/// A library scan walks thousands of files and one unreadable header must not
/// stop it, so this is what the scan pipeline calls. It is a separate function
/// rather than the default because a single-file read triggered by a user
/// action *should* be able to say what went wrong.
pub fn read_metadata_or_placeholder(path: &Path, data_dir: Option<&Path>) -> TrackMetadata {
    match read_metadata(path, data_dir) {
        Ok(metadata) => metadata,
        Err(error) => {
            tracing::warn!(%error, path = %path.display(), "failed to parse metadata");
            placeholder(path)
        }
    }
}

/// The row v1 produced for a file it could not parse.
fn placeholder(path: &Path) -> TrackMetadata {
    TrackMetadata {
        title: file_stem(path),
        artist: UNKNOWN_ARTIST.to_owned(),
        album_artist: None,
        album: UNKNOWN_ALBUM.to_owned(),
        duration: 0.0,
        genre: String::new(),
        year: None,
        track_number: None,
        disc_number: None,
        album_art: None,
    }
}

/// Extract and cache the embedded cover, if there is one.
///
/// **v1 takes `picture[0]` unconditionally** — no front-cover preference, no
/// MIME filtering, no size limit. That is reproduced rather than improved:
/// preferring `PictureType::CoverFront` would change which image a user sees
/// for any file whose first picture is a back cover or an artist photo, and
/// changing displayed art is a product decision, not a port decision. It is
/// noted here so the choice is deliberate rather than inherited by accident.
///
/// A cover that will not save is logged and dropped, matching the scan
/// utility's handling; the track still gets its text metadata.
fn embedded_cover(tag: &Tag, data_dir: &Path) -> Option<String> {
    let picture = tag.pictures().first()?;

    match crate::art::save_cover(data_dir, picture.data()) {
        Ok(url) => url,
        Err(error) => {
            tracing::warn!(%error, "failed to cache an embedded cover");
            None
        }
    }
}

/// The filename without its extension, which is v1's title fallback.
fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// `||`-style emptiness: v1 used `common.x || fallback`, so an empty tag value
/// takes the fallback rather than being stored as `""`.
fn non_empty(value: Option<&str>) -> Option<String> {
    value.filter(|value| !value.is_empty()).map(str::to_owned)
}

/// The year, from either the plain year tag or the leading four digits of a
/// full date.
///
/// music-metadata populated `common.year` from two mappings: ID3v2.3's `TYER`
/// parsed whole, and `TDRC` / `©day` / `DATE` parsed as `substr(0, 4)`. Both
/// are read here, and `0` becomes `None` because v1's `common.year || null`
/// discarded it.
fn year_of(tag: &Tag) -> Option<i32> {
    let raw = tag
        .get_string(ItemKey::Year)
        .or_else(|| tag.get_string(ItemKey::RecordingDate))?;

    let digits: String = raw.chars().take_while(char::is_ascii_digit).collect();
    let year = digits.parse::<i32>().ok()?;

    (year != 0).then_some(year)
}

/// The leading integer of a `"3"` or `"3/12"` style value, with `0` as absent.
///
/// Ported from music-metadata's `normalizeTrack`:
///
/// ```js
/// const split = origVal.toString().split('/');
/// return { no: Number.parseInt(split[0], 10) || null, ... };
/// ```
///
/// The `|| null` is why zero is absent, and the leading-digit parse is why
/// `parseInt` semantics (stop at the first non-digit) are reproduced rather
/// than Rust's stricter whole-string `parse`.
fn leading_number(tag: &Tag, key: ItemKey) -> Option<i32> {
    let raw = tag.get_string(key)?;
    let head = raw.split('/').next().unwrap_or_default().trim();

    let digits: String = head
        .strip_prefix('-')
        .map_or_else(|| head.to_owned(), |rest| format!("-{rest}"))
        .chars()
        .enumerate()
        .take_while(|(index, c)| c.is_ascii_digit() || (*index == 0 && *c == '-'))
        .map(|(_, c)| c)
        .collect();

    let value = digits.parse::<i32>().ok()?;
    (value != 0).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lofty::tag::TagType;

    fn tag_with(pairs: &[(ItemKey, &str)]) -> Tag {
        typed_tag_with(TagType::Id3v2, pairs)
    }

    fn typed_tag_with(tag_type: TagType, pairs: &[(ItemKey, &str)]) -> Tag {
        let mut tag = Tag::new(tag_type);
        for (key, value) in pairs {
            assert!(
                tag.insert_text(*key, (*value).to_owned()),
                "{key:?} is not a valid key for {tag_type:?}"
            );
        }
        tag
    }

    #[test]
    fn a_track_number_with_a_total_keeps_only_the_position() {
        let tag = tag_with(&[(ItemKey::TrackNumber, "3/12")]);
        assert_eq!(leading_number(&tag, ItemKey::TrackNumber), Some(3));
    }

    #[test]
    fn a_zero_track_number_reads_as_absent() {
        // music-metadata's `parseInt(...) || null` already did this, so no v1
        // database contains a zero and the port must not start producing them.
        let tag = tag_with(&[(ItemKey::TrackNumber, "0")]);
        assert_eq!(leading_number(&tag, ItemKey::TrackNumber), None);

        let with_total = tag_with(&[(ItemKey::TrackNumber, "0/12")]);
        assert_eq!(leading_number(&with_total, ItemKey::TrackNumber), None);
    }

    #[test]
    fn a_non_numeric_track_number_reads_as_absent() {
        let tag = tag_with(&[(ItemKey::TrackNumber, "A1")]);
        assert_eq!(leading_number(&tag, ItemKey::TrackNumber), None);
    }

    #[test]
    fn a_track_number_with_trailing_junk_parses_its_leading_digits() {
        // `parseInt` stops at the first non-digit rather than rejecting the
        // whole string, and some taggers write `"07 "` or `"7a"`.
        let tag = tag_with(&[(ItemKey::TrackNumber, "07a")]);
        assert_eq!(leading_number(&tag, ItemKey::TrackNumber), Some(7));
    }

    #[test]
    fn a_disc_number_uses_the_same_rules() {
        let tag = tag_with(&[(ItemKey::DiscNumber, "2/2")]);
        assert_eq!(leading_number(&tag, ItemKey::DiscNumber), Some(2));
    }

    #[test]
    fn a_full_date_yields_its_leading_year() {
        let tag = tag_with(&[(ItemKey::RecordingDate, "2024-03-15")]);
        assert_eq!(year_of(&tag), Some(2024));
    }

    #[test]
    fn a_vorbis_year_comment_is_read_directly() {
        // Vorbis and APE spell it `YEAR`; ID3v2 has no such key, because lofty
        // upgrades ID3v2.3's `TYER` into `TDRC` on read and hands it back as
        // `RecordingDate`. music-metadata mapped both onto `common.year` too,
        // so reading both spellings is what reproduces v1.
        let tag = typed_tag_with(TagType::VorbisComments, &[(ItemKey::Year, "1998")]);
        assert_eq!(year_of(&tag), Some(1998));
    }

    #[test]
    fn a_zero_year_reads_as_absent() {
        // v1's `common.year || null`.
        let tag = tag_with(&[(ItemKey::RecordingDate, "0")]);
        assert_eq!(year_of(&tag), None);
    }

    #[test]
    fn an_unparseable_year_reads_as_absent() {
        let tag = tag_with(&[(ItemKey::RecordingDate, "unknown")]);
        assert_eq!(year_of(&tag), None);
    }

    #[test]
    fn a_placeholder_row_is_named_after_the_file() {
        let row = placeholder(Path::new("/music/song.mp3"));

        assert_eq!(row.title, "song");
        assert_eq!(row.artist, UNKNOWN_ARTIST);
        assert_eq!(row.album, UNKNOWN_ALBUM);
        assert_eq!(row.album_artist, None);
        assert_eq!(row.duration, 0.0);
        assert_eq!(row.genre, "");
        assert_eq!(row.year, None);
        assert_eq!(row.track_number, None);
        assert_eq!(row.disc_number, None);
        assert_eq!(row.album_art, None);
    }

    #[test]
    fn an_empty_string_tag_takes_the_fallback() {
        // v1 used `||`, not `??`, so `""` is as absent as a missing tag.
        assert_eq!(non_empty(Some("")), None);
        assert_eq!(non_empty(Some("value")), Some("value".to_owned()));
        assert_eq!(non_empty(None), None);
    }

    #[test]
    fn an_unreadable_file_becomes_a_placeholder_rather_than_an_error() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let path = directory.path().join("broken.mp3");
        std::fs::write(&path, b"not audio").expect("the fixture writes");

        assert!(read_metadata(&path, None).is_err());
        assert_eq!(read_metadata_or_placeholder(&path, None).title, "broken");
    }

    #[test]
    fn an_album_artist_of_only_whitespace_is_absent() {
        let tag = tag_with(&[(ItemKey::AlbumArtist, "   ")]);

        let trimmed = tag
            .get_string(ItemKey::AlbumArtist)
            .map(str::trim)
            .filter(|value| !value.is_empty());

        assert_eq!(trimmed, None, "v1 trimmed this field and only this field");
    }
}
