//! `library:*` command tests: the scan slot, the empty-on-cancel
//! contract, the wire shapes, validation, and the off-thread helper.

use super::*;
use shiranami_core::models::TrackMetadata;
use shiranami_library::scan::ignore_progress;
use std::path::Path;
use std::sync::Arc;

/// A folder holding `count` files that are not decodable audio.
///
/// Deliberately not real audio: every assertion below is about the command
/// layer's contract — order, grouping, cancellation, the empty-on-cancel
/// mapping — and the crate's own suite already covers tag reading against
/// real fixtures. A `.mp3` that will not parse still produces a
/// `ScannedFile`, because v1 substituted a filename-derived placeholder
/// rather than dropping the file.
fn tree(root: &Path, count: usize) -> Vec<PathBuf> {
    (0..count)
        .map(|index| {
            let path = root.join(format!("track-{index}.mp3"));
            std::fs::write(&path, b"not really audio").expect("the fixture writes");
            path
        })
        .collect()
}

fn scanned(path: &Path) -> ScannedFile {
    ScannedFile {
        file_path: path.to_path_buf(),
        metadata: TrackMetadata {
            title: "T".to_owned(),
            artist: String::new(),
            album_artist: None,
            album: String::new(),
            duration: 0.0,
            genre: String::new(),
            year: None,
            track_number: None,
            disc_number: None,
            album_art: None,
        },
    }
}

// ── the slot ─────────────────────────────────────────────────────────────

#[test]
fn cancelling_marks_the_active_scan() {
    let slot = ScanSlot::default();
    let guard = slot.begin();

    assert!(!guard.token().is_cancelled());
    slot.cancel();
    assert!(guard.token().is_cancelled());
}

/// v1's regression: a stale flag left set by a mistimed cancel made the
/// *next* scan start pre-cancelled, so the folder the user just added
/// imported nothing and reported success.
#[test]
fn cancelling_while_idle_does_not_poison_the_next_scan() {
    let slot = ScanSlot::default();

    slot.cancel();

    let guard = slot.begin();
    assert!(
        !guard.token().is_cancelled(),
        "a new scan must not inherit a cancel aimed at nothing"
    );
}

/// Unlike the enrich and loudness slots, a second scan is **not** refused —
/// v1 has no busy check here. The newer scan is what the cancel button
/// reaches.
#[test]
fn a_second_scan_displaces_the_first_rather_than_being_refused() {
    let slot = ScanSlot::default();
    let first = slot.begin();
    let second = slot.begin();

    slot.cancel();

    assert!(second.token().is_cancelled());
    assert!(
        !first.token().is_cancelled(),
        "the displaced scan keeps running; it is only unreachable by cancel"
    );
}

/// Without the identity check, the first scan's cleanup frees the slot while
/// the second is still running, and the cancel button goes dead for it.
#[test]
fn a_late_finishing_scan_does_not_release_a_newer_ones_slot() {
    let slot = ScanSlot::default();
    let first = slot.begin();
    let second = slot.begin();

    drop(first);

    slot.cancel();
    assert!(
        second.token().is_cancelled(),
        "the older scan's cleanup cleared a slot it no longer owned"
    );
}

#[test]
fn the_slot_is_empty_once_its_only_guard_drops() {
    let slot = ScanSlot::default();
    drop(slot.begin());

    assert!(lock(&slot.active).is_none());
}

// ── the empty-on-cancel wire contract ────────────────────────────────────

/// The property the whole cancellation story rests on: `apps/web` reads
/// `results.length === 0` as "nothing to persist", so a cancelled scan must
/// resolve empty rather than reject. A rejection would raise a failure toast
/// for something the user deliberately asked for.
#[test]
fn a_cancelled_scan_resolves_empty_rather_than_failing() {
    let dir = tempfile::tempdir().expect("a temp dir");
    tree(dir.path(), 8);

    let cancel = CancellationToken::new();
    cancel.cancel();

    let flat = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &ignore_progress));
    assert!(flat.is_empty());

    let grouped = empty_on_cancel(scan_folder_grouped(
        dir.path(),
        None,
        &cancel,
        &ignore_progress,
    ));
    assert_eq!(grouped, GroupedScanResult::default());
}

