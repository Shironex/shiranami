//! The IPC command surface, one module per namespace.
//!
//! `mod.rs` is a manifest: declarations and re-exports only, never logic. The
//! v1 backend exposes 155 channels across 24 namespaces; Phase 14 lands them
//! here as `#[tauri::command] #[specta::specta]` functions that delegate
//! straight into a domain crate.
//!
//! # The rules every namespace module follows
//!
//! - **No synchronous command that touches disk, the database, the network or a
//!   child process.** A sync command runs on the WKWebView main thread and
//!   freezes the UI (§2.3, R15). `async` plus `spawn_blocking` for anything
//!   CPU-bound; the cheap in-memory survivors are the exception, not the default.
//! - **`tauri::async_runtime::spawn`, never bare `tokio::spawn`**, on any path a
//!   sync command or an OS callback can reach. Nightcore shipped a SIGABRT to
//!   users over exactly this (R16).
//! - **Acquire the connection once** ([`crate::state::AppState::conn`]) and pass
//!   `&mut *conn` to every repository the command needs. The pool holds one
//!   connection, so a second acquire hangs rather than fails.
//! - **Channel names, argument shapes and return shapes match v1 exactly.** The
//!   renderer is unchanged (§2.6) and the 155-channel manifest *is* the parity
//!   checklist (R13). `db:tracks:get-all` becomes `db_tracks_get_all` and
//!   nothing else changes.
//! - **Errors go out through [`crate::error::WireResultExt::wire`]**, never as a
//!   bare string.
//!
//! # Registration
//!
//! Commands are collected by [`registry`], whose one shared line list is the only
//! file a new namespace touches outside its own module. See that module for the
//! shape of a namespace's `commands!` macro.

pub mod registry;

// ── namespaces ──────────────────────────────────────────────────────────────
// A lane appends its module here and one line in `registry::namespaces!`.
pub mod db_tracks;
pub mod health;
pub mod store;
pub mod weather;

/// How many commands the registry currently collects.
///
/// Recorded as a constant so the count is a **stated** number rather than
/// whatever the macro happened to produce: a lane that adds a namespace to the
/// shared list but forgets to declare its `commands!` entries gets a failing
/// test naming the discrepancy, not a silently smaller surface. The parity
/// target is 135 (§2.6); [`registry`]'s tests hold that ceiling.
pub const COMMAND_COUNT: usize = 19;
