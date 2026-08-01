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
