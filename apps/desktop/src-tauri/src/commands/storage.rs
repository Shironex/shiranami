//! `storage:get-usage` — how much disk the watched library folders occupy.
//!
//! One channel, ported from `apps/desktop/src/main/ipc/storage.ts`, whose
//! handler is a single line: the whole computation lives in
//! `shiranami_library::storage`, and the folder paths arrive as an **argument**
//! rather than being read from the `folders` table. That is v1's shape and it is
//! why this namespace, like `library`, touches no database — the renderer
//! already holds the watched folders and passes them in.
//!
//! # Folders in, volumes out
//!
//! The input granularity is a folder and the output granularity is a physical
//! volume: the settings panel draws one segmented bar per disk, and
//! `folderPaths` on each entry records which watched folders fed that bar. Two
//! folders on the same drive collapse into one entry whose `musicBytes` is their
//! sum.
//!
//! # A failure is reported, never raised
//!
//! An unmounted or removed drive yields a `VolumeUsage` with every byte field
//! zeroed and `unavailable: true`, appended after the readable ones — v1's
//! `[...volumes, ...unavailableVolumes]`. One missing USB drive must not blank
//! the usage panel for the internal disk beside it, so the crate has no failure
//! path to project and this command cannot reject for a disk reason at all.

use std::path::PathBuf;

use shiranami_library::{DiskUsageResult, compute_disk_usage};

use crate::error::CommandResult;
use crate::wire::{off_thread, require_path};

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::storage::storage_get_usage,
            ]
        }
    };
}
pub(crate) use commands;

/// `storage:get-usage` — disk usage across the watched folders, by volume.
///
/// An empty list is not an error: it answers with no volumes, which is what a
/// library with no folders yet should show. v1's zod tuple allowed it too, and
/// only refused an empty *string* inside the array.
///
/// `spawn_blocking` is not optional here. The walk is `walkdir` to depth 12 plus
/// a `statvfs` per volume over what may be a whole music library on a spinning
/// or network disk — seconds of synchronous I/O, and on the WKWebView main
/// thread that is the window not painting for the duration (§2.3, R15).
#[tauri::command]
#[specta::specta]
pub async fn storage_get_usage(folder_paths: Vec<PathBuf>) -> CommandResult<DiskUsageResult> {
    for path in &folder_paths {
        // v1's `z.string().min(1)`. An empty path is not a folder that
        // contributes nothing — it resolves to the process's working directory
        // and would walk it, reporting bytes from somewhere the user never
        // added to their library.
        require_path(path)?;
    }

    off_thread("measure the library folders", move || {
        Ok(compute_disk_usage(&folder_paths))
    })
    .await
}

#[cfg(test)]
#[path = "tests/storage.rs"]
mod tests;
