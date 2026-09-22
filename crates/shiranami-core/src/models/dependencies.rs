//! External-tool installation results, ported from
//! `packages/contracts/src/domain/dependencies.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// An external binary the downloader depends on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    /// yt-dlp, the extractor.
    Ytdlp,
    /// ffmpeg, the muxer and transcoder.
    Ffmpeg,
}

/// Result of installing one external tool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ToolInstallResult {
    /// Which tool this entry is about.
    pub tool: Tool,
    /// Whether the install completed.
    pub success: bool,
    /// Failure reason when `success` is false.
    #[specta(optional)]
    pub error: Option<String>,
}

/// Aggregate result of an install-dependencies run: one entry per tool.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InstallDependenciesResult {
    /// One [`ToolInstallResult`] per tool the run touched.
    pub results: Vec<ToolInstallResult>,
}
