//! Turning a playlist URL into a list of downloadable YouTube results.
//!
//! # URL validation, and where the SSRF guard is and is not
//!
//! Every URL reaching this module comes from the renderer, so every one is
//! checked with [`shiranami_net::is_http_url`] before it goes anywhere — that
//! is v1's guard at its `playlist:extract` boundary, and it is the same check
//! [`crate::spawn::append_url_arg`] repeats before the URL becomes argv.
//!
//! The DNS-resolving SSRF guard is deliberately **not** applied, which mirrors
//! v1 exactly: its two guarded call sites were the radio proxy and cover-art
//! download (Phase 3 amendment), and neither is here. The Spotify fetch does
//! not need it either — its URL is built from a validated alphanumeric playlist
//! id against a fixed host, so there is no attacker-chosen destination to
//! guard. Adding a resolution step would refuse a corporate mirror without
//! closing anything.
//!
//! # Spotify matching runs four at a time
//!
//! One YouTube search per track, serially, makes a 50-track playlist take
//! minutes. Four concurrent searches is v1's number, shared with the metadata
//! enrichment pool: enough for a 4–6× speedup, low enough to stay clear of
//! YouTube's search throttling and of running many yt-dlp processes at once.
//!
//! Results are slotted by input index rather than appended, so the returned
//! list preserves playlist order even though the searches finish out of order.

use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use shiranami_core::models::{MatchFlag, PlaylistExtractResult, SearchResult};
use shiranami_net::{HttpClient, RequestOptions};
use tokio_util::sync::CancellationToken;

use crate::error::{DownloaderError, Result};
use crate::extract::detect::{PlaylistProvider, detect_provider, spotify_playlist_id};
use crate::extract::matcher::pick_best_match;
use crate::extract::spotify::{SpotifyTrack, parse_embed_html, parse_playlist_name};
use crate::extract::youtube::{parse_json_lines, playlist_title};
use crate::spawn::{ProcessRunner, ProcessSpec, args};

/// Concurrent YouTube searches during Spotify extraction. v1's value.
pub const MATCH_CONCURRENCY: usize = 4;

/// Candidates fetched per track. More than one is what makes scoring possible.
pub const SEARCH_LIMIT: u32 = 5;

/// The browser User-Agent the Spotify embed page is fetched with.
///
/// The embed is a Next.js page that renders differently — or not at all — for a
/// client it does not recognise as a browser.
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
     AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Notified as a Spotify playlist's tracks are matched.
pub trait ExtractProgressSink: Send + Sync {
    /// How far along the match run is, and which track it is on.
    fn progress(&self, current: usize, total: usize, track_name: &str);
}

/// A sink nobody is listening to.
#[derive(Debug, Default)]
pub struct NoProgress;

impl ExtractProgressSink for NoProgress {
    fn progress(&self, _current: usize, _total: usize, _track_name: &str) {}
}

/// Extracts playlists from YouTube and Spotify.
pub struct PlaylistExtractor {
    processes: std::sync::Arc<dyn ProcessRunner>,
    client: std::sync::Arc<HttpClient>,
    yt_dlp_path: std::path::PathBuf,
}

impl PlaylistExtractor {
    /// An extractor over `yt_dlp_path`.
    pub fn new(
        processes: std::sync::Arc<dyn ProcessRunner>,
        client: std::sync::Arc<HttpClient>,
        yt_dlp_path: std::path::PathBuf,
    ) -> Self {
        Self {
            processes,
            client,
            yt_dlp_path,
        }
    }

    /// Extract whichever provider `url` names.
    ///
    /// # Errors
    ///
    /// [`DownloaderError::UnsupportedUrl`] when the URL names no provider,
    /// [`DownloaderError::NoTracks`] when extraction yields nothing, and
    /// [`DownloaderError::PrivatePlaylist`] when Spotify refuses the page.
    pub async fn extract(
        &self,
        url: &str,
        progress: &dyn ExtractProgressSink,
        cancel: &CancellationToken,
    ) -> Result<PlaylistExtractResult> {
        match detect_provider(url) {
            PlaylistProvider::YouTube => self.extract_youtube(url, cancel).await,
            PlaylistProvider::Spotify => self.extract_spotify(url, progress, cancel).await,
            PlaylistProvider::Unknown => Err(DownloaderError::UnsupportedUrl {
                message: "Unsupported URL. Please provide a YouTube or Spotify playlist URL."
                    .to_owned(),
            }),
        }
    }

    /// One `--flat-playlist --dump-json` run, parsed.
    async fn extract_youtube(
        &self,
        url: &str,
        cancel: &CancellationToken,
    ) -> Result<PlaylistExtractResult> {
        tracing::info!(url, "extracting a YouTube playlist");

        // Refuses a non-http(s) URL before it can become argv.
        let argv = args::playlist(url)?;
        let spec = ProcessSpec::capturing(self.yt_dlp_path.clone(), argv);

        let output = self
            .processes
            .run(spec, None, cancel)
            .await
            .map_err(|source| DownloaderError::Process {
                operation: "extract a YouTube playlist",
                source,
            })?;

        if output.code != 0 {
            return Err(DownloaderError::NoTracks {
                message: "yt-dlp failed to extract playlist".to_owned(),
            });
        }

        let tracks = parse_json_lines(&output.stdout);
        let title = playlist_title(&output.stdout);
        tracing::info!(
            count = tracks.len(),
            title = title.as_deref().unwrap_or_default(),
            "extracted a YouTube playlist"
        );

        Ok(PlaylistExtractResult { title, tracks })
    }

