//! The Spotify embed parser against v1's own fixture.
//!
//! Architecture §6 makes "`spotify-match` fixture reproduced" a done-criterion
//! for this phase, and §8 lists it among the golden fixtures. Every expectation
//! below is the one v1's `playlist.test.ts` asserted against the same bytes.
//!
//! # Why the file is copied into this crate
//!
//! `apps/desktop` is deleted at cutover (Phase 20) and this test has to keep
//! working afterwards — the same reasoning that put `v1-schema.json` in
//! `shiranami-db`'s fixtures. The copy is guarded: while v1's file still
//! exists, a test asserts the two are byte-identical, so the copy cannot drift
//! from the original during the handover window.

use std::path::{Path, PathBuf};

use shiranami_downloader::extract::{parse_embed_html, parse_playlist_name};

/// The repo root, from this crate's manifest.
fn repo_root() -> PathBuf {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .canonicalize()
        .expect("resolve the repo root")
}

/// The fixture, from this crate's own copy.
fn fixture() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/spotify-embed-playlist.html");
    std::fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!("read {}: {error}", path.display());
    })
}

#[test]
fn the_crate_fixture_is_byte_identical_to_v1s() {
    let v1 = repo_root().join("apps/desktop/src/main/ipc/__fixtures__/spotify-embed-playlist.html");

    // Absent only after Phase 20 deletes `apps/desktop`, at which point there
    // is no original left to drift from.
    let Ok(original) = std::fs::read(&v1) else {
        return;
    };

    let copy = std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/spotify-embed-playlist.html"),
    )
    .expect("read this crate's copy of the fixture");

    assert_eq!(
        original, copy,
        "this crate's fixture has drifted from v1's — the port's parity claim \
         rests on the two being the same bytes"
    );
}

#[test]
fn extracts_every_track_from_the_real_embed_next_data_fixture() {
    let tracks = parse_embed_html(&fixture());

    assert_eq!(tracks.len(), 3);
    assert_eq!(
        tracks
            .iter()
            .map(|track| track.title.as_str())
            .collect::<Vec<_>>(),
        vec!["Janice STFU", "Babydoll", "DAISIES"]
    );
}

#[test]
fn maps_the_artist_from_subtitle_never_unknown() {
    let tracks = parse_embed_html(&fixture());

    assert_eq!(
        tracks
            .iter()
            .map(|track| track.artist.as_str())
            .collect::<Vec<_>>(),
        vec!["Drake", "Dominic Fike", "Justin Bieber"],
        "the original bug read `artists[].name`, which this page does not \
         have, so every artist came back `Unknown`"
    );

    for track in &tracks {
        assert_ne!(track.artist, "Unknown");
    }
}

#[test]
fn converts_duration_milliseconds_to_rounded_seconds() {
    let tracks = parse_embed_html(&fixture());

    assert_eq!(
        tracks
            .iter()
            .map(|track| track.duration_sec)
            .collect::<Vec<_>>(),
        vec![Some(237.0), Some(98.0), Some(176.0)],
        "237344ms → 237, 97960ms → 98, 176453ms → 176"
    );
}

#[test]
fn omits_album_and_isrc_which_the_embed_does_not_carry() {
    let tracks = parse_embed_html(&fixture());
    let first = tracks.first().expect("the fixture has tracks");

    assert_eq!(first.album, None);
    assert_eq!(first.isrc, None);
}

#[test]
fn reads_the_playlist_name_from_the_next_data_entity() {
    assert_eq!(
        parse_playlist_name(&fixture()),
        Some("Today’s Top Hits".to_owned()),
        "the name carries a typographic apostrophe — reproduced verbatim, \
         because it is what the recreated playlist is called"
    );
}

#[test]
fn returns_nothing_when_the_page_carries_no_track_data() {
    assert!(parse_embed_html("<html><body>nothing here</body></html>").is_empty());
    assert_eq!(
        parse_playlist_name("<html><body>nothing</body></html>"),
        None
    );
}

#[test]
fn the_bracket_scanner_handles_a_page_with_no_next_data_at_all() {
    // v1's V4 regression: the old non-greedy regex stopped at the first `]` in
    // any nested array, so this yielded zero tracks.
    let html = r#"<html><body><script>
var data = {"trackList":[
  {"title":"Song One","subtitle":"Artist A","duration":180000,"contentRatings":{"labels":["EXPLICIT"]}},
  {"title":"Song Two","subtitle":"Artist B","duration":240000,"contentRatings":{"labels":[]}}
]}</script></body></html>"#;

    let tracks = parse_embed_html(html);

    assert_eq!(tracks.len(), 2);
    assert_eq!(
        tracks
            .iter()
            .map(|track| track.title.as_str())
            .collect::<Vec<_>>(),
        vec!["Song One", "Song Two"]
    );
    assert_eq!(
        tracks
            .iter()
            .map(|track| track.artist.as_str())
            .collect::<Vec<_>>(),
        vec!["Artist A", "Artist B"]
    );
}

#[test]
fn a_primary_parse_with_only_unknown_artists_falls_through_to_a_better_fallback() {
    // The exact starvation v1 suffered: `__NEXT_DATA__` parses, but every
    // artist is `Unknown`, so the ladder must keep descending rather than
    // accepting it.
    let html = r#"<html><script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"state":{"data":{"entity":{"trackList":[{"title":"Starved"}]}}}}}}
</script><script>{"trackList":[{"title":"Rescued","subtitle":"Real Artist"}]}</script></html>"#;

    let tracks = parse_embed_html(html);

    // The bracket scan sweeps the *whole page*, `__NEXT_DATA__` included, so it
    // collects both lists — and the ladder accepts that result because it now
    // contains a real artist. This is v1's behaviour exactly, and it is the
    // right one: the starved entry is a track the playlist really has, just one
    // whose artist the page did not name.
    assert_eq!(
        tracks
            .iter()
            .map(|track| (track.title.as_str(), track.artist.as_str()))
            .collect::<Vec<_>>(),
        vec![("Starved", "Unknown"), ("Rescued", "Real Artist")],
        "the ladder descends past a primary parse that produced no real \
         artist — the bug this replaced accepted it and starved the fallback"
    );
}

#[test]
fn an_all_unknown_result_is_still_returned_when_nothing_better_exists() {
    let html = r#"<html><script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"state":{"data":{"entity":{"trackList":[{"title":"Nameless"}]}}}}}}
</script></html>"#;

    let tracks = parse_embed_html(html);

    assert_eq!(
        tracks.len(),
        1,
        "a title with no artist is still something the matcher can search for"
    );
    assert_eq!(tracks[0].artist, "Unknown");
}
