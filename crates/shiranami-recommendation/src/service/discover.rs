//! The discover shelf's fetch half: a seed's YouTube RD mix, through yt-dlp.
//!
//! Ported from `computeDiscoverItems` / `fetchRdMix` in
//! `apps/desktop/src/main/services/recommendation-service.ts`. The seed half —
//! which tracks seed the shelf and in what order — is
//! [`super::discover_seed_youtube_ids`] and shipped with Phase 14; this is the
//! part that needed a process.
//!
//! # The seam is `shiranami_downloader`'s `ProcessRunner`, not a new trait
//!
//! §2.1's spine already runs `{ db, downloader } → recommendation`, so the
//! trait is reachable, and the alternative — a second single-method process
//! trait in this crate — would need an adapter in the composition root whose
//! only job is to forward one call to the trait the shell already holds. The
//! shape mirrors [`shiranami_downloader::search::SearchService`] exactly: a
//! runner, and the path of a binary that may not be installed yet.
//!
//! Reusing it also means the argv is the one the downloader crate builds and
//! tests. v1 spelled `['--flat-playlist', '--dump-json', '--no-warnings']`
//! inline in `fetchRdMix` and got `--ignore-config` and the `--` guard from its
//! shared spawner — which is byte-for-byte
//! [`shiranami_downloader::spawn::args::playlist`], because an RD mix *is* a
//! playlist to yt-dlp. The equality is asserted in this module's tests rather
//! than assumed, so neither builder can drift into the other's blind spot.
//!
//! # Every failure here is an empty mix
//!
//! v1's `fetchRdMix` caught everything and returned `[]`: a non-zero exit, an
//! unparseable line, a binary that will not start. The discover shelf is
//! ambient furniture — a user who opened the overview did not ask for it — so
//! one failed mix costs a few rows and never a toast, and the shelf that
//! results is honestly stamped rather than suppressed.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt as _;
use shiranami_core::models::DiscoverRecommendation;
use shiranami_downloader::extract::parse_json_lines;
use shiranami_downloader::spawn::{ProcessRunner, ProcessSpec, args};
use tokio_util::sync::CancellationToken;

/// How many RD mixes are fetched at once. v1's `DISCOVER_CONCURRENCY`.
///
/// Above the three seeds `DISCOVER_SEED_COUNT` selects, so in practice every
/// seed's mix is in flight together — which is v1's arithmetic too, and the
/// reason the constant reads like slack rather than a limit.
const DISCOVER_CONCURRENCY: usize = 4;

/// Cap on the items written to the discover shelf, across every mix. v1's
/// `DISCOVER_MAX_ITEMS`.
const DISCOVER_MAX_ITEMS: usize = 24;

/// Fetches a seed's RD mix.
///
/// Stateless: a runner and a path, both of which the composition root owns. It
/// is built once at boot for the same reason
/// [`crate::service`]'s other collaborators are — the binary directory is a
/// boot value, and §2.3 has one place for those.
pub struct DiscoverFetcher {
    processes: Arc<dyn ProcessRunner>,
    yt_dlp_path: PathBuf,
}

impl DiscoverFetcher {
    /// A fetcher over `yt_dlp_path`, which need not exist yet.
    pub fn new(processes: Arc<dyn ProcessRunner>, yt_dlp_path: PathBuf) -> Self {
        Self {
            processes,
            yt_dlp_path,
        }
    }

    /// Whether the managed yt-dlp is present.
    ///
    /// Existence only, as v1's `isYtDlpInstalled()` checked and as
    /// [`shiranami_downloader::bin::YtDlpManager::is_installed`] checks. A
    /// present-but-broken binary surfaces as a failed mix, which is already an
    /// empty mix.
    pub async fn is_installed(&self) -> bool {
        tokio::fs::try_exists(&self.yt_dlp_path)
            .await
            .unwrap_or(false)
    }

