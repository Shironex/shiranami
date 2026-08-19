//! The ten `downloader:queue-*` channels, exercised against a fake driver.
//!
//! Split from `queue.rs` and included with `#[path]` rather than left in it:
//! the two together run past the module-shape cap, and of the two halves the
//! tests are the one that can move without splitting a namespace across files.
//! `commands/mod.rs` is generated from the registry list, so a second `pub mod`
//! entry there would declare a namespace that does not exist.

use super::*;
use crate::downloads::testing::{FakePersistence, RecordingSink, StalledRunner, queue_over, until};
use shiranami_core::error::codes;
use shiranami_core::models::DownloadQueueStatus;
use shiranami_downloader::error::code;
use shiranami_downloader::queue::QueuePersistence as _;
use std::sync::Arc;

fn input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: "Cornelius - Drop".to_owned(),
        ..EnqueueDownloadInput::default()
    }
}

/// The queue every test below drives, with the sink, the store and the
/// runner it was built over so all three can be asserted on.
struct Harness {
    queue: Arc<shiranami_downloader::queue::DownloadQueue>,
    sink: Arc<RecordingSink>,
    persistence: Arc<FakePersistence>,
    runner: Arc<StalledRunner>,
}

fn harness(dir: &std::path::Path) -> Harness {
    let persistence = Arc::new(FakePersistence::default());
    let sink = Arc::new(RecordingSink::default());
    let runner = Arc::new(StalledRunner::default());
    let queue = queue_over(
        Arc::clone(&persistence),
        Arc::clone(&sink),
        Arc::clone(&runner),
        dir.join("downloads"),
    );
    Harness {
        queue,
        sink,
        persistence,
        runner,
    }
}

#[test]
fn a_valid_single_download_passes_validation() {
    assert!(validate_enqueue(&input("https://youtu.be/abc")).is_ok());
}

/// The guard the playlist importer's payload actually reaches.
#[test]
fn a_non_http_url_is_refused_under_v1s_code() {
    let error = validate_enqueue(&input("file:///etc/passwd")).expect_err("refused");

    assert_eq!(error.code, code::INVALID_URL);
}

#[test]
fn an_empty_url_or_title_is_a_bad_request() {
    let mut blank_title = input("https://youtu.be/abc");
    blank_title.title = String::new();

    assert_eq!(
        validate_enqueue(&input("")).expect_err("empty url").code,
        codes::validation::BAD_REQUEST
    );
    assert_eq!(
        validate_enqueue(&blank_title)
            .expect_err("empty title")
            .code,
        codes::validation::BAD_REQUEST
    );
}

/// v1's `.refine`. A half-specified pair silently misroutes a playlist item
/// onto the single-download path, so it is refused at the boundary.
#[test]
fn a_half_specified_batch_pair_is_refused_and_a_whole_one_is_not() {
    let mut only_id = input("https://youtu.be/abc");
    only_id.batch_id = Some("batch-1".to_owned());

    let mut only_index = input("https://youtu.be/abc");
    only_index.batch_index = Some(0);

    let mut both = input("https://youtu.be/abc");
    both.batch_id = Some("batch-1".to_owned());
    both.batch_index = Some(0);

    assert_eq!(
        validate_enqueue(&only_id)
            .expect_err("id without index")
            .code,
        codes::validation::BAD_REQUEST
    );
    assert!(validate_enqueue(&only_index).is_err());
    assert!(validate_enqueue(&both).is_ok(), "a whole pair is accepted");
    assert!(
        validate_enqueue(&input("https://youtu.be/abc")).is_ok(),
        "neither is the single-download path"
    );
}

/// `batchIndex: 0` is the first item of every batch, and a check written as
/// truthiness rather than presence would reject it. v1's `=== undefined`
/// comparison got this right; `is_some()` is the Rust spelling of it.
#[test]
fn a_zero_batch_index_is_a_present_index() {
    let mut first = input("https://youtu.be/abc");
    first.batch_id = Some("batch-1".to_owned());
    first.batch_index = Some(0);

    assert!(validate_enqueue(&first).is_ok());
}

