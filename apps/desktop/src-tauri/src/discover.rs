//! The discover shelf's refresh, driven around the connection rather than
//! through it.
//!
//! `shiranami_recommendation::service` supplies the three phases — plan, fetch,
//! commit — and deliberately does not join them, because joining them means
//! holding a database connection across three yt-dlp processes. This module is
//! where they meet, which is §2.3's rule applied literally: the crate owns the
//! decisions, the composition root owns the connection and the clock.
//!
//! # The latch is here because v1's was a module-level variable
//!
//! v1 coalesced concurrent refreshes onto one in-flight promise so that the
//! 30-second timer and a user pressing *Refresh* could not spawn six yt-dlp
//! processes between them. That latch was a global; §2.3 forbids one, so it is
//! a field here and is reached through [`crate::state::AppState`] like every
//! other piece of cross-call state — the same move
//! [`crate::downloads::DownloaderServices`] made with the extraction token.
//!
//! Where v1's promise **shared** its result, this serialises: a second caller
//! waits and then fetches again rather than receiving the first's shelf. The
//! property that mattered is the one kept — never two fan-outs at once — and
//! the difference is only visible to a user who pressed Refresh during the
//! background run, who asked for a fresh shelf and gets one. The background
//! path does not wait at all: it skips, because a refresh already running is
//! the thing it exists to cause.

use shiranami_recommendation::service::{self, DiscoverFetcher};
use tokio_util::sync::CancellationToken;

use crate::state::AppState;

/// The discover fetch and the latch that keeps two of them apart.
pub struct DiscoverRefresh {
    fetcher: DiscoverFetcher,
    /// Held for the whole of one refresh. `tokio::sync::Mutex` rather than
    /// `std::sync::Mutex` because it is held across awaits by construction —
    /// which is the one case the workspace's `await_holding_lock` lint reserves
    /// it for.
    in_flight: tokio::sync::Mutex<()>,
}

impl DiscoverRefresh {
    /// A refresh over `fetcher`.
    pub fn new(fetcher: DiscoverFetcher) -> Self {
        Self {
            fetcher,
            in_flight: tokio::sync::Mutex::new(()),
        }
    }

    /// Rebuild the discover shelf, waiting for any fan-out already running.
    ///
    /// The channel's path: the user asked for a newer shelf, so staleness is
    /// not consulted — v1's `refreshRecommendations` rebuilt discovery on every
    /// call too.
    pub async fn run(&self, state: &AppState, now_ms: i64) {
        let _guard = self.in_flight.lock().await;

        self.drive(state, now_ms, false).await;
    }

    /// Rebuild the shelf only if it has aged out, and only if nothing else is
    /// running.
    ///
    /// The boot timer's path, and both conditions are v1's. Its timer callback
    /// re-read the cached row **at fire time** and logged
    /// *"discover cache warm; skipping background refresh"* rather than
    /// spawning anything, so a user who opened the overview inside the first
    /// thirty seconds does not pay for a second fan-out. A busy latch is the
    /// same answer for the same reason: v1's timer joined the in-flight promise
    /// and did no additional work of its own.
    pub async fn run_if_stale(&self, state: &AppState, now_ms: i64) {
        let Ok(_guard) = self.in_flight.try_lock() else {
            tracing::debug!("a discover refresh is already running; skipping this one");
            return;
        };

        self.drive(state, now_ms, true).await;
    }

