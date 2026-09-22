//! `metadata:*` command tests: the `write-tags` wire contract, three-state
//! field mapping, the enrich slot, cancellation mid-flight, and event payloads.

use super::*;
use crate::state::tests::state_over;
use shiranami_core::error::codes;
use shiranami_core::models::TrackCreateInput;
use shiranami_metadata::ENRICH_BUSY_CODE;
use shiranami_metadata::enrich::EnrichStatus;
use std::path::Path;

fn input(id: &str, file_path: &str) -> WriteTagsInput {
    WriteTagsInput {
        id: id.to_owned(),
        file_path: PathBuf::from(file_path),
        ..WriteTagsInput::default()
    }
}

// ── the write-tags wire contract ─────────────────────────────────────────

/// **The pin the architecture asks for.** A tag write that fails still
/// answers `{ success: true }`, because the renderer commits the database
/// row on that flag and v1's writer never threw.
///
/// Driven through the real crate against a file it genuinely cannot write —
/// a path that does not exist — so the failure is the crate's own rather
/// than a stubbed one.
#[tokio::test]
async fn the_success_flag_survives_a_write_failure() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let missing = dir.path().join("not-here.mp3");

    let failure = write_tags(
        &missing,
        &WriteTagsOptions {
            title: FieldEdit::Set("New".to_owned()),
            ..WriteTagsOptions::default()
        },
        None,
    );
    assert!(
        failure.is_err(),
        "the crate reports what v1 swallowed; the command is what re-swallows it"
    );

    // The command's answer for that same input, and the row it still writes.
    let mut conn = state.conn().await.expect("acquire");
    let track = tracks::add(
        &mut conn,
        &TrackCreateInput {
            file_path: missing.to_string_lossy().into_owned(),
            title: "Old".to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("seed")
    .expect("a row");

    let patch = row_patch(&WriteTagsInput {
        title: Some("New".to_owned()),
        ..input(&track.id, &missing.to_string_lossy())
    });
    tracks::update(&mut conn, &track.id, &patch)
        .await
        .expect("the row is committed regardless of the file");

    let stored = tracks::get_all(&mut conn).await.expect("read");
    assert_eq!(
        stored[0].title, "New",
        "v1 updated the row whether or not the bytes landed"
    );
}

/// The shape itself: `success` is the only field a happy answer carries, and
/// `error` is absent rather than null-but-present in the type's default.
#[test]
fn the_result_serializes_as_v1s_shape() {
    let json = serde_json::to_value(WriteTagsResult {
        success: true,
        error: None,
    })
    .expect("serialize");

    assert_eq!(json["success"], true);

    let failed = serde_json::to_value(WriteTagsResult {
        success: false,
        error: Some("nope".to_owned()),
    })
    .expect("serialize");
    assert_eq!(failed["success"], false);
    assert_eq!(failed["error"], "nope");
}

/// v1's zod accepted exactly these keys, and the renderer's
/// `EditTagsDialog` builds the object. A rename is a silently ignored edit.
#[test]
fn the_input_parses_v1s_object() {
    let parsed: WriteTagsInput = serde_json::from_str(
        r#"{"id":"11111111-1111-4111-8111-111111111111",
            "filePath":"/music/a.mp3","title":"T","artist":"A",
            "albumArtist":"AA","album":"Al","genre":"G",
            "year":2018,"trackNumber":4,"discNumber":1}"#,
    )
    .expect("v1's shape parses");

    assert_eq!(parsed.file_path, PathBuf::from("/music/a.mp3"));
    assert_eq!(parsed.album_artist.as_deref(), Some("AA"));
    assert_eq!(parsed.year, Some(Some(2018)));
    assert_eq!(parsed.disc_number, Some(Some(1)));
}

// ── three-state mapping ──────────────────────────────────────────────────

