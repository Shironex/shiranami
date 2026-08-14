//! §2.8 step 6: the work that runs **off** the setup hook.
//!
//! > Off the setup hook via `spawn_boot_reconcile`: download-queue
//! > hydrate/resume, album-art orphan prune, background recommendation refresh
//! > (30 s delay, coalesced), scrobbler start, updater first check (5 s). None
//! > has a first-paint dependency.
//!
//! That last sentence is the whole criterion. Everything here would work
//! identically if it ran inside `setup()` — it would just delay the window by
//! however long it took, and the art prune walks the entire cover cache.
//!
//! # Every timing constant is v1's
//!
//! | Task                     | When                    | v1 source                     |
//! | ------------------------ | ----------------------- | ----------------------------- |
//! | queue hydrate and resume | immediately             | IPC registration              |
//! | tool status              | immediately             | `fetchAndCacheToolStatus()`   |
//! | art orphan prune         | immediately             | `pruneOrphanedAlbumArt()`     |
//! | background sweep         | immediately             | v2-born; see `sweep_backgrounds` |
//! | updater first check      | 5 s, then hourly        | `app/updater.ts`              |
//! | recommendation refresh   | 30 s, stale-gated       | `REFRESH_STARTUP_DELAY_MS`    |
//! | scrobbler flush          | every 60 s              | `FLUSH_INTERVAL_MS`           |
//! | Discord pump             | driven by its own delay | the crate returns the delay   |

use std::sync::Arc;
use std::time::Duration;

use shiranami_metadata::{art, background};
use tauri::{AppHandle, Manager as _};

use crate::boot::services::{DiscordService, Handles};
use crate::state::AppState;

/// The recommendation refresh's startup delay. v1's
/// `REFRESH_STARTUP_DELAY_MS`.
const RECOMMENDATION_DELAY: Duration = Duration::from_secs(30);

/// Start everything §2.8 step 6 lists. Returns immediately.
pub fn spawn(app: &AppHandle, e2e: bool, handles: &Handles) {
    hydrate_download_queue(app);
    warm_tool_status(app);
    prune_album_art(app);
    sweep_backgrounds(app);

    if e2e {
        // v1 gated the scrobbler and the recommendation refresh in the same
        // block as the tray and the updater.
        tracing::info!("E2E run: skipping the scrobbler and the recommendation refresh");
        return;
    }

    start_scrobbler(app);
    if let Some(presence) = handles.discord.clone() {
        start_discord_pump(app, presence);
    }
    schedule_recommendation_refresh(app);
    schedule_update_checks(app);
}

/// v1's `hydrateAndResume`, which reloads the persisted queue and restarts
/// whatever was downloading.
fn hydrate_download_queue(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let Some(queue) = state.deferred().downloads.clone() else {
            return;
        };

        // Never fails: the crate logs a failed read and starts empty, because
        // v1's call sat inside IPC registration where a throw would silently
        // skip every handler registered after it.
        queue.hydrate_and_resume().await;
        tracing::debug!("the download queue is hydrated");
    });
}

/// v1's `fetchAndCacheToolStatus()`, fire-and-forget at IPC registration.
///
/// Two network probes — the yt-dlp and ffmpeg release APIs — so the settings
/// panel has a warm cache before the user opens it. Not E2E-gated, matching v1,
/// which ran it outside the `isE2E` block.
fn warm_tool_status(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };

        if let Err(error) = crate::commands::downloader::tools::refresh(&app, &state).await {
            tracing::warn!(?error, "the background tool-status refresh failed");
        }
    });
}