#[tokio::test]
async fn an_empty_queue_answers_v1s_snapshot_shape() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness { queue, .. } = harness(dir.path());

    let snapshot = queue.snapshot();

    assert!(snapshot.items.is_empty());
    assert_eq!(snapshot.max_concurrency, 3, "v1's MAX_CONCURRENCY");
    assert_eq!(snapshot.active_count, 0);
    assert!(!snapshot.paused);
}

/// `enqueue` answers the generated id, and the item lands queued at zero
/// progress with the batch fields absent.
#[tokio::test]
async fn enqueue_answers_an_id_and_broadcasts_the_new_item() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue,
        sink,
        persistence,
        ..
    } = harness(dir.path());

    let id = queue.enqueue(input("https://youtu.be/abc")).await;

    assert!(!id.is_empty());

    let snapshot = sink.latest().expect("enqueue broadcasts");
    let item = snapshot.items.first().expect("the item is in the snapshot");
    assert_eq!(item.id, id);
    assert_eq!(item.title, "Cornelius - Drop");
    assert_eq!(item.progress, 0.0);
    assert!(item.batch_id.is_none());
    assert_eq!(
        persistence.stored().len(),
        1,
        "enqueue writes through to the table"
    );
}

/// The six void channels are observable only through the broadcast, which
/// is what this asserts: pause emits a paused snapshot, resume an unpaused
/// one, and both are persisted.
#[tokio::test]
async fn pause_and_resume_broadcast_and_persist_the_flag() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue,
        sink,
        persistence,
        ..
    } = harness(dir.path());

    queue.pause().await;
    assert!(sink.latest().expect("pause broadcasts").paused);
    assert!(persistence.is_paused().await);

    queue.resume().await;
    assert!(!sink.latest().expect("resume broadcasts").paused);
    assert!(!persistence.is_paused().await);
}

/// Cancelling a **queued** item marks it `canceled` in place rather than
/// removing it, which is what lets the downloads view show what happened
/// instead of having rows vanish. The persisted row *is* dropped — a
/// cancelled download is not work a restart should resume.
#[tokio::test]
async fn cancelling_a_queued_item_marks_it_and_forgets_its_row() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue,
        sink,
        persistence,
        ..
    } = harness(dir.path());

    // Paused, so the enqueue is not immediately promoted to active: the
    // queued and active paths through `cancel` are genuinely different, and
    // this is the synchronous one.
    queue.pause().await;
    let id = queue.enqueue(input("https://youtu.be/abc")).await;

    queue.cancel(&id).await;

    let snapshot = sink.latest().expect("cancel broadcasts");
    let item = snapshot.items.first().expect("the row is still there");
    assert_eq!(item.status, DownloadQueueStatus::Canceled);
    assert!(item.finished_at.is_some(), "a cancel stamps a finish time");
    assert!(persistence.stored().is_empty());
}

/// Cancelling an **active** item is asynchronous, and that asymmetry is the
/// whole reason the queue is a driver rather than a data structure: the
/// state machine can only emit `Abort`, and the item does not reach
/// `canceled` until the download task observes its token and reports back.
///
/// A test that asserted immediately would read `active` and be wrong about
/// what v1 did, not about what the port does.
#[tokio::test]
async fn cancelling_an_active_item_reaches_canceled_once_the_task_reports() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness { queue, runner, .. } = harness(dir.path());
    let id = queue.enqueue(input("https://youtu.be/abc")).await;

    // Waiting on the *runner*, not on the status. The driver marks an item
    // active when it promotes it and registers the item's cancel token only
    // just before entering the runner, so a cancel sent between those two
    // points finds no token and does nothing. Entry here means the token is
    // registered, which makes the assertion below deterministic rather than
    // dependent on how the scheduler interleaved two spawned tasks.
    until("the download task has started", || runner.running() == 1).await;
    assert_eq!(
        queue.snapshot().items[0].status,
        DownloadQueueStatus::Active
    );

    queue.cancel(&id).await;

    until("the aborted item settles as canceled", || {
        queue.snapshot().items[0].status == DownloadQueueStatus::Canceled
    })
    .await;
}

