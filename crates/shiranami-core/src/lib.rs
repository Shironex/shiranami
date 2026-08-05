//! Rank-0 crate: the vocabulary every other crate is written in.
//!
//! `shiranami-core` owns the domain models, the `thiserror` error taxonomy and
//! its serializable `{ code, message, details }` wire form, path handling
//! (containment checks, the folders cache, legacy-directory resolution), the
//! atomic JSON settings store with its renderer-writable key allowlist, system
//! notices with their 5-minute per-`source:code` dedup, and the frozen
//! sentinel mirror (`UNKNOWN_ARTIST` / `UNKNOWN_ALBUM`) that shipped migration
//! SQL already depends on. It performs no network, database or child-process
//! I/O, and it depends on no other workspace crate — every other crate depends
//! on it, so anything added here is added to everything.
//!
//! Ported in Phase 2. See `docs/v2/architecture.md` §2.1–§2.3 and §3.4.

// Every item here is renderer-visible contract, a ported guard, or both. An
// undocumented one is a contract nobody can read, so the crate gates on it.
#![warn(missing_docs)]

pub mod bindings;
pub mod companion;
pub mod constants;
pub mod error;
pub mod migrate;
pub mod models;
pub mod notice;
pub mod paths;
pub mod scrub;
pub mod store;
pub mod sync;
pub mod time;

pub use constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
pub use error::{CoreError, ErrorPayload, Result};
pub use notice::{SystemNotice, SystemNoticeLevel, SystemNoticeSource};