/// v1's `pruneOrphanedAlbumArt()`.
///
/// # The reference set is resolved first, and that is the safety property
///
/// `art::prune_orphans` is synchronous and takes an `ArtReferences` whose two
/// methods are synchronous too, while the rows they describe come from SQLite.
/// The same inversion `crate::folders` has, and here it is simpler: the answer
/// is two `Vec<String>`s that are read once, so they are resolved **before**
/// the blocking half starts rather than being answered on demand.
///
/// The crate's own doc is emphatic about what must not happen: *"v1 caught a
/// failed database query and returned a zero report rather than pruning against
/// an empty reference set, because 'the database is unavailable' and 'nothing is
/// referenced' look identical from here and one of them means deleting the
/// user's entire cover cache."* So a failed read skips the prune entirely.
fn prune_album_art(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let Ok(data_dir) = app.path().app_data_dir() else {
            return;
        };

        let references = match resolve_art_references(&state).await {
            Some(references) => references,
            None => {
                // Skipping is the fail-safe. Pruning against an empty set would
                // delete every cover the user has.
                tracing::warn!("skipping the album-art prune: references unavailable");
                return;
            }
        };

        let report = crate::wire::off_thread("prune orphaned album art", move || {
            Ok(art::prune_orphans(&data_dir, &references))
        })
        .await;

        match report {
            Ok(report) => tracing::info!(
                scanned = report.scanned,
                deleted = report.deleted,
                referenced = report.referenced,
                "album-art prune complete"
            ),
            Err(error) => tracing::warn!(?error, "the album-art prune did not complete"),
        }
    });
}

/// Collect background files the current record does not name.
///
/// The same shape as [`prune_album_art`] and for the same reason, but with a far
/// smaller reference set: one settings entry rather than two table scans. What
/// carries over exactly is the fail-safe — the sweep is handed a
/// [`BackgroundReference`], which has no variant a failed read can be squeezed
/// into, so "the record did not parse" cannot arrive at the deletion site
/// wearing the face of "nothing is referenced".
///
/// What this collects: the predecessor of every replacement, and any file
/// orphaned by a crash between the copy and the record that names it.
fn sweep_backgrounds(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let Ok(data_dir) = app.path().app_data_dir() else {
            return;
        };

        // Read inside the closure, not before it: `off_thread` schedules, so a
        // reference resolved out here would be a snapshot taken before the scan
        // it guards. An import completing in that window would look like an
        // orphan and be deleted out from under the record naming it.
        let settings = std::sync::Arc::clone(state.settings());
        let report = crate::wire::off_thread("sweep orphaned backgrounds", move || {
            let reference = crate::commands::background::read_record(&settings);
            Ok(background::sweep_orphans(&data_dir, &reference))
        })
        .await;

        match report {
            Ok(report) => tracing::info!(
                scanned = report.scanned,
                deleted = report.deleted,
                referenced = report.referenced,
                "background sweep complete"
            ),
            Err(error) => tracing::warn!(?error, "the background sweep did not complete"),
        }
    });
}

/// Both reference lists, or `None` if either read failed.
async fn resolve_art_references(state: &AppState) -> Option<ResolvedReferences> {
    let mut conn = state.conn().await.ok()?;

    let tracks = shiranami_db::repo::tracks::album_art_urls(&mut conn)
        .await
        .ok()?;
    let playlists = shiranami_db::repo::playlists::cover_art_urls(&mut conn)
        .await
        .ok()?;

    Some(ResolvedReferences { tracks, playlists })
}

/// The two lists, already read, satisfying the crate's synchronous trait.
struct ResolvedReferences {
    tracks: Vec<String>,
    playlists: Vec<String>,
}

impl art::ArtReferences for ResolvedReferences {
    fn track_art(&self) -> art::ArtReferencesResult<Vec<String>> {
        Ok(self.tracks.clone())
    }

    fn playlist_art(&self) -> art::ArtReferencesResult<Vec<String>> {
        Ok(self.playlists.clone())
    }
}

/// The scrobbler's 60-second flush. The crate holds no timer of its own —
/// "the composition root drives `Scrobbler::flush` on its own interval, which is
/// what keeps this crate free of a runtime handle".
fn start_scrobbler(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let interval = Duration::from_secs(shiranami_integrations::scrobble::FLUSH_INTERVAL_SECS);

        loop {
            tokio::time::sleep(interval).await;

            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            let Some(scrobbler) = state.deferred().scrobbler.clone() else {
                return;
            };

            if let Err(error) = scrobbler.flush(&state.pool()).await {
                tracing::warn!(%error, "a scrobble flush failed");
            }
        }
    });
}

