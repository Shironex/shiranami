//! The queue driver, with real tasks, real cancellation tokens and a
//! controllable runner.
//!
//! Where `queue_transitions.rs` asserts what a transition *decides*, this
//! asserts that the decisions are carried out: a download actually starts, an
//! abort actually reaches the token the runner was handed, and persistence sees
//! the write-through calls in the order v1 made them.

#[path = "support/queue.rs"]
mod support;

use std::sync::Arc;

use shiranami_core::models::{DownloadQueueStatus, EnqueueDownloadInput};
use shiranami_downloader::queue::MAX_CONCURRENCY;
use support::{
    ControllableRunner, FailingDirectory, FakePersistence, RecordingSink, queue, seed_item, until,
};

fn input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        ..EnqueueDownloadInput::default()
    }
}

fn batch_input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        batch_id: Some("b1".to_owned()),
        batch_index: Some(0),
        ..EnqueueDownloadInput::default()
    }
}

/// The three doubles a queue is assembled from.
fn doubles() -> (
    Arc<FakePersistence>,
    Arc<ControllableRunner>,
    Arc<RecordingSink>,
) {
    (
        Arc::new(FakePersistence::empty()),
        Arc::new(ControllableRunner::default()),
        Arc::new(RecordingSink::default()),
    )
}

#[tokio::test]
async fn starts_at_most_max_concurrency_downloads() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    for index in 0..5 {
        queue
            .enqueue(input(&format!("https://example.com/{index}")))
            .await;
    }

    runner.wait_for(MAX_CONCURRENCY as usize).await;
    // Give any fourth task a chance to start, so this fails rather than passing
    // on a race.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    assert_eq!(runner.started(), MAX_CONCURRENCY as usize);
    assert_eq!(queue.snapshot().active_count, MAX_CONCURRENCY);
}

#[tokio::test]
async fn promotes_the_next_queued_item_when_an_active_one_finishes() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    for index in 0..4 {
        queue
            .enqueue(input(&format!("https://example.com/{index}")))
            .await;
    }
    runner.wait_for(3).await;

    runner.with(0, |run| run.resolve("/tmp/downloads/track0.mp3"));
    runner.wait_for(4).await;

    assert_eq!(
        runner.urls().get(3).map(String::as_str),
        Some("https://example.com/3")
    );

    let snapshot = queue.snapshot();
    let finished = snapshot
        .items
        .iter()
        .find(|item| item.url == "https://example.com/0")
        .expect("the finished item is still listed");
    assert_eq!(finished.status, DownloadQueueStatus::Done);
    assert_eq!(
        finished.file_path.as_deref(),
        Some("/tmp/downloads/track0.mp3")
    );
}

#[tokio::test]
async fn cancelling_an_active_download_aborts_its_token_and_settles_as_canceled() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    let id = queue.enqueue(input("https://example.com/x")).await;
    runner.wait_for(1).await;
    assert!(!runner.is_cancelled(0));

    queue.cancel(&id).await;
    assert!(
        runner.is_cancelled(0),
        "the token handed to the runner is the one cancel must reach"
    );

    // The real runner answers `Cancelled` once its child dies.
    runner.with(0, |run| run.cancelled());

    until(|| {
        queue
            .snapshot()
            .items
            .iter()
            .any(|item| item.id == id && item.status == DownloadQueueStatus::Canceled)
    })
    .await;
}

#[tokio::test]
async fn a_real_failure_settles_as_error_carrying_the_classified_reason() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    let id = queue.enqueue(input("https://example.com/y")).await;
    runner.wait_for(1).await;

    runner.with(0, |run| run.reject("yt_dlp_age_restricted"));

    until(|| {
        queue
            .snapshot()
            .items
            .iter()
            .any(|item| item.id == id && item.status == DownloadQueueStatus::Error)
    })
    .await;

    let snapshot = queue.snapshot();
    let failed = snapshot
        .items
        .iter()
        .find(|item| item.id == id)
        .expect("the item is listed");
    assert_eq!(
        failed.error.as_deref(),
        Some("yt_dlp_age_restricted"),
        "the classified code reaches the row verbatim — the renderer \
         translates it"
    );
}

#[tokio::test]
async fn cancel_all_aborts_every_in_flight_download_and_clears_persistence() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.enqueue(input("https://example.com/a")).await;
    queue.enqueue(input("https://example.com/b")).await;
    runner.wait_for(2).await;

    queue.cancel_all().await;

    assert!(runner.all_cancelled());
    assert!(queue.snapshot().items.is_empty());
    assert_eq!(persistence.calls().cleared, 1);
}

#[tokio::test]
async fn the_paused_flag_is_persisted_through_pause_and_resume() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.pause().await;
    queue.resume().await;

    assert_eq!(persistence.calls().paused_set, vec![true, false]);
}

#[tokio::test]
async fn nothing_starts_while_paused_and_the_backlog_starts_on_resume() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.pause().await;
    queue.enqueue(input("https://example.com/a")).await;
    queue.enqueue(input("https://example.com/b")).await;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(runner.started(), 0);

    queue.resume().await;
    runner.wait_for(2).await;
}

