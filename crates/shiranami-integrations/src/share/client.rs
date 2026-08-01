//! The share API client.
//!
//! Ported from the `fetchApi` helper and the three network-facing handlers in
//! `apps/desktop/src/main/ipc/share.ts`. `apps/server` (NestJS) stays live in
//! v2 — subsystem #39 is "unchanged" — so this is a client port, not a server
//! port, and the DTO contract crossing it is unchanged too.
//!
//! # What this crate owns, and what it does not
//!
//! v1's share logic lived in an **IPC handler**, and it mixed two jobs:
//! assembling a payload (reading `tracks`/`playlists`, resolving each track to a
//! YouTube id through the `youtube_mappings` cache and a `yt-dlp` search) and
//! talking to the API. Only the second half is crate logic here. The first half
//! reaches `shiranami-downloader`, which is rank 3 alongside this crate and
//! therefore not something it may depend on, so the assembly stays with the
//! Phase 14 command layer — which is also where it lived in v1.
//!
//! # Validation asymmetry, preserved
//!
//! The outbound body is validated before it is sent, and the **import**
//! response is validated on the way in — but the **create** response is passed
//! through untouched, exactly as v1 did. The asymmetry is deliberate: the
//! import response carries third-party content that the renderer reads field by
//! field, while the create response is our own server echoing a code back. A
//! typed struct here would turn an additive server-side field into a desktop
//! failure, which is precisely the coupling decision D25 exists to avoid.

use reqwest::header::{CONTENT_TYPE, HeaderValue};
use shiranami_net::{HttpClient, RequestOptions};

use crate::share::dto::{CreateShareRequest, ShareImportResponse};
use crate::share::error::{Result, ShareError};

/// The production share API.
pub const SHARE_API_URL: &str = "https://api.shiranami.app";

/// The share API in development, matching v1's `NODE_ENV` branch.
pub const SHARE_API_DEV_URL: &str = "http://localhost:3000";

/// The base URL for this build.
///
/// v1 branched on `process.env.NODE_ENV === 'development'`, which is set by the
/// bundler rather than by the environment at runtime. `debug_assertions` is the
/// Rust equivalent that is likewise fixed at build time — a release bundle can
/// never be talked into pointing at localhost by an environment variable.
pub fn default_base_url() -> &'static str {
    if cfg!(debug_assertions) {
        SHARE_API_DEV_URL
    } else {
        SHARE_API_URL
    }
}

/// Whether `code` is a shape the server issues.
///
/// The server mints codes with `nanoid(8)`, whose alphabet is
/// `[A-Za-z0-9_-]`, and the deep-link parser already accepts only that set.
///
/// **Hardening beyond v1.** v1 interpolated the code straight into the path
/// (`/api/share/${code}`) behind a zod `z.string().min(1)`, so a code
/// containing `../` would have been normalised by the URL parser into a request
/// against a different API path. Nothing reachable today produces such a code,
/// but the check costs one pass and removes the class rather than relying on
/// every caller upstream to keep it out.
pub fn is_valid_share_code(code: &str) -> bool {
    !code.is_empty()
        && code
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
}

/// `POST /api/share` and `GET /api/share/:code`.
#[derive(Debug, Clone)]
pub struct ShareClient {
    http: HttpClient,
    base: String,
}

impl ShareClient {
    /// A client against [`default_base_url`].
    pub fn new(http: HttpClient) -> Self {
        Self::with_base(http, default_base_url())
    }

    /// A client against `base`, so tests can drive a loopback server.
    pub fn with_base(http: HttpClient, base: impl Into<String>) -> Self {
        Self {
            http,
            base: base.into(),
        }
    }

    /// Create a share link.
    ///
    /// Returns the server's response verbatim — `{ code, url, expiresAt }` at
    /// the time of writing, unvalidated by design (see the module docs).
    ///
    /// # Errors
    ///
    /// [`ShareError::BadRequest`] when the body fails the contract before it is
    /// sent, [`ShareError::Server`] when the API refuses it, and
    /// [`ShareError::Transport`] when the API cannot be reached.
    pub async fn create(&self, request: &CreateShareRequest) -> Result<serde_json::Value> {
        request
            .validate()
            .map_err(|issues| ShareError::BadRequest { issues })?;

        let body = serde_json::to_string(request).map_err(|error| ShareError::BadRequest {
            issues: vec![crate::share::dto::FieldIssue {
                path: String::new(),
                message: error.to_string(),
            }],
        })?;

        let options = RequestOptions::post(body)
            .with_header(CONTENT_TYPE, HeaderValue::from_static("application/json"))
            // The API writes an actionable `message` on a 4xx; without this the
            // body is discarded and the user sees "HTTP 400".
            .reading_error_body();

        self.http
            .json(&format!("{}/api/share", self.base), options)
            .await
            .map_err(ShareError::from_http)
    }

    /// Fetch a share by its code.
    ///
    /// # Errors
    ///
    /// [`ShareError::MalformedCode`] when `code` is not a shape the server
    /// issues, [`ShareError::InvalidResponse`] when the response does not match
    /// the contract, and [`ShareError::Server`] / [`ShareError::Transport`] as
    /// for [`Self::create`].
    pub async fn import(&self, code: &str) -> Result<ShareImportResponse> {
        if !is_valid_share_code(code) {
            return Err(ShareError::MalformedCode {
                code: code.to_owned(),
            });
        }

        tracing::info!(code, "importing share code");

        let options = RequestOptions::default().reading_error_body();
        let response: ShareImportResponse = self
            .http
            .json(&format!("{}/api/share/{code}", self.base), options)
            .await
            .map_err(|error| {
                // A body that does not deserialise into the union is a contract
                // failure, not a transport one — v1 reported it as
                // `share.invalid_response` and so does this.
                if let shiranami_net::HttpError::Json { source, .. } = &error {
                    tracing::warn!(%source, "share import response failed schema validation");
                    return ShareError::InvalidResponse {
                        issues: vec![crate::share::dto::FieldIssue {
                            path: String::new(),
                            message: source.to_string(),
                        }],
                    };
                }
                ShareError::from_http(error)
            })?;

        // Deserialising proves the *shape*; this proves the bounds — a title of
        // 50 MB or an `expiresAt` of `<script>` parses fine and must not reach
        // the renderer.
        response
            .validate()
            .map_err(|issues| ShareError::InvalidResponse { issues })?;

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_codes_the_server_mints() {
        for code in ["AbC12345", "a", "aZ0-_9zZ", &"x".repeat(64)] {
            assert!(is_valid_share_code(code), "{code} should be accepted");
        }
    }

    /// The class this check removes: anything that could change which path the
    /// request lands on.
    #[test]
    fn rejects_codes_that_could_walk_the_api_path() {
        for code in [
            "", "../admin", "..", "a/b", "a.b", "a%2fb", "a?b", "a#b", "a b", "日本", "a\nb",
        ] {
            assert!(!is_valid_share_code(code), "{code} should be rejected");
        }
    }

    /// A debug build must never point a real user at localhost, and a release
    /// build must never be talked into it either — both are fixed at compile
    /// time.
    #[test]
    fn the_base_url_is_fixed_at_build_time() {
        let base = default_base_url();
        if cfg!(debug_assertions) {
            assert_eq!(base, SHARE_API_DEV_URL);
        } else {
            assert_eq!(base, SHARE_API_URL);
        }
    }

    #[test]
    fn the_production_host_is_the_one_the_server_serves() {
        assert_eq!(SHARE_API_URL, "https://api.shiranami.app");
    }
}
