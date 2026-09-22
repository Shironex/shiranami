//! The two scan entry points.
//!
//! Ported from the `library:scan-folder` and `library:scan-folder-grouped`
//! handlers (`library.ts:318-355`, `:420-470`).
//!
//! Both are synchronous. v1's were `async` because Node's filesystem API is,
//! not because anything awaited concurrently; in v2 the command layer wraps
//! them in `spawn_blocking`, which is the convention architecture §2.3 sets and
//! `core::paths` already follows. It keeps the pipeline a plain function that a
//! test can call without a runtime.

use std::path::{Path, PathBuf};

use tokio_util::sync::CancellationToken;

use crate::error::{LibraryError, Result};
use crate::scan::discover::{discover_files, discover_grouped};
use crate::scan::model::{GroupedScanResult, ProgressFn, ScannedFile, SubfolderScan};
use crate::scan::parse::ParseRun;
use crate::scan::telemetry::{ScanKind, ScanTelemetry};

/// Scan `root` and return every audio file beneath it, flat.
///
/// **No production caller.** `apps/web` reaches only for the grouped form; this
/// one survives because the e2e suite drives it and because deleting a channel
/// the frozen `ALL_IPC_CHANNELS` list still names would fail Phase 14's parity
/// checklist.
///
/// `data_dir` is the app data directory, where embedded covers are cached; pass
/// `None` to skip cover extraction entirely.
pub fn scan_folder(
    root: &Path,
    data_dir: Option<&Path>,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
) -> Result<Vec<ScannedFile>> {
    let telemetry = ScanTelemetry::start(ScanKind::Flat);

    let files = discover_files(root);
    let run = ParseRun::new(data_dir, cancel, progress, files.len());
    let outcome = run.parse_all(&files);

    telemetry.record_end(files.len(), outcome.is_err());
    outcome
}

/// Scan `root` and return its loose files plus one group per immediate
/// subdirectory.
///
/// This is the only path production uses: `scanAndPersistFolder` calls it for
/// the add-folder flow, the rescan flow and the onboarding flow alike.
///
/// # One parse pass, not one per group
///
/// v1 parsed the root files, then ran four subfolders concurrently with their
/// own pools inside. v2 flattens every discovered file into a single ordered
/// pass and slices the results back into groups afterwards. The output is
/// identical — order is preserved end to end — and so is the progress contract,
/// which v1 already made scan-wide by calling `setBatchSize(totalFiles)` once
/// rather than per group. What changes is that the concurrency ceiling is the
/// 16 the phase plan names instead of the 16×4 the nesting happened to produce.
pub fn scan_folder_grouped(
    root: &Path,
    data_dir: Option<&Path>,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
) -> Result<GroupedScanResult> {
    let telemetry = ScanTelemetry::start(ScanKind::Grouped);

    let groups = discover_grouped(root);
    let total = groups.total_files();

    let mut every_file = Vec::with_capacity(total);
    every_file.extend_from_slice(&groups.root_files);
    for subfolder in &groups.subfolders {
        every_file.extend_from_slice(&subfolder.files);
    }

    let outcome = ParseRun::new(data_dir, cancel, progress, total).parse_all(&every_file);
    telemetry.record_end(total, outcome.is_err());

    let mut parsed = outcome?.into_iter();

    // Slice the flat result back into its groups, in the order it was flattened.
    let root_tracks: Vec<ScannedFile> = parsed.by_ref().take(groups.root_files.len()).collect();

    let mut subfolders = Vec::with_capacity(groups.subfolders.len());
    for subfolder in groups.subfolders {
        let tracks = parsed.by_ref().take(subfolder.files.len()).collect();
        subfolders.push(SubfolderScan {
            name: subfolder.name,
            path: subfolder.path,
            tracks,
        });
    }

    Ok(GroupedScanResult {
        root_tracks,
        subfolders,
    })
}

/// v1's handler-level cancellation mapping: an aborted scan resolves empty.
///
/// Both handlers ended in the same three lines —
///
/// ```js
/// if (err instanceof ScanCancelledError) {
///   logger.info(`[library] Scan cancelled after ${Date.now() - start}ms`);
///   return [];
/// }
/// ```
///
/// — and the renderer depends on it: `scanAndPersistFolder` reads
/// `results.length === 0` as "nothing to persist" and reports an empty folder,
/// whereas a rejection would surface as a failure toast for an action the user
/// deliberately took. Phase 14's commands call this rather than reimplementing
/// it.
///
/// It also states the property the phase is gated on. Nothing downstream of a
/// cancelled scan runs — no `db:tracks:add-many`, no `db:folders:add`, no
/// `db:folders:update-scanned` — so a cancelled scan leaves the database exactly
/// as it found it, with no partial rows to be torn.
pub fn empty_on_cancel<T: Default>(result: Result<T>) -> T {
    match result {
        Ok(value) => value,
        Err(LibraryError::Cancelled) => {
            tracing::info!("scan cancelled; resolving empty");
            T::default()
        }
    }
}

/// Every file the flat scan would return, without reading a single tag.
///
/// Exposed for callers that want the file set alone — the progress bar's total,
/// a dry run, a test. Reading tags is the expensive half; discovery is one walk.
pub fn discover(root: &Path) -> Vec<PathBuf> {
    discover_files(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cancelled_scan_resolves_empty_rather_than_failing() {
        let cancelled: Result<Vec<ScannedFile>> = Err(LibraryError::Cancelled);
        assert!(empty_on_cancel(cancelled).is_empty());

        let grouped: Result<GroupedScanResult> = Err(LibraryError::Cancelled);
        assert_eq!(empty_on_cancel(grouped), GroupedScanResult::default());
    }

    #[test]
    fn a_successful_scan_passes_through_untouched() {
        let files = vec![PathBuf::from("/music/a.mp3")];
        assert_eq!(empty_on_cancel(Ok(files.clone())), files);
    }
}
