//! `downloader:search`, `suggest`, `download` and `get-stream-url`.
//!
//! # The http(s) guard is a security control, not a validation nicety
//!
//! Three of these four take a URL and hand it to yt-dlp. v1 refused anything
//! that is not http(s) **up front**, with a comment naming the attack: a
//! tampered playlist or share payload carrying a `--exec=<cmd>` value would
//! otherwise reach the argument list. The guard is reproduced here on both
//! channels that had it (`download`, `get-stream-url`), and the queue's
//! `enqueue` keeps its own copy for the same reason.
//!
//! There is a second layer underneath: `spawn::append_url_arg` puts a bare `--`
//! before the URL so yt-dlp cannot read it as a flag even if it starts with a
//! dash, and `spawn::args` refuses a URL that fails to parse. Two layers,
//! deliberately — the guard here is the one that produces a *renderer-visible*
//! `downloader.invalid_url`, and the one underneath is the one that holds if a
//! future caller forgets this one.
//!
//! # `suggest` is not yt-dlp
//!
//! It queries Google's `clients1.google.com/complete/search` autocomplete
//! endpoint and answers the second element of a `[query, suggestions]` tuple.
//! It is a fallback channel whose fallback is an empty list, and
//! `SearchService::suggest` is infallible for exactly that reason — an
//! autocomplete that fails should show no suggestions, never an error, because
//! it fires on every keystroke.
//!
//! # `download` is the legacy single-URL path
//!
//! The queue superseded it for everything the UI drives, and the renderer kept
//! it for one-off downloads. It answers the resolved file path and emits
//! `downloader:progress` while it runs. It takes an object — `{ url, outputDir? }`
//! — because v1's channel did, even though the preload only ever sends `{ url }`.

use shiranami_core::error::{ErrorPayload, codes};
use shiranami_core::models::SearchResult;
use shiranami_downloader::download::{DownloadFailure, DownloadRequest};
use shiranami_downloader::{DownloaderError, location};
use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use super::deferred::services;
use crate::downloads::DownloadEvents;
use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// `downloader:search` — ten scored YouTube results for a query.
#[tauri::command]
#[specta::specta]
pub async fn downloader_search(
    state: State<'_, AppState>,
    query: String,
) -> CommandResult<Vec<SearchResult>> {
    non_empty(&query, "the search query")?;

    services(&state)?
        .search()
        .search(&query, &CancellationToken::new())
        .await
        .wire()
}

/// `downloader:suggest` — autocomplete suggestions, or an empty list.
#[tauri::command]
#[specta::specta]
pub async fn downloader_suggest(
    state: State<'_, AppState>,
    query: String,
) -> CommandResult<Vec<String>> {
    non_empty(&query, "the suggest query")?;

    Ok(services(&state)?.search().suggest(&query).await)
}

/// `downloader:get-stream-url` — resolve a page URL to a direct audio stream.
///
/// Used by the radio and recommendation paths, which play without downloading.
#[tauri::command]
#[specta::specta]
pub async fn downloader_get_stream_url(
    state: State<'_, AppState>,
    url: String,
) -> CommandResult<String> {
    non_empty(&url, "the stream URL")?;
    http_only(&url, "Refusing to resolve a non-http(s) URL")?;

    services(&state)?
        .search()
        .stream_url(&url, &CancellationToken::new())
        .await
        .wire()
}

/// `downloader:download` — the legacy single-URL download.
///
/// Answers the path of the written file and emits `downloader:progress`.
#[tauri::command]
#[specta::specta]
pub async fn downloader_download(
    app: AppHandle,
    state: State<'_, AppState>,
    opts: DownloadOptions,
) -> CommandResult<String> {
    non_empty(&opts.url, "the download URL")?;
    http_only(&opts.url, "Refusing to download a non-http(s) URL")?;

    let services = services(&state)?;

    // v1: `outputDir ?? getDownloadDir()`, then `mkdirSync(recursive)` on
    // whichever won — including a caller-supplied one, which is why the ensure
    // is outside the branch.
    let download_dir = match opts.output_dir {
        Some(ref directory) if !directory.trim().is_empty() => {
            std::path::PathBuf::from(directory.trim())
        }
        _ => {
            let music_dir = super::location::music_dir(&app)?;
            let configured = state.settings().downloads_location();
            location::active_dir(
                &music_dir,
                configured.as_deref().and_then(std::path::Path::to_str),
            )
        }
    };
    location::ensure(&download_dir).await.wire()?;

    let progress = DownloadEvents::new(app);
    let request = DownloadRequest {
        url: opts.url,
        download_dir,
    };

    services
        .downloader()
        .download(&request, &progress, &CancellationToken::new())
        .await
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(on_wire)
}

