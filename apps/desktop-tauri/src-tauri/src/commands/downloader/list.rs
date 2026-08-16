//! This namespace's contribution to [`crate::commands::registry`].
//!
//! A file of its own because `lint:meta` forbids a `macro_rules!` in a `mod.rs`
//! — a manifest declares and re-exports, it does not implement — and because
//! twenty-five paths in one place is easier to check against
//! `packages/contracts/src/ipc/channels.ts` than twenty-five scattered across
//! four modules.
//!
//! The order is v1's `IPC_CHANNELS.downloader` order, not alphabetical, so the
//! two lists diff against each other line for line.

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                // ── tool status ──────────────────────────────────────────
                crate::commands::downloader::tools::downloader_check,
                crate::commands::downloader::tools::downloader_check_dependencies,
                crate::commands::downloader::tools::downloader_get_cached_tool_status,
                crate::commands::downloader::tools::downloader_refresh_tool_status,
                crate::commands::downloader::tools::downloader_check_ffmpeg,
                crate::commands::downloader::tools::downloader_get_ytdlp_path,
                crate::commands::downloader::tools::downloader_install_ytdlp,
                crate::commands::downloader::tools::downloader_install_ffmpeg,
                crate::commands::downloader::tools::downloader_install_dependencies,
                // ── location ─────────────────────────────────────────────
                crate::commands::downloader::location::downloader_get_download_location,
                crate::commands::downloader::location::downloader_set_download_location,
                // ── search and the single-URL download ───────────────────
                crate::commands::downloader::fetch::downloader_search,
                crate::commands::downloader::fetch::downloader_suggest,
                crate::commands::downloader::fetch::downloader_download,
                crate::commands::downloader::fetch::downloader_get_stream_url,
                // ── the queue ────────────────────────────────────────────
                crate::commands::downloader::queue::downloader_queue_enqueue,
                crate::commands::downloader::queue::downloader_queue_cancel,
                crate::commands::downloader::queue::downloader_queue_cancel_all,
                crate::commands::downloader::queue::downloader_queue_retry,
                crate::commands::downloader::queue::downloader_queue_retry_all,
                crate::commands::downloader::queue::downloader_queue_clear_completed,
                crate::commands::downloader::queue::downloader_queue_pause,
                crate::commands::downloader::queue::downloader_queue_resume,
                crate::commands::downloader::queue::downloader_queue_mark_imported,
                crate::commands::downloader::queue::downloader_queue_get,
            ]
        }
    };
}
pub(crate) use commands;