    /// One seed's RD mix, or an empty list if anything at all went wrong.
    ///
    /// `cancelled` is set — never cleared — when the run was stopped by
    /// `cancel`, which is how the caller tells "this mix was empty" from "the
    /// fan-out was abandoned". v1 distinguished the two by re-throwing its
    /// `AbortError` through a function that swallowed everything else.
    async fn fetch_mix(
        &self,
        seed_youtube_id: &str,
        cancel: &CancellationToken,
        cancelled: &AtomicBool,
    ) -> Vec<DiscoverRecommendation> {
        // The watch-URL form, with the mix as `list`. v1's comment is explicit
        // that the bare playlist URL is unviewable, so this is not a stylistic
        // choice between two working URLs.
        let url = rd_mix_url(seed_youtube_id);

        let argv = match args::playlist(&url) {
            Ok(argv) => argv,
            Err(error) => {
                // Unreachable for a URL this module builds itself; kept because
                // the guard is what makes that true rather than incidental.
                tracing::warn!(%error, seed = seed_youtube_id, "refusing an RD mix URL");
                return Vec::new();
            }
        };

        let spec = ProcessSpec::capturing(self.yt_dlp_path.clone(), argv);

        let output = match self.processes.run(spec, None, cancel).await {
            Ok(output) => output,
            Err(error) => {
                if error.is_cancelled() {
                    cancelled.store(true, Ordering::Relaxed);
                } else {
                    tracing::warn!(%error, seed = seed_youtube_id, "an RD mix could not be fetched");
                }
                return Vec::new();
            }
        };

        if output.code != 0 {
            // v1 logged the code and moved on without classifying stderr — the
            // shelf has nothing to tell the user, so the classification would
            // have no consumer.
            tracing::warn!(
                seed = seed_youtube_id,
                code = output.code,
                "an RD mix exited non-zero; skipping it"
            );
            return Vec::new();
        }

        parse_json_lines(&output.stdout)
            .into_iter()
            // An id-less entry is dropped, and so is the seed itself: yt-dlp
            // returns the seed video as the mix's first entry, which the real
            // capture in this crate's fixtures shows.
            .filter(|result| !result.id.is_empty() && result.id != seed_youtube_id)
            .map(|result| DiscoverRecommendation {
                youtube_id: result.id,
                title: result.title,
                uploader: result.uploader,
                thumbnail: result.thumbnail,
                // v1's `webpage_url || url` — a **truthiness** fallback, not
                // `??`, so an empty string falls through to `url` where a null
                // would have been kept by the parser's own default.
                url: if result.webpage_url.is_empty() {
                    result.url
                } else {
                    result.webpage_url
                },
            })
            .collect()
    }
}

/// The mix URL for a seed video.
fn rd_mix_url(seed_youtube_id: &str) -> String {
    format!("https://www.youtube.com/watch?v={seed_youtube_id}&list=RD{seed_youtube_id}")
}

/// Everything the fan-out needs from the database, read before it starts.
///
/// # Why the plan is a value and not a connection
///
/// The fetch spawns up to three yt-dlp processes and waits seconds for them.
/// `shiranami_db`'s pool holds exactly **one** connection, so a fetch that held
/// it across that wait would stall every command the user made meanwhile.
/// `shiranami_metadata::enrich::batch` solved the same problem the same way and
/// its signature is the precedent: the rows are read first, the network work
/// takes no connection at all, and the result is written afterwards.
///
/// So the caller reads a plan ([`super::discover_plan`]), fetches with the
/// connection released, and commits ([`super::commit_discover`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoverPlan {
    /// The seed videos, strongest first — the order that decides which mix's
    /// copy of a shared video survives the dedupe.
    pub(super) seeds: Vec<String>,
    /// Every YouTube id the library already owns.
    pub(super) library: std::collections::HashSet<String>,
    /// Whether the cached discover shelf has aged out.
    pub(super) stale: bool,
}

impl DiscoverPlan {
    /// Whether the cached shelf has aged out.
    ///
    /// The background refresh is gated on this — v1's timer re-read the row at
    /// fire time and skipped a warm cache, so a user who opened the overview in
    /// the first thirty seconds does not pay for a second fan-out.
    pub fn is_stale(&self) -> bool {
        self.stale
    }
}

