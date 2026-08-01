//! `GET /{token}/radio?url=…` — v1's `shiranami-radio://stream?url=…`.
//!
//! The station URL comes from radio-browser.info, which is a worldwide
//! user-editable directory: it is untrusted input that the app hands straight to
//! an HTTP client, which is the textbook SSRF shape. The guard runs on the URL
//! before the first request **and on every redirect target**, because a station
//! that answers `302 Location: http://169.254.169.254/…` would otherwise turn
//! the app into a proxy for the user's own network.
//!
//! Hence the manual hop loop. A client that follows redirects itself performs
//! exactly the requests the guard was supposed to authorise, and reports back
//! only where it ended up.
//!
//! # One deviation from v1: no 499
//!
//! v1 answered an aborted request with the non-standard `499`, because Electron
//! handed the protocol handler the renderer's `AbortSignal` and there was still
//! a response channel to write to. Over HTTP there is not: a client that goes
//! away has closed the connection, and 499 would be written to a socket nobody
//! is reading. The status is dropped rather than faked; the abort still
//! propagates, because dropping the response future drops the upstream body with
//! it and the connection to the station closes.

use axum::body::Body;
use axum::extract::{Path as UrlPath, State};
use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use url::Url;

use crate::error::ServeError;
use crate::media_types::DEFAULT_AUDIO_MIME;
use crate::routes::query;
use crate::state::{MAX_REDIRECTS, ServeState};
use crate::upstream::UpstreamHead;

/// The statuses that mean "ask elsewhere". v1's `REDIRECT_STATUSES`.
const REDIRECT_STATUSES: [u16; 5] = [301, 302, 303, 307, 308];

/// Proxy a radio stream, re-validating every hop.
pub async fn handle(
    State(state): State<ServeState>,
    UrlPath(token): UrlPath<String>,
    uri: Uri,
) -> Result<Response, ServeError> {
    if !state.token_matches(&token) {
        return Err(ServeError::NotFound);
    }

    let Some(requested) = query::first(&uri, "url").filter(|url| !url.is_empty()) else {
        return Err(ServeError::BadRequest("missing url parameter"));
    };

    let mut current = requested;

    for hop in 0..=MAX_REDIRECTS {
        // Every hop, including the first. The reason is logged and never sent:
        // telling a caller *why* its URL was refused lets it map the network
        // one request at a time.
        let checked = state.guard().check(&current).await.map_err(|reason| {
            tracing::warn!(%reason, hop, "radio proxy blocked a URL");
            ServeError::Forbidden
        })?;

        let head = state
            .upstream()
            .fetch(checked.as_str())
            .await
            .map_err(|error| {
                tracing::debug!(%error, hop, "radio proxy could not reach the station");
                ServeError::Internal
            })?;

        if !REDIRECT_STATUSES.contains(&head.status) {
            return respond(head);
        }

        // A 3xx with no usable `Location` is not a redirect we can follow, so
        // it is forwarded as the response it is — which fails the success check
        // in `respond` and reaches the renderer as the station's own status.
        let Some(location) = head.location() else {
            return respond(head);
        };

        if hop == MAX_REDIRECTS {
            tracing::warn!("radio proxy refused a redirect chain longer than {MAX_REDIRECTS}");
            return Err(ServeError::Forbidden);
        }

        // Relative targets are resolved against the URL that produced them, as
        // v1's `new URL(location, currentUrl)` did.
        current = resolve_location(&checked, location).ok_or_else(|| {
            tracing::warn!("radio proxy refused an unresolvable Location");
            ServeError::Forbidden
        })?;
    }

    // Unreachable: the loop either returns or refuses at `hop == MAX_REDIRECTS`.
    Err(ServeError::Forbidden)
}

fn resolve_location(base: &Url, location: &str) -> Option<String> {
    base.join(location).ok().map(String::from)
}

/// Turn a station's response into ours.
///
/// The status is flattened to 200 on success, as v1 did. A station answering 206
/// to a request we never sent a Range on would otherwise reach the media element
/// as a partial response with no `Content-Range` to place it.
fn respond(head: UpstreamHead) -> Result<Response, ServeError> {
    let status = StatusCode::from_u16(head.status).unwrap_or(StatusCode::BAD_GATEWAY);
    if !status.is_success() {
        return Err(ServeError::Upstream { status });
    }

    let content_type = head.content_type().unwrap_or(DEFAULT_AUDIO_MIME).to_owned();

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            // A live stream has no length and no seekable extent. Saying so
            // stops the media element from issuing Range requests the station
            // would answer by restarting the stream.
            (header::ACCEPT_RANGES, "none".to_owned()),
            (header::CACHE_CONTROL, "no-cache, no-store".to_owned()),
        ],
        Body::from_stream(head.body),
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_redirect_statuses_are_v1s() {
        assert_eq!(REDIRECT_STATUSES, [301, 302, 303, 307, 308]);
        assert!(
            !REDIRECT_STATUSES.contains(&300),
            "300 Multiple Choices has no single Location to follow"
        );
        assert!(!REDIRECT_STATUSES.contains(&304));
    }

    #[test]
    fn a_relative_location_resolves_against_its_own_hop() {
        let base = Url::parse("http://stream.example.com/a/b").expect("a valid base");
        assert_eq!(
            resolve_location(&base, "/live.mp3").as_deref(),
            Some("http://stream.example.com/live.mp3")
        );
        assert_eq!(
            resolve_location(&base, "c.mp3").as_deref(),
            Some("http://stream.example.com/a/c.mp3")
        );
    }

    #[test]
    fn an_absolute_location_replaces_the_base() {
        let base = Url::parse("http://stream.example.com/a").expect("a valid base");
        assert_eq!(
            resolve_location(&base, "https://cdn.example.net/live").as_deref(),
            Some("https://cdn.example.net/live")
        );
    }

    /// A scheme-relative target keeps the scheme, which matters because the
    /// guard refuses anything that is not http(s) — and would never see a
    /// `javascript:` target that had been resolved away.
    #[test]
    fn a_resolved_location_is_still_checked_by_the_guard() {
        let base = Url::parse("http://stream.example.com/a").expect("a valid base");
        assert_eq!(
            resolve_location(&base, "//cdn.example.net/live").as_deref(),
            Some("http://cdn.example.net/live")
        );
        assert_eq!(
            resolve_location(&base, "file:///etc/passwd").as_deref(),
            Some("file:///etc/passwd"),
            "resolution does not judge — the guard does, on the next iteration"
        );
    }
}
