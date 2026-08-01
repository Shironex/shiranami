//! Shared rig for the enrich test files.
//!
//! `#[path]`-included rather than reached through a `tests/support/mod.rs`,
//! because `mod.rs` is a manifest in this workspace and this file is anything
//! but. It owns the loopback server, the progress recorder and the track
//! factory, so `enrich_batch.rs` and `enrich_fields.rs` stay under the
//! 400-code-line module cap without duplicating a hundred lines of setup.

#![allow(dead_code, reason = "each test file uses a different subset")]

// The path is relative to this file's directory, so it resolves to the sibling
// `support/test_server.rs`.
#[path = "test_server.rs"]
pub(crate) mod test_server;

use std::sync::{Arc, Mutex};

use shiranami_core::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_metadata::enrich::{
    EnrichContext, EnrichOptions, EnrichProgress, EnrichStatus, EnrichTrackInput,
    EnrichTrackResult, enrich_tracks,
};
use shiranami_net::HttpClient;
use tokio_util::sync::CancellationToken;

pub(crate) use test_server::{Reply, TestServer};

/// An iTunes response with no results.
pub(crate) const NO_RESULTS: &str = r#"{"resultCount":0,"results":[]}"#;

/// Collects progress events for assertion.
#[derive(Default)]
pub(crate) struct Recorder(pub(crate) Mutex<Vec<EnrichProgress>>);

impl Recorder {
    pub(crate) fn events(&self) -> Vec<EnrichProgress> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(crate) fn count(&self, status: EnrichStatus) -> usize {
        self.events()
            .into_iter()
            .filter(|event| event.status == status)
            .count()
    }
}

/// A track with nothing worth keeping: unknown artist and album, no art.
pub(crate) fn track(index: usize, title: &str) -> EnrichTrackInput {
    EnrichTrackInput {
        id: format!("00000000-0000-4000-8000-00000000000{index}"),
        file_path: format!("/music/{title}.mp3").into(),
        title: title.to_owned(),
        artist: UNKNOWN_ARTIST.to_owned(),
        album: UNKNOWN_ALBUM.to_owned(),
        album_art: None,
        genre: String::new(),
        year: None,
        track_number: None,
    }
}

/// An iTunes response matching `title` exactly, with no artwork.
pub(crate) fn matching(title: &str) -> String {
    format!(
        r#"{{"resultCount":1,"results":[{{
          "trackName":"{title}","artistName":"Found Artist",
          "collectionName":"Found Album","primaryGenreName":"Found Genre",
          "releaseDate":"2020-07-01T07:00:00Z","trackNumber":7
        }}]}}"#
    )
}

/// Run a batch against a server that answers each lookup with `replies`.
pub(crate) async fn run(
    replies: Vec<Reply>,
    tracks: &[EnrichTrackInput],
    options: EnrichOptions,
    cancel: &CancellationToken,
) -> (Vec<EnrichTrackResult>, Arc<Recorder>, TestServer) {
    run_with_data_dir(replies, tracks, options, cancel, None).await
}

/// [`run`], with an art-cache directory.
pub(crate) async fn run_with_data_dir(
    replies: Vec<Reply>,
    tracks: &[EnrichTrackInput],
    options: EnrichOptions,
    cancel: &CancellationToken,
    data_dir: Option<&std::path::Path>,
) -> (Vec<EnrichTrackResult>, Arc<Recorder>, TestServer) {
    let server = TestServer::start(replies).await;
    let client = HttpClient::new().expect("the shared client builds");
    let recorder = Arc::new(Recorder::default());
    let endpoint = server.url("/search");

    let context = EnrichContext {
        client: &client,
        data_dir,
        fallback: None,
        // The whole reason `itunes_endpoint` is a field: without it the batch
        // would reach the real iTunes API from a unit test.
        itunes_endpoint: &endpoint,
    };

    let sink = Arc::clone(&recorder);
    let results = enrich_tracks(&context, tracks, options, cancel, &move |event| {
        sink.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(event);
    })
    .await;

    (results, recorder, server)
}