/// Cancelling *mid-flight* rather than before the first file. The scan
/// checks its token once per file at task entry, so a token cancelled while
/// the walk is in progress still short-circuits the run — and the mapping
/// turns that into an empty result rather than a partial one, which is what
/// keeps the renderer from persisting half a folder.
#[test]
fn cancelling_mid_scan_yields_nothing_rather_than_a_partial_result() {
    let dir = tempfile::tempdir().expect("a temp dir");
    tree(dir.path(), 200);

    let cancel = CancellationToken::new();
    let seen = Arc::new(Mutex::new(0_usize));

    let trip = {
        let cancel = cancel.clone();
        let seen = Arc::clone(&seen);
        move |_: ScanProgress| {
            let mut count = lock(&seen);
            *count += 1;
            // Cancel once the run is genuinely under way, so this exercises
            // the mid-flight path rather than the pre-cancelled one.
            if *count == 5 {
                cancel.cancel();
            }
        }
    };

    let result = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &trip));

    assert!(
        result.is_empty(),
        "a cancelled scan hands back nothing, so no partial folder is persisted"
    );
    assert!(
        *lock(&seen) < 200,
        "the run short-circuited rather than parsing every file first"
    );
}

#[test]
fn a_scan_that_is_never_cancelled_passes_its_result_through() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let written = tree(dir.path(), 3);

    let cancel = CancellationToken::new();
    let result = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &ignore_progress));

    assert_eq!(
        result.len(),
        written.len(),
        "an unparseable file still yields a placeholder row, as v1 did"
    );
}

// ── the wire shapes ──────────────────────────────────────────────────────

/// `apps/web`'s `scanAndPersistFolder` destructures these two keys; a rename
/// here is a silently empty library.
#[test]
fn the_grouped_result_keeps_v1s_key_names() {
    let json = serde_json::to_string(&GroupedScanResult::default()).expect("serialize");

    assert_eq!(json, r#"{"rootTracks":[],"subfolders":[]}"#);
}

/// `library:parse-metadata` answered `{ filePath, metadata }` — the same
/// `ScannedFile` the scan returns, not a bare `TrackMetadata`. The renderer
/// reads `.metadata` off it.
#[test]
fn parse_metadata_answers_the_scanned_file_shape() {
    let json = serde_json::to_value(scanned(Path::new("/music/a.mp3"))).expect("serialize");

    assert_eq!(json["filePath"], "/music/a.mp3");
    assert!(json["metadata"].is_object());
    assert_eq!(json["metadata"]["title"], "T");
}

/// The event payload this namespace emits, pinned against the object
/// `webContents.send(C.scanProgress, evt)` produced. The four keys are read
/// by `App.tsx`'s throttle and `ScanProgressCard`.
#[test]
fn a_progress_tick_serializes_as_v1s_event_payload() {
    let json = serde_json::to_value(ScanProgress {
        file_path: PathBuf::from("/music/a.mp3"),
        file_index: 3,
        file_count: 10,
        ok: true,
    })
    .expect("serialize");

    assert_eq!(json["filePath"], "/music/a.mp3");
    assert_eq!(json["fileIndex"], 3);
    assert_eq!(json["fileCount"], 10);
    assert_eq!(json["ok"], true);

    // And the `Json` wrapper the event carries is transparent, so what
    // reaches the renderer is that object and not one wrapping it.
    assert_eq!(
        serde_json::to_value(Json(json.clone())).expect("serialize"),
        json
    );
}

// ── validation ───────────────────────────────────────────────────────────

#[test]
fn only_the_absent_paths_come_back_in_input_order() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let present = tree(dir.path(), 1).remove(0);
    let first_gone = dir.path().join("gone-a.mp3");
    let last_gone = dir.path().join("gone-b.mp3");

    assert_eq!(
        validate_files(&[
            first_gone.clone(),
            present,
            last_gone.clone(),
            first_gone.clone(),
        ]),
        vec![first_gone.clone(), last_gone, first_gone],
        "duplicates are preserved, and the survivors are not returned"
    );
}
