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
//! namespace's name, on its own line** in [`namespaces!`]. Two lanes conflict
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
//! 2. `pub mod <ns>;` in `commands/mod.rs`.
//! 3. One line in [`namespaces!`] below.
//!
//! Steps 1 and 2 are in files the lane owns or appends to; step 3 is the single
//! shared line.

/// Every namespace, in one list.
///
/// **This is the shared line. A namespace lane appends one entry and touches
/// nothing else in this file.** Order is alphabetical and has no semantics — the
/// generated bindings sort their own output — so an append anywhere in the block
/// is correct and a merge that keeps both sides of a conflict is always right.
macro_rules! namespaces {
    () => {
        $crate::commands::registry::gather! {
            queue = [
                // ══════════════ THE SHARED LINE LIST ══════════════
                health,
                store,
                // ═════════════════════════════════════════════════
            ],
            collected = []
        }
    };
}
pub(crate) use namespaces;

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
