//! Deciding which fields a lookup is allowed to change.
//!
//! A direct port of `computeUpdatedFields` in
//! `apps/desktop/src/main/services/metadata-enrich-batch.ts`.
//!
//! The `only_missing` branch is subtler than it looks, and the asymmetry is
//! v1's, not an oversight:
//!
//! - **artist and album** are "missing" only when they equal the display
//!   sentinels `Unknown Artist` / `Unknown Album`. A wrong-but-present artist
//!   is left alone, because the user may have set it deliberately.
//! - **genre, year and track number** are "missing" when merely falsy, so `""`,
//!   `None` and `0` all qualify. These have no sentinel — absent is absent.
//!
//! Both branches also require the lookup's value to be truthy, so a match that
//! carries nothing for a field never blanks it. Enrichment can only fill or
//! replace; it can never empty.

use shiranami_core::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};

use crate::enrich::model::{EnrichTrackInput, EnrichUpdatedFields};
use crate::lookup::MetadataLookupResult;

/// Work out what to change about `track`, given `lookup`.
pub fn compute_updated_fields(
    track: &EnrichTrackInput,
    lookup: &MetadataLookupResult,
    only_missing: bool,
) -> EnrichUpdatedFields {
    let mut fields = EnrichUpdatedFields::default();

    if only_missing {
        if track.artist == UNKNOWN_ARTIST {
            fields.artist = non_empty(lookup.artist.as_deref());
        }
        if track.album == UNKNOWN_ALBUM {
            fields.album = non_empty(lookup.album.as_deref());
        }
        if track.genre.is_empty() {
            fields.genre = non_empty(lookup.genre.as_deref());
        }
        // `!track.year` in JavaScript, so a stored `0` counts as missing too.
        if track.year.is_none_or(|year| year == 0) {
            fields.year = truthy(lookup.year);
        }
        if track.track_number.is_none_or(|number| number == 0) {
            fields.track_number = truthy(lookup.track_number);
        }
    } else {
        // Unconditional overwrite, subject only to the lookup having a value.
        // It does not compare against what the track already holds.
        fields.artist = non_empty(lookup.artist.as_deref());
        fields.album = non_empty(lookup.album.as_deref());
        fields.genre = non_empty(lookup.genre.as_deref());
        fields.year = truthy(lookup.year);
        fields.track_number = truthy(lookup.track_number);
    }

    fields
}

