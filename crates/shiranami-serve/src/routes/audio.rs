//! `GET /{token}/audio?path=…` — v1's `shiranami-audio://play?path=…`.
//!
//! The order of the checks is the security property, and it is v1's order:
//! extension allowlist, then containment, then open. Checking containment first
//! would be a filesystem probe for anyone who can reach the port — the timing
//! difference between "outside the roots" and "inside but missing" is a
//! directory oracle. Checking the extension first means a refused request never
//! touches the disk at all.
//!
//! The body is streamed. A seek in a 300 MB FLAC asks for a range near the end
//! of the file, and reading the file to serve it would put 300 MB in memory to
//! send a few kilobytes.

use std::path::PathBuf;

use axum::body::Body;
use axum::extract::{Path as UrlPath, State};
use axum::http::{HeaderMap, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use futures_util::Stream;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::error::ServeError;
use crate::media_types::{UNKNOWN_AUDIO_MIME, audio_mime, extension_of, is_audio_path};
use crate::range::{RangeOutcome, ResolvedRange, resolve};
use crate::routes::query;
use crate::state::ServeState;

/// How much of a file is read at a time.
///
/// The number that makes "streamed" true. 64 KiB is roughly a second of FLAC,
/// so it is large enough that the syscall rate is irrelevant and small enough
/// that a hundred concurrent reads are still megabytes rather than gigabytes.
pub const CHUNK_SIZE: usize = 64 * 1024;

/// Serve a byte range of an authorized audio file.
pub async fn handle(
    State(state): State<ServeState>,
    UrlPath(token): UrlPath<String>,
    uri: Uri,
    headers: HeaderMap,
) -> Result<Response, ServeError> {
    if !state.token_matches(&token) {
        // 404, not 403: a 403 would confirm the route exists to a local process
        // that guessed the port. See `crate::token`.
        return Err(ServeError::NotFound);
    }

    let Some(raw_path) = query::first(&uri, "path") else {
        return Err(ServeError::BadRequest("missing path parameter"));
    };
    if raw_path.is_empty() {
        return Err(ServeError::BadRequest("missing path parameter"));
    }
    let path = PathBuf::from(&raw_path);

    if !is_audio_path(&path) {
        tracing::warn!(
            extension = ?extension_of(&path),
            "audio route refused a non-audio extension"
        );
        return Err(ServeError::Forbidden);
    }

    if !is_allowed(&state, path.clone()).await? {
        tracing::warn!("audio route refused a path outside the allowed roots");
        return Err(ServeError::Forbidden);
    }

    let file = File::open(&path).await.map_err(|error| {
        tracing::debug!(%error, "audio route could not open the file");
        ServeError::NotFound
    })?;
    let metadata = file.metadata().await.map_err(|_| ServeError::NotFound)?;
    if !metadata.is_file() {
        return Err(ServeError::NotAFile);
    }
    let total = metadata.len();

    let content_type =
        extension_of(&path).map_or(UNKNOWN_AUDIO_MIME, |extension| audio_mime(&extension));

    match resolve(range_header(&headers), total) {
        RangeOutcome::Full => Ok(full_response(file, total, content_type)),
        RangeOutcome::Partial(range) => partial_response(file, range, total, content_type).await,
        RangeOutcome::Unsatisfiable => Err(ServeError::RangeNotSatisfiable { total }),
    }
}

/// The containment check, off the async executor.
///
/// `is_path_allowed` may resolve symlinks and read the database on a miss, and
/// blocking a tokio worker on a disk read is how a slow network volume stalls
/// every other request. Its own fast path keeps the common case — the repeated
/// Range requests of a single seek — from ever reaching here twice.
async fn is_allowed(state: &ServeState, path: PathBuf) -> Result<bool, ServeError> {
    let folders = state.folders();
    tokio::task::spawn_blocking(move || folders.is_path_allowed(&path))
        .await
        .map_err(|_| ServeError::Internal)
}

fn range_header(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::RANGE)?.to_str().ok()
}

