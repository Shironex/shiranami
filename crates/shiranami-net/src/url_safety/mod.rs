//! The SSRF guard: scheme allowlist, DNS resolution and range classification.

pub mod guard;
pub mod ranges;
pub mod resolver;

pub use guard::{UrlGuard, UrlGuardReason, is_http_url, parse_stream_url};
pub use ranges::is_denied;
pub use resolver::{ResolveFuture, Resolver, SystemResolver};
