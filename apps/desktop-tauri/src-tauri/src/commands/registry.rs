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
pub const COMMAND_COUNT: usize = 35;

/// The invoke half of the 155-channel parity checklist (§2.6): 135 invoke plus
/// 20 events. [`COMMAND_COUNT`] may exceed it only by the commands that port no
/// v1 channel — today that is `health_check` alone.
pub const V1_INVOKE_CHANNEL_COUNT: usize = 135;

/// Commands in this crate that port no v1 channel and are therefore not counted
/// against [`V1_INVOKE_CHANNEL_COUNT`].
pub const NON_V1_COMMANDS: usize = 1;

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
            db_history
            db_tracks
            health
            radio
            recommendations
            store
            weather
            // ═════════════════════════════════════════════════
        }
    };
}
pub(crate) use namespace_list;

/// `namespace_list!` callback: declare each namespace as a module.
///
/// Expands where it is *invoked*, not where it is defined, so the `pub mod`
/// items land in `commands/mod.rs` and resolve against `commands/`.
macro_rules! declare_modules {
    ($($namespace:ident)*) => {
        $( pub mod $namespace; )*
    };
}
pub(crate) use declare_modules;

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
