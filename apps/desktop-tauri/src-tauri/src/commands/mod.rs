//! The IPC command surface, one module per namespace.
//!
//! `mod.rs` is a manifest: declarations and re-exports only, never logic. The
//! v1 backend exposes 155 channels across 24 namespaces; Phase 14 lands them
//! here as `#[tauri::command] #[specta::specta]` functions that delegate
//! straight into a domain crate. No command may be synchronous if it touches
//! disk, the database, the network or a child process — a sync command runs on
//! the WKWebView main thread and freezes the UI.

pub mod health;
