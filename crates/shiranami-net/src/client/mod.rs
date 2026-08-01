//! The shared HTTP client: request options, the request core, and gating.

pub mod options;
pub mod send;

pub use options::{DEFAULT_TIMEOUT, RequestOptions};
pub use send::HttpClient;
