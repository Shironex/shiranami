//! The download queue's core lifecycle, against the pure state machine.
//!
//! Concurrency, promotion, cancellation and the three terminal states. Batch
//! bookkeeping, pause/resume and hydration live in `queue_batches.rs`; the
//! driver's behaviour under real tasks lives in `queue_manager.rs`.
//!
//! None of these need a runner, a database, a timer or a fake: a transition is
//! a method call and an effect list.

#[path = "support/transitions.rs"]
mod support;

use shiranami_core::models::{DownloadQueueStatus, EnqueueDownloadInput};
use shiranami_downloader::queue::{Effect, MAX_CONCURRENCY, QueueState};
use support::{fill, input, started};

#[test]
fn runs_at_most_max_concurrency_downloads_at_once() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 5);

    let snapshot = state.snapshot();
    assert_eq!(snapshot.active_count, MAX_CONCURRENCY);
    assert_eq!(
        snapshot
            .items
            .iter()
            .filter(|item| item.status == DownloadQueueStatus::Active)
            .count(),
        MAX_CONCURRENCY as usize
    );
    assert_eq!(
        snapshot
            .items
            .iter()
            .filter(|item| item.status == DownloadQueueStatus::Queued)
            .count(),
        5 - MAX_CONCURRENCY as usize
    );
    assert_eq!(ids.len(), 5);
}

#[test]
fn promotes_the_next_queued_item_fifo_when_an_active_one_finishes() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 4);

    let effects = state.finish_done(&ids[0], "/tmp/downloads/track0.mp3".to_owned(), 100);

    assert_eq!(
        started(&effects),
        vec![ids[3].clone()],
        "insertion order is the scheduling order — the fourth item is next"
    );

    let snapshot = state.snapshot();
    assert_eq!(snapshot.active_count, 3);
    let finished = state.get(&ids[0]).expect("the item is still listed");
    assert_eq!(finished.status, DownloadQueueStatus::Done);
    assert_eq!(
        finished.file_path.as_deref(),
        Some("/tmp/downloads/track0.mp3")
    );
    assert_eq!(finished.progress, 100.0);
}

#[test]
fn cancels_a_queued_item_directly_without_starting_it() {
    let mut state = QueueState::new();
    fill(&mut state, MAX_CONCURRENCY as usize);
    state.enqueue(input("https://example.com/queued"), "q".to_owned(), 99);

    let effects = state.cancel("q", 100);

    assert_eq!(
        effects,
        vec![Effect::Forget("q".to_owned()), Effect::Broadcast],
        "a queued item has no child to kill, so it settles immediately"
    );
    assert_eq!(
        state.get("q").map(|item| item.status),
        Some(DownloadQueueStatus::Canceled)
    );
    assert_eq!(state.get("q").and_then(|item| item.finished_at), Some(100));
}

#[test]
fn cancelling_an_active_item_only_asks_its_child_to_stop() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 1);

    let effects = state.cancel(&ids[0], 100);

    assert_eq!(effects, vec![Effect::Abort(ids[0].clone())]);
    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Active),
        "the item stays active until its child actually dies — releasing the \
         slot early would start a fourth download beside three running ones"
    );
}

#[test]
fn a_cancelled_child_becomes_canceled_and_a_failed_one_becomes_error() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 2);

    state.finish_cancelled(&ids[0], 100);
    state.finish_error(&ids[1], "Video unavailable".to_owned(), 101);

    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Canceled)
    );
    assert_eq!(state.get(&ids[0]).and_then(|item| item.error.clone()), None);

    assert_eq!(
        state.get(&ids[1]).map(|item| item.status),
        Some(DownloadQueueStatus::Error)
    );
    assert_eq!(
        state.get(&ids[1]).and_then(|item| item.error.clone()),
        Some("Video unavailable".to_owned())
    );
}

#[test]
fn cancelling_a_terminal_item_is_a_no_op() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 1);
    state.finish_done(&ids[0], "/tmp/a.mp3".to_owned(), 100);

    assert!(
        state.cancel(&ids[0], 200).is_empty(),
        "a second click on cancel must not resurrect a finished row"
    );
    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Done)
    );
}

#[test]
fn cancelling_an_unknown_id_is_a_no_op() {
    let mut state = QueueState::new();
    assert!(state.cancel("never-existed", 1).is_empty());
}

#[test]
fn clear_completed_removes_only_terminal_items() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 4);

    state.finish_done(&ids[0], "/tmp/done.mp3".to_owned(), 100);
    state.finish_error(&ids[1], "boom".to_owned(), 101);

    state.clear_completed();

    let remaining: Vec<String> = state
        .snapshot()
        .items
        .into_iter()
        .map(|item| item.id)
        .collect();

    assert!(!remaining.contains(&ids[0]));
    assert!(!remaining.contains(&ids[1]));
    assert!(remaining.contains(&ids[2]));
    assert_eq!(
        state.get(&ids[3]).map(|item| item.status),
        Some(DownloadQueueStatus::Active),
        "the formerly-queued item was promoted when the two finished ones \
         freed their slots"
    );
}

