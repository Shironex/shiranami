//! Reading back what the code under test actually put on the wire.
//!
//! The URL is the assertion for most of these suites — v1's tests stubbed the
//! transport, so a mis-encoded query string would have passed them and failed
//! against the real API.

/// The request line, e.g. `GET /api/share/abc HTTP/1.1`.
pub(crate) fn request_line(raw: &str) -> &str {
    raw.lines().next().unwrap_or_default()
}

/// The request body: everything past the blank line.
pub(crate) fn request_body(raw: &str) -> &str {
    raw.split_once("\r\n\r\n").map_or("", |(_, body)| body)
}