    /// Plan, fetch, commit — with the connection released across the fetch.
    ///
    /// Two short acquisitions rather than one long one. `metadata:write-tags`
    /// records the rule this follows: *"acquired late and released on return,
    /// never held across the write above"* — here the thing not to straddle is
    /// three child processes.
    ///
    /// Every failure is a log line and a return. This runs behind a background
    /// timer and behind a channel that already degrades to the cached shelves,
    /// so there is no caller for an error and an unrefreshed shelf reports its
    /// real age either way.
    async fn drive(&self, state: &AppState, now_ms: i64, only_if_stale: bool) {
        let plan = {
            let Ok(mut conn) = state.conn().await else {
                return;
            };

            match service::discover_plan(&mut conn, now_ms).await {
                Ok(plan) => plan,
                Err(error) => {
                    tracing::warn!(%error, "could not plan the discover refresh");
                    return;
                }
            }
        };

        if only_if_stale && !plan.is_stale() {
            tracing::debug!("the discover cache is warm; skipping the background refresh");
            return;
        }

        let Some(items) = self.fetcher.fetch(&plan, &CancellationToken::new()).await else {
            // Cancelled. Nothing is written, so the cached shelf keeps its own
            // timestamp and goes stale honestly rather than being replaced by a
            // half-fetched one stamped as fresh.
            return;
        };

        let Ok(mut conn) = state.conn().await else {
            return;
        };

        if let Err(error) = service::commit_discover(&mut conn, items, now_ms).await {
            tracing::warn!(%error, "could not cache the discover shelf");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::time::instant;
    use std::sync::Arc;

    /// A refresh whose yt-dlp does not exist, which is the shape every case
    /// below needs: the fan-out is gated on the binary being present, so
    /// nothing here spawns anything and the commit still happens.
    fn refresh_with_no_binary() -> DiscoverRefresh {
        DiscoverRefresh::new(DiscoverFetcher::new(
            Arc::new(shiranami_downloader::spawn::TokioRunner::new()),
            std::path::PathBuf::from("/nowhere/yt-dlp"),
        ))
    }

    fn now_ms() -> i64 {
        instant::parse_iso8601_ms("2026-06-15T12:00:00.000Z").expect("a known instant")
    }

    async fn shelf_timestamp(state: &AppState) -> Option<String> {
        let mut conn = state.conn().await.expect("acquire");

        shiranami_db::repo::recommendations::read_shelf(&mut conn, "discover")
            .await
            .expect("read the shelf")
            .map(|row| row.generated_at)
    }

    /// The background path writes a shelf when there is none, which is the
    /// missing half Phase 16 flagged: the schedule fired and nothing was ever
    /// cached.
    #[tokio::test]
    async fn the_background_refresh_caches_a_shelf_when_none_exists() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        assert_eq!(shelf_timestamp(&state).await, None, "nothing cached yet");

        refresh_with_no_binary()
            .run_if_stale(&state, now_ms())
            .await;

        assert!(
            shelf_timestamp(&state).await.is_some(),
            "an empty shelf is still a shelf — v1 cached the empty result rather \
             than leaving the row absent"
        );
    }

    /// v1's timer re-read the row at fire time and logged *"discover cache warm;
    /// skipping background refresh"*. A user who opened the overview inside the
    /// first thirty seconds must not pay for a second fan-out.
    #[tokio::test]
    async fn a_warm_cache_skips_the_background_refresh() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let refresh = refresh_with_no_binary();

        refresh.run_if_stale(&state, now_ms()).await;
        let first = shelf_timestamp(&state).await.expect("a shelf was written");

        // One minute later, far inside the 24-hour TTL.
        refresh.run_if_stale(&state, now_ms() + 60_000).await;

        assert_eq!(
            shelf_timestamp(&state).await.as_deref(),
            Some(first.as_str()),
            "a warm cache must not be rewritten, or the timestamp the renderer \
             shows would move without the shelf changing"
        );
    }

    /// The channel's path ignores staleness: the user asked for newer, and v1's
    /// `refreshRecommendations` rebuilt discovery on every call.
    #[tokio::test]
    async fn a_user_refresh_rebuilds_a_warm_shelf_anyway() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let refresh = refresh_with_no_binary();

        refresh.run(&state, now_ms()).await;
        let first = shelf_timestamp(&state).await.expect("a shelf was written");

        refresh.run(&state, now_ms() + 60_000).await;

        assert_ne!(
            shelf_timestamp(&state).await.as_deref(),
            Some(first.as_str())
        );
    }

    /// The latch, from the side that must never wait. v1's timer joined the
    /// in-flight promise and did no work of its own; skipping is that, and
    /// blocking here would park a background task behind a user's fan-out.
    #[tokio::test]
    async fn the_background_refresh_skips_while_another_is_in_flight() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let refresh = refresh_with_no_binary();

        let held = refresh.in_flight.lock().await;
        refresh.run_if_stale(&state, now_ms()).await;
        drop(held);

        assert_eq!(
            shelf_timestamp(&state).await,
            None,
            "the run must have returned without touching the database"
        );
    }
}
