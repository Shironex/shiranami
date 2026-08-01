//! The error taxonomy: typed enums per crate, one `{ code, message, details }`
//! wire shape, and the frozen code registries the renderer matches on.

pub mod codes;
pub mod taxonomy;

pub use taxonomy::{CoreError, ErrorPayload, Result, WireError};
