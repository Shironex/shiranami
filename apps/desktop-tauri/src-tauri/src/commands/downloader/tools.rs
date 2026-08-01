//! The nine channels over the two managed binaries.
//!
//! `downloader:check`, `check-dependencies`, `check-ffmpeg`,
//! `get-cached-tool-status`, `refresh-tool-status`, `get-ytdlp-path`,
//! `install-ytdlp`, `install-ffmpeg`, `install-dependencies`.
//!
//! # The status cache lost a layer and kept its contract
//!
//! v1 held the cache twice: a module-level `toolStatusCache` variable *and* the
//! `downloads.toolStatusCache` store key, with `loadCachedToolStatus()`
//! preferring the variable. The variable is a global, which §2.3 forbids, and
//! it bought nothing here — `SettingsStore` is already an in-memory document
//! that writes through, so reading the key is a map lookup, not a file read.
//! The key, its shape and its `null`-when-absent answer are unchanged.
//!
//! # Why installing invalidates rather than refreshes
//!
//! Both single-tool installs and the combined one delete the cache key instead
//! of writing a fresh status into it, exactly as v1 did. Recomputing would mean
//! a version probe and two network calls on the tail of an install the user is
//! watching; deleting means the next `refresh-tool-status` — which the settings
//! panel fires when it re-renders — pays for it instead.
//!
//! # `check-dependencies` is deliberately the cheap one
//!
//! It answers two booleans from the filesystem: no version probe, no network.
//! The download view runs it on mount, so making it as expensive as `check`
//! would put two upstream requests behind opening a tab. `ffmpegInstalled`
//! requires **both** ffmpeg and ffprobe, which is what the download path
//! actually needs.

use shiranami_core::error::codes;
use shiranami_core::models::{
    CachedToolStatus, DependencyCheck, InstallDependenciesResult, ToolStatus,
};
use shiranami_core::store::MainStoreKey;
use shiranami_core::time::now_ms;
use shiranami_downloader::location;
use tauri::{AppHandle, State};

use super::deferred::services;
use crate::downloads::{DependencyInstallEvents, InstallChannel, InstallPercentEvents};
use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// `downloader:check` — yt-dlp's installed state, version and update status.
///
/// A `handleWithFallback` channel in v1 whose fallback is now unreachable: the
/// status probe cannot fail, it reports `latest_version: None` instead. See the
/// namespace docs.
#[tauri::command]
#[specta::specta]
pub async fn downloader_check(state: State<'_, AppState>) -> CommandResult<ToolStatus> {
    Ok(services(&state)?.tools().ytdlp_status().await)
}

/// `downloader:check-ffmpeg` — ffmpeg's installed state, version and update
/// status.
#[tauri::command]
#[specta::specta]
pub async fn downloader_check_ffmpeg(state: State<'_, AppState>) -> CommandResult<ToolStatus> {
    Ok(services(&state)?.tools().ffmpeg_status().await)
}

/// `downloader:check-dependencies` — two booleans, no network.
#[tauri::command]
#[specta::specta]
pub async fn downloader_check_dependencies(
    state: State<'_, AppState>,
) -> CommandResult<DependencyCheck> {
    Ok(services(&state)?.tools().check().await)
}

/// `downloader:get-ytdlp-path` — where the managed yt-dlp lives.
///
/// Answers whether or not it is installed; the settings panel shows the path so
/// a user can see where an install *would* go.
#[tauri::command]
#[specta::specta]
pub async fn downloader_get_ytdlp_path(state: State<'_, AppState>) -> CommandResult<String> {
    Ok(services(&state)?
        .tools()
        .ytdlp
        .path()
        .to_string_lossy()
        .into_owned())
}

/// `downloader:get-cached-tool-status` — the last cached snapshot, or `null`.
///
/// `null` is not an error: a fresh install has never refreshed, and the panel
/// renders a loading state for it.
#[tauri::command]
#[specta::specta]
pub async fn downloader_get_cached_tool_status(
    state: State<'_, AppState>,
) -> CommandResult<Option<CachedToolStatus>> {
    Ok(cached(&state))
}

/// `downloader:refresh-tool-status` — probe both tools and cache the result.
///
/// The one genuine `handleWithFallback` of the four: resolving the download
/// location creates a directory, which can fail on a full or read-only volume,
/// and v1 answered the stale cache rather than rejecting. A settings panel that
/// shows a slightly old version string beats one that shows an error.
#[tauri::command]
#[specta::specta]
pub async fn downloader_refresh_tool_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<CachedToolStatus>> {
    match refresh(&app, &state).await {
        Ok(fresh) => Ok(Some(fresh)),
        Err(error) => {
            // `warn`, and deliberately not reported: v1's fallback path logged
            // and moved on precisely so a degraded upstream did not become a
            // Sentry event on every settings render.
            tracing::warn!(%error.message, "tool status refresh failed; answering the cache");
            Ok(cached(&state))
        }
    }
}