/// The distinction the tag editor depends on. An omitted numeric leaves the
/// frame alone; an explicit `null` removes it. Collapsing the two would make
/// every save clear every field the user did not touch.
#[test]
fn an_absent_numeric_is_kept_and_an_explicit_null_clears_it() {
    let absent: WriteTagsInput =
        serde_json::from_str(r#"{"id":"x","filePath":"/a.mp3"}"#).expect("parse");
    let cleared: WriteTagsInput =
        serde_json::from_str(r#"{"id":"x","filePath":"/a.mp3","year":null}"#).expect("parse");
    let set: WriteTagsInput =
        serde_json::from_str(r#"{"id":"x","filePath":"/a.mp3","year":2018}"#).expect("parse");

    assert_eq!(tag_edits(&absent).year, FieldEdit::Keep);
    assert_eq!(tag_edits(&cleared).year, FieldEdit::Clear);
    assert_eq!(tag_edits(&set).year, FieldEdit::Set(2018));

    assert_eq!(row_patch(&absent).year, None, "the column is left alone");
    assert_eq!(
        row_patch(&cleared).year,
        Some(None),
        "the column is cleared"
    );
    assert_eq!(row_patch(&set).year, Some(Some(2018)));
}

/// The file and the row must agree about a cleared numeric, or a rescan
/// restores the stale tag over the user's edit. v1 states this outright.
#[test]
fn clearing_a_numeric_clears_it_in_both_the_file_and_the_row() {
    let cleared: WriteTagsInput = serde_json::from_str(
        r#"{"id":"x","filePath":"/a.mp3","year":null,"trackNumber":null,"discNumber":null}"#,
    )
    .expect("parse");

    let edits = tag_edits(&cleared);
    let patch = row_patch(&cleared);

    assert_eq!(edits.year, FieldEdit::Clear);
    assert_eq!(edits.track_number, FieldEdit::Clear);
    assert_eq!(edits.disc_number, FieldEdit::Clear);
    assert_eq!(patch.year, Some(None));
    assert_eq!(patch.track_number, Some(None));
    assert_eq!(patch.disc_number, Some(None));
}

/// An emptied text box removes the frame rather than writing an empty
/// string, and still writes the empty string to the row — v1's split, kept
/// because the row is what the library list renders from.
#[test]
fn an_emptied_text_field_clears_the_frame_and_writes_the_row() {
    let emptied = WriteTagsInput {
        genre: Some(String::new()),
        ..input("x", "/a.mp3")
    };

    assert_eq!(tag_edits(&emptied).genre, FieldEdit::Set(String::new()));
    assert_eq!(row_patch(&emptied).genre, Some(Some(String::new())));
}

/// A submission that changes nothing must not issue an UPDATE at all — v1's
/// `if (Object.keys(updates).length > 0)`.
#[test]
fn a_submission_with_no_fields_produces_no_patch() {
    assert_eq!(
        row_patch(&input("x", "/a.mp3")),
        TrackUpdateInput::default()
    );
    assert!(
        tag_edits(&input("x", "/a.mp3")).is_empty(),
        "and nothing to write to the file either"
    );
}

/// The tag editor sends no artwork; v1's `WriteTagsInput` has no image
/// field. Covers arrive through the enrich flow instead.
#[test]
fn the_tag_editor_never_writes_a_cover() {
    let full: WriteTagsInput = serde_json::from_str(
        r#"{"id":"x","filePath":"/a.mp3","title":"T","artist":"A","album":"Al"}"#,
    )
    .expect("parse");

    assert_eq!(tag_edits(&full).cover, None);
}

#[test]
fn an_empty_file_path_is_a_bad_request() {
    let error = require_path(Path::new("")).expect_err("empty is refused");

    assert_eq!(error.code, codes::validation::BAD_REQUEST);
}

// ── the slot ─────────────────────────────────────────────────────────────

/// The busy code is contract, not diagnostics: `apps/web`'s enrich store
/// matches the literal to show "another run is already going" instead of a
/// failure toast.
#[test]
fn a_second_run_is_refused_under_v1s_busy_code() {
    let runs = EnrichRuns::default();
    let _first = runs.claim().expect("the first claim succeeds");

    let error = runs.claim().expect_err("the second claim is refused");

    assert_eq!(error.code, ENRICH_BUSY_CODE);
    assert_eq!(error.code, "metadata.enrich_busy");
}

/// A bulk run and a preview share one slot, so each excludes the other. The
/// renderer has one cancel button and one progress bar; a second concurrent
/// run would have nowhere to report.
#[test]
fn the_slot_is_reusable_once_the_run_finishes() {
    let runs = EnrichRuns::default();

    drop(runs.claim().expect("the first claim succeeds"));

    runs.claim().expect("the slot is free again");
}

#[test]
fn cancelling_marks_the_active_run() {
    let runs = EnrichRuns::default();
    let guard = runs.claim().expect("claim");

    assert!(!guard.token().is_cancelled());
    runs.0.cancel();
    assert!(guard.token().is_cancelled());
}

/// v1's regression test: a stale flag left set by a mistimed cancel made the
/// *next* run start pre-cancelled, so a bulk enrich did nothing and reported
/// success.
#[test]
fn cancelling_while_idle_does_not_poison_the_next_run() {
    let runs = EnrichRuns::default();

    runs.0.cancel();

    let guard = runs.claim().expect("claim");
    assert!(!guard.token().is_cancelled());
}

// ── cancellation mid-flight ──────────────────────────────────────────────

/// A run cancelled before any track is reached does no work at all — no
/// lookup, no request — and returns a shorter list than its input rather
/// than synthetic failures. Asserted against the real batch with no network
/// reachable, which is exactly the point: a cancelled queue entry must not
/// make a request.
#[tokio::test]
async fn a_cancelled_batch_returns_fewer_results_than_it_was_given() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let context = EnrichContext::new(state.http(), None);

    let runs = EnrichRuns::default();
    let guard = runs.claim().expect("claim");
    runs.0.cancel();

    let tracks_input = vec![enrich_input("a"), enrich_input("b"), enrich_input("c")];
    let results = enrich_tracks(
        &context,
        &tracks_input,
        EnrichOptions::default(),
        guard.token(),
        &|_| {},
    )
    .await;

    assert!(
        results.is_empty(),
        "an abandoned track contributes nothing, not a synthetic failure"
    );
}

/// Exactly one `cancelled` tick per run, not one per abandoned track — v1's
/// `let cancelled = false` guard. Three tracks, one event.
#[tokio::test]
async fn a_cancelled_batch_reports_cancellation_once() {
    use std::sync::Mutex;

    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let context = EnrichContext::new(state.http(), None);

    let runs = EnrichRuns::default();
    let guard = runs.claim().expect("claim");
    runs.0.cancel();

    let ticks = Mutex::new(Vec::new());
    let sink = |tick: EnrichProgress| {
        ticks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(tick.status);
    };

    let tracks_input = vec![enrich_input("a"), enrich_input("b"), enrich_input("c")];
    enrich_tracks(
        &context,
        &tracks_input,
        EnrichOptions::default(),
        guard.token(),
        &sink,
    )
    .await;

    let statuses = ticks
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == EnrichStatus::Cancelled)
            .count(),
        1,
        "the cancelled event is emitted once per run, not once per track: {statuses:?}"
    );
}