/// Whether a cover should be fetched for this track.
///
/// v1: `const needsCover = options.onlyMissing ? !track.albumArt : true;` — so
/// `only_missing` gates the *download*, and once a cover has been obtained the
/// result always carries it.
pub fn needs_cover(track: &EnrichTrackInput, only_missing: bool) -> bool {
    if only_missing {
        track
            .album_art
            .as_ref()
            .is_none_or(|value| value.is_empty())
    } else {
        true
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value.filter(|value| !value.is_empty()).map(str::to_owned)
}

fn truthy(value: Option<i32>) -> Option<i32> {
    value.filter(|value| *value != 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lookup::LookupSource;

    fn track() -> EnrichTrackInput {
        EnrichTrackInput {
            id: "00000000-0000-4000-8000-000000000001".to_owned(),
            file_path: "/music/song.mp3".into(),
            title: "My Song".to_owned(),
            artist: UNKNOWN_ARTIST.to_owned(),
            album: UNKNOWN_ALBUM.to_owned(),
            album_art: None,
            genre: String::new(),
            year: None,
            track_number: None,
        }
    }

    fn lookup() -> MetadataLookupResult {
        MetadataLookupResult {
            title: Some("Found Title".to_owned()),
            artist: Some("Found Artist".to_owned()),
            album: Some("Found Album".to_owned()),
            genre: Some("Found Genre".to_owned()),
            year: Some(2020),
            track_number: Some(5),
            cover_image_url: Some("https://example.com/cover.jpg".to_owned()),
            source: LookupSource::Itunes,
            confidence: 0.9,
        }
    }

    #[test]
    fn only_missing_fills_every_empty_field() {
        let fields = compute_updated_fields(&track(), &lookup(), true);

        assert_eq!(fields.artist.as_deref(), Some("Found Artist"));
        assert_eq!(fields.album.as_deref(), Some("Found Album"));
        assert_eq!(fields.genre.as_deref(), Some("Found Genre"));
        assert_eq!(fields.year, Some(2020));
        assert_eq!(fields.track_number, Some(5));
    }

    #[test]
    fn only_missing_leaves_populated_fields_alone() {
        let mut track = track();
        track.artist = "Real Artist".to_owned();
        track.genre = "Real Genre".to_owned();
        track.year = Some(1999);
        track.track_number = Some(2);

        let fields = compute_updated_fields(&track, &lookup(), true);

        assert_eq!(fields.artist, None, "a set artist must survive");
        assert_eq!(fields.genre, None);
        assert_eq!(fields.year, None);
        assert_eq!(fields.track_number, None);
        // The album is still the sentinel, so it is still filled.
        assert_eq!(fields.album.as_deref(), Some("Found Album"));
    }

    #[test]
    fn only_missing_treats_artist_and_album_by_sentinel_not_by_emptiness() {
        // The asymmetry that matters: an artist of `""` is *not* missing, and
        // an artist of "Unknown Artist" is. v1 compares to the sentinel.
        let mut track = track();
        track.artist = String::new();
        track.album = String::new();

        let fields = compute_updated_fields(&track, &lookup(), true);

        assert_eq!(
            fields.artist, None,
            "an empty-but-not-sentinel artist is left alone"
        );
        assert_eq!(fields.album, None);
    }

    #[test]
    fn overwrite_mode_replaces_everything_the_lookup_carries() {
        let mut track = track();
        track.artist = "Real Artist".to_owned();
        track.album = "Real Album".to_owned();
        track.genre = "Real Genre".to_owned();
        track.year = Some(1999);
        track.track_number = Some(2);

        let fields = compute_updated_fields(&track, &lookup(), false);

        assert_eq!(fields.artist.as_deref(), Some("Found Artist"));
        assert_eq!(fields.album.as_deref(), Some("Found Album"));
        assert_eq!(fields.genre.as_deref(), Some("Found Genre"));
        assert_eq!(fields.year, Some(2020));
        assert_eq!(fields.track_number, Some(5));
    }

    #[test]
    fn a_lookup_with_nothing_to_say_never_blanks_a_field() {
        let mut track = track();
        track.artist = "Real Artist".to_owned();

        let empty = MetadataLookupResult {
            source: LookupSource::Itunes,
            ..MetadataLookupResult::none()
        };
        let fields = compute_updated_fields(&track, &empty, false);

        assert!(
            fields.is_empty(),
            "enrichment can fill or replace, never empty"
        );
    }

    #[test]
    fn the_title_is_never_proposed() {
        // `EnrichUpdatedFields` has no title field at all, which is the
        // structural version of v1's omission. This test exists so the reason
        // is recorded next to the behaviour: enrichment must not rename a
        // track, because the title is also the search term.
        let fields = compute_updated_fields(&track(), &lookup(), false);

        assert_eq!(fields.album_art, None, "art is set later, not here");
        assert_eq!(fields.artist.as_deref(), Some("Found Artist"));
    }

    #[test]
    fn a_cover_is_wanted_when_the_track_has_none() {
        let mut track = track();
        assert!(needs_cover(&track, true));

        track.album_art = Some("shiranami-art://art/x.jpg".to_owned());
        assert!(!needs_cover(&track, true));
        assert!(
            needs_cover(&track, false),
            "overwrite mode always fetches a cover"
        );
    }

    #[test]
    fn a_zero_year_counts_as_missing() {
        // JavaScript's `!track.year` is true for 0, and the column is nullable
        // rather than sentinel-defaulted, so a 0 can be in there.
        let mut track = track();
        track.year = Some(0);
        track.track_number = Some(0);

        let fields = compute_updated_fields(&track, &lookup(), true);

        assert_eq!(fields.year, Some(2020));
        assert_eq!(fields.track_number, Some(5));
    }
}