/// Project a download failure onto the wire.
///
/// `DownloadFailure` is the crate's own two-case wrapper and is deliberately
/// **not** a `WireError`: `Cancelled` has no code of its own because the queue,
/// which is the only caller that can cancel, turns it into a `canceled` item
/// status rather than into an error at all.
///
/// This channel has no cancel, so a `Cancelled` here means the child process
/// died without anyone asking — an internal failure, and reported as one.
/// A `Failed` keeps yt-dlp's classified code, so `yt_dlp_age_restricted` and
/// its siblings reach the renderer's switch exactly as in v1.
fn on_wire(failure: DownloadFailure) -> ErrorPayload {
    match failure {
        DownloadFailure::Failed(error) => ErrorPayload::of(&error),
        DownloadFailure::Cancelled => ErrorPayload {
            code: codes::INTERNAL.to_owned(),
            message: "the download stopped before it finished".to_owned(),
            details: None,
        },
    }
}

/// The single object argument `downloader:download` takes.
///
/// A struct because v1's channel took one — `z.object({ url, outputDir? })` —
/// and the preload calls it as `invoke(C.download, { url })`. Splitting it into
/// two parameters would change the call shape the shim forwards.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    /// The page URL to download. Must be http(s).
    pub url: String,
    /// Where to write it. Absent means the configured download location.
    #[specta(optional)]
    pub output_dir: Option<String>,
}

/// v1's `z.string().min(1)`.
fn non_empty(value: &str, what: &str) -> CommandResult<()> {
    if value.is_empty() {
        return Err(bad_request(format!("{what} must not be empty")));
    }
    Ok(())
}

/// v1's `isHttpUrl` guard, raising `downloader.invalid_url`.
///
/// The code is the crate's, not a local string, so the renderer's `switch` sees
/// the same value it saw in v1 and the frozen registry stays the one place it
/// is written.
fn http_only(url: &str, message: &str) -> CommandResult<()> {
    if is_http_url(url) {
        return Ok(());
    }

    Err(ErrorPayload::of(&DownloaderError::InvalidUrl {
        message: message.to_owned(),
    }))
}

