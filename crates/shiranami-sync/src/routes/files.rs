//! The byte routes: cover art and audio files.
//!
//! Audio is addressed by **track id**, never by path: a phone cannot name a
//! file, only a row, and the desktop resolves the row to a path itself. That
//! path then goes through the same extension allowlist and folder containment
//! guard the loopback server uses, so even a compromised paired phone cannot
//! read outside the library. A refusal there is a 404 like any other.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path as UrlPath, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::Response;
use bytes::Bytes;
use futures_util::StreamExt as _;
use shiranami_core::paths::is_path_within;
use shiranami_core::sync::lock_or_recover;
use shiranami_serve::media_types::{UNKNOWN_AUDIO_MIME, audio_mime, extension_of, is_audio_path};
use shiranami_serve::range::{RangeOutcome, resolve};
use shiranami_serve::routes::audio::{CHUNK_SIZE, range_stream};
use tokio_util::io::ReaderStream;

use crate::error::SyncError;
use crate::routes::library::{file_stat, file_version};
use crate::routes::{authenticate, is_art_hash};
use crate::server::{MAX_STREAMS_PER_DEVICE, Shared};
use crate::status::SyncTransfer;

/// Covers are content-addressed, so a name's bytes never change.
const ART_CACHE_CONTROL: &str = "private, max-age=31536000, immutable";

pub(super) async fn art(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    UrlPath(hash): UrlPath<String>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    if !is_art_hash(&hash) {
        return Err(SyncError::NotFound);
    }
    let path = shared.art_dir.join(format!("{hash}.jpg"));
    // Always true after the name check; kept as the second opinion, exactly
    // as the loopback art route does.
    if !is_path_within(&path, &shared.art_dir) {
        return Err(SyncError::NotFound);
    }
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|_| SyncError::NotFound)?;
    let mut response = Response::new(Body::from(bytes));
    let out = response.headers_mut();
    out.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/jpeg"));
    out.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(ART_CACHE_CONTROL),
    );
    if let Ok(etag) = HeaderValue::from_str(&format!("\"{hash}\"")) {
        out.insert(header::ETAG, etag);
    }
    Ok(response)
}

/// Removes its transfer from the status when the response body is dropped,
/// whether it finished, failed or the phone hung up.
struct TransferGuard {
    shared: Arc<Shared>,
    id: u64,
}

impl Drop for TransferGuard {
    fn drop(&mut self) {
        lock_or_recover(&self.shared.transfers).remove(&self.id);
        self.shared.notify();
    }
}

pub(super) async fn audio(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    UrlPath(track_id): UrlPath<String>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    let device = authenticate(&shared, peer, &method, &uri, &headers, &body).await?;

    // Resolve and release the connection before touching the disk: a stream
    // can run for minutes and the app has one connection.
    let (file_path, title) = {
        let pool = (shared.pool)();
        let mut conn = pool.acquire().await.map_err(|error| {
            tracing::warn!(%error, "sync: could not acquire the database");
            SyncError::Internal
        })?;
        shiranami_db::repo::sync::track_file(&mut conn, &track_id).await?
    }
    .ok_or(SyncError::NotFound)?;
    let path = PathBuf::from(file_path);

    if !is_audio_path(&path) {
        tracing::warn!("sync: refused a track whose file is not audio");
        return Err(SyncError::NotFound);
    }
    let folders = Arc::clone(&shared.folders);
    let checked = path.clone();
    let allowed = tokio::task::spawn_blocking(move || folders.is_path_allowed(&checked))
        .await
        .map_err(|_| SyncError::Internal)?;
    if !allowed {
        tracing::warn!("sync: refused a track outside the allowed folders");
        return Err(SyncError::NotFound);
    }

    let stat_path = path.clone();
    let (total, mtime) = tokio::task::spawn_blocking(move || file_stat(&stat_path))
        .await
        .map_err(|_| SyncError::Internal)?
        .ok_or(SyncError::NotFound)?;
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| SyncError::NotFound)?;
    let etag = format!("\"{}\"", file_version(total, mtime));

    // RFC 7233 §3.2: a Range is honoured only if `If-Range` still names this
    // version of the file; otherwise the whole new file is sent.
    let range_header = headers.get(header::RANGE).and_then(|v| v.to_str().ok());
    let if_range = headers.get(header::IF_RANGE).and_then(|v| v.to_str().ok());
    let range_header = match if_range {
        Some(validator) if validator != etag => None,
        _ => range_header,
    };

    let guard = begin_transfer(&shared, &device.device_id, &device.name, &track_id, &title)?;
    let content_type =
        extension_of(&path).map_or(UNKNOWN_AUDIO_MIME, |extension| audio_mime(&extension));
    let stop = shared.shutdown.clone();

    let (status, length, content_range, body) = match resolve(range_header, total) {
        RangeOutcome::Full => {
            let stream = ReaderStream::with_capacity(file, CHUNK_SIZE)
                .take_until(stop.cancelled_owned())
                .map(move |chunk| {
                    let _keep = &guard;
                    chunk
                });
            (StatusCode::OK, total, None, Body::from_stream(stream))
        }
        RangeOutcome::Partial(range) => {
            let stream = range_stream(file, range)
                .await
                .map_err(|_| SyncError::Internal)?
                .take_until(stop.cancelled_owned())
                .map(move |chunk| {
                    let _keep = &guard;
                    chunk
                });
            (
                StatusCode::PARTIAL_CONTENT,
                range.length(),
                Some(range.content_range(total)),
                Body::from_stream(stream),
            )
        }
        RangeOutcome::Unsatisfiable => {
            drop(guard);
            return Err(SyncError::RangeNotSatisfiable { total });
        }
    };

    let mut response = Response::new(body);
    *response.status_mut() = status;
    let out = response.headers_mut();
    out.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    out.insert(header::CONTENT_LENGTH, HeaderValue::from(length));
    out.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    out.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(value) = HeaderValue::from_str(&etag) {
        out.insert(header::ETAG, value);
    }
    if let Some(value) = content_range.and_then(|v| HeaderValue::from_str(&v).ok()) {
        out.insert(header::CONTENT_RANGE, value);
    }
    Ok(response)
}

/// Register a transfer, refusing a device that already has
/// [`MAX_STREAMS_PER_DEVICE`] open.
fn begin_transfer(
    shared: &Arc<Shared>,
    device_id: &str,
    device_name: &str,
    track_id: &str,
    title: &str,
) -> Result<TransferGuard, SyncError> {
    let id = shared.next_transfer.fetch_add(1, Ordering::Relaxed);
    {
        let mut transfers = lock_or_recover(&shared.transfers);
        let open = transfers
            .values()
            .filter(|transfer| transfer.device_id == device_id)
            .count();
        if open >= MAX_STREAMS_PER_DEVICE {
            return Err(SyncError::TooManyStreams);
        }
        transfers.insert(
            id,
            SyncTransfer {
                device_id: device_id.to_owned(),
                device_name: device_name.to_owned(),
                track_id: track_id.to_owned(),
                title: title.to_owned(),
            },
        );
    }
    shared.notify();
    Ok(TransferGuard {
        shared: Arc::clone(shared),
        id,
    })
}
