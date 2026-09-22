//! What an enrich run decides to change, and whether it touches the file.
//!
//! The sibling of `enrich_batch.rs`, which covers the run mechanics. These
//! assertions are about outcomes per track: apply vs preview, the
//! `only_missing` gates, and the success semantics the renderer's persisted
//! skip list depends on.

#[path = "support/audio.rs"]
mod audio;
#[path = "support/enrich.rs"]
mod support;

use shiranami_metadata::enrich::{EnrichMode, EnrichOptions, EnrichStatus};
use shiranami_metadata::lookup::LookupSource;
use shiranami_metadata::read_metadata;
use support::{Reply, matching, run, run_with_data_dir, track};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn an_apply_run_writes_the_tags_to_the_file() {
    // v1 only ever asserted that its mocked writer was *called*. This drives
    // the whole batch and checks the bytes landed.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.mp3");

    let mut input = track(1, "Racing Into The Night");
    input.file_path = path.clone();

    let (results, recorder, _server) = run_with_data_dir(
        vec![Reply::ok(&matching("Racing Into The Night"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            mode: EnrichMode::Apply,
            write_to_file: true,
            only_missing: false,
        },
        &CancellationToken::new(),
        Some(directory.path()),
    )
    .await;

    assert!(results[0].success, "{:?}", results[0].error);
    assert_eq!(results[0].source, LookupSource::Itunes);
    assert!(recorder.count(EnrichStatus::Writing) >= 1);

    let metadata = read_metadata(&path, None).expect("the re-read succeeds");
    assert_eq!(metadata.artist, "Found Artist");
    assert_eq!(metadata.album, "Found Album");
    assert_eq!(metadata.genre, "Found Genre");
    assert_eq!(metadata.year, Some(2020));
    assert_eq!(metadata.track_number, Some(7));
    // The fixture carries no title frame, and enrichment writes none — so the
    // read still falls back to the filename. That fallback is the proof: had a
    // title been written, this would read "Racing Into The Night".
    assert_eq!(
        metadata.title, "sine",
        "enrichment must never write a title, because the title is also the search term"
    );
}

#[tokio::test]
async fn an_apply_run_leaves_the_album_artist_alone() {
    // Enrichment has no album-artist suggestion to make, and writing one would
    // fragment a various-artists album at grouping time.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.flac");

    let mut input = track(1, "Song");
    input.file_path = path.clone();

    let _ = run_with_data_dir(
        vec![Reply::ok(&matching("Song"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            mode: EnrichMode::Apply,
            write_to_file: true,
            only_missing: false,
        },
        &CancellationToken::new(),
        Some(directory.path()),
    )
    .await;

    let metadata = read_metadata(&path, None).expect("the re-read succeeds");
    assert_eq!(metadata.artist, "Found Artist");
    assert_eq!(
        metadata.album_artist, None,
        "enrichment proposed an album artist it was never given"
    );
}

#[tokio::test]
async fn a_preview_run_proposes_without_touching_the_file() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.mp3");
    let before = std::fs::read(&path).expect("the fixture is readable");

    let mut input = track(1, "Racing Into The Night");
    input.file_path = path.clone();

    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Racing Into The Night"))],
        std::slice::from_ref(&input),
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert!(results[0].success);
    assert_eq!(
        results[0].source,
        LookupSource::Preview,
        "a preview reports itself as one"
    );
    assert_eq!(
        results[0].updated_fields.artist.as_deref(),
        Some("Found Artist")
    );
    assert_eq!(
        std::fs::read(&path).expect("still readable"),
        before,
        "a preview must not write to the file"
    );
}

#[tokio::test]
async fn an_apply_run_without_write_to_file_leaves_the_file_alone() {
    // The third combination: the user accepted the changes, but the setting to
    // write them back into the file is off. The database still gets them.
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = audio::scratch(directory.path(), "sine.mp3");
    let before = std::fs::read(&path).expect("the fixture is readable");

    let mut input = track(1, "Song");
    input.file_path = path.clone();

    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Song"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            mode: EnrichMode::Apply,
            write_to_file: false,
            only_missing: false,
        },
        &CancellationToken::new(),
    )
    .await;

    assert!(results[0].success);
    assert_eq!(
        results[0].updated_fields.artist.as_deref(),
        Some("Found Artist"),
        "the change is still proposed for the database"
    );
    assert_eq!(std::fs::read(&path).expect("still readable"), before);
}

#[tokio::test]
async fn only_missing_leaves_a_populated_field_alone() {
    let mut input = track(1, "Racing Into The Night");
    input.artist = "The Real Artist".to_owned();
    input.genre = "Shoegaze".to_owned();

    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Racing Into The Night"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            only_missing: true,
            ..Default::default()
        },
        &CancellationToken::new(),
    )
    .await;

    let fields = &results[0].updated_fields;
    assert_eq!(fields.artist, None, "a set artist must survive");
    assert_eq!(fields.genre, None);
    // The album is still the sentinel, so it is filled.
    assert_eq!(fields.album.as_deref(), Some("Found Album"));
}

#[tokio::test]
async fn overwrite_mode_replaces_a_populated_field() {
    let mut input = track(1, "Song");
    input.artist = "The Real Artist".to_owned();
    input.genre = "Shoegaze".to_owned();

    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Song"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            only_missing: false,
            ..Default::default()
        },
        &CancellationToken::new(),
    )
    .await;

    let fields = &results[0].updated_fields;
    assert_eq!(fields.artist.as_deref(), Some("Found Artist"));
    assert_eq!(fields.genre.as_deref(), Some("Found Genre"));
}

#[tokio::test]
async fn a_match_that_proposes_nothing_still_succeeds() {
    // v1 states this in a comment: `success` is match presence, not field
    // count. A `false` here would land the track on the persisted skip list
    // and it would never be looked at again.
    let mut input = track(1, "Song");
    input.artist = "Found Artist".to_owned();
    input.album = "Found Album".to_owned();
    input.genre = "Found Genre".to_owned();
    input.year = Some(2020);
    input.track_number = Some(7);

    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Song"))],
        std::slice::from_ref(&input),
        EnrichOptions {
            only_missing: true,
            ..Default::default()
        },
        &CancellationToken::new(),
    )
    .await;

    assert!(results[0].updated_fields.is_empty());
    assert!(
        results[0].success,
        "a match that changes nothing still matched"
    );
}

#[tokio::test]
async fn a_low_confidence_match_is_rejected() {
    // iTunes returns something for almost any query; the 0.3 floor is what
    // stops a wrong album title being written over a correct one.
    let (results, _recorder, _server) = run(
        vec![Reply::ok(&matching("Something Totally Unrelated"))],
        &[track(1, "Racing Into The Night")],
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert!(!results[0].success);
    assert_eq!(results[0].source, LookupSource::None);
    assert_eq!(results[0].error.as_deref(), Some("No metadata found"));
}
