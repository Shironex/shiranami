//! The one shared line list, and the machinery that turns it into `Commands`.
//!
//! # The problem this solves
//!
//! Phase 14 fans out to one agent per namespace, twenty-four of them, working in
//! parallel worktrees. `tauri_specta::collect_commands!` takes a flat list of
//! command paths and expands it into `tauri::generate_handler!` plus
//! `specta::function::collect_functions!` — both of which need *literal* paths at
//! expansion time, so neither a runtime `Vec` nor merging two `Commands` values
//! is possible. The obvious shape is therefore one central file listing all 135
//! command paths, which is one file every lane edits, in the middle, with
//! semantically adjacent lines. That is a guaranteed conflict per lane and a
//! merge whose resolution is "keep both, hope the order is right".
//!
//! # The shape instead
//!
//! A namespace declares its own commands, in its own file, in a `commands!`
//! macro next to them. The only thing that reaches this file is **the
//! namespace's name, on its own line** in [`namespace_list!`]. Two lanes conflict
//! only if they append adjacent lines, and the resolution is unambiguous because
//! neither line refers to anything in the other.
//!
//! # How it works
//!
//! [`gather!`] is a token-tree muncher in continuation-passing style. It carries
//! two lists: `queue`, the namespaces left to visit, and `collected`, the command
//! paths found so far. Each step hands control to the head namespace's own
//! `commands!` macro, which appends its paths and calls straight back in. When
//! the queue empties, the accumulated paths go to `collect_commands!`.
//!
//! Two details are load-bearing and neither is obvious:
//!
//! - **`collected` is `$($t:tt)*`, not `$($p:path),*`.** A fragment matched as
//!   `path` becomes a single opaque AST node, and `collect_commands!` matches on
//!   `$b:ident $(:: $p:ident)*` — an opaque node matches neither. Raw token trees
//!   re-emit transparently, which is what lets the paths survive being carried
//!   through two macros before the one that parses them sees them.
//! - **Paths are written `crate::commands::…`, spelled out.** `$crate` would be
//!   the idiomatic choice and does not work here: it expands to a resolver-level
//!   token that `collect_commands!`'s `$b:ident` cannot match. Every namespace
//!   lives in this crate, so the absolute form costs nothing.
//!
//! # Adding a namespace
//!
//! 1. Write `commands/<ns>.rs` with the commands and a `commands!` macro
//!    (copy the shape from [`crate::commands::store`]).
//! 2. Add its name to [`namespace_list!`] below.
//!
//! That is the whole procedure. Step 1 is a new file, which cannot conflict;
//! step 2 is **one line in one file**. The module declaration in
//! `commands/mod.rs` is generated from the same list, so there is no second
//! place to forget.

/// How many commands the shared list currently collects.
///
/// A **stated** number rather than whatever the macro happened to produce: a
/// lane that adds its namespace to the list but mis-declares its `commands!`
/// entries would otherwise get a silently smaller surface instead of a failing
/// test. `crate::bindings` counts the emitted callables against this.
///
/// Raising it is how a lane records that it landed. Lowering it means a
/// namespace was dropped, which is exactly the regression R13 names — museeks
/// lost six features across its migration and noticed afterwards.
pub const COMMAND_COUNT: usize = 160;

/// The invoke half of the 155-channel parity checklist (§2.6): 135 invoke plus
/// 20 events. [`COMMAND_COUNT`] may exceed it only by the commands that port no
/// v1 channel.
pub const V1_INVOKE_CHANNEL_COUNT: usize = 135;

