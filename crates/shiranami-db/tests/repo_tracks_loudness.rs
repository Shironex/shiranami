//! The tracks loudness surface against a real database — v1's single column
//! and F5's profile beside it.
//!
//! Split out of `repo_tracks.rs` when F5 landed, for the same module-shape
//! reason search got its own file. The properties pinned here: the skip test
//! reads what the run wrote, a v1 measurement is never overwritten, and a
//! backend measurement never masquerades as a user edit (`updated_at`).

#[path = "support/library.rs"]
mod library;

use shiranami_db::repo::tracks;
use shiranami_db::repo::tracks::LoudnessProfileUpdate;

use library::{add_track, fresh};

// ── loudness ──────────────────────────────────────────────────────────────────

/// The skip test `loudness:analyze` runs before measuring anything: a freshly
/// imported track has no measurement, and the column is what says so.
#[tokio::test]
async fn a_new_track_has_no_measured_loudness() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/unmeasured.mp3", "Unmeasured").await;

    assert_eq!(
        tracks::loudness_lufs(library.conn(), &id)
            .await
            .expect("read"),
        None
    );
}

#[tokio::test]
async fn a_recorded_measurement_reads_back() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/measured.mp3", "Measured").await;

    tracks::set_loudness_lufs(library.conn(), &id, -13.7)
        .await
        .expect("record");

    let stored = tracks::loudness_lufs(library.conn(), &id)
        .await
        .expect("read")
        .expect("a measurement");
    assert!((stored + 13.7).abs() < f64::EPSILON);
}

/// The analysis run reads this for a track the renderer named but the library
/// no longer holds. "Absent" and "unmeasured" answer the same, so a stale id is
/// work to attempt rather than something to crash on.
#[tokio::test]
async fn an_unknown_track_reads_as_unmeasured_rather_than_failing() {
    let mut library = fresh().await;

    assert_eq!(
        tracks::loudness_lufs(library.conn(), "11111111-1111-4111-8111-111111111111")
            .await
            .expect("read"),
        None
    );
}

/// Writing to an id that no longer exists is a no-op, not an error — a run that
/// measures a file whose row was deleted mid-batch must not abort.
#[tokio::test]
async fn recording_against_an_unknown_track_is_a_no_op() {
    let mut library = fresh().await;

    tracks::set_loudness_lufs(library.conn(), "11111111-1111-4111-8111-111111111111", -9.0)
        .await
        .expect("the write is a no-op rather than a failure");
}

/// `loudness_lufs` is the only column the write touches. A measurement must not
/// disturb the tags beside it, and must not bump `updated_at` — it is a backend
/// measurement, not a user edit.
#[tokio::test]
async fn recording_loudness_leaves_every_other_column_alone() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/tagged.mp3", "Tagged").await;

    let before = tracks::get_all(library.conn()).await.expect("read");
    tracks::set_loudness_lufs(library.conn(), &id, -8.25)
        .await
        .expect("record");
    let after = tracks::get_all(library.conn()).await.expect("read");

    let (before, after) = (&before[0], &after[0]);
    assert_eq!(before.title, after.title);
    assert_eq!(before.file_path, after.file_path);
    assert_eq!(before.play_count, after.play_count);
    assert_eq!(before.updated_at, after.updated_at);
    assert_eq!(after.loudness_lufs, Some(-8.25));
}

// ── the F5 profile ────────────────────────────────────────────────────────────

/// The full profile round-trips through the state read the analysis run's
/// skip test uses.
#[tokio::test]
async fn a_recorded_profile_reads_back_through_the_state() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/fresh.mp3", "Fresh").await;

    tracks::set_loudness_profile(
        library.conn(),
        &id,
        &LoudnessProfileUpdate {
            lufs: Some(-16.5),
            true_peak_db: Some(-1.2),
            loudness_range: Some(6.4),
        },
    )
    .await
    .expect("record");

    let state = tracks::loudness_state(library.conn(), &id)
        .await
        .expect("read")
        .expect("a known track has a state");
    assert_eq!(state.lufs, Some(-16.5));
    assert_eq!(state.true_peak_db, Some(-1.2));
    assert_eq!(
        state.album_loudness_lufs, None,
        "the fold writes this, not the profile"
    );

    let row = &tracks::get_all(library.conn()).await.expect("read")[0];
    assert_eq!(row.loudness_range, Some(6.4));
}

/// The continuity contract, at the SQL level: a v1-measured integrated value
/// survives a re-profile untouched while the v2-only columns land fresh.
#[tokio::test]
async fn a_v1_measurement_is_never_overwritten_by_a_profile() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/carried.mp3", "Carried").await;
    tracks::set_loudness_lufs(library.conn(), &id, -12.0)
        .await
        .expect("the v1-era measurement");

    tracks::set_loudness_profile(
        library.conn(),
        &id,
        &LoudnessProfileUpdate {
            lufs: Some(-12.4),
            true_peak_db: Some(-0.6),
            loudness_range: Some(4.1),
        },
    )
    .await
    .expect("re-profile");

    let state = tracks::loudness_state(library.conn(), &id)
        .await
        .expect("read")
        .expect("a state");
    assert_eq!(state.lufs, Some(-12.0), "COALESCE must keep the v1 value");
    assert_eq!(
        state.true_peak_db,
        Some(-0.6),
        "the v2 column is the fresh measurement"
    );
}

#[tokio::test]
async fn an_unknown_track_has_no_loudness_state() {
    let mut library = fresh().await;

    let state = tracks::loudness_state(library.conn(), "missing")
        .await
        .expect("the read succeeds");
    assert_eq!(state, None);
}

/// One value, many ids — the fold stamps a whole record at once, and only
/// that record.
#[tokio::test]
async fn album_loudness_is_stamped_onto_every_member_and_nothing_else() {
    let mut library = fresh().await;
    let first = add_track(library.conn(), "/music/a1.mp3", "Side A").await;
    let second = add_track(library.conn(), "/music/a2.mp3", "Side B").await;
    let outsider = add_track(library.conn(), "/music/b1.mp3", "Another Record").await;

    tracks::set_album_loudness(library.conn(), &[first.clone(), second.clone()], -13.7)
        .await
        .expect("stamp");

    let all = tracks::get_all(library.conn()).await.expect("read");
    let album_lufs = |id: &str| {
        all.iter()
            .find(|track| track.id == id)
            .expect("the track exists")
            .album_loudness_lufs
    };
    assert_eq!(album_lufs(&first), Some(-13.7));
    assert_eq!(album_lufs(&second), Some(-13.7));
    assert_eq!(album_lufs(&outsider), None);
}

/// Like the single-column write, the profile is a backend measurement: the
/// tags beside it and `updated_at` stay exactly as they were.
#[tokio::test]
async fn recording_a_profile_leaves_every_other_column_alone() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/tagged.mp3", "Tagged").await;

    let before = tracks::get_all(library.conn()).await.expect("read");
    tracks::set_loudness_profile(
        library.conn(),
        &id,
        &LoudnessProfileUpdate {
            lufs: Some(-9.0),
            true_peak_db: Some(0.3),
            loudness_range: None,
        },
    )
    .await
    .expect("record");
    let after = tracks::get_all(library.conn()).await.expect("read");

    let (before, after) = (&before[0], &after[0]);
    assert_eq!(before.title, after.title);
    assert_eq!(before.play_count, after.play_count);
    assert_eq!(before.updated_at, after.updated_at);
    assert_eq!(after.true_peak_db, Some(0.3));
}