/// 200 with the whole file.
fn full_response(file: File, total: u64, content_type: &str) -> Response {
    let body = Body::from_stream(ReaderStream::with_capacity(file, CHUNK_SIZE));

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_owned()),
            (header::CONTENT_LENGTH, total.to_string()),
            // Advertised even on a 200: it is how a client learns it may ask
            // for a range at all, and WebKit reads it before it seeks.
            (header::ACCEPT_RANGES, "bytes".to_owned()),
        ],
        body,
    )
        .into_response()
}

/// 206 with one range.
async fn partial_response(
    file: File,
    range: ResolvedRange,
    total: u64,
    content_type: &str,
) -> Result<Response, ServeError> {
    let body = Body::from_stream(range_stream(file, range).await?);

    Ok((
        StatusCode::PARTIAL_CONTENT,
        [
            (header::CONTENT_TYPE, content_type.to_owned()),
            (header::CONTENT_LENGTH, range.length().to_string()),
            (header::CONTENT_RANGE, range.content_range(total)),
            (header::ACCEPT_RANGES, "bytes".to_owned()),
        ],
        body,
    )
        .into_response())
}

/// The bytes of `range`, in [`CHUNK_SIZE`] pieces, read as they are sent.
///
/// `seek` then `take` rather than read-then-slice: the process never holds more
/// than one chunk of the file, whatever the file's size or the range's.
pub async fn range_stream(
    mut file: File,
    range: ResolvedRange,
) -> Result<impl Stream<Item = std::io::Result<Bytes>> + Send, ServeError> {
    file.seek(std::io::SeekFrom::Start(range.start))
        .await
        .map_err(|error| {
            tracing::debug!(%error, "audio route could not seek to the range start");
            ServeError::Internal
        })?;

    Ok(ReaderStream::with_capacity(
        file.take(range.length()),
        CHUNK_SIZE,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    /// Big enough that a whole-file read would be obvious in the chunk count.
    const FILE_SIZE: usize = CHUNK_SIZE * 8;

    async fn fixture() -> (tempfile::TempDir, File) {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("track.mp3");
        std::fs::write(&path, vec![7_u8; FILE_SIZE]).expect("the fixture writes");
        let file = File::open(&path).await.expect("the fixture opens");
        (dir, file)
    }

    /// The claim in the module note, measured: the stream yields the range in
    /// bounded pieces rather than one allocation the size of the range.
    #[tokio::test]
    async fn the_body_arrives_in_bounded_chunks() {
        let (_dir, file) = fixture().await;
        let range = ResolvedRange {
            start: 0,
            end: (FILE_SIZE - 1) as u64,
        };

        let mut stream = Box::pin(range_stream(file, range).await.expect("the stream builds"));
        let mut chunks = 0_usize;
        let mut bytes = 0_usize;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.expect("the read succeeds");
            assert!(
                chunk.len() <= CHUNK_SIZE,
                "a {}-byte chunk means the range was buffered, not streamed",
                chunk.len()
            );
            chunks += 1;
            bytes += chunk.len();
        }

        assert_eq!(bytes, FILE_SIZE);
        assert!(
            chunks >= FILE_SIZE / CHUNK_SIZE,
            "{chunks} chunks for {FILE_SIZE} bytes — the reader is not chunking"
        );
    }

    /// A range near the end of a file must not read the start of it.
    #[tokio::test]
    async fn a_range_reads_only_its_own_bytes() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("track.mp3");
        let contents: Vec<u8> = (0..=255_u8).cycle().take(1_000).collect();
        std::fs::write(&path, &contents).expect("the fixture writes");
        let file = File::open(&path).await.expect("the fixture opens");

        let range = ResolvedRange {
            start: 900,
            end: 909,
        };
        let mut stream = Box::pin(range_stream(file, range).await.expect("the stream builds"));

        let mut read = Vec::new();
        while let Some(chunk) = stream.next().await {
            read.extend_from_slice(&chunk.expect("the read succeeds"));
        }

        assert_eq!(read, &contents[900..=909]);
        assert_eq!(read.len() as u64, range.length());
    }
}