/// `downloader:install-ytdlp` — download the managed yt-dlp.
///
/// Emits `downloader:install-progress`, de-duplicated to whole percentages by
/// the fetcher.
#[tauri::command]
#[specta::specta]
pub async fn downloader_install_ytdlp(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let progress = InstallPercentEvents::new(app, InstallChannel::YtDlp);
    let outcome = services(&state)?
        .tools()
        .ytdlp
        .install(Some(&progress))
        .await;

    finish_install(&state, outcome)
}

/// `downloader:install-ffmpeg` — download the managed ffmpeg and ffprobe.
///
/// Emits `downloader:ffmpeg-install-progress`.
#[tauri::command]
#[specta::specta]
pub async fn downloader_install_ffmpeg(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let progress = InstallPercentEvents::new(app, InstallChannel::Ffmpeg);
    let outcome = services(&state)?
        .tools()
        .ffmpeg
        .install(Some(&progress))
        .await;

    finish_install(&state, outcome)
}

/// `downloader:install-dependencies` — install whichever tools are missing.
///
/// Emits `downloader:dependency-install-progress`, which carries the target,
/// the overall percentage across the run and a label. Answers a per-tool result
/// list rather than rejecting, because a run that installed one of two tools is
/// partial success and the panel says which half worked.
///
/// An empty `results` means nothing was missing — v1's early return, preserved
/// because the renderer reads `results.length === 0` as "already set up".
#[tauri::command]
#[specta::specta]
pub async fn downloader_install_dependencies(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<InstallDependenciesResult> {
    let progress = DependencyInstallEvents::new(app);
    let result = services(&state)?
        .tools()
        .install_missing(Some(&progress))
        .await;

    // v1 invalidated unconditionally, including on the nothing-to-do path.
    invalidate(&state);

    Ok(result)
}

/// Delete the cache and project an install failure onto the wire.
fn finish_install(
    state: &AppState,
    outcome: Result<(), shiranami_downloader::DownloaderError>,
) -> CommandResult<()> {
    // Before the `?`: v1 invalidated inside the `try`, so a *successful*
    // install cleared the cache and a failed one did not. Reproduced by
    // invalidating only on success.
    outcome.wire()?;
    invalidate(state);
    Ok(())
}

/// The cached snapshot, or `None` when absent or unreadable.
///
/// A cache entry that will not deserialize is treated as absent rather than as
/// an error: the shape can change between releases, and the cost of a miss is
/// one refresh.
fn cached(state: &AppState) -> Option<CachedToolStatus> {
    state
        .settings()
        .get_main(MainStoreKey::DownloadsToolStatusCache)
        .and_then(|value| serde_json::from_value(value).ok())
}

/// Probe both tools, resolve the location, and write the cache.
async fn refresh(app: &AppHandle, state: &AppState) -> CommandResult<CachedToolStatus> {
    let services = services(state)?;
    let tools = services.tools();

    // v1 ran these four concurrently with `Promise.all`. Two are filesystem
    // probes plus an upstream version check each, so the concurrency is worth
    // keeping: serially this is two network round trips instead of one.
    let (ytdlp, ffmpeg) = tokio::join!(tools.ytdlp_status(), tools.ffmpeg_status());

    let music_dir = super::location::music_dir(app)?;
    let configured = state.settings().downloads_location();
    let download_location = location::state(
        &music_dir,
        configured.as_deref().and_then(std::path::Path::to_str),
    )
    .await
    .wire()?;

    let fresh = CachedToolStatus {
        ytdlp,
        ffmpeg,
        ytdlp_path: tools.ytdlp.path().to_string_lossy().into_owned(),
        download_location,
        timestamp: now_ms(),
    };

    let encoded =
        serde_json::to_value(&fresh).map_err(|error| shiranami_core::error::ErrorPayload {
            code: codes::INTERNAL.to_owned(),
            message: format!("could not encode the tool status cache: {error}"),
            details: None,
        })?;
    state
        .settings()
        .set_main(MainStoreKey::DownloadsToolStatusCache, encoded)
        .wire()?;

    Ok(fresh)
}

/// Drop the cache, so the next refresh recomputes.
fn invalidate(state: &AppState) {
    if let Err(error) = state
        .settings()
        .delete_main(MainStoreKey::DownloadsToolStatusCache)
    {
        // Not fatal to the install that just succeeded: a stale cache shows an
        // old version string until the next refresh, which the panel triggers
        // on its own.
        tracing::warn!(%error, "could not invalidate the tool status cache");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::models::{DownloadLocation, Tool};
    use shiranami_core::store::SettingsStore;
    use std::sync::Arc;

    fn settings(dir: &std::path::Path) -> Arc<SettingsStore> {
        let (store, _quarantined) = SettingsStore::load(dir.join("config.json"));
        Arc::new(store)
    }

    fn snapshot() -> CachedToolStatus {
        CachedToolStatus {
            ytdlp: ToolStatus {
                installed: true,
                version: Some("2025.01.01".to_owned()),
                latest_version: Some("2025.02.02".to_owned()),
                update_available: Some(true),
            },
            ffmpeg: ToolStatus::default(),
            ytdlp_path: "/tmp/bin/yt-dlp".to_owned(),
            download_location: DownloadLocation {
                path: "/tmp/Music/Shiranami Downloads".to_owned(),
                default_path: "/tmp/Music/Shiranami Downloads".to_owned(),
                is_default: true,
            },
            timestamp: 1_700_000_000_000,
        }
    }

    /// v1's `getCachedToolStatus` answered `null` on a fresh install, and the
    /// panel renders a loading state for it rather than an error.
    #[test]
    fn an_absent_cache_reads_as_none_rather_than_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let store = settings(dir.path());

        assert!(
            store
                .get_main(MainStoreKey::DownloadsToolStatusCache)
                .is_none()
        );
    }

    /// The cache is a wire type, so it has to survive the round trip through
    /// the settings document with every field intact — including the two
    /// `Option`s that distinguish "not installed" from "no update".
    #[test]
    fn the_cache_round_trips_through_the_settings_document() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let store = settings(dir.path());
        let original = snapshot();

        store
            .set_main(
                MainStoreKey::DownloadsToolStatusCache,
                serde_json::to_value(&original).expect("encode"),
            )
            .expect("write the cache");

        let read: CachedToolStatus = serde_json::from_value(
            store
                .get_main(MainStoreKey::DownloadsToolStatusCache)
                .expect("the cache is present"),
        )
        .expect("decode");

        assert_eq!(read, original);
        assert_eq!(read.ffmpeg.update_available, None, "absent, not false");
    }

    /// A cache written by an older release must not fail the command. The cost
    /// of treating it as absent is one refresh; the cost of erroring is a
    /// settings panel that cannot open until someone clears a file by hand.
    #[test]
    fn a_cache_entry_of_the_wrong_shape_reads_as_absent() {
        let value = serde_json::json!({ "ytdlp": "not a status object" });

        let decoded: Option<CachedToolStatus> = serde_json::from_value(value).ok();

        assert!(decoded.is_none());
    }

    /// The key is main-only. The tool status cache holds no secret, but it is
    /// written on a path the renderer can trigger, and `downloads.*` is
    /// wholesale outside `RendererStoreKey` for that reason.
    #[test]
    fn the_cache_key_is_main_only() {
        assert!(
            serde_json::from_value::<shiranami_core::store::RendererStoreKey>(
                serde_json::Value::String("downloads.toolStatusCache".to_owned())
            )
            .is_err()
        );
    }

    /// `install-dependencies` answers per-tool rather than rejecting, so the
    /// panel can say "yt-dlp installed, ffmpeg failed" instead of "failed".
    #[test]
    fn the_install_result_is_per_tool_and_carries_the_failure_message() {
        let result = InstallDependenciesResult {
            results: vec![
                shiranami_core::models::ToolInstallResult {
                    tool: Tool::Ytdlp,
                    success: true,
                    error: None,
                },
                shiranami_core::models::ToolInstallResult {
                    tool: Tool::Ffmpeg,
                    success: false,
                    error: Some("no route to host".to_owned()),
                },
            ],
        };

        let json = serde_json::to_value(&result).expect("serialize");

        assert_eq!(json["results"][0]["tool"], "ytdlp");
        assert_eq!(json["results"][1]["tool"], "ffmpeg");
        assert_eq!(json["results"][1]["success"], false);
        assert_eq!(json["results"][1]["error"], "no route to host");
    }

    /// v1's early return: nothing missing means an empty list, which the
    /// renderer reads as "already set up" rather than as a failed run.
    #[test]
    fn nothing_missing_answers_an_empty_result_list() {
        let empty = InstallDependenciesResult::default();

        assert!(empty.results.is_empty());
        assert_eq!(
            serde_json::to_value(&empty).expect("serialize"),
            serde_json::json!({ "results": [] })
        );
    }
}
