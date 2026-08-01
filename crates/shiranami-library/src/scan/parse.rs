//! Reading tags off every discovered file, in parallel, cancellably.
//!
//! Ported from `parseAudioFilesViaUtility` (`library.ts:122-141`) and the
//! `utilityProcess` it drove (`workers/scan-utility.ts`).
//!
//! # The shape, and what replaced what
//!
//! v1 forked a `utilityProcess`, kept up to 16 `parse` messages in flight, and
//! did the tag read, the cover decode, the 512 px downscale and the JPEG encode
//! over there so that only a `shiranami-art://` URL ever crossed a process
//! boundary. v2 has no boundary to protect: the identical work happens on a
//! rayon worker, and the two-process handshake — hello/ready/init timeouts, a
//! `postMessage` cancel, a 2-second `SIGTERM` backstop — collapses into a
//! [`CancellationToken`], exactly as architecture §2.2 row 16 predicted.
//!
//! **Workers are readers, not writers.** Every rayon worker only reads a file
//! and appends bytes to the content-addressed art cache, whose writes are
//! `O_EXCL` and already race-safe. Nothing here touches the database, so the
//! single-connection pool this crate does not even depend on cannot be
//! contended. See the crate docs for why that is a finding rather than an
//! omission.
//!
//! # Concurrency: 16, and deliberately not 64
//!
//! `PARSE_CONCURRENCY` is v1's, but v1's *grouped* scan — the only path
//! production uses — nested two pools: root files at 16, then four subfolders
//! concurrently at 16 each, for a real peak of 64 in-flight parses
//! (`library.ts:443-453`). That number is an artifact of the pool-of-round-trips
//! shape, not a tuning decision, and reproducing it would mean 64 threads
//! decoding JPEGs at once. v2 flattens the scan into one pass over every
//! discovered file at 16, which the phase plan names, keeps output order and the
//! end-to-end progress contract identical, and bounds the work honestly.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use shiranami_metadata::read_metadata_or_placeholder;
use tokio_util::sync::CancellationToken;

use crate::error::{LibraryError, Result};
use crate::scan::model::{ProgressFn, ScanProgress, ScannedFile};

/// How many files are parsed at once. v1's `PARSE_CONCURRENCY`.
pub const PARSE_CONCURRENCY: usize = 16;

/// Everything one scan needs that is not per-file.
pub struct ParseRun<'a> {
    /// App data directory, for the album-art cache. `None` skips covers.
    data_dir: Option<&'a Path>,
    /// The single-slot cancel that replaced v1's `activeScanAbort`.
    cancel: &'a CancellationToken,
    /// Where progress ticks go.
    progress: ProgressFn<'a>,
    /// v1's `progressTotal`, set once for the whole scan.
    total: usize,
    /// v1's `progressEmitted`.
    settled: AtomicUsize,
}

impl<'a> ParseRun<'a> {
    /// Prepare a run over `total` files.
    pub fn new(
        data_dir: Option<&'a Path>,
        cancel: &'a CancellationToken,
        progress: ProgressFn<'a>,
        total: usize,
    ) -> Self {
        Self {
            data_dir,
            cancel,
            progress,
            total,
            settled: AtomicUsize::new(0),
        }
    }

    /// Parse every file, sixteen at a time, preserving input order.
    ///
    /// Order is load-bearing twice over: the caller slices the flat result back
    /// into groups by position, and the renderer inserts the rows in the order
    /// it receives them.
    ///
    /// Cancellation is checked once per file, at the top of the task, which is
    /// where v1 checks it. A worker that finds the token set does no work at all
    /// — no read, no decode, no cover write — and the first `Err` stops the
    /// remaining workers from claiming new files, reproducing the `hasFailed`
    /// latch in v1's `mapWithConcurrency`.
    pub fn parse_all(&self, files: &[PathBuf]) -> Result<Vec<ScannedFile>> {
        if files.is_empty() {
            return Ok(Vec::new());
        }

        // A scan-owned pool rather than the global one: a library scan runs for
        // minutes, and monopolising the process-wide pool for that long would
        // stall every other rayon user behind it. If the threads cannot be
        // spawned at all there is nothing worth failing a scan over, so the work
        // falls back to whatever pool is installed.
        match rayon::ThreadPoolBuilder::new()
            .num_threads(PARSE_CONCURRENCY)
            .thread_name(|index| format!("shiranami-scan-{index}"))
            .build()
        {
            Ok(pool) => pool.install(|| self.parse_in_parallel(files)),
            Err(error) => {
                tracing::warn!(%error, "could not build the scan thread pool; using the default");
                self.parse_in_parallel(files)
            }
        }
    }

    fn parse_in_parallel(&self, files: &[PathBuf]) -> Result<Vec<ScannedFile>> {
        files.par_iter().map(|file| self.parse_one(file)).collect()
    }

