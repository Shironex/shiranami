//! The single outbound HTTP surface: no other crate constructs a client.
//!
//! `shiranami-net` owns the shared `reqwest` client, the `HttpError` taxonomy
//! (including the `Retry-After` / `x-ratelimit-reset` clamp and the `maxBytes`
//! response cap), per-host rate gates, and the SSRF guard — scheme allowlist,
//! DNS resolution and address-range classification, with CGNAT deliberately
//! allowed. Every URL that leaves the process, including each individual hop of
//! a followed redirect, is re-validated here.
//!
//! Ported in Phase 3; the existing TypeScript `url-safety` test vectors are
//! ported first and must pass unchanged. See `docs/v2/architecture.md` §2.2
//! (#12, #32).

// Every item here is either a ported guard or the vocabulary the crates above
// phrase their own failures in. An undocumented one is a contract nobody can
// read, so this crate gates on documentation the way `shiranami-core` does.
#![warn(missing_docs)]

pub mod client;
pub mod error;
pub mod gate;
pub mod retry_after;
pub mod url_safety;

pub use client::{DEFAULT_TIMEOUT, HttpClient, RequestOptions};
pub use error::{HttpError, Result};
pub use gate::{HOST_GATES, HostGates, MinIntervalGate};
pub use retry_after::{DEFAULT_429_BACKOFF, RETRY_AFTER_MAX, parse_retry_after};
pub use url_safety::{Resolver, UrlGuard, UrlGuardReason, is_http_url, parse_stream_url};
