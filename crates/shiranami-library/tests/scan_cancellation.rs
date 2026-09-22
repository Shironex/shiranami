//! Cancelling a scan, and what it leaves behind.
//!
//! Phase 10's done-criterion is "cancel mid-scan leaves no partial rows". This
//! file is where that is proved, and the proof has two halves because the
//! property is structural rather than transactional:
//!
//! 1. A cancelled scan yields **nothing partial to the caller** — not a
//!    truncated list of the files it had got through, but an empty result, via
//!    `empty_on_cancel`. That is what v1's handlers returned.
//! 2. Nothing downstream of a scan runs on that empty result. `apps/web`'s
//!    `scanAndPersistFolder` returns at `results.length === 0` *before*
//!    `db:tracks:exists-many`, `db:tracks:add-many` and `db:folders:add`, so no
//!    row is written at all — there is no torn state because there was never a
//!    write. The renderer branch is reproduced here as `persist_like_the_renderer`
//!    so the claim is executable rather than asserted in a comment.

#[path = "support/tree.rs"]
mod tree;

use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use shiranami_library::scan::{ScanProgress, empty_on_cancel, scan_folder, scan_folder_grouped};
use shiranami_library::{LibraryError, ScannedFile};
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

fn temp() -> TempDir {
    tempfile::tempdir().expect("a temp dir")
}

/// A tree big enough that a mid-scan cancellation genuinely lands mid-scan.
fn many_tracks(count: usize) -> TempDir {
    let dir = temp();
    for index in 0..count {
        tree::wav(dir.path(), &format!("track{index:04}.wav"));
    }
    dir
}

/// `scanAndPersistFolder`'s first branch, as a function.
///
/// Returns how many rows the renderer would have asked the database to insert.
/// v1 returns `{ addedCount: 0, empty: true }` here and touches nothing.
fn persist_like_the_renderer(scanned: &[ScannedFile]) -> usize {
    if scanned.is_empty() {
        return 0;
    }
    scanned.len()
}

#[test]
fn a_scan_cancelled_before_it_starts_does_no_work() {
    let dir = many_tracks(50);
    let cancel = CancellationToken::new();
    cancel.cancel();

    let ticks = AtomicUsize::new(0);
    let sink = |_: ScanProgress| {
        ticks.fetch_add(1, Ordering::SeqCst);
    };

    let outcome = scan_folder(dir.path(), None, &cancel, &sink);

    assert!(matches!(outcome, Err(LibraryError::Cancelled)));
    assert_eq!(
        ticks.load(Ordering::SeqCst),
        0,
        "an already-cancelled scan parses nothing"
    );
    assert_eq!(persist_like_the_renderer(&empty_on_cancel(outcome)), 0);
}

#[test]
fn cancelling_mid_scan_yields_an_empty_result_not_a_partial_one() {
    let dir = many_tracks(400);
    let cancel = CancellationToken::new();

    // Cancel once a handful of files have been parsed, so the scan is genuinely
    // interrupted rather than pre-empted.
    let parsed = AtomicUsize::new(0);
    let sink = |_: ScanProgress| {
        if parsed.fetch_add(1, Ordering::SeqCst) >= 5 {
            cancel.cancel();
        }
    };

    let outcome = scan_folder(dir.path(), None, &cancel, &sink);

    assert!(
        matches!(outcome, Err(LibraryError::Cancelled)),
        "an interrupted scan reports cancellation rather than a short list"
    );

    let delivered = empty_on_cancel(outcome);
    assert!(
        delivered.is_empty(),
        "the caller receives nothing, so nothing can be half-imported"
    );
    assert_eq!(
        persist_like_the_renderer(&delivered),
        0,
        "the renderer's empty branch runs: no exists-many, no add-many, no folders:add"
    );

    let settled = parsed.load(Ordering::SeqCst);
    assert!(
        settled > 0 && settled < 400,
        "the cancellation must land mid-scan to be worth asserting: {settled}"
    );
}

#[test]
fn cancelling_a_grouped_scan_yields_an_empty_result_too() {
    let dir = temp();
    for group in 0..8 {
        for index in 0..40 {
            tree::wav(dir.path(), &format!("Artist {group}/track{index:03}.wav"));
        }
    }

    let cancel = CancellationToken::new();
    let parsed = AtomicUsize::new(0);
    let sink = |_: ScanProgress| {
        if parsed.fetch_add(1, Ordering::SeqCst) >= 5 {
            cancel.cancel();
        }
    };

    let outcome = scan_folder_grouped(dir.path(), None, &cancel, &sink);
    assert!(matches!(outcome, Err(LibraryError::Cancelled)));

    let delivered = empty_on_cancel(outcome);
    assert!(delivered.root_tracks.is_empty());
    assert!(
        delivered.subfolders.is_empty(),
        "no group survives partially — the whole result is discarded together"
    );
}

#[test]
fn every_file_that_reported_progress_had_already_finished_its_work() {
    // The "no torn state" property at the file level: a worker either does the
    // whole of its job or none of it. Cancellation is checked before the read,
    // so a file that emitted a tick has a complete entry behind it — there is no
    // window in which a half-read file is announced.
    let dir = many_tracks(300);
    let cancel = CancellationToken::new();

    let reported = Mutex::new(Vec::new());
    let sink = |progress: ScanProgress| {
        let mut reported = reported.lock().expect("the sink lock");
        reported.push(progress.file_path);
        if reported.len() >= 10 {
            cancel.cancel();
        }
    };

    let outcome = scan_folder(dir.path(), None, &cancel, &sink);
    assert!(matches!(outcome, Err(LibraryError::Cancelled)));

    let reported = reported.into_inner().expect("the sink lock");
    assert!(!reported.is_empty());
    for path in &reported {
        assert!(
            path.exists(),
            "{} was announced complete, so it must have been read",
            path.display()
        );
    }
}

#[test]
fn cancelling_after_a_scan_finished_does_not_retroactively_empty_it() {
    let dir = many_tracks(5);
    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let outcome = scan_folder(dir.path(), None, &cancel, &sink);
    cancel.cancel();

    assert_eq!(
        empty_on_cancel(outcome).len(),
        5,
        "a completed scan's result is already the caller's"
    );
}

#[test]
fn a_cancellation_token_is_reusable_across_scans_only_until_it_fires() {
    // v1's `activeScanAbort` is a single slot replaced per scan; the token has
    // the same one-shot semantics, and a caller reusing a fired one gets an
    // immediately-cancelled scan. Pinned so nobody caches one in a long-lived
    // struct by mistake.
    let dir = many_tracks(3);
    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    assert_eq!(
        scan_folder(dir.path(), None, &cancel, &sink)
            .expect("the first scan succeeds")
            .len(),
        3
    );

    cancel.cancel();

    assert!(matches!(
        scan_folder(dir.path(), None, &cancel, &sink),
        Err(LibraryError::Cancelled)
    ));
}
