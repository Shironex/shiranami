//! The eight `downloader:queue-*` channels.
//!
//! `enqueue`, `cancel`, `cancel-all`, `clear-completed`, `pause`, `resume`,
//! `mark-imported`, `get`.
//!
//! # Seven of the eight answer nothing, and that is the contract
//!
//! Only `enqueue` (the new item's id) and `get` (the snapshot) return a value.
//! The other six answer `void` and the renderer learns what happened from the
//! `downloader:queue-state` event, which the driver broadcasts after every
//! structural change. That is v1's design and it is load-bearing: two clients
//! of the same queue — the downloads view and the mini player — stay in sync
//! because neither of them is the source of truth.
//!
//! It also means a test of these commands asserts on the **broadcast**, not on
//! the return value. There is nothing else to assert on.
//!
//! # `enqueue` re-checks the URL
//!
//! v1 guarded `queue-enqueue` with the same `isHttpUrl` check as the legacy
//! `download` channel, and the comment says why: this is the channel the
//! playlist importer feeds, so it is the one a tampered playlist payload
//! actually reaches. The guard is here rather than only inside the queue
//! because the queue would otherwise accept the item, persist it, and fail at
//! download time — after the renderer had already drawn a row for it.
//!
//! # `batchId` and `batchIndex` are a coupled pair
//!
//! v1's zod schema carried a `.refine` rejecting a half-specified pair, because
//! the importer treats a missing `batchId` as the single-item path and a
//! half-filled pair silently misroutes. serde cannot express that, so it is a
//! `BAD_REQUEST` here under the same code the zod failure produced.
//!
//! # `mark-imported` is not `clear-completed`
//!
//! Importing is a renderer-side concern — the queue only knows the file was
//! written — so `mark-imported` exists to let the renderer say "these rows are
//! done with" and have them dropped from the persisted table. Calling
//! `clear-completed` instead would also drop rows the renderer has not imported
//! yet, which after a restart is a downloaded file nothing will ever add to the
//! library.

use shiranami_core::models::{DownloadQueueSnapshot, EnqueueDownloadInput};
use shiranami_net::url_safety::is_http_url;
use tauri::State;

use super::deferred::queue;
use crate::error::{CommandResult, bad_request};
use crate::state::AppState;

/// `downloader:queue-enqueue` — add one item, answering its generated id.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_enqueue(
    state: State<'_, AppState>,
    input: EnqueueDownloadInput,
) -> CommandResult<String> {
    validate_enqueue(&input)?;

    Ok(queue(&state)?.enqueue(input).await)
}

/// `downloader:queue-cancel` — cancel one item by id.
///
/// A no-op for an unknown id, exactly as v1 was: the renderer can fire this
/// from a row it drew before a `queue-state` event removed the item, and
/// rejecting would surface a race as an error.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_cancel(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    if id.is_empty() {
        return Err(bad_request("the download id must not be empty"));
    }

    queue(&state)?.cancel(&id).await;
    Ok(())
}

/// `downloader:queue-cancel-all` — cancel everything queued or active.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_cancel_all(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.cancel_all().await;
    Ok(())
}

/// `downloader:queue-clear-completed` — drop finished, failed and cancelled rows.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_clear_completed(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.clear_completed().await;
    Ok(())
}

/// `downloader:queue-pause` — stop promoting queued items to active.
///
/// Survives a restart: the flag is persisted outside the queue table, because
/// an empty paused queue is a real state. See [`crate::downloads::queue`].
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_pause(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.pause().await;
    Ok(())
}

/// `downloader:queue-resume` — start promoting again.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_resume(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.resume().await;
    Ok(())
}

/// `downloader:queue-mark-imported` — drop rows the renderer has imported.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_mark_imported(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CommandResult<()> {
    queue(&state)?.mark_imported(&ids).await;
    Ok(())
}

/// `downloader:queue-get` — the whole queue, for a renderer that just mounted.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_get(
    state: State<'_, AppState>,
) -> CommandResult<DownloadQueueSnapshot> {
    Ok(queue(&state)?.snapshot())
}

/// v1's `downloaderEnqueueArgs`, minus what serde already enforces.
///
/// The two non-empty strings and the coupled batch pair; the optional fields'
/// presence and types are serde's.
fn validate_enqueue(input: &EnqueueDownloadInput) -> CommandResult<()> {
    if input.url.is_empty() {
        return Err(bad_request("the download URL must not be empty"));
    }
    if input.title.is_empty() {
        return Err(bad_request("the download title must not be empty"));
    }
    if !is_http_url(&input.url) {
        return Err(shiranami_core::error::ErrorPayload::of(
            &shiranami_downloader::DownloaderError::InvalidUrl {
                message: "Refusing to download a non-http(s) URL".to_owned(),
            },
        ));
    }
    if input.batch_id.is_some() != input.batch_index.is_some() {
        return Err(bad_request("batchId and batchIndex must be provided together"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloads::testing::{
        FakePersistence, RecordingSink, StalledRunner, queue_over, until,
    };
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
            validate_enqueue(&blank_title).expect_err("empty title").code,
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
            validate_enqueue(&only_id).expect_err("id without index").code,
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
        let Harness { queue, sink, persistence, .. } = harness(dir.path());

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
        let Harness { queue, sink, persistence, .. } = harness(dir.path());

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
        let Harness { queue, sink, persistence, .. } = harness(dir.path());

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
        assert_eq!(queue.snapshot().items[0].status, DownloadQueueStatus::Active);

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
        let Harness { queue, sink, persistence, .. } = harness(dir.path());

        queue.pause().await;
        queue.enqueue(input("https://youtu.be/one")).await;
        queue.enqueue(input("https://youtu.be/two")).await;

        queue.cancel_all().await;

        let snapshot = sink.latest().expect("cancel-all broadcasts");
        assert!(snapshot.items.is_empty());
        assert!(!snapshot.paused, "the paused flag is reset");
        assert!(persistence.stored().is_empty());
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
    #[tokio::test]
    async fn mark_imported_drops_batch_rows_from_the_view_and_keeps_single_ones() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let Harness { queue, persistence, .. } = harness(dir.path());

        queue.pause().await;

        let mut batched = input("https://youtu.be/one");
        batched.batch_id = Some("batch-1".to_owned());
        batched.batch_index = Some(0);
        let batched_id = queue.enqueue(batched).await;
        let single_id = queue.enqueue(input("https://youtu.be/two")).await;

        queue
            .mark_imported(&[batched_id.clone(), single_id.clone()])
            .await;

        let remaining = queue.snapshot();
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

    /// The persisted queue is what a restart reads, so this is the round trip
    /// `hydrate_and_resume` performs at boot: rows and the paused flag both
    /// come back.
    #[tokio::test]
    async fn a_persisted_queue_hydrates_with_its_paused_flag() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let Harness { queue: first, persistence, .. } = harness(dir.path());

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
}