/// `cancel-all` empties the queue outright rather than marking rows, and it
/// clears the paused flag so the next enqueue does not land invisibly in a
/// queue the user can no longer see is paused.
#[tokio::test]
async fn cancel_all_empties_the_queue_and_unpauses_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue,
        sink,
        persistence,
        ..
    } = harness(dir.path());

    queue.pause().await;
    queue.enqueue(input("https://youtu.be/one")).await;
    queue.enqueue(input("https://youtu.be/two")).await;

    queue.cancel_all().await;

    let snapshot = sink.latest().expect("cancel-all broadcasts");
    assert!(snapshot.items.is_empty());
    assert!(!snapshot.paused, "the paused flag is reset");
    assert!(persistence.stored().is_empty());
}

/// Retry mirrors cancel's tolerance: an unknown id or a row that is not
/// `error` is a no-op, because the renderer can fire it from a row a
/// `queue-state` event has already settled differently. The error → queued
/// transition itself is covered exhaustively by the pure state-machine
/// suites; this asserts the driver wiring does not reject the race.
#[tokio::test]
async fn retrying_an_unknown_or_unfailed_item_is_a_no_op() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness { queue, .. } = harness(dir.path());

    queue.pause().await;
    let id = queue.enqueue(input("https://youtu.be/abc")).await;

    queue.retry(&id).await;
    queue.retry("no-such-item").await;
    queue.retry_all_failed().await;

    let snapshot = queue.snapshot();
    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(
        snapshot.items[0].status,
        DownloadQueueStatus::Queued,
        "a queued row is left exactly where it was"
    );
}

/// v1's cancel was a no-op for an unknown id, because the renderer can fire
/// it from a row that a `queue-state` event has already removed.
#[tokio::test]
async fn cancelling_an_unknown_id_is_a_no_op() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness { queue, .. } = harness(dir.path());

    queue.cancel("no-such-item").await;

    assert!(queue.snapshot().items.is_empty());
}

/// `mark-imported` treats a batch item and a single one differently, and
/// the asymmetry is deliberate rather than an oversight.
///
/// A **batch** item leaves the view as well as the table: its coordinator
/// imports the whole batch and then reports, and leaving the rows behind
/// would show a completed playlist import as a list of stale rows. A
/// **single** item keeps its row until `clear-completed` takes it, because
/// the downloads view is where the user sees that a one-off download
/// finished.
///
/// Both drop the persisted row either way, which is the part that matters
/// after a restart: an imported download must not be resumed.
///
/// Both rows are `done` before the call, which is the only thing the
/// renderer imports. It matters because `retry` re-queues an item without
/// leaving a trace, so an unfinished row is indistinguishable from one a
/// retry has just revived, and `mark_imported` spares those on purpose.
#[tokio::test]
async fn mark_imported_drops_batch_rows_from_the_view_and_keeps_single_ones() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue, persistence, ..
    } = harness(dir.path());

    queue.pause().await;

    let mut batched = input("https://youtu.be/one");
    batched.batch_id = Some("batch-1".to_owned());
    batched.batch_index = Some(0);
    let batched_id = queue.enqueue(batched).await;
    let single_id = queue.enqueue(input("https://youtu.be/two")).await;

    for mut item in persistence.stored() {
        item.status = DownloadQueueStatus::Done;
        item.file_path = Some(format!("{}.mp3", item.id));
        persistence.upsert(&item).await.expect("the row stores");
    }

    let restarted = queue_over(
        Arc::clone(&persistence),
        Arc::new(RecordingSink::default()),
        Arc::new(StalledRunner::default()),
        dir.path().join("downloads"),
    );
    restarted.hydrate_and_resume().await;

    restarted
        .mark_imported(&[batched_id.clone(), single_id.clone()])
        .await;

    let remaining = restarted.snapshot();
    assert_eq!(remaining.items.len(), 1, "the batch row left the view");
    assert_eq!(remaining.items[0].id, single_id);
    assert!(
        persistence.stored().is_empty(),
        "both persisted rows are forgotten, so a restart resumes neither"
    );
}

/// `clear-completed` is the other half of the pair, and it deliberately
/// spares batch items: clearing one early drops its persisted row, so a
/// restart before the batch finishes rebuilds it with fewer tracks and
/// recreates the playlist without them — they are never imported at all.
#[tokio::test]
async fn clear_completed_spares_batch_items() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness { queue, .. } = harness(dir.path());

    queue.pause().await;
    let mut batched = input("https://youtu.be/one");
    batched.batch_id = Some("batch-1".to_owned());
    batched.batch_index = Some(0);
    let batched_id = queue.enqueue(batched).await;
    let single_id = queue.enqueue(input("https://youtu.be/two")).await;

    queue.cancel(&batched_id).await;
    queue.cancel(&single_id).await;
    queue.clear_completed().await;

    let remaining = queue.snapshot();
    assert_eq!(remaining.items.len(), 1, "only the single item was cleared");
    assert_eq!(remaining.items[0].id, batched_id);
}