/// Commands in this crate that port no v1 channel and are therefore not counted
/// against [`V1_INVOKE_CHANNEL_COUNT`].
///
/// Twenty-five of them:
///
/// - `health_check`.
/// - `dialog_save_file` — v1 opened its save panel inside the
///   `db:backup:export` handler rather than over IPC, so the panel has no
///   channel to port even though the behaviour does. See
///   [`crate::commands::dialog`] for why it is a command rather than a webview
///   capability.
/// - `serve_info` — v1's media URLs were a custom scheme, which is a constant
///   and needs no channel to discover. §2.4's loopback origin is per-session,
///   so it does. See [`crate::commands::serve`].
/// - `analysis_analyze` and `analysis_cancel` — the v2 feature wave's one-pass
///   analysis engine. Born in v2: v1 had nothing that decoded once for every
///   measurement, and its loudness batch keeps its own ported channels
///   untouched. See [`crate::commands::analysis`].
/// - `db_tracks_search` — v2's FTS5 library search (feature wave F6). v1 had
///   no search channel at all: its renderer filtered the in-memory library,
///   which is exactly what this command exists to replace.
/// - `doctor_scan` and `doctor_cancel` — the Library Doctor (feature wave F8).
///   v1's decoder could not see truncation, damaged packets or true peak, so
///   there was nothing to report over a channel.
/// - `window_set_fullscreen` and `window_set_display_sleep_inhibited` —
///   Sanctuary Mode (v2 feature wave); v1 had no fullscreen surface at all.
///   See [`crate::commands::window`].
/// - `companion_get_state` — the v2 companion's ledger read (hatches the
///   `companion_state` singleton from history on first call). Born in v2:
///   v1 had no companion, so there is no channel to port. See
///   [`crate::commands::companion`].
/// - `companion_set_name` — the naming ceremony; born in v2 for the same
///   reason.
/// - `companion_set_species` — the Shio/Hotaru switch
///   (`docs/v2/companion/decision.md`); born in v2 for the same reason.
/// - `companion_set_accessories` — the companion's keepsake accessories
///   (v2 companion, Phase 3); born in v2 for the same reason.
/// - `downloader_queue_retry` and `downloader_queue_retry_all` — re-queue
///   failed downloads. Born in v2: v1's queue dropped a failed item's row and
///   offered nothing but clear-completed, so there was no retry to have a
///   channel for. See [`crate::commands::downloader::queue`].
/// - `lyrics_save_batch` and `lyrics_save_cancel` — the write-back batch. v1
///   kept fetched lyrics in an in-memory MRU and nowhere else, so there was no
///   library-wide pass for it to have a channel for. See
///   [`crate::commands::lyrics`].
/// - `radio_log_record` and `radio_log_get` — the radio diary. v1's stream
///   proxy declined ICY metadata, so no station title ever reached the app and
///   there was nothing to keep a record of. See [`crate::commands::radio`].
/// - `background_library_get`, `background_add`, `background_remove`,
///   `background_set_active` and `background_rename` — the saved-background
///   library. v1's themes were five bundled bitmaps and nothing else, so there
///   was no import to have a channel for. `background_add` opens its own
///   dialog rather than taking a path, which is why it is not simply a caller
///   of `dialog_open_file`. See [`crate::commands::background`].
pub const NON_V1_COMMANDS: usize = 25;

/// Every namespace, in one list, expanded through `$callback`.
///
/// **This is the shared line list. A namespace lane appends one entry and
/// touches nothing else outside its own module.** Order is alphabetical and has
/// no semantics — the generated bindings sort their own output — so an append
/// anywhere in the block is correct and a merge that keeps both sides of a
/// conflict is always right.
///
/// The list is read twice, by two callbacks, which is what keeps it to one line
/// rather than two: [`declare_modules!`] turns it into the `pub mod` items in
/// `commands/mod.rs`, and [`begin_gather!`] seeds the muncher that collects the
/// commands. A lane that added its module in one place and forgot the other
/// would otherwise get a namespace that compiles and registers nothing.
macro_rules! namespace_list {
    ($callback:ident) => {
        crate::commands::registry::$callback! {
            // ══════════════ THE SHARED LINE LIST ══════════════
            analysis
            app
            background
            companion
            db_backup
            db_folders
            db_history
            db_playlists
            db_smart_playlists
            db_tracks
            debug
            dialog
            discord
            doctor
            downloader
            health
            library
            loudness
            lyrics
            media
            metadata
            playlist
            radio
            recommendations
            scrobble
            serve
            share
            shell
            storage
            store
            system
            updater
            waveform
            weather
            window
            // ═════════════════════════════════════════════════
        }
    };
}
pub(crate) use namespace_list;

/// `namespace_list!` callback: seed [`gather!`] with the full queue.
macro_rules! begin_gather {
    ($($namespace:ident)*) => {
        crate::commands::registry::gather! {
            queue = [$($namespace,)*],
            collected = []
        }
    };
}
pub(crate) use begin_gather;

/// Walk `queue`, letting each namespace append its own commands to `collected`.
///
/// See the module docs for why `collected` is a token-tree sequence and why the
/// paths are spelled `crate::…` rather than `$crate::…`.
macro_rules! gather {
    // Queue empty: hand the accumulated paths to tauri-specta.
    (queue = [], collected = [$($collected:tt)*]) => {
        ::tauri_specta::collect_commands![$($collected)*]
    };
    // Otherwise: continuation-pass into the head namespace's own macro, which
    // appends its command paths and calls back in with the shorter queue.
    (queue = [$head:ident, $($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::$head::commands! {
            queue = [$($tail,)*],
            collected = [$($collected)*]
        }
    };
}
pub(crate) use gather;

#[cfg(test)]
mod tests {
    // The registry's own coverage is asserted in `crate::bindings`, against the
    // emitted TypeScript rather than against `Commands` — that type seals its
    // contents on purpose, and the emitted file is the artifact the shim
    // consumes, so it is the honest thing to measure.
}
