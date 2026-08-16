//! Batch bookkeeping, pause/resume and restart hydration.
//!
//! The half of the state machine that exists because a *playlist* import is not
//! a pile of unrelated downloads: its items have to survive `clear_completed`
//! until the batch coordinator resolves them, or a restart mid-import
//! reconstructs the playlist with tracks silently missing.

#[path = "support/transitions.rs"]
mod support;

use shiranami_core::models::DownloadQueueStatus;
use shiranami_downloader::queue::{Effect, QueueState};
use support::{batch_input, fill, input, seed, started};

#[test]
fn clear_completed_keeps_batch_items_but_clears_single_ones() {
    let mut state = QueueState::new();
    state.enqueue(input("https://example.com/single"), "s".to_owned(), 1);
    state.enqueue(batch_input("https://example.com/batch"), "b".to_owned(), 2);

    state.finish_done("s", "/tmp/single.mp3".to_owned(), 100);
    state.finish_done("b", "/tmp/batch.mp3".to_owned(), 101);

    state.clear_completed();

    assert!(state.get("s").is_none());
    assert!(
        state.get("b").is_some(),
        "clearing a batch item early drops its persisted row, so a restart \
         before the batch finishes recreates the playlist without it"
    );
}

#[test]
fn mark_imported_removes_resolved_batch_items_but_leaves_singles() {
    let mut state = QueueState::new();
    state.enqueue(input("https://example.com/single"), "s".to_owned(), 1);
    state.enqueue(batch_input("https://example.com/batch"), "b".to_owned(), 2);
    state.finish_done("s", "/tmp/single.mp3".to_owned(), 100);
    state.finish_done("b", "/tmp/batch.mp3".to_owned(), 101);

    let effects = state.mark_imported(&["s".to_owned(), "b".to_owned()]);

    assert_eq!(
        effects.first(),
        Some(&Effect::ForgetMany(vec!["s".to_owned(), "b".to_owned()])),
        "both rows are dropped from persistence regardless of batch membership"
    );
    assert!(
        state.get("s").is_some(),
        "the single item stays in the view"
    );
    assert!(state.get("b").is_none());
}

#[test]
fn retrying_a_failed_batch_item_releases_it_to_a_standalone_download() {
    let mut state = QueueState::new();
    state.enqueue(batch_input("https://example.com/batch"), "b".to_owned(), 1);
    state.finish_error("b", "boom".to_owned(), 100);

    state.retry("b", 200);

    let item = state.get("b").expect("the item is still listed");
    assert_eq!(item.status, DownloadQueueStatus::Active);
    assert_eq!(
        item.batch_id, None,
        "the batch resolves without this item either way — a retry downloads \
         for the library, not for the playlist, so the single-import path \
         picks it up when it lands"
    );
    assert_eq!(item.batch_index, None);
    assert_eq!(item.batch_source_title, None);
    assert_eq!(item.batch_create_playlist, None);
}

#[test]
fn mark_imported_releases_failed_batch_items_instead_of_dropping_them() {
    let mut state = QueueState::new();
    state.enqueue(batch_input("https://example.com/done"), "d".to_owned(), 1);
    state.enqueue(batch_input("https://example.com/failed"), "f".to_owned(), 2);
    state.finish_done("d", "/tmp/done.mp3".to_owned(), 100);
    state.finish_error("f", "boom".to_owned(), 101);

    let effects = state.mark_imported(&["d".to_owned(), "f".to_owned()]);

    assert_eq!(
        effects.first(),
        Some(&Effect::ForgetMany(vec!["d".to_owned()])),
        "only the done row is forgotten — the failed one was already dropped \
         at finish_error, and forgetting it again could clobber the row a \
         concurrent retry just re-persisted"
    );
    assert!(effects.contains(&Effect::Broadcast));
    assert!(state.get("d").is_none());
    let failed = state
        .get("f")
        .expect("the failed item stays visible for retry");
    assert_eq!(failed.status, DownloadQueueStatus::Error);
    assert_eq!(
        failed.batch_id, None,
        "released: with no batch protection left, clear-completed can take it"
    );
}