#[test]
fn enqueue_carries_thumbnail_and_batch_intent_onto_the_item() {
    let mut state = QueueState::new();

    state.enqueue(
        EnqueueDownloadInput {
            url: "https://example.com/a".to_owned(),
            title: "A".to_owned(),
            thumbnail: Some("https://img/a.jpg".to_owned()),
            batch_id: Some("batch-1".to_owned()),
            batch_index: Some(3),
            batch_source_title: Some("My Playlist".to_owned()),
            batch_create_playlist: Some(true),
            ..EnqueueDownloadInput::default()
        },
        "a".to_owned(),
        1,
    );

    let item = state.get("a").expect("the item is listed");
    assert_eq!(item.thumbnail.as_deref(), Some("https://img/a.jpg"));
    assert_eq!(item.batch_source_title.as_deref(), Some("My Playlist"));
    assert_eq!(item.batch_create_playlist, Some(true));
    assert_eq!(item.batch_index, Some(3));
    assert_eq!(item.enqueued_at, 1);
}

#[test]
fn progress_is_coalesced_and_a_conversion_flushes_immediately() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 1);

    assert_eq!(
        state.on_progress(&ids[0], 42.5),
        vec![Effect::BroadcastProgress]
    );
    assert_eq!(state.get(&ids[0]).map(|item| item.progress), Some(42.5));

    assert_eq!(
        state.on_converting(&ids[0]),
        vec![Effect::Broadcast],
        "the row's label changes from a percentage to `converting`, which is a \
         structural change and must not wait for the throttle"
    );
    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Converting)
    );
    assert_eq!(state.get(&ids[0]).map(|item| item.progress), Some(100.0));
}

#[test]
fn a_converting_item_still_holds_its_concurrency_slot() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 4);
    state.on_converting(&ids[0]);

    assert_eq!(
        state.snapshot().active_count,
        MAX_CONCURRENCY,
        "yt-dlp is still running during post-processing — freeing the slot \
         would put four children on the machine"
    );
    assert_eq!(
        state.get(&ids[3]).map(|item| item.status),
        Some(DownloadQueueStatus::Queued)
    );
}

#[test]
fn progress_for_an_unknown_id_changes_nothing() {
    let mut state = QueueState::new();
    assert!(state.on_progress("never-existed", 50.0).is_empty());
    assert!(state.on_converting("never-existed").is_empty());
}

#[test]
fn retrying_a_failed_item_requeues_it_and_persists_the_row() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 1);
    state.finish_error(&ids[0], "boom".to_owned(), 100);

    let effects = state.retry(&ids[0], 200);

    let Some(Effect::Persist(item)) = effects.first() else {
        panic!("the first effect must be the write-through persist");
    };
    assert_eq!(
        item.status,
        DownloadQueueStatus::Queued,
        "the row is persisted as queued, before promotion mutates it"
    );
    assert_eq!(item.error, None);
    assert_eq!(
        item.enqueued_at, 200,
        "a retry is a re-enqueue, and says so"
    );
    assert_eq!(effects.get(1), Some(&Effect::Broadcast));
    assert_eq!(
        started(&effects),
        vec![ids[0].clone()],
        "a free slot promotes the retried item immediately"
    );

    let item = state.get(&ids[0]).expect("the item is still listed");
    assert_eq!(item.status, DownloadQueueStatus::Active);
    assert_eq!(item.error, None);
    assert_eq!(item.finished_at, None);
    assert_eq!(item.progress, 0.0);
}

#[test]
fn retry_is_a_no_op_for_anything_but_a_failed_item() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, MAX_CONCURRENCY as usize);
    state.enqueue(input("https://example.com/c"), "c".to_owned(), 99);
    state.cancel("c", 100);
    state.finish_done(&ids[0], "/tmp/a.mp3".to_owned(), 101);

    assert!(
        state.retry(&ids[0], 200).is_empty(),
        "a stray click must not re-download a finished row"
    );
    assert!(
        state.retry(&ids[1], 200).is_empty(),
        "an active row is already running"
    );
    assert!(
        state.retry("c", 200).is_empty(),
        "canceled is a user decision, not a failure — retry targets only `error`"
    );
    assert!(state.retry("never-existed", 200).is_empty());
}

#[test]
fn retry_all_failed_requeues_every_failed_item_and_nothing_else() {
    let mut state = QueueState::new();
    let ids = fill(&mut state, 3);
    state.finish_error(&ids[0], "boom".to_owned(), 100);
    state.finish_error(&ids[1], "boom".to_owned(), 101);
    state.finish_done(&ids[2], "/tmp/c.mp3".to_owned(), 102);

    let effects = state.retry_all_failed(200);

    let persisted: Vec<&str> = effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Persist(item) => Some(item.id.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(persisted, vec![ids[0].as_str(), ids[1].as_str()]);
    assert_eq!(
        state.get(&ids[0]).map(|item| item.status),
        Some(DownloadQueueStatus::Active),
        "free slots promote retried items immediately"
    );
    assert_eq!(
        state.get(&ids[2]).map(|item| item.status),
        Some(DownloadQueueStatus::Done)
    );
    assert!(
        state.retry_all_failed(300).is_empty(),
        "with nothing failed left there is nothing to do — and nothing to broadcast"
    );
}

#[test]
fn the_enqueue_effect_order_persists_before_broadcasting() {
    let mut state = QueueState::new();
    let effects = state.enqueue(input("https://example.com/a"), "a".to_owned(), 1);

    let Some(Effect::Persist(item)) = effects.first() else {
        panic!("the first effect must be the write-through persist");
    };
    assert_eq!(
        item.status,
        DownloadQueueStatus::Queued,
        "the row is persisted as queued, before promotion mutates it"
    );
    assert_eq!(effects.get(1), Some(&Effect::Broadcast));
}