impl DiscoverFetcher {
    /// Every discover item the plan's mixes yield, deduplicated and capped.
    ///
    /// `None` means the fan-out was cancelled and **nothing should be
    /// committed**: v1's abort threw out of `refreshRecommendations` before its
    /// cache write, and a half-fetched shelf stamped as fresh would hide the
    /// seeds that never ran.
    ///
    /// An empty list is a real answer and is meant to be committed — see
    /// [`super::commit_discover`].
    pub async fn fetch(
        &self,
        plan: &DiscoverPlan,
        cancel: &CancellationToken,
    ) -> Option<Vec<DiscoverRecommendation>> {
        if !self.is_installed().await {
            // v1 returned an empty list here and its caller cached it, so a
            // user without yt-dlp gets a freshly-stamped empty shelf rather
            // than an indefinitely stale one. Ported as-is: the renderer
            // already gates the section on the tool being installed.
            tracing::info!("yt-dlp is not installed; the discover shelf stays empty");
            return Some(Vec::new());
        }

        if plan.seeds.is_empty() {
            tracing::info!("no YouTube-mapped seed tracks; the discover shelf stays empty");
            return Some(Vec::new());
        }

        let cancelled = AtomicBool::new(false);

        // Bounded fan-out that keeps **input** order: `buffered` yields the
        // first seed's mix first however the runs finish, and that ordering is
        // the whole point — the strongest seed's copy of a shared video is the
        // one that survives the dedupe below.
        let mixes: Vec<Vec<DiscoverRecommendation>> = futures::stream::iter(plan.seeds.clone())
            .map(|seed| fetch_one(self, seed, cancel, &cancelled))
            .buffered(DISCOVER_CONCURRENCY)
            .collect()
            .await;

        if cancelled.load(Ordering::Relaxed) {
            return None;
        }

        Some(merge(mixes, &plan.seeds, &plan.library))
    }
}

/// One mix, by value, so the fan-out's future stays higher-ranked.
///
/// `shiranami_metadata::enrich::batch` records the same shape and the reason:
/// an `async move` block closing over a borrowed item makes rustc infer the
/// closure at one concrete lifetime, and the resulting future cannot be proven
/// `Send` by a Tauri command — an error reported against the *caller*, naming
/// neither this closure nor this crate.
async fn fetch_one(
    fetcher: &DiscoverFetcher,
    seed: String,
    cancel: &CancellationToken,
    cancelled: &AtomicBool,
) -> Vec<DiscoverRecommendation> {
    if cancel.is_cancelled() {
        cancelled.store(true, Ordering::Relaxed);
        return Vec::new();
    }

    fetcher.fetch_mix(&seed, cancel, cancelled).await
}

/// Merge the mixes in seed order, dropping everything the shelf must not show.
///
/// The four rules are v1's, in v1's order: the cap stops the merge, a video
/// already taken is skipped, a **seed** is never recommended back (any seed,
/// not just the mix's own), and anything the library already has is not new
/// music.
fn merge(
    mixes: Vec<Vec<DiscoverRecommendation>>,
    seeds: &[String],
    library: &std::collections::HashSet<String>,
) -> Vec<DiscoverRecommendation> {
    let seed_set: std::collections::HashSet<&str> = seeds.iter().map(String::as_str).collect();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut merged: Vec<DiscoverRecommendation> = Vec::new();

    'mixes: for mix in mixes {
        for item in mix {
            if merged.len() >= DISCOVER_MAX_ITEMS {
                break 'mixes;
            }
            if seen.contains(&item.youtube_id)
                || seed_set.contains(item.youtube_id.as_str())
                || library.contains(&item.youtube_id)
            {
                continue;
            }

            seen.insert(item.youtube_id.clone());
            merged.push(item);
        }
    }

    merged
}

#[cfg(test)]
#[path = "discover_tests.rs"]
mod tests;