/// The Discord pump, driven at the delay the state machine asks for.
///
/// v1 used two `setTimeout`s; the crate collapses them into one `pump` that
/// returns how long to wait. Taking the delay from the return value rather than
/// from a constant is what preserves v1's first-reconnect-in-five-seconds
/// behaviour, which reads like a bug and is not.
///
/// # The pump does not go through the seam
///
/// `crate::seam::Presence` has exactly the four operations v1's four channels
/// name, and `pump` is not one of them — it advances a clock, which is the
/// composition root's business and not a command's. So boot keeps the concrete
/// service (`crate::boot::services::Handles`) alongside the seam it also
/// installs, rather than widening the trait for one caller.
fn start_discord_pump(app: &AppHandle, presence: Arc<DiscordService>) {
    let _ = app;
    tauri::async_runtime::spawn(async move {
        loop {
            let waited = match presence.pump(shiranami_core::time::now_ms()).await {
                shiranami_integrations::discord::Pump::Idle => Duration::from_secs(15),
                shiranami_integrations::discord::Pump::Again { retry_in } => retry_in,
            };
            tokio::time::sleep(waited).await;
        }
    });
}

/// v1's 30-second, stale-gated, coalesced background refresh.
///
/// Both shelves, in v1's order: the library shelf is a bounded SQL recompute
/// and runs unconditionally, then the discover shelf's yt-dlp fan-out runs only
/// if its cache has aged out. The staleness check happens **at fire time**, not
/// at schedule time — a user who opened the recommendations tab in the first
/// thirty seconds has already warmed the cache, and refreshing again would
/// spawn yt-dlp for nothing. [`crate::discover`] owns that gate and the latch
/// that keeps this run and a user's Refresh from fanning out together.
fn schedule_recommendation_refresh(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(RECOMMENDATION_DELAY).await;

        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let now = shiranami_core::time::now_ms();

        {
            // Scoped so the connection is released before the fan-out below,
            // which spawns yt-dlp and waits seconds for it. The pool holds one
            // connection; holding it across that would stall every command the
            // user made meanwhile.
            let Ok(mut conn) = state.conn().await else {
                return;
            };

            match shiranami_recommendation::service::refresh(&mut conn, now).await {
                Ok(_) => tracing::debug!("the background library refresh completed"),
                Err(error) => tracing::warn!(%error, "the background library refresh failed"),
            }
        }

        // Absent under the E2E harness, which is also why the whole function is
        // unreachable there.
        if let Some(discover) = state.deferred().discover.clone() {
            discover.run_if_stale(&state, now).await;
        }
    });
}

/// v1's five-second first check and hourly tick.
///
/// Both survive an absent updater — `Deferred.updater` is `None` in dev, on
/// macOS and under the harness — because the loop re-reads the state each time
/// and returns when there is nothing behind it.
fn schedule_update_checks(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(crate::updater::FIRST_CHECK_DELAY_SECS)).await;

        loop {
            // The `State<'_, _>` guard is confined to this block so it does not
            // straddle the awaits below: it borrows the app, and holding it
            // across a sleep would pin that borrow for an hour.
            let updater = {
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                match state.deferred().updater.clone() {
                    Some(updater) => updater,
                    // Nothing to check, and nothing will appear later.
                    None => return,
                }
            };

            updater.check().await;
            tokio::time::sleep(Duration::from_secs(crate::updater::CHECK_INTERVAL_SECS)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The delays are v1's, and they are the kind of constant that drifts
    /// silently: nothing fails if the updater checks every ten minutes instead
    /// of every hour, it just costs every user's bandwidth.
    #[test]
    fn every_delay_matches_v1() {
        assert_eq!(RECOMMENDATION_DELAY, Duration::from_secs(30));
        assert_eq!(crate::updater::FIRST_CHECK_DELAY_SECS, 5);
        assert_eq!(crate::updater::CHECK_INTERVAL_SECS, 3_600);
        assert_eq!(shiranami_integrations::scrobble::FLUSH_INTERVAL_SECS, 60);
    }

    /// The reference resolver satisfies the crate's synchronous trait from
    /// already-read rows — the inversion the module docs describe.
    #[test]
    fn the_resolved_references_answer_from_what_was_read() {
        use shiranami_metadata::art::ArtReferences as _;

        let resolved = ResolvedReferences {
            tracks: vec!["a.jpg".to_owned()],
            playlists: vec!["b.jpg".to_owned()],
        };

        assert_eq!(resolved.track_art().expect("tracks"), vec!["a.jpg"]);
        assert_eq!(resolved.playlist_art().expect("playlists"), vec!["b.jpg"]);
    }
}
