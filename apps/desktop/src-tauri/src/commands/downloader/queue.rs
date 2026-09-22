//! The ten `downloader:queue-*` channels.
//!
//! `enqueue`, `cancel`, `cancel-all`, `retry`, `retry-all`, `clear-completed`,
//! `pause`, `resume`, `mark-imported`, `get`.
//!
//! # Eight of the ten answer nothing, and that is the contract
//!
//! Only `enqueue` (the new item's id) and `get` (the snapshot) return a value.
//! The other eight answer `void` and the renderer learns what happened from the
//! `downloader:queue-state` event, which the driver broadcasts after every
//! structural change. That is v1's design and it is load-bearing: two clients
//! of the same queue — the downloads view and the mini player — stay in sync
//! because neither of them is the source of truth.
//!
//! It also means a test of these commands asserts on the **broadcast**, not on
//! the return value. There is nothing else to assert on.
//!
//! # `enqueue` re-checks the URL
//!
//! v1 guarded `queue-enqueue` with the same `isHttpUrl` check as the legacy
//! `download` channel, and the comment says why: this is the channel the
//! playlist importer feeds, so it is the one a tampered playlist payload
//! actually reaches. The guard is here rather than only inside the queue
//! because the queue would otherwise accept the item, persist it, and fail at
//! download time — after the renderer had already drawn a row for it.
//!
//! # `batchId` and `batchIndex` are a coupled pair
//!
//! v1's zod schema carried a `.refine` rejecting a half-specified pair, because
//! the importer treats a missing `batchId` as the single-item path and a
//! half-filled pair silently misroutes. serde cannot express that, so it is a
//! `BAD_REQUEST` here under the same code the zod failure produced.
//!
//! # `mark-imported` is not `clear-completed`
//!
//! Importing is a renderer-side concern — the queue only knows the file was
//! written — so `mark-imported` exists to let the renderer say "these rows are
//! done with" and have them dropped from the persisted table. Calling
//! `clear-completed` instead would also drop rows the renderer has not imported
//! yet, which after a restart is a downloaded file nothing will ever add to the
//! library.

use shiranami_core::models::{DownloadQueueSnapshot, EnqueueDownloadInput};
use shiranami_net::url_safety::is_http_url;
use tauri::State;

use super::deferred::queue;
use crate::error::{CommandResult, bad_request};
use crate::state::AppState;

/// `downloader:queue-enqueue` — add one item, answering its generated id.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_enqueue(
    state: State<'_, AppState>,
    input: EnqueueDownloadInput,
) -> CommandResult<String> {
    validate_enqueue(&input)?;

    Ok(queue(&state)?.enqueue(input).await)
}

/// `downloader:queue-cancel` — cancel one item by id.
///
/// A no-op for an unknown id, exactly as v1 was: the renderer can fire this
/// from a row it drew before a `queue-state` event removed the item, and
/// rejecting would surface a race as an error.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_cancel(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    if id.is_empty() {
        return Err(bad_request("the download id must not be empty"));
    }

    queue(&state)?.cancel(&id).await;
    Ok(())
}

/// `downloader:queue-cancel-all` — cancel everything queued or active.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_cancel_all(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.cancel_all().await;
    Ok(())
}

/// `downloader:queue-retry` — re-queue one failed item by id.
///
/// A no-op for an unknown id or a non-failed item, mirroring `queue-cancel`:
/// the renderer can fire this from a row a `queue-state` event has already
/// settled or removed, and rejecting would surface that race as an error.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_retry(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    if id.is_empty() {
        return Err(bad_request("the download id must not be empty"));
    }

    queue(&state)?.retry(&id).await;
    Ok(())
}

/// `downloader:queue-retry-all` — re-queue every failed item.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_retry_all(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.retry_all_failed().await;
    Ok(())
}

/// `downloader:queue-clear-completed` — drop finished, failed and cancelled rows.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_clear_completed(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.clear_completed().await;
    Ok(())
}

/// `downloader:queue-pause` — stop promoting queued items to active.
///
/// Survives a restart: the flag is persisted outside the queue table, because
/// an empty paused queue is a real state. See [`crate::downloads::queue`].
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_pause(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.pause().await;
    Ok(())
}

/// `downloader:queue-resume` — start promoting again.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_resume(state: State<'_, AppState>) -> CommandResult<()> {
    queue(&state)?.resume().await;
    Ok(())
}

/// `downloader:queue-mark-imported` — drop rows the renderer has imported.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_mark_imported(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CommandResult<()> {
    queue(&state)?.mark_imported(&ids).await;
    Ok(())
}

/// `downloader:queue-get` — the whole queue, for a renderer that just mounted.
#[tauri::command]
#[specta::specta]
pub async fn downloader_queue_get(
    state: State<'_, AppState>,
) -> CommandResult<DownloadQueueSnapshot> {
    Ok(queue(&state)?.snapshot())
}

/// v1's `downloaderEnqueueArgs`, minus what serde already enforces.
///
/// The two non-empty strings and the coupled batch pair; the optional fields'
/// presence and types are serde's.
fn validate_enqueue(input: &EnqueueDownloadInput) -> CommandResult<()> {
    if input.url.is_empty() {
        return Err(bad_request("the download URL must not be empty"));
    }
    if input.title.is_empty() {
        return Err(bad_request("the download title must not be empty"));
    }
    if !is_http_url(&input.url) {
        return Err(shiranami_core::error::ErrorPayload::of(
            &shiranami_downloader::DownloaderError::InvalidUrl {
                message: "Refusing to download a non-http(s) URL".to_owned(),
            },
        ));
    }
    if input.batch_id.is_some() != input.batch_index.is_some() {
        return Err(bad_request(
            "batchId and batchIndex must be provided together",
        ));
    }

    Ok(())
}

#[cfg(test)]
#[path = "queue_tests.rs"]
mod tests;
