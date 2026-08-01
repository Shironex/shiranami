//! The shared HTTP client: request options, the request core, and gating.

pub mod options;
pub mod send;
pub mod stream;

pub use options::{DEFAULT_TIMEOUT, RequestOptions};
pub use send::HttpClient;
pub use stream::StreamedResponse;
