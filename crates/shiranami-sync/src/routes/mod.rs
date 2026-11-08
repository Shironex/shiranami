//! The `/v1/sync` router, and the pieces every route shares: request
//! authentication, JSON bodies, query parameters and cursors.
//!
//! | Method + path | Auth | Body |
//! | ------------- | ---- | ---- |
//! | `POST /v1/sync/pair` | pairing proof | [`crate::wire::PairResponse`] |
//! | `GET /v1/sync/hello` | signed | [`crate::wire::SyncHello`] |
//! | `GET /v1/sync/manifest?cursor=&limit=` | signed | [`crate::wire::LibraryManifestPage`] |
//! | `GET /v1/sync/playlists` | signed | [`crate::wire::PlaylistsSnapshot`] |
//! | `GET /v1/sync/favorites` | signed | [`crate::wire::FavoritesSnapshot`] |
//! | `GET /v1/sync/history?cursor=&limit=` | signed | [`crate::wire::HistoryPage`] |
//! | `GET /v1/sync/art/{hash}` | signed | `image/jpeg` |
//! | `GET /v1/sync/tracks/{id}/audio` | signed | audio, `Range` / `If-Range` |
//! | `DELETE /v1/sync/devices/self` | signed | 204 |
//!
//! Anything else is a 404 with no body, the same answer as a bad signature.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::Response;
use axum::routing::{delete, get, post};
use serde::Serialize;
use shiranami_core::sync::lock_or_recover;
use shiranami_db::repo::sync::{SyncPeer, get_peer, touch_peer};

use crate::auth::{hmac_verify, is_fresh, parse_authorization, signing_payload, unb64};
use crate::error::SyncError;
use crate::server::{Shared, unix_now};

mod files;
mod library;
mod pair;

/// How often `last_seen_at` is written per device, at most.
const TOUCH_EVERY: Duration = Duration::from_secs(60);

/// Prefix of every cursor this build mints. Cursors are opaque to clients.
const CURSOR_PREFIX: &str = "v0.";

/// The router over `shared`.
pub(crate) fn router(shared: Arc<Shared>) -> Router {
    Router::new()
        .route("/v1/sync/pair", post(pair::pair))
        .route("/v1/sync/hello", get(library::hello))
        .route("/v1/sync/manifest", get(library::manifest))
        .route("/v1/sync/playlists", get(library::playlists))
        .route("/v1/sync/favorites", get(library::favorites))
        .route("/v1/sync/history", get(library::history))
        .route("/v1/sync/art/{hash}", get(files::art))
        .route("/v1/sync/tracks/{id}/audio", get(files::audio))
        .route("/v1/sync/devices/self", delete(library::revoke_self))
        .fallback(unknown)
        .with_state(shared)
}

async fn unknown() -> SyncError {
    SyncError::NotFound
}

/// A JSON response with `no-store`: nothing here should sit in a cache.
pub(crate) fn json<T: Serialize>(status: StatusCode, body: &T) -> Response {
    let Ok(bytes) = serde_json::to_vec(body) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response_plain();
    };
    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// `StatusCode` to an empty response, without pulling `IntoResponse` into
/// every call site.
trait PlainResponse {
    fn into_response_plain(self) -> Response;
}

impl PlainResponse for StatusCode {
    fn into_response_plain(self) -> Response {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = self;
        response
    }
}

/// The first value of query parameter `key`.
pub(crate) fn query(uri: &Uri, key: &str) -> Option<String> {
    url::form_urlencoded::parse(uri.query().unwrap_or_default().as_bytes())
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.into_owned())
}

/// Read `cursor` as the rowid to continue after. Absent means the start.
pub(crate) fn cursor(uri: &Uri) -> Result<i64, SyncError> {
    match query(uri, "cursor") {
        None => Ok(0),
        Some(raw) if raw.is_empty() => Ok(0),
        Some(raw) => raw
            .strip_prefix(CURSOR_PREFIX)
            .and_then(|rowid| rowid.parse::<i64>().ok())
            .filter(|rowid| *rowid >= 0)
            .ok_or(SyncError::BadRequest("unreadable cursor")),
    }
}

/// Mint the cursor that continues after `rowid`.
pub(crate) fn make_cursor(rowid: i64) -> String {
    format!("{CURSOR_PREFIX}{rowid}")
}

/// Read `limit`, defaulting and clamping.
pub(crate) fn limit(uri: &Uri, default: i64, max: i64) -> Result<i64, SyncError> {
    match query(uri, "limit") {
        None => Ok(default),
        Some(raw) => raw
            .parse::<i64>()
            .ok()
            .filter(|limit| *limit >= 1)
            .map(|limit| limit.min(max))
            .ok_or(SyncError::BadRequest("unreadable limit")),
    }
}