/// The same round trip over the **real** persistence and a real database.
///
/// The tests above use a fake store because what they assert is queue
/// behaviour. This one asserts the wiring instead: that a row put in by the
/// queue lands in `download_queue` through `SqlitePersistence`, survives a
/// restart, and comes back with its batch columns intact — the ones the
/// renderer rebuilds a playlist import from, and the ones a schema drift
/// would silently drop.
///
/// The paused flag deliberately does **not** live in that table, so this
/// pairs it with the real `SettingsPausedFlag` over a real settings file.
#[tokio::test]
async fn the_queue_round_trips_through_the_real_table_and_settings_file() {
    use crate::downloads::SettingsPausedFlag;
    use shiranami_core::store::SettingsStore;
    use shiranami_downloader::queue::{DownloadQueue, SqlitePersistence};

    let dir = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
        .await
        .expect("a fresh database opens");
    let (settings, _quarantined) = SettingsStore::load(dir.path().join("config.json"));
    let settings = Arc::new(settings);

    let persistence = || -> Arc<SqlitePersistence> {
        Arc::new(SqlitePersistence::new(
            opened.pool.clone(),
            Arc::new(SettingsPausedFlag::new(Arc::clone(&settings))),
        ))
    };
    let build = || {
        DownloadQueue::new(
            persistence(),
            Arc::new(StalledRunner::default()),
            Arc::new(RecordingSink::default()),
            Arc::new(crate::downloads::testing::FixedDirectory(
                dir.path().join("downloads"),
            )),
        )
    };

    let first = build();
    first.pause().await;
    let mut batched = input("https://youtu.be/abc");
    batched.batch_id = Some("batch-1".to_owned());
    batched.batch_index = Some(2);
    batched.batch_source_title = Some("lofi beats".to_owned());
    batched.batch_create_playlist = Some(true);
    batched.youtube_id = Some("abc".to_owned());
    let id = first.enqueue(batched).await;

    // The row really is in the table, read back through the repository the
    // queue writes through rather than through the queue's own memory.
    let mut conn = opened.pool.acquire().await.expect("a connection");
    let rows = shiranami_db::repo::download_queue::load(&mut conn)
        .await
        .expect("the table reads");
    drop(conn);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, id);

    let restarted = build();
    restarted.hydrate_and_resume().await;

    let snapshot = restarted.snapshot();
    assert!(snapshot.paused, "the flag came back from the settings file");
    let item = snapshot.items.first().expect("the row came back");
    assert_eq!(item.id, id);
    assert_eq!(item.url, "https://youtu.be/abc");
    assert_eq!(item.youtube_id.as_deref(), Some("abc"));
    assert_eq!(item.batch_id.as_deref(), Some("batch-1"));
    assert_eq!(item.batch_index, Some(2));
    assert_eq!(item.batch_source_title.as_deref(), Some("lofi beats"));
    assert_eq!(item.batch_create_playlist, Some(true));
}

/// The persisted queue is what a restart reads, so this is the round trip
/// `hydrate_and_resume` performs at boot: rows and the paused flag both
/// come back.
#[tokio::test]
async fn a_persisted_queue_hydrates_with_its_paused_flag() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let Harness {
        queue: first,
        persistence,
        ..
    } = harness(dir.path());

    first.enqueue(input("https://youtu.be/abc")).await;
    first.pause().await;

    // A second driver over the same store stands in for the next launch.
    let sink = Arc::new(RecordingSink::default());
    let restarted = queue_over(
        Arc::clone(&persistence),
        Arc::clone(&sink),
        Arc::new(StalledRunner::default()),
        dir.path().join("downloads"),
    );
    restarted.hydrate_and_resume().await;

    let snapshot = restarted.snapshot();
    assert_eq!(snapshot.items.len(), 1, "the row survived the restart");
    assert!(snapshot.paused, "and so did the paused flag");
}
