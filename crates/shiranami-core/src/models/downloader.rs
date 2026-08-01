//! Downloader status payloads, ported from
//! `packages/contracts/src/ipc/preload-api.ts`.
//!
//! These five shapes never lived in `packages/contracts/src/domain`, so Phase 2
//! did not port them — the same gap the history types had, resolved the same
//! way (Phase 7 amendment). They belong here rather than in
//! `shiranami-downloader` because [`crate::bindings`] is the single registry
//! the renderer's types are generated from, and a wire type declared outside it
//! is a type the renderer cannot see.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Installed state of one external tool.
///
/// Three of the four fields are absent rather than false when unknown, and that
/// is load-bearing: `updateAvailable` is `undefined` for a tool that is not
/// installed, which the settings panel renders differently from "no update".
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    /// Whether the tool is present on disk.
    pub installed: bool,
    /// The installed version, when it could be read.
    #[specta(optional)]
    pub version: Option<String>,
    /// The newest published version, when the upstream could be reached.
    #[specta(optional)]
    pub latest_version: Option<String>,
    /// Whether an update is available. Absent when the tool is not installed.
    #[specta(optional)]
    pub update_available: Option<bool>,
}

/// Where finished downloads land, plus whether that is still the default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLocation {
    /// The directory downloads are written to.
    pub path: String,
    /// The directory they would go to with no configuration.
    pub default_path: String,
    /// Whether `path` and `default_path` name the same directory.
    pub is_default: bool,
}

/// Cached snapshot of both tools' status, reused across renderer reloads.
///
/// Persisted under the `downloads.toolStatusCache` settings key so a reload
/// renders the settings panel immediately instead of waiting on two network
/// round trips.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CachedToolStatus {
    /// yt-dlp's status.
    pub ytdlp: ToolStatus,
    /// ffmpeg's status.
    pub ffmpeg: ToolStatus,
    /// Absolute path to the managed yt-dlp, shown in the settings panel.
    pub ytdlp_path: String,
    /// The active download location.
    pub download_location: DownloadLocation,
    /// When this snapshot was taken, epoch milliseconds.
    #[specta(type = Number)]
    pub timestamp: i64,
}

/// Whether each external tool is present.
///
/// Deliberately not [`ToolStatus`]: this is the cheap check the download view
/// runs on mount, and it performs no version probe and no network call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DependencyCheck {
    /// Whether yt-dlp is installed.
    pub ytdlp_installed: bool,
    /// Whether both ffmpeg and ffprobe are installed.
    pub ffmpeg_installed: bool,
}

/// Progress event for the legacy single-URL download path.
///
/// Superseded by the queue for everything the UI drives, but still emitted by
/// the `downloader:download` channel the renderer keeps for one-off downloads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    /// The URL being downloaded.
    pub url: String,
    /// Percentage, 0–100.
    #[specta(type = Number)]
    pub progress: f64,
    /// Which phase the download is in.
    pub status: DownloadProgressStatus,
    /// Failure reason when the status is [`DownloadProgressStatus::Error`].
    #[specta(optional)]
    pub error: Option<String>,
}

/// The phase a single-URL download is in.
///
/// A narrower vocabulary than [`crate::models::DownloadQueueStatus`]: a
/// progress event never describes a queued or cancelled download, because
/// neither produces one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DownloadProgressStatus {
    /// Transferring.
    Downloading,
    /// yt-dlp post-processing.
    Converting,
    /// Written to disk.
    Done,
    /// Failed.
    Error,
}

/// Progress event for a combined yt-dlp + ffmpeg install run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DependencyInstallProgress {
    /// Which tool is being installed right now.
    pub target: crate::models::Tool,
    /// That tool's own progress, 0–100.
    pub percent: u32,
    /// Progress across the whole run, 0–100.
    pub overall_percent: u32,
    /// Human-readable label, e.g. `"Installing ffmpeg (2/2)"`.
    pub label: String,
}
