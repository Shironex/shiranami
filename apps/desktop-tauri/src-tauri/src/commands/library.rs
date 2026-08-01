//! `library:*` — the folder scan, its cancellation, and the on-disk validation.
//!
//! Five channels, ported from `apps/desktop/src/main/ipc/library.ts`. Every one
//! of them delegates into `shiranami-library`, whose module docs carry the
//! pipeline's reasoning; what lives here is the four things a scan crate cannot
//! decide for itself — where the app data directory is, which thread the walk
//! runs on, where a progress tick goes, and what a cancelled scan resolves to.
//!
//! # This namespace writes no database rows, and that is the contract
//!
//! Architecture §Phase 10: v1's main process is a **stateless scanner**. It
//! discovers files, reads their tags, and returns the whole result across IPC.
//! Every reconciliation decision — which paths are new, which are gone, what to
//! insert, what to delete — lives in the renderer, in `scanHelpers.ts` and
//! `useLibraryRescan.ts`, as three separate round-trips:
//! `library:scan-folder-grouped`, then `db:tracks:exists-many`, then
//! `db:tracks:add-many`.
//!
//! `apps/web` is unchanged in v2 (§2.6), so it still does all of that. A scan
//! that also wrote rows would not merely duplicate work: `db:tracks:add-many` is
//! `ON CONFLICT DO NOTHING` and returns only the rows that landed, so the
//! renderer would receive an empty array, report "library up to date" for a
//! folder full of new music, and never enqueue the tracks it had just imported.
//!
//! So **no command here takes `State<'_, AppState>`**, which is the structural
//! form of that rule: there is no connection in scope to write a row with.
//!
//! # A cancelled scan resolves empty rather than rejecting
//!
//! Both v1 scan handlers ended in the same three lines — catch
//! `ScanCancelledError`, log, `return []` — and the renderer depends on it:
//! `scanAndPersistFolder` reads `results.length === 0` as "nothing to persist",
//! whereas a rejection would surface as a failure toast for an action the user
//! deliberately took. [`shiranami_library::empty_on_cancel`] is that mapping,
//! and it is called rather than reimplemented.
//!
//! # Concurrent scans replace rather than refuse
//!
//! [`ScanSlot`] holds one token and a *newer* scan overwrites it, exactly as
//! v1's `activeScanAbort = abort` did with no busy check — unlike the enrich and
//! loudness slots, which reject a second run outright. The release is
//! identity-checked so a scan finishing late cannot clear a newer one's slot.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use shiranami_core::error::{ErrorPayload, codes};
use shiranami_library::{
    GroupedScanResult, ScanProgress, ScannedFile, empty_on_cancel, scan_folder,
    scan_folder_grouped, validate_files,
};
use tauri::{AppHandle, Manager as _, State};
use tauri_specta::Event as _;
use tokio_util::sync::CancellationToken;

use crate::error::{CommandResult, bad_request};
use crate::events::LibraryScanProgress;
use crate::wire::Json;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::library::library_parse_metadata,
                crate::commands::library::library_scan_folder,
                crate::commands::library::library_scan_folder_grouped,
                crate::commands::library::library_scan_cancel,
                crate::commands::library::library_validate_files,
            ]
        }
    };
}
pub(crate) use commands;

// ── lane-shared helpers ──────────────────────────────────────────────────────
//
// `commands/mod.rs` is generated from the shared namespace list, so a lane
// cannot add a non-namespace sibling module to hold helpers its own namespaces
// share. These two live in the media-pipeline lane's first module and are used
// by `loudness`, `metadata` and `waveform` as well. They belong in
// `crate::wire` — the module already documented as "wire helpers the command
// layer needs and no domain crate should own" — and should move there the
// moment a shared-file edit is cheaper than a cross-lane conflict.

