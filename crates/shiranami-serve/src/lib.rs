//! The loopback byte server — audio, album art, and the radio proxy.
//!
//! Audio and art reach the webview over `http://127.0.0.1:<port>/…`, not a
//! custom URI scheme and not Tauri's asset protocol: wry#1778 means macOS 26.6
//! no longer delivers cross-scheme subresource requests to a scheme handler,
//! and a `MediaElementAudioSource` without `Access-Control-Allow-Origin` is
//! specified to emit silence. This crate therefore owns byte-for-byte control
//! of the response headers, Range/206 handling, an extension allowlist and
//! path-containment check on every read, the art LRU, and a radio proxy that
//! re-validates every redirect hop through the SSRF guard. It binds
//! `127.0.0.1` on port 0 and authenticates with a per-session path token.
//!
//! It is a crate, not a module inside `src-tauri`, because its failure mode is
//! silent and it must be testable with plain `cargo test` against an ephemeral
//! port, with no webview. Ported in Phase 8. See `docs/v2/architecture.md`
//! §2.4.
//!
//! # The route map
//!
//! One route per v1 custom protocol, with the session token as the first path
//! segment of each:
//!
//! | v1 protocol                                 | v2 route                        |
//! | ------------------------------------------- | ------------------------------- |
//! | `shiranami-audio://play?path=…`             | `GET /{token}/audio?path=…`     |
//! | `shiranami-art://art/{hash}.jpg`            | `GET /{token}/art/{hash}.jpg`   |
//! | `shiranami-radio://stream?url=…`            | `GET /{token}/radio?url=…`      |
//!
//! # What is load-bearing, and what merely works
//!
//! Two invariants here fail silently rather than loudly, so both are pinned by
//! tests that assert the *absence* case:
//!
//! - **`Access-Control-Allow-Origin` on every response, errors included.**
//!   Spike A measured a stripped header producing exactly 0 RMS through the
//!   analyser while playback appeared to continue.
//! - **Range support.** WebKit opens every media load with `Range: bytes=0-1`,
//!   so this is not a seeking feature; nothing plays without it.

// Every item here is a response contract the renderer depends on, or a ported
// guard. An undocumented one is a contract nobody can read, so this crate gates
// on documentation the way `shiranami-core` and `shiranami-net` do.
#![warn(missing_docs)]

pub mod art_cache;
pub mod cors;
pub mod error;
pub mod media_types;
pub mod range;
pub mod token;

pub use error::ServeError;
pub use token::SessionToken;
