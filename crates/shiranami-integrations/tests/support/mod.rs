//! Shared fixtures for the `shiranami-integrations` integration tests.
//!
//! [`test_server`] is `shiranami-net`'s loopback server, copied rather than
//! shared: it lives in that crate's `tests/` tree, which cargo compiles into
//! that crate's test binaries only and never publishes. Driving a real socket
//! is the point — v1's suite stubbed the transport outright, so it never
//! exercised URL construction, and a wrongly-encoded query string would have
//! passed its tests and failed against the real API.

// Cargo compiles this module separately into *each* integration-test binary,
// and no single one uses every helper — the precedence suite counts requests
// without reading them, the LRCLIB suite reads every byte. Without this, the
// unused half warns in whichever binary does not happen to need it, and
// `clippy -D warnings` turns that into a build failure.
#![allow(dead_code)]

pub(crate) mod request;
pub(crate) mod test_server;
