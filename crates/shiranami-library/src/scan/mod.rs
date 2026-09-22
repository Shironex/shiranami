//! The folder scan: discover, parse, report, cancel.
//!
//! Ported from `apps/desktop/src/main/ipc/library.ts` and the
//! `utilityProcess` it drove (`apps/desktop/src/main/workers/scan-utility.ts`,
//! `scan-utility-host.ts`).
//!
//! Read the submodules in pipeline order: [`discover`] finds the files,
//! [`parse`] reads their tags in parallel, [`run`] joins the two into the shapes
//! the two IPC channels return, and [`telemetry`] measures the whole thing.

pub mod discover;
pub mod model;
pub mod parse;
pub mod run;
mod telemetry;

pub use discover::{AUDIO_EXTENSIONS, SCAN_MAX_DEPTH, is_audio_file};
pub use model::{
    GroupedScanResult, ProgressFn, ScanProgress, ScannedFile, SubfolderScan, ignore_progress,
};
pub use parse::PARSE_CONCURRENCY;
pub use run::{
    discover as discover_audio_files, empty_on_cancel, scan_folder, scan_folder_grouped,
};
