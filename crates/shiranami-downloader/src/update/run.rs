//! One automatic update of one tool, from "is there a newer version" to a
//! verified binary in place.
//!
//! # The order is what keeps downloads safe
//!
//! 1. Ask the upstream, without any lock. Unreachable is a quiet skip, and an
//!    up-to-date tool never touches the lock, so the settings panel's
//!    "installing" flag is not raised by a routine check.
//! 2. Take the tool's **install lock** (`bin::lock`) and keep it to the end,
//!    re-reading the installed version under it (a manual install may have
//!    finished in the meantime). A manual install clicked from here on waits
//!    behind this one instead of staging into, promoting over or rolling back
//!    the same files. The manager refuses a guard from any other lock, and the
//!    staged handle cannot outlive the guard; see `bin::lock` for which half
//!    of that the compiler checks and which half is a run-time check.
//! 3. **Stage** the new binary beside the old one: download, verify the
//!    checksum, make it executable. This is the slow part (seconds for yt-dlp,
//!    up to a minute or two for ffmpeg), and it runs while downloads carry on,
//!    because nothing installed is touched.
//! 4. **Quiesce** the download queue: stop it starting anything new, and wait
//!    for the downloads already running to finish. Never swap a binary under a
//!    running download; on Windows the swap would fail outright, and on macOS
//!    a yt-dlp that is still unpacking itself would read a file that changed
//!    beneath it. The hold is a [`SwapHold`] guard, released when it drops, so
//!    a panic or an early return cannot leave the queue stuck.
//! 5. **Promote**: re-check the staged file's digest, move the old binary
//!    aside, move the new one in, probe it, and roll back if the probe fails.
//!
//! If the running downloads outlast [`QUIESCE_LIMIT`], the staged update is
//! thrown away and the check reports [`UpdateOutcome::Busy`]. Holding the queue
//! for longer than that would be the updater getting in the way of the thing it
//! exists to protect.

use std::sync::Arc;
use std::time::Duration;

use shiranami_core::models::Tool;

use crate::bin::{FfmpegManager, Tools, YtDlpManager};
use crate::queue::DownloadQueue;
use crate::spawn::has_update;
use crate::update::policy::{self, UpdateOutcome};

/// How long a swap waits for running downloads before giving up for this
/// window.
pub const QUIESCE_LIMIT: Duration = Duration::from_secs(30 * 60);

/// A quiet period, held for as long as this value lives.
///
/// Dropping it ends the hold. That is deliberately the only way: a hold that
/// had to be released by hand would stay held forever after a panic or a `?`
/// between quiesce and release.
pub struct SwapHold(Option<Box<dyn FnOnce() + Send>>);

impl SwapHold {
    /// A hold that runs `release` when dropped.
    pub fn new(release: impl FnOnce() + Send + 'static) -> Self {
        Self(Some(Box::new(release)))
    }

    /// A hold with nothing to release, for a gate that holds nothing.
    pub fn noop() -> Self {
        Self(None)
    }
}

impl Drop for SwapHold {
    fn drop(&mut self) {
        if let Some(release) = self.0.take() {
            release();
        }
    }
}

/// Whatever must be quiet while a binary is swapped.
#[async_trait::async_trait]
pub trait SwapGate: Send + Sync {
    /// Stop new work and wait for running work to finish.
    ///
    /// `None` when running work did not finish in time; the gate is then
    /// already released and the caller has nothing to undo.
    async fn quiesce(&self) -> Option<SwapHold>;
}

/// The download queue as a [`SwapGate`].
pub struct QueueGate {
    queue: Arc<DownloadQueue>,
    limit: Duration,
}

impl QueueGate {
    /// Gate on `queue`, waiting at most [`QUIESCE_LIMIT`].
    pub fn new(queue: Arc<DownloadQueue>) -> Self {
        Self::with_limit(queue, QUIESCE_LIMIT)
    }

    /// Gate on `queue`, waiting at most `limit`.
    pub fn with_limit(queue: Arc<DownloadQueue>, limit: Duration) -> Self {
        Self { queue, limit }
    }
}

#[async_trait::async_trait]
impl SwapGate for QueueGate {
    async fn quiesce(&self) -> Option<SwapHold> {
        self.queue.hold();
        // Built before the wait, so even a panic inside it releases the queue.
        let queue = Arc::clone(&self.queue);
        let hold = SwapHold::new(move || queue.release_detached());

        if self.queue.wait_until_idle(self.limit).await {
            return Some(hold);
        }
        tracing::info!("downloads are still running; postponing the tool update");
        None
    }
}