/// Run CPU-bound or blocking work off the webview's thread (§2.3, R15).
///
/// The join failure is a panic inside `work`, which is a bug rather than a
/// runtime condition — but it must still cross as a code-bearing rejection, or
/// the renderer's `switch (err.code)` sees `undefined` for the one case where
/// something has genuinely gone wrong.
///
/// `tauri::async_runtime::spawn_blocking`, never tokio's directly: from a thread
/// Tauri entered through an OS callback there is no reactor, and the resulting
/// panic crosses an `extern "C"` boundary as a `SIGABRT` (R16).
pub(crate) async fn off_thread<T, F>(operation: &'static str, work: F) -> CommandResult<T>
where
    F: FnOnce() -> CommandResult<T> + Send + 'static,
    T: Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(outcome) => outcome,
        Err(error) => Err(ErrorPayload {
            code: codes::INTERNAL.to_owned(),
            message: format!("could not {operation}: {error}"),
            details: None,
        }),
    }
}

/// The app data directory, or `None` when the platform will not name one.
///
/// `None` is a real, survivable state rather than a failure: it is where the
/// album-art cache lives, and every consumer in this lane takes
/// `Option<&Path>` and simply skips cover extraction without it. v1 dropped a
/// cover that would not write while keeping the track, and this is the same
/// trade one level up — a scan that refused to run because a directory could
/// not be resolved would lose the user the tags as well as the artwork.
pub(crate) fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    match app.path().app_data_dir() {
        Ok(dir) => Some(dir),
        Err(error) => {
            tracing::warn!(%error, "no app data directory; cover art will not be cached");
            None
        }
    }
}

/// v1's `z.string().min(1)`, which guards a path argument on every channel in
/// this lane.
///
/// serde accepts any string, including the empty one, and an empty path resolves
/// to the process's working directory — so an unguarded scan would walk it and
/// an unguarded disk-usage call would report bytes from somewhere the user never
/// added to their library. Refused under the same `BAD_REQUEST` code v1's zod
/// failure produced.
pub(crate) fn require_path(path: &Path) -> CommandResult<()> {
    if path.as_os_str().is_empty() {
        return Err(bad_request("the path must not be empty"));
    }
    Ok(())
}

// ── the cancellation slot ────────────────────────────────────────────────────

/// The one in-flight scan's cancellation token.
///
/// Managed state rather than a `static`, per §2.3's "no globals". Phase 16
/// `manage`s it alongside [`crate::state::AppState`]; until then
/// `library:scan-cancel` answers "state not managed", which is the same honest
/// intermediate every stateful command in this crate is already in.
#[derive(Debug, Default)]
pub struct ScanSlot {
    // A plain `std::sync::Mutex`: it guards a small `Option` and is never held
    // across an await, which is the workspace rule for choosing it over tokio's.
    active: Mutex<Option<Run>>,
    generations: AtomicU64,
}

/// The scan currently holding the slot.
#[derive(Debug)]
struct Run {
    token: CancellationToken,
    /// Monotonic run number, so a guard can tell whether the slot is still
    /// *its* scan's before clearing it. v1 compared the `AbortController` by
    /// reference; a counter says the same without the token needing an identity
    /// comparison.
    generation: u64,
}

impl ScanSlot {
    /// Take the slot, displacing whatever held it.
    ///
    /// v1 assigns `activeScanAbort = abort` unconditionally — there is no busy
    /// check on either scan channel — so a second scan starting while a first
    /// runs simply becomes what `library:scan-cancel` cancels. The first is left
    /// running and still resolves; it is only unreachable by the cancel button.
    fn begin(&self) -> ScanGuard<'_> {
        let token = CancellationToken::new();
        let generation = self.generations.fetch_add(1, Ordering::SeqCst);

        *lock(&self.active) = Some(Run {
            token: token.clone(),
            generation,
        });

        ScanGuard {
            slot: self,
            token,
            generation,
        }
    }

    /// Cancel the active scan. A no-op when none is running.
    ///
    /// Idle is deliberately not an error: v1 logs and returns, because a stale
    /// flag left set by a mistimed cancel would poison the next scan.
    fn cancel(&self) {
        match lock(&self.active).as_ref() {
            Some(run) => {
                tracing::info!("scan cancellation requested");
                run.token.cancel();
            }
            None => tracing::info!("scan cancel requested with no active scan"),
        }
    }
}

