//! Shared inputs for the pure state-machine suites.
//!
//! Split out so `queue_transitions.rs` and `queue_batches.rs` build the same
//! items rather than two subtly different ones.

// Each integration test is its own crate, so every one of them compiles this
// whole file and uses only the part it needs. The lint is measuring one binary
// at a time and cannot see the other.
#![allow(dead_code)]

use shiranami_core::models::{DownloadQueueItem, DownloadQueueStatus, EnqueueDownloadInput};
use shiranami_downloader::queue::{Effect, QueueState};

/// A minimal enqueue input.
pub(crate) fn input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        ..EnqueueDownloadInput::default()
    }
}

/// An enqueue input belonging to a batch.
pub(crate) fn batch_input(url: &str) -> EnqueueDownloadInput {
    EnqueueDownloadInput {
        url: url.to_owned(),
        title: url.to_owned(),
        batch_id: Some("b1".to_owned()),
        batch_index: Some(0),
        batch_source_title: Some("My Playlist".to_owned()),
        batch_create_playlist: Some(true),
        ..EnqueueDownloadInput::default()
    }
}

/// Enqueue `count` items named `id-0..id-count`, returning their ids.
pub(crate) fn fill(state: &mut QueueState, count: usize) -> Vec<String> {
    (0..count)
        .map(|index| {
            let id = format!("id-{index}");
            state.enqueue(
                input(&format!("https://example.com/{index}")),
                id.clone(),
                i64::try_from(index).unwrap_or(0),
            );
            id
        })
        .collect()
}

/// The ids a transition asked to start.
pub(crate) fn started(effects: &[Effect]) -> Vec<String> {
    effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Start(id) => Some(id.clone()),
            _ => None,
        })
        .collect()
}

/// A persisted item, for hydrate cases.
pub(crate) fn seed(id: &str, url: &str, status: DownloadQueueStatus, at: i64) -> DownloadQueueItem {
    DownloadQueueItem {
        id: id.to_owned(),
        url: url.to_owned(),
        youtube_id: None,
        title: id.to_owned(),
        thumbnail: None,
        status,
        progress: if status == DownloadQueueStatus::Done {
            100.0
        } else {
            0.0
        },
        file_path: None,
        error: None,
        batch_id: None,
        batch_index: None,
        batch_source_title: None,
        batch_create_playlist: None,
        enqueued_at: at,
        started_at: None,
        finished_at: None,
    }
}
