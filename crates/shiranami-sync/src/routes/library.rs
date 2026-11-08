//! The metadata routes: hello, manifest, playlists, favourites, history, and
//! unpairing from the phone side.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::Response;
use bytes::Bytes;
use shiranami_db::repo::sync as repo;
use sqlx::Sqlite;
use sqlx::pool::PoolConnection;

use crate::error::SyncError;
use crate::routes::{artwork_hash, authenticate, cursor, json, limit, make_cursor};
use crate::server::{Shared, unix_now};
use crate::wire::{
    FavoritesSnapshot, HistoryEntry, HistoryPage, LibraryManifestPage, MIN_PROTOCOL_VERSION,
    ManifestTrack, PROTOCOL_VERSION, PlaylistsSnapshot, SyncCapability, SyncHello, SyncPlaylist,
};

/// Default and largest manifest page.
const MANIFEST_PAGE: (i64, i64) = (500, 1000);
/// Default and largest history page.
const HISTORY_PAGE: (i64, i64) = (1000, 5000);

async fn conn(shared: &Shared) -> Result<PoolConnection<Sqlite>, SyncError> {
    (shared.pool)().acquire().await.map_err(|error| {
        tracing::warn!(%error, "sync: could not acquire the database");
        SyncError::Internal
    })
}

pub(super) async fn hello(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    let device = authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    let track_count = repo::track_count(&mut *conn(&shared).await?).await?;
    Ok(json(
        StatusCode::OK,
        &SyncHello {
            protocol_version: PROTOCOL_VERSION,
            min_protocol_version: MIN_PROTOCOL_VERSION,
            desktop_id: shared.desktop_id.clone(),
            desktop_name: shared.desktop_name.clone(),
            library_id: shared.library_id.clone(),
            app_version: shared.app_version.clone(),
            server_time: unix_now(),
            device_id: device.device_id,
            capabilities: vec![
                SyncCapability::Manifest,
                SyncCapability::Playlists,
                SyncCapability::Favorites,
                SyncCapability::History,
                SyncCapability::Artwork,
                SyncCapability::AudioRange,
            ],
            track_count,
        },
    ))
}

pub(super) async fn manifest(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    let after = cursor(&uri)?;
    let page = limit(&uri, MANIFEST_PAGE.0, MANIFEST_PAGE.1)?;

    let (track_count, mut rows) = {
        let mut conn = conn(&shared).await?;
        let count = repo::track_count(&mut conn).await?;
        let rows = repo::manifest_page(&mut conn, after, page + 1).await?;
        (count, rows)
    };
    let has_more = rows.len() > usize::try_from(page).unwrap_or(usize::MAX);
    rows.truncate(usize::try_from(page).unwrap_or(usize::MAX));
    let next_cursor = has_more
        .then(|| rows.last().map(|row| make_cursor(row.rowid)))
        .flatten();

    // File sizes come from the disk, off the executor: a page is up to a
    // thousand `stat` calls, and a slow network volume must not stall the
    // runtime.
    let paths: Vec<PathBuf> = rows
        .iter()
        .map(|row| PathBuf::from(&row.track.file_path))
        .collect();
    let stats =
        tokio::task::spawn_blocking(move || paths.iter().map(|p| file_stat(p)).collect::<Vec<_>>())
            .await
            .map_err(|_| SyncError::Internal)?;

    let tracks = rows
        .into_iter()
        .zip(stats)
        .map(|(row, stat)| {
            let track = row.track;
            ManifestTrack {
                format: extension(&track.file_path),
                artwork_hash: artwork_hash(track.album_art.as_deref()),
                size_bytes: stat.map(|(size, _)| size),
                file_version: stat.map(|(size, mtime)| file_version(size, mtime)),
                content_hash: row.content_hash,
                id: track.id,
                title: track.title,
                artist: track.artist,
                album_artist: track.album_artist,
                album: track.album,
                genre: track.genre,
                year: track.year,
                track_number: track.track_number,
                disc_number: track.disc_number,
                duration: track.duration,
                is_favorite: track.is_favorite.unwrap_or(false),
                play_count: track.play_count.unwrap_or(0),
                created_at: track.created_at,
                updated_at: track.updated_at,
            }
        })
        .collect();

    Ok(json(
        StatusCode::OK,
        &LibraryManifestPage {
            library_id: shared.library_id.clone(),
            track_count,
            tracks,
            next_cursor,
            has_more,
        },
    ))
}

pub(super) async fn playlists(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    let rows = repo::playlists_snapshot(&mut *conn(&shared).await?).await?;
    let playlists = rows
        .into_iter()
        .map(|row| SyncPlaylist {
            artwork_hash: artwork_hash(row.cover_art.as_deref()),
            id: row.id,
            name: row.name,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
            track_ids: row.track_ids,
        })
        .collect();
    Ok(json(StatusCode::OK, &PlaylistsSnapshot { playlists }))
}

pub(super) async fn favorites(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    let track_ids = repo::favorite_ids(&mut *conn(&shared).await?).await?;
    Ok(json(StatusCode::OK, &FavoritesSnapshot { track_ids }))
}

pub(super) async fn history(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    let after = cursor(&uri)?;
    let page = limit(&uri, HISTORY_PAGE.0, HISTORY_PAGE.1)?;
    let mut rows = repo::history_page(&mut *conn(&shared).await?, after, page + 1).await?;
    let has_more = rows.len() > usize::try_from(page).unwrap_or(usize::MAX);
    rows.truncate(usize::try_from(page).unwrap_or(usize::MAX));
    let next_cursor = has_more
        .then(|| rows.last().map(|row| make_cursor(row.rowid)))
        .flatten();
    let entries = rows
        .into_iter()
        .map(|row| HistoryEntry {
            id: row.id,
            track_id: row.track_id,
            played_at: row.played_at,
            played_seconds: row.played_seconds,
            completion_ratio: row.completion_ratio,
            completed: row.completed,
            source: row.source,
        })
        .collect();
    Ok(json(
        StatusCode::OK,
        &HistoryPage {
            entries,
            next_cursor,
            has_more,
        },
    ))
}

pub(super) async fn revoke_self(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, SyncError> {
    let device = authenticate(&shared, peer, &method, &uri, &headers, &body).await?;
    crate::devices::revoke(&mut *conn(&shared).await?, &device.device_id).await?;
    shared.nonces.forget(&device.device_id);
    shared.notify();
    let mut response = Response::new(axum::body::Body::empty());
    *response.status_mut() = StatusCode::NO_CONTENT;
    Ok(response)
}

/// `(size, mtime seconds)` of a regular file, `None` otherwise.
pub(crate) fn file_stat(path: &std::path::Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path)
        .ok()
        .filter(std::fs::Metadata::is_file)?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());
    Some((meta.len(), mtime))
}

/// The audio route's `ETag`, unquoted.
pub(crate) fn file_version(size: u64, mtime: u64) -> String {
    format!("{size}-{mtime}")
}

/// Lowercase extension without the dot.
fn extension(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
}