    /// One file: check the token, read the tags, report progress.
    fn parse_one(&self, file: &Path) -> Result<ScannedFile> {
        if self.cancel.is_cancelled() {
            return Err(LibraryError::Cancelled);
        }

        // Never fails: an unparseable file becomes the filename-derived
        // placeholder row v1 substituted, and a cover that will not cache is
        // dropped while the track survives. Both behaviours live in
        // `shiranami-metadata`, which documents this as the function the scan
        // pipeline is meant to call.
        let metadata = read_metadata_or_placeholder(file, self.data_dir);

        self.report(file);

        Ok(ScannedFile {
            file_path: file.to_path_buf(),
            metadata,
        })
    }

    /// Emit one tick for a settled parse.
    ///
    /// The index formula is v1's, verbatim:
    ///
    /// ```js
    /// const fileIndex = Math.min(progressEmitted + 1, Math.max(progressTotal, 1));
    /// progressEmitted++;
    /// ```
    ///
    /// Read-then-increment, so the first settle reports `1`; the clamp is what
    /// stops a mis-sized batch from driving the bar past its total.
    fn report(&self, file: &Path) {
        let already_settled = self.settled.fetch_add(1, Ordering::SeqCst);
        let file_index = (already_settled + 1).min(self.total.max(1));

        (self.progress)(ScanProgress {
            file_path: file.to_path_buf(),
            file_index,
            file_count: self.total,
            // See `ScanProgress::ok` — the `false` case was a two-process
            // artifact and is unreachable in an in-process pipeline.
            ok: true,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_with_total<'a>(
        cancel: &'a CancellationToken,
        progress: ProgressFn<'a>,
        total: usize,
    ) -> ParseRun<'a> {
        ParseRun::new(None, cancel, progress, total)
    }

    #[test]
    fn the_index_climbs_by_one_and_starts_at_one() {
        let cancel = CancellationToken::new();
        let seen = std::sync::Mutex::new(Vec::new());
        let sink = |progress: ScanProgress| {
            seen.lock()
                .expect("the sink lock")
                .push(progress.file_index);
        };

        let run = run_with_total(&cancel, &sink, 3);
        for name in ["a", "b", "c"] {
            run.report(Path::new(name));
        }

        let mut indices = seen.into_inner().expect("the sink lock");
        indices.sort_unstable();
        assert_eq!(indices, vec![1, 2, 3]);
    }

    #[test]
    fn the_index_is_clamped_to_the_total() {
        // v1's `Math.min(..., Math.max(progressTotal, 1))`: more settles than
        // the batch size were announced for must not push the bar past 100%.
        let cancel = CancellationToken::new();
        let seen = std::sync::Mutex::new(Vec::new());
        let sink = |progress: ScanProgress| {
            seen.lock()
                .expect("the sink lock")
                .push(progress.file_index);
        };

        let run = run_with_total(&cancel, &sink, 2);
        for name in ["a", "b", "c", "d"] {
            run.report(Path::new(name));
        }

        assert_eq!(seen.into_inner().expect("the sink lock"), vec![1, 2, 2, 2]);
    }

    #[test]
    fn a_zero_total_still_reports_index_one() {
        // `Math.max(progressTotal, 1)` — v1 pins every event at `fileIndex: 1,
        // fileCount: 0` when the batch size was never set, and the renderer's
        // `fileCount > 0` guard is what keeps that off the progress bar.
        let cancel = CancellationToken::new();
        let seen = std::sync::Mutex::new(Vec::new());
        let sink = |progress: ScanProgress| {
            seen.lock()
                .expect("the sink lock")
                .push((progress.file_index, progress.file_count));
        };

        let run = run_with_total(&cancel, &sink, 0);
        run.report(Path::new("a"));
        run.report(Path::new("b"));

        assert_eq!(
            seen.into_inner().expect("the sink lock"),
            vec![(1, 0), (1, 0)]
        );
    }

    #[test]
    fn an_empty_input_never_builds_a_pool() {
        let cancel = CancellationToken::new();
        let sink = crate::scan::model::ignore_progress;
        let run = run_with_total(&cancel, &sink, 0);

        assert_eq!(run.parse_all(&[]).expect("an empty scan succeeds"), vec![]);
    }

    #[test]
    fn an_already_cancelled_run_does_no_work_at_all() {
        let cancel = CancellationToken::new();
        cancel.cancel();

        let emitted = AtomicUsize::new(0);
        let sink = |_: ScanProgress| {
            emitted.fetch_add(1, Ordering::SeqCst);
        };

        let run = run_with_total(&cancel, &sink, 2);
        let outcome = run.parse_all(&[PathBuf::from("a.mp3"), PathBuf::from("b.mp3")]);

        assert_eq!(outcome, Err(LibraryError::Cancelled));
        assert_eq!(
            emitted.load(Ordering::SeqCst),
            0,
            "a cancelled worker must not even report progress"
        );
    }
}
