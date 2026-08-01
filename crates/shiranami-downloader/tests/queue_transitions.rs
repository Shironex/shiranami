//! Every transition v1's download queue could make, against the pure state
//! machine.
//!
//! These need no runner, no database, no timers and no fakes: a transition is a
//! method call and an effect list. The manager-level behaviour — concurrency
//! under real tasks, cancellation reaching a child, write-through persistence —
//! is covered in `queue_manager.rs`.

use shiranami_core::models::{DownloadQueueStatus, EnqueueDownloadInput};
use shiranami_downloader::queue::{Effect, MAX_CONCURRENCY, QueueState};

/// A minimal enqueue input.
fn input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        ..EnqueueDownloadInput::default()
    }
}

/// An enqueue input belonging to a batch.
fn batch_input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        batch_id: Some("b1".to_owned()),
        batch_index: Some(0),
        batch_source_title: Some("My Playlist".to_owned()),
        batch_create_playlist: Some(true),
        ..EnqueueDownloadInput::default()
    }
}

/// Enqueue `count` items named `0..count`, returning their ids.
fn fill(state: &mut QueueState, count: usize) -> Vec<String> {
    (0..count)
        .map(|index| {
            let id = format!("id-{index}");
            state.enqueue(
                input(&format!("https://example.com/{index}")),
                id.clone(),
                index as i64,
            );
            id
        })
        .collect()
}

/// The ids a transition asked to start.
fn started(effects: &[Effect]) -> Vec<String> {
    effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Start(id) => Some(id.clone()),
            _ => None,
        })
        .collect()
}

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
    assert_eq!(state.get(&ids[0]).and_then(|i| i.error.clone()), None);

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
fn mark_imported_with_no_batch_items_does_not_broadcast() {
    let mut state = QueueState::new();
    state.enqueue(input("https://example.com/single"), "s".to_owned(), 1);

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
            queued_seed("q1", "https://example.com/q1", 1),
            done_seed("d1", "https://example.com/d1", 2),
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

    let effects = state.hydrate(vec![queued_seed("q1", "https://example.com/q1", 1)], true);

    assert!(state.snapshot().paused);
    assert!(started(&effects).is_empty());
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

fn queued_seed(id: &str, url: &str, at: i64) -> shiranami_core::models::DownloadQueueItem {
    seed(id, url, DownloadQueueStatus::Queued, at)
}

fn done_seed(id: &str, url: &str, at: i64) -> shiranami_core::models::DownloadQueueItem {
    seed(id, url, DownloadQueueStatus::Done, at)
}

fn seed(
    id: &str,
    url: &str,
    status: DownloadQueueStatus,
    at: i64,
) -> shiranami_core::models::DownloadQueueItem {
    shiranami_core::models::DownloadQueueItem {
        id: id.to_owned(),
        url: url.to_owned(),
        youtube_id: None,
        title: id.to_owned(),
        thumbnail: None,
        status,
        progress: if status == DownloadQueueStatus::Done {
            100.0
        } else {
            0.0
        },
        file_path: None,
        error: None,
        batch_id: None,
        batch_index: None,
        batch_source_title: None,
        batch_create_playlist: None,
        enqueued_at: at,
        started_at: None,
        finished_at: None,
    }
}