    /// Scrape the embed page, then match every track on YouTube.
    async fn extract_spotify(
        &self,
        url: &str,
        progress: &dyn ExtractProgressSink,
        cancel: &CancellationToken,
    ) -> Result<PlaylistExtractResult> {
        let Some(playlist_id) = spotify_playlist_id(url) else {
            return Err(DownloaderError::UnsupportedUrl {
                message: "Invalid Spotify playlist URL".to_owned(),
            });
        };

        let (name, tracks) = self.fetch_embed(&playlist_id).await?;

        if tracks.is_empty() {
            return Err(DownloaderError::NoTracks {
                message: "Could not extract tracks from Spotify playlist. \
                          The playlist may be private or empty."
                    .to_owned(),
            });
        }

        let matched = self.match_all(&tracks, progress, cancel).await;

        let low = matched
            .iter()
            .filter(|result| result.match_flag == Some(MatchFlag::Low))
            .count();
        tracing::info!(
            resolved = matched.len(),
            total = tracks.len(),
            low_confidence = low,
            cancelled = cancel.is_cancelled(),
            "resolved Spotify tracks on YouTube"
        );

        Ok(PlaylistExtractResult {
            title: name,
            tracks: matched,
        })
    }

    /// Fetch and parse the public embed page.
    async fn fetch_embed(&self, playlist_id: &str) -> Result<(Option<String>, Vec<SpotifyTrack>)> {
        // The id is alphanumeric by construction, so this URL has no
        // attacker-controlled component.
        let embed_url = format!("https://open.spotify.com/embed/playlist/{playlist_id}");
        tracing::info!(playlist_id, "fetching the Spotify embed page");

        let options = RequestOptions::default().with_header(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static(BROWSER_USER_AGENT),
        );

        let html = self
            .client
            .text(&embed_url, options)
            .await
            .map_err(|source| DownloaderError::PrivatePlaylist {
                message: format!("Failed to fetch Spotify embed page: {source}"),
            })?;

        Ok((parse_playlist_name(&html), parse_embed_html(&html)))
    }

    /// Match every track through a bounded concurrent pool.
    async fn match_all(
        &self,
        tracks: &[SpotifyTrack],
        progress: &dyn ExtractProgressSink,
        cancel: &CancellationToken,
    ) -> Vec<SearchResult> {
        let total = tracks.len();
        let slots: Mutex<Vec<Option<SearchResult>>> = Mutex::new(vec![None; total]);
        let cursor = AtomicUsize::new(0);
        let completed = AtomicUsize::new(0);

        let worker = || async {
            loop {
                if cancel.is_cancelled() {
                    return;
                }

                let index = cursor.fetch_add(1, Ordering::SeqCst);
                if index >= total {
                    return;
                }
                let track = &tracks[index];
                let name = format!("{} - {}", track.artist, track.title);

                progress.progress(
                    (completed.load(Ordering::SeqCst) + 1).min(total),
                    total,
                    &name,
                );

                let matched = self.match_one(track, cancel).await;
                if let Ok(mut slots) = slots.lock() {
                    slots[index] = matched;
                }

                let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                progress.progress(done.min(total), total, &name);
            }
        };

        // Four workers regardless of `total`: any beyond the track count find
        // the cursor exhausted and return immediately, which is the same
        // outcome as v1's `min(MATCH_CONCURRENCY, total)` pool size without a
        // dynamic collection of futures.
        tokio::join!(worker(), worker(), worker(), worker());

        slots
            .into_inner()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .into_iter()
            .flatten()
            .collect()
    }

    /// Search YouTube for one track and score the candidates.
    ///
    /// A failed search yields `None` rather than failing the run: one track
    /// that cannot be found must not cost the other forty-nine.
    async fn match_one(
        &self,
        track: &SpotifyTrack,
        cancel: &CancellationToken,
    ) -> Option<SearchResult> {
        let query = format!("{} - {}", track.artist, track.title);
        let spec =
            ProcessSpec::capturing(self.yt_dlp_path.clone(), args::search(&query, SEARCH_LIMIT));

        let output = match self.processes.run(spec, None, cancel).await {
            Ok(output) if output.code == 0 => output,
            Ok(_) | Err(_) if cancel.is_cancelled() => return None,
            Ok(output) => {
                tracing::warn!(query, code = output.code, "the YouTube search failed");
                return None;
            }
            Err(error) => {
                tracing::warn!(query, %error, "could not run the YouTube search");
                return None;
            }
        };

        let candidates = parse_json_lines(&output.stdout);
        let matched = pick_best_match(track, &candidates);
        let mut result = matched.result?;

        // v1 rounded to three decimals before sending, and the renderer renders
        // the number directly.
        result.match_confidence = Some((matched.confidence * 1000.0).round() / 1000.0);
        result.match_flag = Some(matched.flag);
        Some(result)
    }
}