/// Verify a signed request and return the device it came from.
///
/// Every failure is the same 404, and each one counts against the caller's
/// address; an address over [`crate::server::AUTH_FAILURES_PER_MINUTE`] is
/// refused before any work. A valid request from a device over its token
/// bucket is a 429 instead, since it has already proven who it is.
pub(crate) async fn authenticate(
    shared: &Shared,
    peer_addr: SocketAddr,
    method: &Method,
    uri: &Uri,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<SyncPeer, SyncError> {
    let ip: IpAddr = peer_addr.ip();
    if shared.auth_failures.is_blocked(&ip) {
        return Err(SyncError::RateLimited { retry_after: 60 });
    }
    let refuse = |reason: &'static str| {
        shared.auth_failures.allow(&ip);
        tracing::debug!(reason, "sync: refused a request");
        SyncError::NotFound
    };

    let header_value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| refuse("no authorization"))?;
    let signed = parse_authorization(header_value).ok_or_else(|| refuse("malformed"))?;
    let now = unix_now();
    if !is_fresh(signed.ts, now) {
        return Err(refuse("stale timestamp"));
    }

    let peer = {
        let pool = (shared.pool)();
        let mut conn = pool.acquire().await.map_err(|error| {
            tracing::warn!(%error, "sync: could not acquire the database");
            SyncError::Internal
        })?;
        get_peer(&mut conn, &signed.device_id).await?
    }
    .ok_or_else(|| refuse("unknown device"))?;

    let secret = unb64(&peer.secret).ok_or(SyncError::Internal)?;
    let path_and_query = uri
        .path_and_query()
        .map_or_else(|| uri.path().to_owned(), ToString::to_string);
    let payload = signing_payload(
        method.as_str(),
        &path_and_query,
        signed.ts,
        &signed.nonce,
        body,
    );
    if !hmac_verify(&secret, payload.as_bytes(), &signed.sig) {
        return Err(refuse("bad signature"));
    }
    if !shared
        .nonces
        .check_and_insert(&peer.device_id, &signed.nonce, signed.ts, now)
    {
        return Err(refuse("reused nonce"));
    }
    if !shared.device_rate.allow(&peer.device_id) {
        return Err(SyncError::RateLimited { retry_after: 1 });
    }

    touch(shared, &peer.device_id).await;
    Ok(peer)
}

/// Stamp `last_seen_at`, at most once per [`TOUCH_EVERY`] per device.
async fn touch(shared: &Shared, device_id: &str) {
    let due = {
        let mut touched = lock_or_recover(&shared.touched);
        let now = Instant::now();
        let due = touched
            .get(device_id)
            .is_none_or(|last| now.duration_since(*last) >= TOUCH_EVERY);
        if due {
            touched.insert(device_id.to_owned(), now);
        }
        due
    };
    if !due {
        return;
    }
    let pool = (shared.pool)();
    if let Ok(mut conn) = pool.acquire().await
        && let Err(error) = touch_peer(&mut conn, device_id).await
    {
        tracing::debug!(%error, "sync: could not stamp a device as seen");
    }
}

/// The cover-art name a stored `album_art` / `cover_art` value addresses, if
/// it is one of this desktop's cached covers.
pub(crate) fn artwork_hash(stored: Option<&str>) -> Option<String> {
    let canonical = shiranami_core::art::canonical_art_url(stored?);
    let name = canonical.strip_prefix(shiranami_core::art::ART_URL_PREFIX)?;
    let hash = name.strip_suffix(".jpg")?;
    is_art_hash(hash).then(|| hash.to_owned())
}

/// `[0-9a-f]{8,64}`: the shape of a cached cover's name.
pub(crate) fn is_art_hash(hash: &str) -> bool {
    (8..=64).contains(&hash.len()) && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursors_round_trip_and_reject_garbage() {
        let uri: Uri = format!("/x?cursor={}", make_cursor(42))
            .parse()
            .expect("uri");
        assert_eq!(cursor(&uri).expect("cursor"), 42);
        let none: Uri = "/x".parse().expect("uri");
        assert_eq!(cursor(&none).expect("cursor"), 0);
        let bad: Uri = "/x?cursor=42".parse().expect("uri");
        assert!(cursor(&bad).is_err());
        let negative: Uri = "/x?cursor=v0.-1".parse().expect("uri");
        assert!(cursor(&negative).is_err());
    }

    #[test]
    fn limits_clamp() {
        let uri: Uri = "/x?limit=99999".parse().expect("uri");
        assert_eq!(limit(&uri, 10, 500).expect("limit"), 500);
        let zero: Uri = "/x?limit=0".parse().expect("uri");
        assert!(limit(&zero, 10, 500).is_err());
    }

    #[test]
    fn artwork_hash_reads_only_cached_covers() {
        assert_eq!(
            artwork_hash(Some("shiranami-art://art/0123456789abcdef.jpg")).as_deref(),
            Some("0123456789abcdef")
        );
        assert_eq!(artwork_hash(Some("https://example.com/a.jpg")), None);
        assert_eq!(artwork_hash(Some("shiranami-art://art/../x.jpg")), None);
        assert_eq!(artwork_hash(None), None);
    }
}