/// Proof that the caller holds the scan slot; releases it on drop.
struct ScanGuard<'slot> {
    slot: &'slot ScanSlot,
    token: CancellationToken,
    generation: u64,
}

impl ScanGuard<'_> {
    /// The cancellation token for this scan.
    fn token(&self) -> CancellationToken {
        self.token.clone()
    }
}

impl Drop for ScanGuard<'_> {
    fn drop(&mut self) {
        let mut active = lock(&self.slot.active);

        // v1's `if (activeScanAbort === abort)`. A scan that finishes after a
        // newer one started must not clear the newer one's slot, or the cancel
        // button would silently stop working for a scan still running.
        if active
            .as_ref()
            .is_some_and(|current| current.generation == self.generation)
        {
            *active = None;
        }
    }
}

/// `lock_or_recover` for this module's one mutex.
///
/// The workspace forbids `.expect("poisoned")`: the guarded value is a plain
/// `Option` with no invariant a panic could have broken, so recovering beats
/// turning one crash into two.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

// ── the commands ─────────────────────────────────────────────────────────────

/// `library:parse-metadata` — read one file's tags.
///
/// Stays off the scan pipeline entirely, as v1's did: spawning a whole scan for
/// one file is overkill, and a single parse does not accumulate the pressure
/// that drove v1 to a utility process in the first place.
///
/// Never fails on a bad file. v1's `parseAudioMetadata` caught everything and
/// returned a filename-derived placeholder row, which is exactly what
/// [`shiranami_metadata::read_metadata_or_placeholder`] is for — the renderer
/// shows a track named after its file rather than an error.
#[tauri::command]
#[specta::specta]
pub async fn library_parse_metadata(
    app: AppHandle,
    file_path: PathBuf,
) -> CommandResult<ScannedFile> {
    require_path(&file_path)?;
    let data_dir = data_dir(&app);

    off_thread("read the file's tags", move || {
        Ok(ScannedFile {
            metadata: shiranami_metadata::read_metadata_or_placeholder(
                &file_path,
                data_dir.as_deref(),
            ),
            file_path,
        })
    })
    .await
}

/// `library:scan-folder` — every audio file beneath a folder, flat.
///
/// No production caller: `apps/web` reaches only for the grouped form. It
/// survives because the e2e suite drives it and because dropping a channel the
/// frozen manifest still names would fail the parity checklist (R13).
#[tauri::command]
#[specta::specta]
pub async fn library_scan_folder(
    app: AppHandle,
    slot: State<'_, ScanSlot>,
    dir_path: PathBuf,
) -> CommandResult<Vec<ScannedFile>> {
    require_path(&dir_path)?;

    let guard = slot.begin();
    let cancel = guard.token();
    let data_dir = data_dir(&app);
    let progress = progress_sink(app);

    off_thread("scan the folder", move || {
        Ok(empty_on_cancel(scan_folder(
            &dir_path,
            data_dir.as_deref(),
            &cancel,
            &progress,
        )))
    })
    .await
}

/// `library:scan-folder-grouped` — loose files plus one group per subfolder.
///
/// The only path production uses: the add-folder, rescan and onboarding flows
/// all call it. Grouping feeds exactly one feature — the "create playlists from
/// these subfolders?" prompt — and not album detection, which `apps/web` derives
/// from tags instead.
#[tauri::command]
#[specta::specta]
pub async fn library_scan_folder_grouped(
    app: AppHandle,
    slot: State<'_, ScanSlot>,
    dir_path: PathBuf,
) -> CommandResult<GroupedScanResult> {
    require_path(&dir_path)?;

    let guard = slot.begin();
    let cancel = guard.token();
    let data_dir = data_dir(&app);
    let progress = progress_sink(app);

    off_thread("scan the folder", move || {
        Ok(empty_on_cancel(scan_folder_grouped(
            &dir_path,
            data_dir.as_deref(),
            &cancel,
            &progress,
        )))
    })
    .await
}