/// The command's own mapping for a cancelled *preview*: an empty batch
/// result becomes v1's no-match-shaped result carrying `error: 'cancelled'`,
/// so the renderer renders a cancelled state rather than a thrown error.
#[test]
fn a_cancelled_preview_answers_v1s_cancelled_result() {
    let result = cancelled("11111111-1111-4111-8111-111111111111");

    assert!(!result.success);
    assert_eq!(result.source, LookupSource::None);
    assert_eq!(result.error.as_deref(), Some("cancelled"));
    assert!(result.updated_fields.is_empty());

    let json = serde_json::to_value(&result).expect("serialize");
    assert_eq!(json["error"], "cancelled");
    assert_eq!(json["source"], "none");
    assert_eq!(json["success"], false);
}

// ── event payloads ───────────────────────────────────────────────────────

/// The payload this namespace emits, pinned against the object
/// `webContents.send(C.enrichProgress, progress)` produced.
#[test]
fn a_progress_tick_serializes_as_v1s_event_payload() {
    let json = serde_json::to_value(EnrichProgress {
        current: 2,
        total: 10,
        track_name: "Belgium".to_owned(),
        status: EnrichStatus::Done,
        confidence: Some(0.9),
        source: Some(LookupSource::Itunes),
    })
    .expect("serialize");

    assert_eq!(json["current"], 2);
    assert_eq!(json["total"], 10);
    assert_eq!(json["trackName"], "Belgium");
    assert_eq!(json["status"], "done");
    assert_eq!(json["confidence"], 0.9);
    assert_eq!(json["source"], "itunes");
}

/// The options objects the renderer sends. `enrich:preview` takes one field
/// and `enrich:tracks` two, because a preview never writes.
#[test]
fn the_option_arguments_keep_v1s_key_names() {
    let run: EnrichRunOptions =
        serde_json::from_str(r#"{"writeToFile":true,"onlyMissing":false}"#).expect("parse");
    assert!(run.write_to_file);
    assert!(!run.only_missing);

    let preview: EnrichPreviewOptions =
        serde_json::from_str(r#"{"onlyMissing":true}"#).expect("parse");
    assert!(preview.only_missing);
}

fn enrich_input(id: &str) -> EnrichTrackInput {
    EnrichTrackInput {
        id: id.to_owned(),
        file_path: PathBuf::from(format!("/music/{id}.mp3")),
        title: "Title".to_owned(),
        artist: "Artist".to_owned(),
        album: "Album".to_owned(),
        album_art: None,
        genre: String::new(),
        year: None,
        track_number: None,
    }
}
