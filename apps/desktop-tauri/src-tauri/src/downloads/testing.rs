//! Test doubles for the downloader lane, written here because the crate's are
//! unreachable.
//!
//! `shiranami-downloader` has a thorough set of fakes — `ControllableRunner`,
//! `RecordingSink`, `FakePersistence` — and every one of them is either inside
//! a `#[cfg(test)] mod tests` or under `tests/support/`, which are compiled
//! into that crate's own test binaries and into nothing else. The crate exposes
//! no `testing` feature. What *is* reachable is four null objects — `NoSink`,
//! `NoPersistence`, `NoPausedFlag`, `NoProgress` — which record nothing, and
//! recording is the whole point of a double here: the assertions this lane owes
//! are "which arguments reached yt-dlp" and "which events came out, in what
//! order".
//!
//! So these are written rather than reused, modelled on the crate's shapes so
//! the two stay recognisable to the same reader.
//!
//! # The spawn seam is the mock point
//!
//! Every external process in this lane goes through
//! [`shiranami_downloader::spawn::ProcessRunner`], so [`ScriptedRunner`] is the
//! one double the command tests need: it answers each `run` from a queue of
//! canned outputs and records the [`ProcessSpec`] it was handed. That makes
//! "does `downloader:search` pass yt-dlp the arguments v1 passed" an assertion
//! rather than an integration test against a binary that may not be installed.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use shiranami_core::models::{DownloadQueueItem, DownloadQueueSnapshot};
use shiranami_downloader::DownloaderError;
use shiranami_downloader::download::{
    DownloadFailure, DownloadProgressSink, DownloadRequest, DownloadRunner,
};
use shiranami_downloader::queue::{DownloadDirectory, QueuePersistence, SnapshotSink};
use shiranami_downloader::spawn::{
    LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec,
};
use tokio_util::sync::CancellationToken;

/// A `ProcessRunner` that answers from a script and records what it was asked.
///
/// Runs out of script rather than looping: an unexpected extra spawn is a real
/// difference from v1's behaviour, and a runner that quietly repeated its last
/// answer would hide it.
#[derive(Default)]
pub(crate) struct ScriptedRunner {
    replies: Mutex<Vec<Result<ProcessOutput, ProcessError>>>,
    calls: Mutex<Vec<ProcessSpec>>,
    lines: Mutex<Vec<String>>,
    final_path: Option<std::path::PathBuf>,
}

impl ScriptedRunner {
    /// A runner that answers each spawn with the next reply, in order.
    pub(crate) fn new(replies: Vec<Result<ProcessOutput, ProcessError>>) -> Self {
        Self {
            // Reversed so `pop` is the front of the queue.
            replies: Mutex::new(replies.into_iter().rev().collect()),
            calls: Mutex::new(Vec::new()),
            lines: Mutex::new(Vec::new()),
            final_path: None,
        }
    }

    /// Replay `lines` into the caller's `LineSink` before answering.
    ///
    /// This is how a download's **progress sequence** becomes testable with no
    /// yt-dlp: the real runner streams stdout line by line into the sink, and
    /// `download::output::read_line` turns `[download]  42.3% of …` into a
    /// percentage and `[ExtractAudio]` into the converting transition. Feeding
    /// the same literals a real yt-dlp emits tests the parser, the sink and the
    /// event shape in one pass.
    #[must_use]
    pub(crate) fn streaming(mut self, lines: &[&str]) -> Self {
        self.lines = Mutex::new(lines.iter().map(|line| (*line).to_owned()).collect());
        self
    }

    /// Write `path` into the download's `--print-to-file` target, as yt-dlp does.
    ///
    /// Not decoration: `YtDlpDownloader` resolves the written file's path from
    /// that file and **not** from the `Destination:` lines, because
    /// post-processing changes the extension after the last destination is
    /// announced. A mock that only streamed progress would fail with
    /// `Could not determine downloaded file path`, which is the runner
    /// correctly refusing to guess.
    ///
    /// The path must also exist on disk — `resolve_written_path` checks — so a
    /// caller creates the file first.
    #[must_use]
    pub(crate) fn writing_final_path(mut self, path: &std::path::Path) -> Self {
        self.final_path = Some(path.to_path_buf());
        self
    }

    /// The `--print-to-file` destination in a spawn's arguments.
    ///
    /// yt-dlp's spelling is `--print-to-file <template> <file>`, so the target
    /// is two positions along from the flag.
    fn print_to_target(args: &[String]) -> Option<std::path::PathBuf> {
        let flag = args.iter().position(|arg| arg == "--print-to-file")?;
        args.get(flag + 2).map(std::path::PathBuf::from)
    }