/// `library:scan-cancel` — cancel the active scan, if any.
///
/// Best-effort and immediate: it returns as soon as the token is cancelled,
/// while the scan itself unwinds and resolves empty through its own channel.
/// Cancelling while idle is a no-op, not an error.
#[tauri::command]
#[specta::specta]
pub async fn library_scan_cancel(slot: State<'_, ScanSlot>) -> CommandResult<()> {
    slot.cancel();
    Ok(())
}

/// `library:validate-files` — which of these paths are gone from disk.
///
/// Returns only the **missing** paths, in input order, duplicates preserved.
/// It reports; it does not decide — the renderer maps them back to track ids and
/// calls `db:tracks:remove-many` itself, which is a hard delete. See the crate's
/// module docs for what that costs on an unmounted drive, and why softening it
/// belongs in `apps/web` rather than here.
#[tauri::command]
#[specta::specta]
pub async fn library_validate_files(file_paths: Vec<PathBuf>) -> CommandResult<Vec<PathBuf>> {
    for path in &file_paths {
        require_path(path)?;
    }

    off_thread("validate the file paths", move || {
        Ok(validate_files(&file_paths))
    })
    .await
}

/// A progress sink that emits `library:scan-progress` for every settled file.
///
/// Called from several rayon workers at once, so it must be `Sync` as well as
/// `Send`; `AppHandle` is both, and `emit` is safe from any thread.
///
/// **A failed emit is dropped, never propagated.** v1's `sendToRenderer` returns
/// `false` for a destroyed window and the scan carries on; failing a
/// forty-thousand-file scan because the user closed the window mid-way would be
/// a new behaviour, and a worse one.
///
/// The payload is serialized into [`Json`] rather than carried as a typed event
/// field. `crate::events` declares this channel as `Json` for the lanes that had
/// not landed when it was written, and the emitted bytes are identical either
/// way — `ScanProgress` is `#[serde(rename_all = "camelCase")]`, so this
/// produces exactly the `{filePath, fileIndex, fileCount, ok}` object
/// `webContents.send` produced. Narrowing the event's declared type is a
/// binding-visible change to a file every lane shares, so it is deliberately not
/// made here.
fn progress_sink(app: AppHandle) -> impl Fn(ScanProgress) + Send + Sync + 'static {
    move |tick| {
        let Ok(payload) = serde_json::to_value(&tick) else {
            // `ScanProgress` is four scalars; this is unreachable short of an
            // allocator failure, and a lost tick is a stalled bar, not a lost
            // scan.
            tracing::warn!("a scan progress tick could not be serialized");
            return;
        };

        let _ = LibraryScanProgress(Json(payload)).emit(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::models::TrackMetadata;
    use shiranami_library::scan::ignore_progress;
    use std::sync::Arc;

    /// A folder holding `count` files that are not decodable audio.
    ///
    /// Deliberately not real audio: every assertion below is about the command
    /// layer's contract — order, grouping, cancellation, the empty-on-cancel
    /// mapping — and the crate's own suite already covers tag reading against
    /// real fixtures. A `.mp3` that will not parse still produces a
    /// `ScannedFile`, because v1 substituted a filename-derived placeholder
    /// rather than dropping the file.
    fn tree(root: &Path, count: usize) -> Vec<PathBuf> {
        (0..count)
            .map(|index| {
                let path = root.join(format!("track-{index}.mp3"));
                std::fs::write(&path, b"not really audio").expect("the fixture writes");
                path
            })
            .collect()
    }

    fn scanned(path: &Path) -> ScannedFile {
        ScannedFile {
            file_path: path.to_path_buf(),
            metadata: TrackMetadata {
                title: "T".to_owned(),
                artist: String::new(),
                album_artist: None,
                album: String::new(),
                duration: 0.0,
                genre: String::new(),
                year: None,
                track_number: None,
                disc_number: None,
                album_art: None,
            },
        }
    }

    // ── the slot ─────────────────────────────────────────────────────────────

    #[test]
    fn cancelling_marks_the_active_scan() {
        let slot = ScanSlot::default();
        let guard = slot.begin();

        assert!(!guard.token().is_cancelled());
        slot.cancel();
        assert!(guard.token().is_cancelled());
    }

    /// v1's regression: a stale flag left set by a mistimed cancel made the
    /// *next* scan start pre-cancelled, so the folder the user just added
    /// imported nothing and reported success.
    #[test]
    fn cancelling_while_idle_does_not_poison_the_next_scan() {
        let slot = ScanSlot::default();

        slot.cancel();

        let guard = slot.begin();
        assert!(
            !guard.token().is_cancelled(),
            "a new scan must not inherit a cancel aimed at nothing"
        );
    }

    /// Unlike the enrich and loudness slots, a second scan is **not** refused —
    /// v1 has no busy check here. The newer scan is what the cancel button
    /// reaches.
    #[test]
    fn a_second_scan_displaces_the_first_rather_than_being_refused() {
        let slot = ScanSlot::default();
        let first = slot.begin();
        let second = slot.begin();

        slot.cancel();

        assert!(second.token().is_cancelled());
        assert!(
            !first.token().is_cancelled(),
            "the displaced scan keeps running; it is only unreachable by cancel"
        );
    }

    /// Without the identity check, the first scan's cleanup frees the slot while
    /// the second is still running, and the cancel button goes dead for it.
    #[test]
    fn a_late_finishing_scan_does_not_release_a_newer_ones_slot() {
        let slot = ScanSlot::default();
        let first = slot.begin();
        let second = slot.begin();

        drop(first);

        slot.cancel();
        assert!(
            second.token().is_cancelled(),
            "the older scan's cleanup cleared a slot it no longer owned"
        );
    }

    #[test]
    fn the_slot_is_empty_once_its_only_guard_drops() {
        let slot = ScanSlot::default();
        drop(slot.begin());

        assert!(lock(&slot.active).is_none());
    }

    // ── the empty-on-cancel wire contract ────────────────────────────────────

    /// The property the whole cancellation story rests on: `apps/web` reads
    /// `results.length === 0` as "nothing to persist", so a cancelled scan must
    /// resolve empty rather than reject. A rejection would raise a failure toast
    /// for something the user deliberately asked for.
    #[test]
    fn a_cancelled_scan_resolves_empty_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        tree(dir.path(), 8);

        let cancel = CancellationToken::new();
        cancel.cancel();

        let flat = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &ignore_progress));
        assert!(flat.is_empty());

        let grouped =
            empty_on_cancel(scan_folder_grouped(dir.path(), None, &cancel, &ignore_progress));
        assert_eq!(grouped, GroupedScanResult::default());
    }

    /// Cancelling *mid-flight* rather than before the first file. The scan
    /// checks its token once per file at task entry, so a token cancelled while
    /// the walk is in progress still short-circuits the run — and the mapping
    /// turns that into an empty result rather than a partial one, which is what
    /// keeps the renderer from persisting half a folder.
    #[test]
    fn cancelling_mid_scan_yields_nothing_rather_than_a_partial_result() {
        let dir = tempfile::tempdir().expect("a temp dir");
        tree(dir.path(), 200);

        let cancel = CancellationToken::new();
        let seen = Arc::new(Mutex::new(0_usize));

        let trip = {
            let cancel = cancel.clone();
            let seen = Arc::clone(&seen);
            move |_: ScanProgress| {
                let mut count = lock(&seen);
                *count += 1;
                // Cancel once the run is genuinely under way, so this exercises
                // the mid-flight path rather than the pre-cancelled one.
                if *count == 5 {
                    cancel.cancel();
                }
            }
        };

        let result = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &trip));

        assert!(
            result.is_empty(),
            "a cancelled scan hands back nothing, so no partial folder is persisted"
        );
        assert!(
            *lock(&seen) < 200,
            "the run short-circuited rather than parsing every file first"
        );
    }

    #[test]
    fn a_scan_that_is_never_cancelled_passes_its_result_through() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let written = tree(dir.path(), 3);

        let cancel = CancellationToken::new();
        let result = empty_on_cancel(scan_folder(dir.path(), None, &cancel, &ignore_progress));

        assert_eq!(
            result.len(),
            written.len(),
            "an unparseable file still yields a placeholder row, as v1 did"
        );
    }

    // ── the wire shapes ──────────────────────────────────────────────────────

    /// `apps/web`'s `scanAndPersistFolder` destructures these two keys; a rename
    /// here is a silently empty library.
    #[test]
    fn the_grouped_result_keeps_v1s_key_names() {
        let json = serde_json::to_string(&GroupedScanResult::default()).expect("serialize");

        assert_eq!(json, r#"{"rootTracks":[],"subfolders":[]}"#);
    }

    /// `library:parse-metadata` answered `{ filePath, metadata }` — the same
    /// `ScannedFile` the scan returns, not a bare `TrackMetadata`. The renderer
    /// reads `.metadata` off it.
    #[test]
    fn parse_metadata_answers_the_scanned_file_shape() {
        let json =
            serde_json::to_value(scanned(Path::new("/music/a.mp3"))).expect("serialize");

        assert_eq!(json["filePath"], "/music/a.mp3");
        assert!(json["metadata"].is_object());
        assert_eq!(json["metadata"]["title"], "T");
    }

    /// The event payload this namespace emits, pinned against the object
    /// `webContents.send(C.scanProgress, evt)` produced. The four keys are read
    /// by `App.tsx`'s throttle and `ScanProgressCard`.
    #[test]
    fn a_progress_tick_serializes_as_v1s_event_payload() {
        let json = serde_json::to_value(ScanProgress {
            file_path: PathBuf::from("/music/a.mp3"),
            file_index: 3,
            file_count: 10,
            ok: true,
        })
        .expect("serialize");

        assert_eq!(json["filePath"], "/music/a.mp3");
        assert_eq!(json["fileIndex"], 3);
        assert_eq!(json["fileCount"], 10);
        assert_eq!(json["ok"], true);

        // And the `Json` wrapper the event carries is transparent, so what
        // reaches the renderer is that object and not one wrapping it.
        assert_eq!(
            serde_json::to_value(Json(json.clone())).expect("serialize"),
            json
        );
    }

    // ── validation ───────────────────────────────────────────────────────────

    #[test]
    fn only_the_absent_paths_come_back_in_input_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let present = tree(dir.path(), 1).remove(0);
        let first_gone = dir.path().join("gone-a.mp3");
        let last_gone = dir.path().join("gone-b.mp3");

        assert_eq!(
            validate_files(&[
                first_gone.clone(),
                present,
                last_gone.clone(),
                first_gone.clone(),
            ]),
            vec![first_gone.clone(), last_gone, first_gone],
            "duplicates are preserved, and the survivors are not returned"
        );
    }

    #[test]
    fn an_empty_path_is_a_bad_request_rather_than_a_walk_of_the_root() {
        let error = require_path(Path::new("")).expect_err("empty is refused");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    #[test]
    fn a_real_path_passes_validation() {
        assert!(require_path(Path::new("/music")).is_ok());
    }

    // ── the off-thread helper ────────────────────────────────────────────────

    #[tokio::test]
    async fn off_thread_carries_the_result_back() {
        let value: usize = off_thread("do the thing", || Ok(7)).await.expect("ok");

        assert_eq!(value, 7);
    }

    #[tokio::test]
    async fn off_thread_carries_a_failure_back_unchanged() {
        let error = off_thread::<(), _>("do the thing", || Err(bad_request("nope")))
            .await
            .expect_err("the failure survives");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
        assert_eq!(error.message, "nope");
    }

    /// A panic in the blocking half must still cross as a code-bearing
    /// rejection, or the renderer's `switch (err.code)` falls through to
    /// `undefined` for the one case where something has genuinely broken.
    #[tokio::test]
    async fn a_panic_off_thread_becomes_a_coded_rejection() {
        let error = off_thread::<(), _>("scan the folder", || panic!("boom"))
            .await
            .expect_err("the panic is reported rather than swallowed");

        assert_eq!(error.code, codes::INTERNAL);
        assert!(error.message.contains("scan the folder"));
    }
}