/// Check `tool` and install a newer version if there is one.
///
/// Never fails: every problem is an [`UpdateOutcome`], because the caller is a
/// background scheduler with nobody to propagate an error to.
pub async fn update_tool(tool: Tool, tools: &Tools, gate: &dyn SwapGate) -> UpdateOutcome {
    match tool {
        Tool::Ytdlp => update_ytdlp(&tools.ytdlp, gate).await,
        Tool::Ffmpeg if !policy::auto_updatable(tool, tools.ffmpeg.platform) => {
            UpdateOutcome::NotSupported
        }
        Tool::Ffmpeg => update_ffmpeg(&tools.ffmpeg, gate).await,
    }
}

async fn update_ytdlp(manager: &YtDlpManager, gate: &dyn SwapGate) -> UpdateOutcome {
    if !manager.is_installed().await {
        return UpdateOutcome::NotInstalled;
    }

    let (current, latest) = tokio::join!(manager.version(), manager.latest_version());
    let Some(latest) = latest else {
        return UpdateOutcome::Unreachable;
    };
    let Some(current) = current else {
        return unreadable(Tool::Ytdlp);
    };
    if !has_update(Some(&current), Some(&latest)) {
        return UpdateOutcome::UpToDate;
    }

    let guard = manager.lock_install().await;
    let Some(current) = manager.version().await else {
        return unreadable(Tool::Ytdlp);
    };
    if !has_update(Some(&current), Some(&latest)) {
        return UpdateOutcome::UpToDate;
    }

    tracing::info!(current, latest, "a newer yt-dlp is available; staging it");
    // Pinned to the tag just read, so the asset and its checksum list come
    // from the same release.
    let staged = match manager.stage(&guard, Some(&latest), None).await {
        Ok(staged) => staged,
        Err(error) => return failed(Tool::Ytdlp, &error),
    };

    let Some(hold) = gate.quiesce().await else {
        manager.discard(staged).await;
        return UpdateOutcome::Busy;
    };
    let promoted = manager.promote_staged(&guard, staged).await;
    drop(hold);

    match promoted {
        Ok(to) => UpdateOutcome::Updated {
            from: Some(current),
            to,
        },
        Err(error) => failed(Tool::Ytdlp, &error),
    }
}

async fn update_ffmpeg(manager: &FfmpegManager, gate: &dyn SwapGate) -> UpdateOutcome {
    if !manager.is_installed().await {
        return UpdateOutcome::NotInstalled;
    }

    let (current, latest) = tokio::join!(manager.version(), manager.latest_version());
    let Some(latest) = latest else {
        return UpdateOutcome::Unreachable;
    };
    let Some(current) = current else {
        return unreadable(Tool::Ffmpeg);
    };
    if !has_update(Some(&current), Some(&latest)) {
        return UpdateOutcome::UpToDate;
    }

    let guard = manager.lock_install().await;
    let Some(current) = manager.version().await else {
        return unreadable(Tool::Ffmpeg);
    };
    if !has_update(Some(&current), Some(&latest)) {
        return UpdateOutcome::UpToDate;
    }

    tracing::info!(current, latest, "a newer ffmpeg is available; staging it");
    let staged = match manager.stage(&guard, None).await {
        Ok(staged) => staged,
        Err(error) => return failed(Tool::Ffmpeg, &error),
    };

    let Some(hold) = gate.quiesce().await else {
        manager.discard(staged).await;
        return UpdateOutcome::Busy;
    };
    let promoted = manager.promote_staged(&guard, staged).await;
    drop(hold);

    match promoted {
        Ok(to) => UpdateOutcome::Updated {
            from: Some(current),
            to,
        },
        Err(error) => failed(Tool::Ffmpeg, &error),
    }
}

/// An installed tool whose version cannot be read: a binary that will not run,
/// or one that timed out answering `--version`.
///
/// Not [`UpdateOutcome::UpToDate`]: `has_update` cannot compare against nothing,
/// and reading that as "up to date" would record a clean check for a tool that
/// does not work. Nor an unattended reinstall: a slow cold start reads the same
/// as a corrupt binary. A failure counts toward the streak, so a binary that
/// stays broken is told to the user.
fn unreadable(tool: Tool) -> UpdateOutcome {
    tracing::warn!(
        ?tool,
        "could not read the installed version; not updating it"
    );
    UpdateOutcome::Failed("could not read the installed version".to_owned())
}

