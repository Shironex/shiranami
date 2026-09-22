//! The analysis measurements on the track row: tempo, key, and the batched
//! write the one-pass engine uses.
//!
//! Split from `repo_tracks.rs` — these columns arrived with migration `0003`
//! and the v2 analysis engine, not with v1's thirteen channels, and the
//! module-shape cap is the mechanical reminder that they are a different job.
//! The loudness siblings stay in `repo_tracks.rs` because `loudness_lufs` is
//! ported v1 surface.

#[path = "support/library.rs"]
mod library;

use shiranami_db::repo::tracks;

use library::{add_track, fresh};

#[tokio::test]
async fn a_new_track_has_an_empty_analysis_state() {
    // A fresh import carries no analysis at all, and the engine's skip test
    // reads all three measurements in one row read.
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/unanalysed.mp3", "Unanalysed").await;

    let state = tracks::analysis_state(library.conn(), &id)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(state, tracks::TrackAnalysisState::default());
}

/// "No such track" is `None` for the whole struct — the batch treats it as
/// unmeasured work to attempt, exactly as `loudness_lufs` does.
#[tokio::test]
async fn an_unknown_track_has_no_analysis_state() {
    let mut library = fresh().await;

    assert_eq!(
        tracks::analysis_state(library.conn(), "11111111-1111-4111-8111-111111111111")
            .await
            .expect("read"),
        None
    );
}

#[tokio::test]
async fn recorded_tempo_and_key_read_back_through_state_and_row() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/analysed.mp3", "Analysed").await;

    tracks::set_bpm_key(library.conn(), &id, Some(84.9), Some("A minor"))
        .await
        .expect("record");

    let state = tracks::analysis_state(library.conn(), &id)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(state.bpm, Some(84.9));
    assert_eq!(state.musical_key.as_deref(), Some("A minor"));
    assert_eq!(state.loudness_lufs, None);

    // The wire model carries both fields too.
    let row = &tracks::get_all(library.conn()).await.expect("read")[0];
    assert_eq!(row.bpm, Some(84.9));
    assert_eq!(row.musical_key.as_deref(), Some("A minor"));
}

/// One dimension detectable, the other not: `None` writes `NULL`, the honest
/// "analysed, nothing detectable" state, without a sentinel.
#[tokio::test]
async fn a_partial_estimate_stores_null_for_the_undetectable_half() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/ambient.mp3", "Ambient").await;

    tracks::set_bpm_key(library.conn(), &id, None, Some("C major"))
        .await
        .expect("record");

    let state = tracks::analysis_state(library.conn(), &id)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(state.bpm, None);
    assert_eq!(state.musical_key.as_deref(), Some("C major"));
}

/// Writing to a deleted id is a no-op, not an error — the loudness write's
/// contract, kept.
#[tokio::test]
async fn recording_bpm_key_against_an_unknown_track_is_a_no_op() {
    let mut library = fresh().await;

    tracks::set_bpm_key(
        library.conn(),
        "11111111-1111-4111-8111-111111111111",
        Some(120.0),
        Some("C major"),
    )
    .await
    .expect("the write is a no-op rather than a failure");
}

/// The measurement write leaves tags and `updated_at` alone, as loudness does.
#[tokio::test]
async fn recording_bpm_key_leaves_every_other_column_alone() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/tagged2.mp3", "Tagged Two").await;

    let before = tracks::get_all(library.conn()).await.expect("read");
    tracks::set_bpm_key(library.conn(), &id, Some(96.0), Some("F# minor"))
        .await
        .expect("record");
    let after = tracks::get_all(library.conn()).await.expect("read");

    let (before, after) = (&before[0], &after[0]);
    assert_eq!(before.title, after.title);
    assert_eq!(before.file_path, after.file_path);
    assert_eq!(before.loudness_lufs, after.loudness_lufs);
    assert_eq!(before.updated_at, after.updated_at);
    assert_eq!(after.bpm, Some(96.0));
    assert_eq!(after.musical_key.as_deref(), Some("F# minor"));
}

/// The engine's chunked write path: one transaction covers many rows, a
/// `None` field leaves its columns untouched, and an unknown id inside the
/// batch is a no-op rather than a rollback.
#[tokio::test]
async fn record_analysis_many_writes_only_what_each_track_measured() {
    let mut library = fresh().await;
    let with_everything = add_track(library.conn(), "/music/full.mp3", "Full").await;
    let loudness_only = add_track(library.conn(), "/music/quiet.mp3", "Quiet").await;

    // A pre-existing key that the batch does not touch must survive.
    tracks::set_bpm_key(library.conn(), &loudness_only, Some(70.0), Some("D minor"))
        .await
        .expect("pre-measure");

    tracks::record_analysis_many(
        library.conn(),
        &[
            tracks::AnalysisWrite {
                id: with_everything.clone(),
                loudness_lufs: Some(-11.5),
                bpm_key: Some((Some(128.0), Some("G major".to_owned()))),
            },
            tracks::AnalysisWrite {
                id: loudness_only.clone(),
                loudness_lufs: Some(-16.25),
                bpm_key: None,
            },
            tracks::AnalysisWrite {
                id: "11111111-1111-4111-8111-111111111111".to_owned(),
                loudness_lufs: Some(-9.0),
                bpm_key: None,
            },
        ],
    )
    .await
    .expect("the batch commits");

    let full = tracks::analysis_state(library.conn(), &with_everything)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(full.loudness_lufs, Some(-11.5));
    assert_eq!(full.bpm, Some(128.0));
    assert_eq!(full.musical_key.as_deref(), Some("G major"));

    let quiet = tracks::analysis_state(library.conn(), &loudness_only)
        .await
        .expect("read")
        .expect("the row exists");
    assert_eq!(quiet.loudness_lufs, Some(-16.25));
    assert_eq!(quiet.bpm, Some(70.0), "an untouched pair must survive");
    assert_eq!(quiet.musical_key.as_deref(), Some("D minor"));
}

#[tokio::test]
async fn record_analysis_many_with_nothing_to_write_is_a_no_op() {
    let mut library = fresh().await;

    tracks::record_analysis_many(library.conn(), &[])
        .await
        .expect("an empty batch is fine");
}
