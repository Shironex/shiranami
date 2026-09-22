//! The CORS headers, and why they are a layer rather than four lines per route.
//!
//! Spike A measured both failure shapes on WKWebView (`docs/v2/spike-a-results.md`
//! §2). With `crossOrigin='anonymous'` set — which both decks do — a response
//! without `Access-Control-Allow-Origin` fails the load outright with
//! `MediaError.code 4`. Without the attribute, it is worse: the element plays,
//! `currentTime` advances, and the tainted `MediaElementAudioSource` emits
//! digital silence into the graph. Nothing reaches the analyser or the speakers,
//! and nothing reports an error.
//!
//! That is why this is a layer wrapping the whole router instead of a header set
//! each handler remembers. A route added later cannot forget it, and — the part
//! that actually bites — *error* responses carry it too. A 403 or a 416 without
//! the header is a CORS failure rather than the status it meant to be, so the
//! renderer sees "load failed" where it should see "range not satisfiable".
//!
//! `*` rather than the webview's origin: the architecture's table names the
//! origin, and Spike A's amendment (§"What this changes in the v2 plan") settles
//! on `*`. It is sufficient because the decks request in anonymous mode, and it
//! is *safer* than echoing `tauri://localhost` — echoing an origin is the shape
//! that later grows credentials. The token in the path, not the origin header,
//! is what stops another local process reading files.

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    ACCESS_CONTROL_EXPOSE_HEADERS, HeaderName,
};
use axum::middleware::Next;
use axum::response::Response;

/// Every origin. See the module note: anonymous-mode requests, no credentials.
pub const ALLOW_ORIGIN: &str = "*";

/// The one request header the media element sends that is not already safelisted
/// in every engine.
pub const ALLOW_HEADERS: &str = "Range";

/// The methods the routes answer.
pub const ALLOW_METHODS: &str = "GET, HEAD, OPTIONS";

/// The response headers a cross-origin reader may see.
///
/// Without `Content-Range` exposed, a 206 arrives at the media element with the
/// bytes but not the position they belong at.
pub const EXPOSE_HEADERS: &str = "Content-Range, Content-Length, Accept-Ranges";

/// The four headers, in the order they are applied.
fn header_set() -> [(HeaderName, HeaderValue); 4] {
    [
        (
            ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static(ALLOW_ORIGIN),
        ),
        (
            ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static(ALLOW_HEADERS),
        ),
        (
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static(ALLOW_METHODS),
        ),
        (
            ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static(EXPOSE_HEADERS),
        ),
    ]
}

/// Stamp the CORS headers onto every response leaving the server.
///
/// Applied with [`axum::middleware::from_fn`] around the whole router, so it
/// covers handler responses, the fallback, and the method-not-allowed responses
/// axum generates on its own — the three places a per-handler header set leaks.
pub async fn apply(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    for (name, value) in header_set() {
        headers.insert(name, value);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The header values are the ones Spike A verified, spelled the way the
    /// fetch spec matches them. A typo here is a silent player on macOS.
    #[test]
    fn the_header_values_are_the_ones_spike_a_verified() {
        assert_eq!(ALLOW_ORIGIN, "*");
        assert!(ALLOW_HEADERS.contains("Range"));
        assert!(EXPOSE_HEADERS.contains("Content-Range"));
        assert!(EXPOSE_HEADERS.contains("Accept-Ranges"));
        assert!(EXPOSE_HEADERS.contains("Content-Length"));
    }

    #[test]
    fn the_header_set_is_four_distinct_headers() {
        let set = header_set();
        let names: Vec<_> = set.iter().map(|(name, _)| name.clone()).collect();
        assert_eq!(names.len(), 4);
        for (index, name) in names.iter().enumerate() {
            assert!(
                !names[..index].contains(name),
                "{name} is applied twice — the later value would win silently"
            );
        }
    }
}