fn failed(tool: Tool, error: &crate::DownloaderError) -> UpdateOutcome {
    tracing::warn!(?tool, %error, "an automatic tool update failed");
    UpdateOutcome::Failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use shiranami_core::models::EnqueueDownloadInput;
    use tokio::sync::oneshot;
    use tokio_util::sync::CancellationToken;

    use super::*;
    use crate::bin::Platform;
    use crate::download::{DownloadFailure, DownloadProgressSink, DownloadRequest, DownloadRunner};
    use crate::queue::{DownloadDirectory, FailureObserver, NoPersistence, NoSink};

    type Finish = oneshot::Sender<Result<PathBuf, DownloadFailure>>;

    /// A runner whose downloads park until the test finishes them.
    #[derive(Default)]
    struct Parked(Mutex<Vec<Option<Finish>>>);

    impl Parked {
        fn started(&self) -> usize {
            lock(&self.0).len()
        }

        fn finish(&self, index: usize, outcome: Result<PathBuf, DownloadFailure>) {
            if let Some(finish) = lock(&self.0).get_mut(index).and_then(Option::take) {
                let _ = finish.send(outcome);
            }
        }

        async fn wait_for(&self, count: usize) {
            for _ in 0..2_000 {
                if self.started() >= count {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            panic!("{count} downloads never started");
        }
    }

    #[async_trait::async_trait]
    impl DownloadRunner for Parked {
        async fn download(
            &self,
            _request: &DownloadRequest,
            _progress: &dyn DownloadProgressSink,
            _cancel: &CancellationToken,
        ) -> Result<PathBuf, DownloadFailure> {
            let (finish, finished) = oneshot::channel();
            lock(&self.0).push(Some(finish));
            finished.await.unwrap_or(Err(DownloadFailure::Cancelled))
        }
    }

    struct Here;

    impl DownloadDirectory for Here {
        fn resolve(&self) -> crate::Result<PathBuf> {
            Ok(PathBuf::from("/tmp/downloads"))
        }
    }

    #[derive(Default)]
    struct Failures(Mutex<Vec<(String, String)>>);

    impl FailureObserver for Failures {
        fn failed(&self, id: &str, _url: &str, error: &crate::DownloaderError) {
            lock(&self.0).push((id.to_owned(), error.to_string()));
        }
    }

    fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
        mutex
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn queue(runner: &Arc<Parked>) -> Arc<DownloadQueue> {
        DownloadQueue::new(
            Arc::new(NoPersistence),
            Arc::clone(runner) as Arc<dyn DownloadRunner>,
            Arc::new(NoSink),
            Arc::new(Here),
        )
    }

    fn input(url: &str) -> EnqueueDownloadInput {
        EnqueueDownloadInput {
            url: url.to_owned(),
            title: url.to_owned(),
            ..EnqueueDownloadInput::default()
        }
    }

    fn done(name: &str) -> Result<PathBuf, DownloadFailure> {
        Ok(PathBuf::from(format!("/tmp/downloads/{name}.mp3")))
    }

    /// The swap waits for every running download, and nothing queued starts
    /// into a slot freed while it waits.
    #[tokio::test]
    async fn the_swap_waits_for_running_downloads_and_starts_nothing_new() {
        let runner = Arc::new(Parked::default());
        let queue = queue(&runner);
        for index in 0..4 {
            queue
                .enqueue(input(&format!("https://youtu.be/{index}")))
                .await;
        }
        runner.wait_for(3).await;

        let gate = Arc::new(QueueGate::new(Arc::clone(&queue)));
        let quiescing = {
            let gate = Arc::clone(&gate);
            tokio::spawn(async move { gate.quiesce().await })
        };

        runner.finish(0, done("0"));
        runner.finish(1, done("1"));
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            !quiescing.is_finished(),
            "a download is still running, so the swap must still be waiting"
        );
        assert_eq!(runner.started(), 3, "the fourth item must not start");

        runner.finish(2, done("2"));
        let hold = quiescing
            .await
            .expect("the task completes")
            .expect("idle now");
        assert!(queue.is_idle());
        assert!(
            !queue.snapshot().paused,
            "the hold is not the user's pause and must not show as one"
        );

        drop(hold);
        runner.wait_for(4).await;
    }

    /// Downloads that outlast the limit postpone the update rather than hold
    /// the queue indefinitely, and leave nothing held behind.
    #[tokio::test]
    async fn the_swap_gives_up_when_downloads_outlast_its_limit() {
        let runner = Arc::new(Parked::default());
        let queue = queue(&runner);
        queue.enqueue(input("https://youtu.be/long")).await;
        runner.wait_for(1).await;

        let gate = QueueGate::with_limit(Arc::clone(&queue), Duration::from_millis(20));
        assert!(gate.quiesce().await.is_none());

        queue.enqueue(input("https://youtu.be/next")).await;
        runner.wait_for(2).await;
    }

    /// A hold is a guard: a task that panics while holding the queue still
    /// releases it, so a bug in an update cannot stop downloads for good.
    #[tokio::test]
    async fn a_panic_while_holding_still_releases_the_queue() {
        let runner = Arc::new(Parked::default());
        let queue = queue(&runner);

        let gate = QueueGate::new(Arc::clone(&queue));
        let crashed = tokio::spawn(async move {
            let _hold = gate
                .quiesce()
                .await
                .expect("an idle queue quiesces at once");
            panic!("an update that crashed mid-swap");
        });
        assert!(crashed.await.is_err(), "the task panicked");

        queue.enqueue(input("https://youtu.be/after")).await;
        runner.wait_for(1).await;
    }

    /// Counts the processes it is asked to run, and runs none.
    #[derive(Default)]
    struct Counting(std::sync::atomic::AtomicUsize);

    #[async_trait::async_trait]
    impl crate::spawn::ProcessRunner for Counting {
        async fn run(
            &self,
            _spec: crate::spawn::ProcessSpec,
            _lines: Option<&(dyn crate::spawn::LineSink + '_)>,
            _cancel: &CancellationToken,
        ) -> std::result::Result<crate::spawn::ProcessOutput, crate::spawn::ProcessError> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(crate::spawn::ProcessOutput::default())
        }
    }

    /// evermeet.cx publishes no checksum, so ffmpeg on macOS is never checked
    /// or touched unattended. With an installed pair on disk, an update that
    /// went ahead would first probe its version (a process) alongside asking
    /// evermeet.cx for the latest one (a request); zero processes run means
    /// the manager was never reached, so no request was made either.
    #[tokio::test]
    async fn ffmpeg_is_never_updated_unattended_on_macos() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        tokio::fs::write(temp.path().join("ffmpeg"), b"old")
            .await
            .expect("write");
        tokio::fs::write(temp.path().join("ffprobe"), b"old")
            .await
            .expect("write");
        let client = Arc::new(shiranami_net::HttpClient::new().expect("the client builds"));
        let runner = Arc::new(Counting::default());
        let as_runner = || Arc::clone(&runner) as Arc<dyn crate::spawn::ProcessRunner>;
        let bin = temp.path().to_path_buf();
        let tools = Tools::new(
            YtDlpManager::new(
                bin.clone(),
                Platform::MacOs,
                Arc::clone(&client),
                as_runner(),
            ),
            FfmpegManager::new(bin, Platform::MacOs, client, as_runner()),
        );
        assert!(
            tools.ffmpeg.is_installed().await,
            "an update would have something to do"
        );
        let gate = QueueGate::new(queue(&Arc::new(Parked::default())));

        let outcome = update_tool(Tool::Ffmpeg, &tools, &gate).await;

        assert_eq!(outcome, UpdateOutcome::NotSupported);
        assert_eq!(
            runner.0.load(std::sync::atomic::Ordering::SeqCst),
            0,
            "no version probe, so the manager (and its request) was never reached"
        );
        assert!(!tools.ffmpeg.is_installing());
    }

    /// A failure is reported after the item settles as `error`, so a retry the
    /// observer triggers finds it retryable.
    #[tokio::test]
    async fn a_failed_download_is_reported_after_it_settles() {
        let runner = Arc::new(Parked::default());
        let queue = queue(&runner);
        let failures = Arc::new(Failures::default());
        queue.observe_failures(Arc::clone(&failures) as Arc<dyn FailureObserver>);

        let id = queue.enqueue(input("https://youtu.be/broken")).await;
        runner.wait_for(1).await;
        runner.finish(
            0,
            Err(DownloadFailure::Failed(crate::DownloaderError::YtDlp {
                code: "ERROR: [youtube] broken: Unable to extract uploader id".to_owned(),
            })),
        );

        for _ in 0..2_000 {
            if !lock(&failures.0).is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        assert_eq!(
            lock(&failures.0).clone(),
            vec![(
                id.clone(),
                "ERROR: [youtube] broken: Unable to extract uploader id".to_owned()
            )]
        );
        let status = queue
            .snapshot()
            .items
            .into_iter()
            .find(|item| item.id == id)
            .map(|item| item.status);
        assert_eq!(
            status,
            Some(shiranami_core::models::DownloadQueueStatus::Error)
        );
    }
}
