//! `playlist:*` — external playlist extraction, ported from
//! `apps/desktop/src/main/ipc/playlist.ts`.
//!
//! Two channels and one event. `playlist:extract` resolves a YouTube or Spotify
//! playlist URL into `SearchResult`s the downloads view can enqueue;
//! `playlist:cancel` stops one in flight.
//!
//! Not to be confused with `db:playlists:*`, which is the library's own
//! playlists. This namespace never touches the database — it produces a list
//! the renderer then decides what to do with.
//!
//! # The two providers are asymmetric, and the event says so
//!
//! YouTube extraction is a single `yt-dlp --flat-playlist --dump-json` call:
//! one process, one parse, no progress to report. Spotify has no usable API —
//! the Web API now requires the app owner to hold Premium, so v1 dropped it —
//! so its metadata is scraped from the public embed page and then **every track
//! is searched on YouTube and scored**. That is where the four-worker pool, the
//! cancellation and all of `playlist:extract-progress` come from.
//!
//! A renderer listening for progress therefore sees nothing at all on a YouTube
//! URL. That is v1's behaviour and not a gap.
//!
//! # Cancellation is real, and it was not always
//!
//! v1 replaced a module-level `cancelledFlag` boolean with an `AbortController`
//! precisely because the boolean only stopped the loop from advancing — the
//! in-flight yt-dlp searches kept running. The port carries a
//! `CancellationToken` into the spawns for the same reason, and
//! [`crate::downloads::DownloaderServices`] holds it because §2.3 forbids the
//! module-level variable v1 kept it in.
//!
//! Two behaviours of that holder are v1's and are pinned there rather than
//! here: a second `extract` aborts the first, and an extraction that finishes
//! after a newer one started does not clear the newer one's token.
//!
//! # A cancelled extraction resolves, it does not reject
//!
//! v1's worker returned early on abort and the pool's `Promise.all` resolved
//! with whatever had been matched, so a cancel answers a **partial result**
//! rather than an error. The renderer closes the modal on cancel and never
//! reads it, but the distinction is observable to anything that does — and
//! rejecting would turn a user pressing Cancel into an error toast.

use shiranami_core::models::PlaylistExtractResult;
use tauri::{AppHandle, State};

use crate::downloads::ExtractEvents;
use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::playlist::playlist_extract,
                crate::commands::playlist::playlist_cancel,
            ]
        }
    };
}
pub(crate) use commands;