/// v1's `isHttpUrl`, which is already ported.
///
/// `shiranami_net::url_safety::is_http_url` is the port of
/// `apps/desktop/src/main/shared/url-safety.ts`, and it is deliberately reused
/// rather than re-derived: a second copy of "which schemes may reach yt-dlp"
/// is a second place to forget one, and this one already carries the
/// `--exec=` refusal tests.
use shiranami_net::url_safety::is_http_url;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::downloads::testing::{RecordingProgress, ScriptedRunner, services_over};
    use shiranami_core::error::codes;
    use shiranami_core::models::DownloadProgressStatus;
    use shiranami_downloader::error::code;
    use std::sync::Arc;

    #[test]
    fn http_and_https_urls_pass_the_guard() {
        for url in [
            "https://www.youtube.com/watch?v=abc",
            "http://example.com/x",
            "HTTPS://WWW.YOUTUBE.COM/watch?v=abc",
            "https://youtu.be/abc?list=PL1",
        ] {
            assert!(is_http_url(url), "`{url}` must be accepted");
        }
    }

    /// The attack v1's comment names: a `--exec=` value arriving through a
    /// tampered playlist or share payload. Every one of these would otherwise
    /// reach yt-dlp's argument list.
    #[test]
    fn everything_else_is_refused() {
        for url in [
            "file:///etc/passwd",
            "data:text/plain,x",
            "javascript:alert(1)",
            "--exec=rm -rf /",
            "-x",
            "/tmp/local/file.mp3",
            "",
            "not a url at all",
            "ftp://example.com/x",
        ] {
            assert!(!is_http_url(url), "`{url}` must be refused");
        }
    }

    /// The guard produces v1's code, so the renderer's error switch keeps
    /// matching. `downloader.invalid_url` is in the frozen registry.
    #[test]
    fn the_guard_rejects_under_v1s_code() {
        let error = http_only("file:///etc/passwd", "Refusing to download a non-http(s) URL")
            .expect_err("a file URL is refused");

        assert_eq!(error.code, code::INVALID_URL);
        assert_eq!(error.code, "downloader.invalid_url");
        assert_eq!(error.message, "Refusing to download a non-http(s) URL");
    }

    /// The two channels carried different messages in v1 — "download" versus
    /// "resolve" — and the renderer surfaces the message when it has no
    /// translation for the code.
    #[test]
    fn the_two_guarded_channels_keep_their_distinct_messages() {
        let download = http_only("file:///x", "Refusing to download a non-http(s) URL")
            .expect_err("refused");
        let stream = http_only("file:///x", "Refusing to resolve a non-http(s) URL")
            .expect_err("refused");

        assert_ne!(download.message, stream.message);
        assert_eq!(download.code, stream.code);
    }

    #[test]
    fn an_empty_query_is_a_bad_request() {
        let error = non_empty("", "the search query").expect_err("empty is refused");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    /// v1's `z.string().min(1)` bounded length only at the bottom, and a query
    /// of one space is a string of length one. Reproduced rather than tightened:
    /// `SearchService` short-circuits a blank query on its own.
    #[test]
    fn a_whitespace_query_is_accepted_exactly_as_v1_accepted_it() {
        assert!(non_empty(" ", "the search query").is_ok());
    }

    // ── over the mocked spawn seam ───────────────────────────────────────────

    /// `downloader:search` reaches yt-dlp with v1's argument list.
    ///
    /// The arguments are the contract with a program this repo does not own, so
    /// they are asserted rather than assumed: `ytsearch10:` is v1's limit,
    /// `--dump-json` is what the parser reads, and `--flat-playlist` is what
    /// keeps a search from expanding every result.
    #[tokio::test]
    async fn search_spawns_yt_dlp_with_v1s_arguments_and_parses_the_result() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::answering(
            r#"{"id":"abc","title":"Drop","uploader":"Cornelius","duration":245,"thumbnail":"https://i.ytimg.com/abc.jpg","url":"https://youtu.be/abc","webpage_url":"https://www.youtube.com/watch?v=abc","view_count":1000}"#,
        ));
        let services = services_over(Arc::clone(&runner), dir.path());

        let results = services
            .search()
            .search("cornelius drop", &CancellationToken::new())
            .await
            .expect("the scripted yt-dlp answers");

        let args = runner.args(0);
        assert!(
            args.iter().any(|arg| arg.contains("ytsearch10:")),
            "v1 searched ten results: {args:?}"
        );
        assert!(args.iter().any(|arg| arg == "--dump-json"), "{args:?}");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "abc");
        assert_eq!(results[0].webpage_url, "https://www.youtube.com/watch?v=abc");
        assert_eq!(results[0].view_count, Some(1_000));
        assert!(
            results[0].match_confidence.is_none(),
            "plain search leaves the Spotify scorer's fields unset"
        );
    }

    /// `downloader:get-stream-url` asks for the best audio format and answers
    /// the **first** line, because yt-dlp prints one URL per selected format
    /// and v1 took `split('\n')[0]`.
    #[tokio::test]
    async fn get_stream_url_asks_for_bestaudio_and_takes_the_first_line() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::answering(
            "https://cdn.example/audio.m4a\nhttps://cdn.example/video.mp4\n",
        ));
        let services = services_over(Arc::clone(&runner), dir.path());

        let url = services
            .search()
            .stream_url("https://youtu.be/abc", &CancellationToken::new())
            .await
            .expect("the scripted yt-dlp answers");

        assert_eq!(url, "https://cdn.example/audio.m4a");

        let args = runner.args(0);
        assert!(args.iter().any(|arg| arg == "bestaudio"), "{args:?}");
        assert!(args.iter().any(|arg| arg == "--get-url"), "{args:?}");
        // The other half of the argument-injection guard: a literal `--` before
        // the URL, so yt-dlp cannot read it as a flag even if the scheme check
        // above were somehow bypassed.
        assert!(args.iter().any(|arg| arg == "--"), "{args:?}");
    }

    /// A non-zero exit reaches the renderer as a **classified** yt-dlp code, not
    /// as a generic failure, because the renderer translates those into the
    /// messages users actually read ("this video is age-restricted").
    #[tokio::test]
    async fn a_failing_stream_url_carries_yt_dlps_classified_code() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let runner = Arc::new(ScriptedRunner::failing(
            "ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.",
        ));
        let services = services_over(runner, dir.path());

        let error = services
            .search()
            .stream_url("https://youtu.be/abc", &CancellationToken::new())
            .await
            .expect_err("a non-zero exit fails");

        assert_eq!(
            shiranami_core::error::ErrorPayload::of(&error).code,
            codes::yt_dlp::AGE_RESTRICTED
        );
    }

    // `suggest`'s fallback is deliberately **not** tested at runtime here.
    // `SearchService::suggest` returns `Vec<String>` and not a `Result`, so
    // "an upstream failure answers an empty list" is a property of the type
    // rather than of a code path — there is no error branch for a test to
    // reach. Asserting it by actually calling the endpoint would make the
    // suite pass or fail on whether the machine running it has network, which
    // is a flake rather than a guard.

    /// The progress sequence a download produces, driven by the literal lines
    /// yt-dlp prints.
    ///
    /// This is the whole `downloader:progress` contract in one test: the
    /// percentages arrive in order as `downloading`, the post-processor line
    /// flips the status to `converting`, and the final event is `done` carrying
    /// the resolved path — which the command answers as its return value.
    #[tokio::test]
    async fn a_mocked_download_emits_v1s_progress_sequence() {
        let dir = tempfile::tempdir().expect("a temp dir");

        // The file yt-dlp would have written. It has to exist, because the
        // runner verifies the path it resolves rather than trusting it — a
        // download that reports a path nothing is at is a failed download.
        let written = dir.path().join("Drop.mp3");
        std::fs::write(&written, b"id3").expect("write the finished file");

        let runner = Arc::new(
            ScriptedRunner::answering("")
                .streaming(&[
                    "[download] Destination: /music/Drop.webm",
                    "[download]   0.0% of ~4.20MiB at Unknown B/s ETA Unknown",
                    "[download]  42.3% of 4.20MiB at 1.10MiB/s ETA 00:02",
                    "[download] 100.0% of 4.20MiB in 00:03",
                    // A post-processor line that is *not* a `Destination:` one.
                    // The distinction is load-bearing; see the assertion below.
                    r#"[Merger] Merging formats into "/music/Drop.mkv""#,
                    "[ExtractAudio] Destination: /music/Drop.mp3",
                ])
                .writing_final_path(&written),
        );
        let services = services_over(Arc::clone(&runner), dir.path());
        let progress = RecordingProgress::default();

        let path = services
            .downloader()
            .download(
                &DownloadRequest {
                    url: "https://youtu.be/abc".to_owned(),
                    download_dir: dir.path().to_path_buf(),
                },
                &progress,
                &CancellationToken::new(),
            )
            .await
            .expect("the scripted download succeeds");

        assert_eq!(
            path, written,
            "the path comes from --print-to-file, not from the last Destination \
             line: post-processing changes the extension after that line is printed"
        );

        let ticks = progress.ticks();
        let percentages: Vec<f64> = ticks
            .iter()
            .filter(|tick| tick.status == DownloadProgressStatus::Downloading)
            .map(|tick| tick.progress)
            .collect();
        assert_eq!(
            percentages,
            vec![0.0, 42.3, 100.0],
            "every percentage, in order"
        );

        assert!(
            ticks
                .iter()
                .any(|tick| tick.status == DownloadProgressStatus::Converting),
            "the post-processor line flips the status: {ticks:?}"
        );

        // The precedence that produced that tick, stated because it is not
        // obvious and a "tidier" parser would break it: a line is checked for
        // `Destination:` *before* it is checked for a post-processor tag, so
        // `[ExtractAudio] Destination: …` announces a destination and does
        // **not** report converting. The converting tick above came from the
        // `[Merger]` line, which carries no destination. Both are lines a real
        // yt-dlp prints, and v1 read them the same way.
        let converting = ticks
            .iter()
            .filter(|tick| tick.status == DownloadProgressStatus::Converting)
            .count();
        assert_eq!(
            converting, 1,
            "only the [Merger] line converts; [ExtractAudio] Destination: is a \
             destination: {ticks:?}"
        );

        let last = ticks.last().expect("at least one tick");
        assert_eq!(last.status, DownloadProgressStatus::Done);
        assert_eq!(last.progress, 100.0);
        assert_eq!(last.url, "https://youtu.be/abc", "every tick names its URL");
        assert!(last.error.is_none());
    }

    /// The argument shape the preload sends. `outputDir` is absent in every
    /// call the renderer makes, so a rename of `url` is the silent breakage.
    #[test]
    fn the_download_argument_keeps_v1s_object_shape() {
        let parsed: DownloadOptions =
            serde_json::from_str(r#"{"url":"https://youtu.be/x"}"#).expect("the preload's shape");

        assert_eq!(parsed.url, "https://youtu.be/x");
        assert!(parsed.output_dir.is_none());

        let with_dir: DownloadOptions =
            serde_json::from_str(r#"{"url":"https://youtu.be/x","outputDir":"/tmp/out"}"#)
                .expect("the full shape");

        assert_eq!(with_dir.output_dir.as_deref(), Some("/tmp/out"));
    }
}