    /// A runner that answers every spawn with `stdout` and exit code 0.
    pub(crate) fn answering(stdout: &str) -> Self {
        Self::new(vec![Ok(ProcessOutput {
            stdout: stdout.to_owned(),
            stderr: String::new(),
            code: 0,
            truncated: false,
        })])
    }

    /// A runner that answers with a non-zero exit and `stderr`.
    pub(crate) fn failing(stderr: &str) -> Self {
        Self::new(vec![Ok(ProcessOutput {
            stdout: String::new(),
            stderr: stderr.to_owned(),
            code: 1,
            truncated: false,
        })])
    }

    /// Every spawn it was handed, in order.
    pub(crate) fn calls(&self) -> Vec<ProcessSpec> {
        lock(&self.calls).clone()
    }

    /// The arguments of the `nth` spawn.
    ///
    /// Panics rather than returning an `Option`: a test asking for a spawn that
    /// never happened has already failed, and the panic names which one.
    pub(crate) fn args(&self, nth: usize) -> Vec<String> {
        let calls = self.calls();
        calls
            .get(nth)
            .unwrap_or_else(|| panic!("no spawn #{nth}; the runner saw {}", calls.len()))
            .args
            .clone()
    }
}

#[async_trait]
impl ProcessRunner for ScriptedRunner {
    async fn run(
        &self,
        spec: ProcessSpec,
        lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        lock(&self.calls).push(spec.clone());

        if let Some(sink) = lines {
            for line in lock(&self.lines).iter() {
                sink.line(line);
            }
        }

        if let (Some(final_path), Some(target)) =
            (self.final_path.as_ref(), Self::print_to_target(&spec.args))
        {
            std::fs::write(&target, format!("{}\n", final_path.display()))
                .unwrap_or_else(|error| panic!("write the print-to file {target:?}: {error}"));
        }

        lock(&self.replies).pop().unwrap_or_else(|| {
            panic!(
                "the scripted runner ran out of replies on spawn #{}",
                lock(&self.calls).len()
            )
        })
    }
}

/// A `SnapshotSink` that keeps every snapshot it was given.
///
/// The queue emits `downloader:queue-state` through this in production; here it
/// is what makes "pausing broadcasts a paused snapshot" assertable without a
/// webview.
#[derive(Default)]
pub(crate) struct RecordingSink {
    snapshots: Mutex<Vec<DownloadQueueSnapshot>>,
}

impl RecordingSink {
    /// The most recent snapshot, or `None` when nothing was emitted.
    pub(crate) fn latest(&self) -> Option<DownloadQueueSnapshot> {
        lock(&self.snapshots).last().cloned()
    }
}

impl SnapshotSink for RecordingSink {
    fn emit(&self, snapshot: DownloadQueueSnapshot) {
        lock(&self.snapshots).push(snapshot);
    }
}

/// In-memory `QueuePersistence`, standing in for the `download_queue` table.
///
/// The real one is `SqlitePersistence` over a real temporary database, and the
/// queue-hydration tests use that. This exists for the tests where persistence
/// is incidental and a database would only add a fixture.
#[derive(Default)]
pub(crate) struct FakePersistence {
    items: Mutex<Vec<DownloadQueueItem>>,
    paused: Mutex<bool>,
}

impl FakePersistence {
    /// The rows currently stored.
    pub(crate) fn stored(&self) -> Vec<DownloadQueueItem> {
        lock(&self.items).clone()
    }
}

#[async_trait]
impl QueuePersistence for FakePersistence {
    async fn load(&self) -> Result<Vec<DownloadQueueItem>, DownloaderError> {
        Ok(self.stored())
    }

    async fn upsert(&self, item: &DownloadQueueItem) -> Result<(), DownloaderError> {
        let mut items = lock(&self.items);
        match items.iter_mut().find(|stored| stored.id == item.id) {
            Some(stored) => *stored = item.clone(),
            None => items.push(item.clone()),
        }
        Ok(())
    }

    async fn remove(&self, id: &str) -> Result<(), DownloaderError> {
        lock(&self.items).retain(|item| item.id != id);
        Ok(())
    }

    async fn remove_many(&self, ids: &[String]) -> Result<(), DownloaderError> {
        lock(&self.items).retain(|item| !ids.contains(&item.id));
        Ok(())
    }

    async fn clear(&self) -> Result<(), DownloaderError> {
        lock(&self.items).clear();
        Ok(())
    }

    async fn is_paused(&self) -> bool {
        *lock(&self.paused)
    }

    async fn set_paused(&self, paused: bool) {
        *lock(&self.paused) = paused;
    }
}

/// A `DownloadDirectory` that always resolves to one path.
pub(crate) struct FixedDirectory(pub(crate) std::path::PathBuf);

impl DownloadDirectory for FixedDirectory {
    fn resolve(&self) -> Result<std::path::PathBuf, DownloaderError> {
        Ok(self.0.clone())
    }
}