#[test]
fn mark_imported_leaves_a_retried_items_live_row_alone() {
    let mut state = QueueState::new();
    state.enqueue(batch_input("https://example.com/failed"), "f".to_owned(), 1);
    state.finish_error("f", "boom".to_owned(), 100);
    state.retry("f", 200);

    let effects = state.mark_imported(&["f".to_owned()]);

    assert_eq!(
        effects.first(),
        Some(&Effect::ForgetMany(Vec::new())),
        "the retried item's row is live state again — dropping it would lose \
         the download on the next restart"
    );
    assert_eq!(
        state.get("f").map(|item| item.status),
        Some(DownloadQueueStatus::Active),
        "the coordinator's late mark-imported must not touch a retry in flight"
    );
}

#[test]
fn mark_imported_with_no_batch_items_does_not_broadcast() {
    let mut state = QueueState::new();
    state.enqueue(input("https://example.com/single"), "s".to_owned(), 1);
    state.finish_done("s", "/tmp/single.mp3".to_owned(), 100);

    let effects = state.mark_imported(&["s".to_owned()]);

    assert_eq!(
        effects,
        vec![Effect::ForgetMany(vec!["s".to_owned()])],
        "nothing left the in-memory queue, so there is nothing to redraw"
    );
}

#[test]
fn pause_stops_promotion_while_in_flight_downloads_keep_running() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 1);

    let effects = state.pause();
    assert_eq!(
        effects,
        vec![Effect::SetPaused(true), Effect::Broadcast],
        "pausing never aborts what is already running"
    );
    assert!(state.snapshot().paused);

    let effects = state.enqueue(input("https://example.com/b"), "b".to_owned(), 2);
    assert!(started(&effects).is_empty());
    assert_eq!(
        state.get("b").map(|item| item.status),
        Some(DownloadQueueStatus::Queued)
    );
    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Active)
    );
}

#[test]
fn resume_promotes_the_queued_backlog() {
    let mut state = QueueState::new();
    state.pause();
    state.enqueue(input("https://example.com/a"), "a".to_owned(), 1);
    state.enqueue(input("https://example.com/b"), "b".to_owned(), 2);

    let effects = state.resume();

    assert!(!state.snapshot().paused);
    assert_eq!(started(&effects), vec!["a".to_owned(), "b".to_owned()]);
}

#[test]
fn pausing_twice_and_resuming_twice_are_idempotent() {
    let mut state = QueueState::new();

    assert!(!state.pause().is_empty());
    assert!(
        state.pause().is_empty(),
        "a second pause must not write the flag again"
    );
    assert!(!state.resume().is_empty());
    assert!(state.resume().is_empty());
}

#[test]
fn cancel_all_aborts_everything_empties_the_queue_and_resets_pause() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 2);
    state.pause();

    let effects = state.cancel_all();

    assert_eq!(
        effects,
        vec![
            Effect::Abort(ids[0].clone()),
            Effect::Abort(ids[1].clone()),
            Effect::Clear,
            Effect::SetPaused(false),
            Effect::Broadcast,
        ]
    );
    assert!(state.snapshot().items.is_empty());
    assert!(
        !state.snapshot().paused,
        "a fresh enqueue after cancel-all must start, not land in a queue the \
         user cannot see is paused"
    );
}

#[test]
fn cancel_all_on_a_running_queue_does_not_touch_the_paused_flag() {
    let mut state = QueueState::new();
    fill(&mut state, 1);

    let effects = state.cancel_all();

    assert!(
        !effects.contains(&Effect::SetPaused(false)),
        "writing a flag that was already false is a pointless settings write"
    );
}

#[test]
fn hydrate_restores_items_and_resumes_the_queued_ones() {
    let mut state = QueueState::new();

    let effects = state.hydrate(
        vec![
            seed(
                "q1",
                "https://example.com/q1",
                DownloadQueueStatus::Queued,
                1,
            ),
            seed("d1", "https://example.com/d1", DownloadQueueStatus::Done, 2),
        ],
        false,
    );

    assert_eq!(started(&effects), vec!["q1".to_owned()]);
    assert_eq!(state.snapshot().items.len(), 2);
    assert_eq!(
        state.get("d1").map(|item| item.status),
        Some(DownloadQueueStatus::Done),
        "a done row names a file waiting to be imported and must not re-download"
    );
}

#[test]
fn hydrate_does_not_resume_when_the_persisted_queue_was_paused() {
    let mut state = QueueState::new();

    let effects = state.hydrate(
        vec![seed(
            "q1",
            "https://example.com/q1",
            DownloadQueueStatus::Queued,
            1,
        )],
        true,
    );

    assert!(state.snapshot().paused);
    assert!(started(&effects).is_empty());
}
