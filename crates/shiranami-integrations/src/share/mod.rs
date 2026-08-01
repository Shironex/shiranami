//! Share links and `shiranami://` deep links.
//!
//! Two halves that meet at a share code:
//!
//! - [`client`] creates a share against `apps/server` and imports one back. The
//!   NestJS server stays live in v2 (subsystem #39, "unchanged"), so this is an
//!   HTTP client port and the [`dto`] contract crossing it is untouched.
//! - [`deep_link`] parses the `shiranami://import/<code>` URL the share preview
//!   page links to. Pure parsing only — registering the scheme and forwarding
//!   the link to the webview is `src-tauri`'s job in Phase 16.
#![warn(missing_docs)]

pub mod client;
pub mod deep_link;
pub mod dto;
pub mod error;

pub use client::{SHARE_API_DEV_URL, SHARE_API_URL, ShareClient, is_valid_share_code};
pub use deep_link::{DEEP_LINK_SCHEME, DeepLink, find_deep_link_argument, parse_deep_link};
pub use dto::{CreateShareRequest, FieldIssue, PlaylistPayload, ShareImportResponse, TrackPayload};
pub use error::{Result, ShareError};
