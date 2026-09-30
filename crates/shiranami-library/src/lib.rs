//! Filesystem-facing library management: scanning, validation, disk usage.
//!
//! `shiranami-library` owns the folder scan pipeline in both its flat and
//! grouped forms (`walkdir` + `rayon`, max depth 5, concurrency 16), the
//! cancellation token that replaces v1's `utilityProcess` handshake, per-file
//! progress reporting, batched file validation, and storage-usage accounting by
//! volume — including the Windows drive-root bucketing that v1 already does.
//!
//! Ported in Phase 10. See `docs/v2/architecture.md` §2.2 (#16, #29).
//!
//! # The finding this crate is shaped by: the scanner has no database
//!
//! The phase plan lists Phase 7 (the `shiranami-db` repositories) as a
//! dependency, and the charter's "a cancelled scan must leave no partial rows
//! behind" reads as though rows are written here. They are not, and the reason
//! is worth stating before anyone adds them.
//!
//! **v1's main process is a stateless scanner.** It has no diffing logic, no
//! database access during a scan, and no knowledge of the `folders` table. It
//! discovers files, reads their tags, and returns the whole result across IPC.
//! Every reconciliation decision — which paths are new, which are gone, what to
//! insert, what to delete — lives in the renderer, in
//! `apps/web/src/lib/scanHelpers.ts` and `useLibraryRescan.ts`, as three
//! separate round-trips: `library:scan-folder-grouped`, then
//! `db:tracks:exists-many`, then `db:tracks:add-many`.
//!
//! `apps/web` is **unchanged** in v2 (architecture §2.6; the Phase 15 shim
//! reimplements `window.electronAPI` over the generated bindings and nothing
//! else). So it still does all of that. A scan that also wrote rows would not
//! merely duplicate work — `db:tracks:add-many` is `ON CONFLICT DO NOTHING` and
//! returns only the rows that landed, so the renderer would receive an empty
//! array, report "library up to date" for a folder full of new music, and never
//! enqueue the tracks it had just imported.
//!
//! Hence no `shiranami-db` dependency, and hence the single-connection pool is
//! trivially safe from here: it is never reached. The "no partial rows"
//! property holds by construction and is pinned by `tests/scan_cancellation.rs`
//! rather than assumed — a cancelled scan yields [`scan::empty_on_cancel`]'s
//! empty result, the renderer takes its `results.length === 0` branch, and
//! nothing downstream of it runs: no `db:tracks:add-many`, no `db:folders:add`,
//! no `db:folders:update-scanned`.
//!
//! # What v1 does not do, and neither does this
//!
//! Two absences are load-bearing enough to name, because both look like gaps in
//! the port rather than in the thing ported:
//!
//! - **There is no changed-file detection.** A known path is never re-read, so
//!   a file whose tags are edited on disk outside the app stays stale in the
//!   library. **Moved files are followed** since migration `0009`: a new path
//!   is hashed ([`identity`], the audio payload with tag blocks skipped), and
//!   during a rescan `db:tracks:add-many` re-points a row whose file has moved
//!   away ([`moved_away`]: definitely not found, with its volume, music folder
//!   and nearest existing parent folder definitely present and holding real
//!   entries) instead of inserting a stranger, so id, plays, favourite,
//!   playlists and history survive a move or rename that passes that guard.
//!   Some moves deliberately do not (files moved out of a folder left empty,
//!   among others): the residuals are listed in `identity/gone.rs`. v1 had no
//!   `UPDATE tracks SET file_path` at all.
//!   The hash lives here because it is filesystem work; the matching lives in
//!   `shiranami-db` and the composition root, so this crate still holds no
//!   database.
//! - **There was no folder watching.** No `chokidar`, no `fs.watch`, no polling
//!   timer, no rescan on startup or focus; `folders.last_scanned` is written and
//!   never read. Every v1 scan was user-triggered from one of three buttons.
//!   The v2 feature wave adds one in [`watch`], and deliberately keeps it out of
//!   reconciliation: it reports *which folders* changed, and the renderer
//!   rescans them through the same path its buttons use.
//!
//! # The pipeline shape
//!
//! ```text
//!   discover (walkdir, single-threaded)
//!        │  Vec<PathBuf>, filesystem order, unsorted
//!        ▼
//!   parse   (rayon, 16-thread scan-owned pool)
//!        │      ├─ read tags             (lofty)
//!        │      ├─ decode + resize cover (image, fast_image_resize)
//!        │      └─ write to the art cache (O_EXCL, content-addressed)
//!        │  cancellation checked once per file, at task entry
//!        ▼
//!   collect (input order preserved, short-circuits on the first cancellation)
//!        │  one progress tick per settled file, through a Send + Sync sink
//!        ▼
//!   Vec<ScannedFile>  →  the command layer  →  the renderer, which persists
//! ```
//!
//! Parallel workers never contend for a shared writer, because there is no
//! shared writer. The only mutation a worker performs is appending a file to the
//! content-addressed art cache, whose writes are create-exclusive and whose
//! `EEXIST` is the deduplication happy path. The one piece of state workers
//! share is the atomic progress counter.

// Every item here is either renderer-visible contract or a ported guard. An
// undocumented one is a contract nobody can read, so the crate gates on it.
#![warn(missing_docs)]

pub mod error;
pub mod identity;
pub mod iso8601;
pub mod scan;
pub mod storage;
pub mod validate;
pub mod watch;

pub use error::{LibraryError, Result};
pub use identity::{content_hash, content_hashes, moved_away, moved_away_all};
pub use scan::{
    AUDIO_EXTENSIONS, GroupedScanResult, PARSE_CONCURRENCY, SCAN_MAX_DEPTH, ScanProgress,
    ScannedFile, SubfolderScan, empty_on_cancel, scan_folder, scan_folder_grouped,
};
pub use storage::{DiskUsageResult, VolumeUsage, compute_disk_usage};
pub use validate::{VALIDATE_BATCH, validate_files};