#[tokio::test]
async fn persistence_is_written_through_on_enqueue_and_on_done_and_dropped_on_error() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    let id = queue.enqueue(input("https://example.com/a")).await;
    let calls = persistence.calls();
    let first = calls.upserted.last().expect("the enqueue was persisted");
    assert_eq!(first.id, id);
    assert_eq!(
        first.status,
        DownloadQueueStatus::Queued,
        "the row is written as queued, before promotion mutates it"
    );

    runner.wait_for(1).await;
    runner.with(0, |run| run.resolve("/tmp/a.mp3"));
    until(|| {
        persistence
            .calls()
            .upserted
            .last()
            .is_some_and(|item| item.status == DownloadQueueStatus::Done)
    })
    .await;
    assert_eq!(
        persistence
            .calls()
            .upserted
            .last()
            .and_then(|item| item.file_path.clone()),
        Some("/tmp/a.mp3".to_owned()),
        "the resolved path is persisted so a crash before import still finds \
         the file"
    );

    let error_id = queue.enqueue(input("https://example.com/b")).await;
    runner.wait_for(2).await;
    runner.with_url("https://example.com/b", |run| run.reject("boom"));

    until(|| persistence.calls().removed.contains(&error_id)).await;
}

#[tokio::test]
async fn mark_imported_drops_the_persisted_rows() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.mark_imported(&["x".to_owned(), "y".to_owned()]).await;

    assert_eq!(
        persistence.calls().removed,
        vec!["x".to_owned(), "y".to_owned()]
    );
}

#[tokio::test]
async fn clear_completed_keeps_batch_items_and_mark_imported_removes_them() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    let single = queue.enqueue(input("https://example.com/single")).await;
    let batch = queue
        .enqueue(batch_input("https://example.com/batch"))
        .await;
    runner.wait_for(2).await;

    runner.with_url("https://example.com/single", |run| {
        run.resolve("/tmp/single.mp3");
    });
    runner.with_url("https://example.com/batch", |run| {
        run.resolve("/tmp/batch.mp3");
    });
    until(|| {
        queue
            .snapshot()
            .items
            .iter()
            .all(|item| item.status == DownloadQueueStatus::Done)
    })
    .await;

    queue.clear_completed().await;
    let ids: Vec<String> = queue
        .snapshot()
        .items
        .into_iter()
        .map(|item| item.id)
        .collect();
    assert!(!ids.contains(&single));
    assert!(ids.contains(&batch));

    queue.mark_imported(std::slice::from_ref(&batch)).await;
    assert!(queue.snapshot().items.is_empty());
}

#[tokio::test]
async fn hydrate_restores_persisted_items_and_resumes_the_queued_ones() {
    let persistence = Arc::new(FakePersistence::new(
        vec![
            seed_item(
                "q1",
                "https://example.com/q1",
                DownloadQueueStatus::Queued,
                1,
            ),
            seed_item("d1", "https://example.com/d1", DownloadQueueStatus::Done, 2),
        ],
        false,
    ));
    let runner = Arc::new(ControllableRunner::default());
    let sink = Arc::new(RecordingSink::default());
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.hydrate_and_resume().await;
    runner.wait_for(1).await;

    assert_eq!(queue.snapshot().items.len(), 2);
    assert_eq!(runner.urls(), vec!["https://example.com/q1".to_owned()]);
}

#[tokio::test]
async fn hydrate_does_not_resume_a_persisted_paused_queue() {
    let persistence = Arc::new(FakePersistence::new(
        vec![seed_item(
            "q1",
            "https://example.com/q1",
            DownloadQueueStatus::Queued,
            1,
        )],
        true,
    ));
    let runner = Arc::new(ControllableRunner::default());
    let sink = Arc::new(RecordingSink::default());
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.hydrate_and_resume().await;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    assert!(queue.snapshot().paused);
    assert_eq!(runner.started(), 0);
}

#[tokio::test]
async fn a_download_directory_that_cannot_be_resolved_settles_the_item_as_error() {
    let persistence = Arc::new(FakePersistence::empty());
    let runner = Arc::new(ControllableRunner::default());
    let sink = Arc::new(RecordingSink::default());
    let queue = shiranami_downloader::queue::DownloadQueue::new(
        Arc::clone(&persistence) as Arc<_>,
        Arc::clone(&runner) as Arc<_>,
        Arc::clone(&sink) as Arc<_>,
        Arc::new(FailingDirectory),
    );

    let first = queue.enqueue(input("https://example.com/a")).await;

    until(|| {
        queue
            .snapshot()
            .items
            .iter()
            .any(|item| item.id == first && item.status == DownloadQueueStatus::Error)
    })
    .await;

    assert_eq!(
        queue.snapshot().active_count,
        0,
        "v1 threw synchronously here and left the item wedged in `active`, \
         holding a concurrency slot nothing would ever free"
    );
    assert_eq!(runner.started(), 0);

    // The slot is genuinely free: a second enqueue is promoted rather than
    // queueing behind the first one forever.
    let second = queue.enqueue(input("https://example.com/b")).await;

    until(|| {
        queue
            .snapshot()
            .items
            .iter()
            .any(|item| item.id == second && item.status == DownloadQueueStatus::Error)
    })
    .await;

    assert_eq!(
        queue.snapshot().active_count,
        0,
        "both items settled, so nothing is holding a slot"
    );
}

#[tokio::test]
async fn every_structural_change_emits_a_snapshot() {
    let (persistence, runner, sink) = doubles();
    let queue = queue(
        Arc::clone(&persistence),
        Arc::clone(&runner),
        Arc::clone(&sink),
    );

    queue.enqueue(input("https://example.com/a")).await;
    runner.wait_for(1).await;

    assert!(
        sink.count() >= 2,
        "an enqueue broadcasts, and so does the promotion that follows it"
    );
    let last = sink.last().expect("a snapshot was emitted");
    assert_eq!(last.max_concurrency, MAX_CONCURRENCY);
    assert_eq!(last.items.len(), 1);
}
