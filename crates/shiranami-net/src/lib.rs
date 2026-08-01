//! The single outbound HTTP surface: no other crate constructs a client.
//!
//! `shiranami-net` owns the shared `reqwest` client, the `HttpError` taxonomy
//! (including the `Retry-After` / `x-ratelimit-reset` clamp and the `maxBytes`
//! response cap), per-host rate gates via `governor`, and the SSRF guard —
//! scheme allowlist, DNS resolution and address-range classification, with
//! CGNAT deliberately allowed. Every URL that leaves the process, including
//! each individual hop of a followed redirect, is re-validated here.
//!
//! Ported in Phase 3; the existing TypeScript `url-safety` test vectors are
//! ported first and must pass unchanged. See `docs/v2/architecture.md` §2.2
//! (#12, #32).