/// `playlist:extract` — resolve a YouTube or Spotify playlist URL.
///
/// Emits `playlist:extract-progress` on the Spotify path only.
#[tauri::command]
#[specta::specta]
pub async fn playlist_extract(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> CommandResult<PlaylistExtractResult> {
    // v1's `z.string().min(1)`. The provider check below rejects anything that
    // is not a recognised playlist URL, so this only separates "you sent
    // nothing" from "you sent something unsupported" — two different messages
    // for two different mistakes.
    if url.is_empty() {
        return Err(bad_request("the playlist URL must not be empty"));
    }

    let services = crate::commands::downloader::services(&state)?;
    let progress = ExtractEvents::new(app);

    // The token has to be installed *before* the await and cleared after it,
    // so a `playlist:cancel` arriving mid-extraction finds something to cancel.
    let token = services.begin_extraction();
    let outcome = services
        .extractor()
        .extract(&url, &progress, &token)
        .await
        .wire();
    services.end_extraction(&token);

    outcome
}

/// `playlist:cancel` — stop the extraction in flight.
///
/// A no-op when none is running, exactly as v1's `activeExtraction?.abort()`
/// was: the renderer fires this from a modal's close button, which is reachable
/// after the extraction has already finished.
#[tauri::command]
#[specta::specta]
pub async fn playlist_cancel(state: State<'_, AppState>) -> CommandResult<()> {
    crate::commands::downloader::services(&state)?.cancel_extraction();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloads::testing::{RecordingExtractProgress, ScriptedRunner, services_over};
    use shiranami_core::error::codes;
    use shiranami_core::models::{MatchFlag, SearchResult};
    use shiranami_downloader::extract::{PlaylistProvider, detect_provider, spotify_playlist_id};
    use std::sync::Arc;
    use tokio_util::sync::CancellationToken;

    #[test]
    fn an_empty_url_is_a_bad_request() {
        let error = bad_request("the playlist URL must not be empty");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    /// v1's `detectPlaylistType`, which decides which of the two very different
    /// extraction paths runs. Pinned here as well as in the crate because the
    /// *command* is what a mis-detection reaches the user through: an
    /// unrecognised URL is a `playlist.unsupported_url` toast, and a YouTube URL
    /// mistaken for Spotify would scrape an embed page that does not exist.
    #[test]
    fn the_provider_split_matches_v1s_detection() {
        for url in [
            "https://www.youtube.com/playlist?list=PL1",
            "https://youtu.be/abc",
            "https://music.youtube.com/playlist?list=PL1",
        ] {
            assert_eq!(detect_provider(url), PlaylistProvider::YouTube, "{url}");
        }

        assert_eq!(
            detect_provider("https://open.spotify.com/playlist/37i9dQ"),
            PlaylistProvider::Spotify
        );

        for url in [
            // Spotify, but not a playlist — v1 returned `unknown` for these.
            "https://open.spotify.com/album/1",
            "https://open.spotify.com/track/1",
            "https://example.com/playlist",
            "not a url",
            "",
        ] {
            assert_eq!(detect_provider(url), PlaylistProvider::Unknown, "{url}");
        }
    }

    #[test]
    fn a_spotify_playlist_id_survives_query_parameters() {
        assert_eq!(
            spotify_playlist_id("https://open.spotify.com/playlist/37i9dQZF1DX?si=abc"),
            Some("37i9dQZF1DX".to_owned())
        );
        assert_eq!(
            spotify_playlist_id("https://open.spotify.com/album/1"),
            None
        );
    }

    /// The result shape the renderer builds its import from. `title` is
    /// nullable because a single-video URL surfaces no playlist name, and the
    /// renderer offers to recreate a real playlist only when it has one.
    #[test]
    fn the_result_keeps_v1s_shape_including_yt_dlps_snake_case() {
        let result = PlaylistExtractResult {
            title: Some("lofi".to_owned()),
            tracks: vec![SearchResult {
                id: "abc".to_owned(),
                title: "Drop".to_owned(),
                uploader: "Cornelius".to_owned(),
                duration: 245.0,
                thumbnail: "https://i.ytimg.com/abc.jpg".to_owned(),
                url: "https://youtu.be/abc".to_owned(),
                webpage_url: "https://www.youtube.com/watch?v=abc".to_owned(),
                view_count: Some(1_000),
                match_confidence: Some(0.912),
                match_flag: Some(MatchFlag::Ok),
            }],
        };

        let json = serde_json::to_value(&result).expect("serialize");

        assert_eq!(json["title"], "lofi");
        assert_eq!(
            json["tracks"][0]["webpage_url"], "https://www.youtube.com/watch?v=abc",
            "yt-dlp's snake_case survives, because the renderer reads it"
        );
        assert_eq!(json["tracks"][0]["view_count"], 1_000);
        assert_eq!(json["tracks"][0]["matchConfidence"], 0.912);
        assert_eq!(json["tracks"][0]["matchFlag"], "ok");
    }

    // ── over the mocked spawn seam ───────────────────────────────────────────

    /// A YouTube extraction is one spawn, and the arguments are the contract.
    ///
    /// `--flat-playlist` is what keeps yt-dlp from resolving every entry (a
    /// hundred-track playlist would otherwise be a hundred metadata fetches),
    /// and `--dump-json` is what the line parser reads. The title comes off the
    /// first entry's `playlist_title`, which is how v1 recreated a real
    /// playlist under the source's name.
    #[tokio::test]
    async fn a_youtube_extraction_spawns_once_and_carries_the_source_title() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::answering(concat!(
            r#"{"id":"a","title":"One","uploader":"U","duration":10,"url":"https://youtu.be/a","playlist_title":"lofi beats"}"#,
            "\n",
            r#"{"id":"b","title":"Two","uploader":"U","duration":20,"url":"https://youtu.be/b","playlist_title":"lofi beats"}"#,
            "\n",
        )));
        let services = services_over(Arc::clone(&runner), dir.path());
        let progress = RecordingExtractProgress::default();

        let result = services
            .extractor()
            .extract(
                "https://www.youtube.com/playlist?list=PL1",
                &progress,
                &CancellationToken::new(),
            )
            .await
            .expect("the scripted yt-dlp answers");

        assert_eq!(runner.calls().len(), 1, "one spawn, not one per track");
        let args = runner.args(0);
        assert!(args.iter().any(|arg| arg == "--flat-playlist"), "{args:?}");
        assert!(args.iter().any(|arg| arg == "--dump-json"), "{args:?}");
        assert!(args.iter().any(|arg| arg == "--"), "{args:?}");

        assert_eq!(result.title.as_deref(), Some("lofi beats"));
        assert_eq!(result.tracks.len(), 2);
        assert_eq!(result.tracks[0].id, "a");
        assert_eq!(result.tracks[1].id, "b");
    }

    /// The asymmetry the module docs describe, asserted rather than stated: a
    /// renderer listening on `playlist:extract-progress` sees **nothing** for a
    /// YouTube URL, because there is no per-track work to report.
    #[tokio::test]
    async fn a_youtube_extraction_emits_no_progress_at_all() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::answering(
            "{\"id\":\"a\",\"title\":\"One\",\"uploader\":\"U\",\"duration\":10,\"url\":\"https://youtu.be/a\"}\n",
        ));
        let services = services_over(runner, dir.path());
        let progress = RecordingExtractProgress::default();

        services
            .extractor()
            .extract(
                "https://www.youtube.com/playlist?list=PL1",
                &progress,
                &CancellationToken::new(),
            )
            .await
            .expect("the scripted yt-dlp answers");

        assert!(progress.ticks().is_empty());
    }

    /// An unrecognised URL is refused before anything is spawned, under v1's
    /// `playlist.unsupported_url`. Spawning first would mean a pasted address
    /// bar cost a process launch.
    #[tokio::test]
    async fn an_unsupported_url_is_refused_without_spawning_anything() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::default());
        let services = services_over(Arc::clone(&runner), dir.path());

        let error = services
            .extractor()
            .extract(
                "https://example.com/playlist",
                &NoProgress,
                &CancellationToken::new(),
            )
            .await
            .expect_err("an unsupported URL is refused");

        assert_eq!(
            shiranami_core::error::ErrorPayload::of(&error).code,
            codes::playlist::UNSUPPORTED_URL
        );
        assert!(runner.calls().is_empty(), "nothing was spawned");
    }

    /// A no-op progress sink, for the tests that assert on refusal rather than
    /// on ticks.
    pub(super) struct NoProgress;

    impl shiranami_downloader::extract::ExtractProgressSink for NoProgress {
        fn progress(&self, _current: usize, _total: usize, _track_name: &str) {}
    }

    /// A playlist with no name answers `null` rather than omitting the key, so
    /// the renderer's `result.title ?? fallback` sees an absence it can handle.
    #[test]
    fn a_titleless_playlist_answers_null() {
        let result = PlaylistExtractResult {
            title: None,
            tracks: Vec::new(),
        };

        assert_eq!(
            serde_json::to_value(&result).expect("serialize"),
            serde_json::json!({ "title": null, "tracks": [] })
        );
    }
}