/// A `DownloadRunner` that runs until cancelled, and says when it started.
///
/// Enough for the command tests, which assert what the *queue* did with an
/// enqueue, a pause or a cancel — not what yt-dlp did. A runner that completed
/// immediately would race every assertion about an item still being queued.
///
/// [`Self::running`] exists because of a window that is otherwise a flaky test:
/// the driver marks an item **active** when it promotes it, and registers the
/// item's cancellation token only just before entering this method. A cancel
/// arriving between the two finds no token and does nothing. Waiting on the
/// status is therefore not enough — waiting on entry here is, because by then
/// the token is registered.
#[derive(Default)]
pub(crate) struct StalledRunner {
    running: Mutex<usize>,
}

impl StalledRunner {
    /// How many downloads have been entered.
    pub(crate) fn running(&self) -> usize {
        *lock(&self.running)
    }
}

#[async_trait]
impl DownloadRunner for StalledRunner {
    async fn download(
        &self,
        _request: &DownloadRequest,
        _progress: &dyn DownloadProgressSink,
        cancel: &CancellationToken,
    ) -> Result<std::path::PathBuf, DownloadFailure> {
        *lock(&self.running) += 1;
        cancel.cancelled().await;
        Err(DownloadFailure::Cancelled)
    }
}

/// A `DownloadProgressSink` that keeps every tick.
#[derive(Default)]
pub(crate) struct RecordingProgress {
    ticks: Mutex<Vec<shiranami_core::models::DownloadProgress>>,
}

impl RecordingProgress {
    /// Every progress event, in order.
    pub(crate) fn ticks(&self) -> Vec<shiranami_core::models::DownloadProgress> {
        lock(&self.ticks).clone()
    }
}

impl DownloadProgressSink for RecordingProgress {
    fn progress(&self, event: shiranami_core::models::DownloadProgress) {
        lock(&self.ticks).push(event);
    }
}

/// An `ExtractProgressSink` that keeps every tick as v1's payload shape.
#[derive(Default)]
pub(crate) struct RecordingExtractProgress {
    ticks: Mutex<Vec<(usize, usize, String)>>,
}

impl RecordingExtractProgress {
    /// Every `(current, total, track_name)` tick, in order.
    pub(crate) fn ticks(&self) -> Vec<(usize, usize, String)> {
        lock(&self.ticks).clone()
    }
}

impl shiranami_downloader::extract::ExtractProgressSink for RecordingExtractProgress {
    fn progress(&self, current: usize, total: usize, track_name: &str) {
        lock(&self.ticks).push((current, total, track_name.to_owned()));
    }
}

/// Build the download queue every queue test drives.
///
/// Returns the queue alongside the sink and persistence it was built over, so a
/// test can assert on what was broadcast and what was stored without threading
/// three `Arc`s through every call.
pub(crate) fn queue_over(
    persistence: Arc<FakePersistence>,
    sink: Arc<RecordingSink>,
    runner: Arc<StalledRunner>,
    directory: std::path::PathBuf,
) -> Arc<shiranami_downloader::queue::DownloadQueue> {
    shiranami_downloader::queue::DownloadQueue::new(
        persistence,
        runner,
        sink,
        Arc::new(FixedDirectory(directory)),
    )
}

/// The whole downloader surface over a scripted runner and a temp directory.
///
/// The mock point is the **spawn seam**, which is what makes a command test
/// meaningful without yt-dlp on the machine: every external process this lane
/// starts goes through `ProcessRunner`, so scripting it scripts the yt-dlp the
/// commands see. The HTTP client is real but unused on these paths — the
/// scripted runner answers before anything reaches the network.
pub(crate) fn services_over(
    runner: Arc<ScriptedRunner>,
    dir: &std::path::Path,
) -> crate::downloads::DownloaderServices {
    crate::downloads::DownloaderServices::new(
        runner,
        Arc::new(shiranami_net::HttpClient::new().expect("the HTTP client must build")),
        dir.join("bin"),
        // Pinned rather than `Platform::HOST`: the yt-dlp binary's *name*
        // differs per platform, and a test asserting on the spawned program
        // would otherwise pass on macOS and fail on Windows.
        shiranami_downloader::bin::Platform::MacOs,
    )
}

/// Poll `condition` until it holds, or fail after one second.
///
/// The queue's driver performs its effects on spawned tasks, so a command that
/// *asks* for a cancellation returns before the item reaches `canceled`. A
/// fixed sleep would be either flaky or slow; a deadline is neither, and the
/// panic names the condition that never became true rather than leaving a hung
/// test to the suite timeout.
pub(crate) async fn until(what: &str, mut condition: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);

    while !condition() {
        assert!(
            std::time::Instant::now() < deadline,
            "timed out waiting until {what}"
        );
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
