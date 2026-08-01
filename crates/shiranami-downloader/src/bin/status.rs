//! Both tools together: their status, and installing whichever is missing.
//!
//! # Status is gathered concurrently and degrades field by field
//!
//! A [`ToolStatus`] is four facts drawn from three sources — the filesystem,
//! the binary itself, and a release API — and any of the three can be slow or
//! unavailable. They are gathered concurrently because a settings panel that
//! waits for GitHub and *then* asks yt-dlp its version takes twice as long for
//! no reason, and each failure degrades only its own field: an unreachable
//! GitHub leaves `latest_version` absent beside a perfectly good `version`.
//!
//! `update_available` is `None` — not `Some(false)` — whenever the tool is not
//! installed. v1 made that distinction and the renderer reads it: "not
//! installed" and "installed, up to date" are different rows.

use shiranami_core::models::{
    DependencyCheck, DependencyInstallProgress, InstallDependenciesResult, Tool, ToolInstallResult,
    ToolStatus,
};

use crate::bin::fetch::ProgressSink;
use crate::bin::ffmpeg::FfmpegManager;
use crate::bin::ytdlp::YtDlpManager;
use crate::spawn::has_update;

/// Notified as a combined install run progresses.
pub trait InstallProgressSink: Send + Sync {
    /// One progress event.
    fn progress(&self, event: DependencyInstallProgress);
}

/// Both binary managers, and the operations that need both.
pub struct Tools {
    /// The yt-dlp manager.
    pub ytdlp: YtDlpManager,
    /// The ffmpeg manager.
    pub ffmpeg: FfmpegManager,
}

impl Tools {
    /// Pair two managers.
    pub fn new(ytdlp: YtDlpManager, ffmpeg: FfmpegManager) -> Self {
        Self { ytdlp, ffmpeg }
    }

    /// The cheap presence check, with no version probe and no network call.
    pub async fn check(&self) -> DependencyCheck {
        let (ytdlp_installed, ffmpeg_installed) =
            tokio::join!(self.ytdlp.is_installed(), self.ffmpeg.is_installed());

        DependencyCheck {
            ytdlp_installed,
            ffmpeg_installed,
        }
    }

    /// yt-dlp's full status.
    pub async fn ytdlp_status(&self) -> ToolStatus {
        let installed = self.ytdlp.is_installed().await;

        // The latest version is fetched whether or not the tool is installed:
        // the settings panel shows "install 2024.12.31" for an absent tool.
        let (version, latest_version) = tokio::join!(
            async {
                if installed {
                    self.ytdlp.version().await
                } else {
                    None
                }
            },
            self.ytdlp.latest_version(),
        );

        status(installed, version, latest_version)
    }

    /// ffmpeg's full status.
    pub async fn ffmpeg_status(&self) -> ToolStatus {
        let installed = self.ffmpeg.is_installed().await;

        let (version, latest_version) = tokio::join!(
            async {
                if installed {
                    self.ffmpeg.version().await
                } else {
                    None
                }
            },
            self.ffmpeg.latest_version(),
        );

        status(installed, version, latest_version)
    }

    /// Install whichever tools are missing, in order, reporting one combined
    /// percentage across the run.
    ///
    /// Never fails: a tool that could not be installed contributes a
    /// `success: false` row and the run continues to the next one. v1 did the
    /// same, and it is the right shape — a user missing both tools whose ffmpeg
    /// download fails should still end up with a working yt-dlp.
    pub async fn install_missing(
        &self,
        progress: Option<&dyn InstallProgressSink>,
    ) -> InstallDependenciesResult {
        let check = self.check().await;

        let mut targets = Vec::new();
        if !check.ytdlp_installed {
            targets.push(Tool::Ytdlp);
        }
        if !check.ffmpeg_installed {
            targets.push(Tool::Ffmpeg);
        }

        if targets.is_empty() {
            return InstallDependenciesResult::default();
        }

        #[expect(
            clippy::cast_precision_loss,
            reason = "`targets` holds at most two entries"
        )]
        let step_weight = 100.0 / targets.len() as f64;
        let total = targets.len();
        let mut results = Vec::with_capacity(total);

        for (index, target) in targets.iter().copied().enumerate() {
            #[expect(clippy::cast_precision_loss, reason = "`index` is 0 or 1")]
            let offset = index as f64 * step_weight;
            let label = label_for(target, index, total);

            let stage = InstallStage {
                sink: progress,
                target,
                offset,
                step_weight,
                label,
            };

            let outcome = match target {
                Tool::Ytdlp => self.ytdlp.install(Some(&stage)).await,
                Tool::Ffmpeg => self.ffmpeg.install(Some(&stage)).await,
            };

            results.push(match outcome {
                Ok(()) => ToolInstallResult {
                    tool: target,
                    success: true,
                    error: None,
                },
                Err(error) => {
                    tracing::error!(?target, %error, "could not install a dependency");
                    ToolInstallResult {
                        tool: target,
                        success: false,
                        error: Some(error.to_string()),
                    }
                }
            });
        }

        InstallDependenciesResult { results }
    }
}

/// Assemble one tool's status, with v1's `update_available` rule.
fn status(installed: bool, version: Option<String>, latest_version: Option<String>) -> ToolStatus {
    ToolStatus {
        installed,
        update_available: installed
            .then(|| has_update(version.as_deref(), latest_version.as_deref())),
        version,
        latest_version,
    }
}

/// v1's label, including the `(n/m)` suffix only when there is more than one.
fn label_for(target: Tool, index: usize, total: usize) -> String {
    let name = match target {
        Tool::Ytdlp => "yt-dlp",
        Tool::Ffmpeg => "ffmpeg",
    };

    if total > 1 {
        format!("Installing {name} ({}/{total})", index + 1)
    } else {
        format!("Installing {name}")
    }
}

/// Adapts one tool's 0–100 onto the combined run's percentage.
struct InstallStage<'a> {
    sink: Option<&'a dyn InstallProgressSink>,
    target: Tool,
    offset: f64,
    step_weight: f64,
    label: String,
}

impl ProgressSink for InstallStage<'_> {
    fn percent(&self, percent: u32) {
        let Some(sink) = self.sink else {
            return;
        };

        // v1's `Math.min(100, Math.round(offset + (percent / 100) * stepWeight))`.
        let overall = (self.offset + (f64::from(percent) / 100.0) * self.step_weight).round();
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "clamped to 0..=100 by the `min` below, as v1 did"
        )]
        let overall = overall.clamp(0.0, 100.0) as u32;

        sink.progress(DependencyInstallProgress {
            target: self.target,
            percent,
            overall_percent: overall,
            label: self.label.clone(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_uninstalled_tool_reports_no_update_availability_at_all() {
        let status = status(false, None, Some("2024.12.31".to_owned()));

        assert!(!status.installed);
        assert_eq!(
            status.update_available, None,
            "`undefined` and `false` are different rows in the settings panel: \
             one offers an install, the other says you are up to date"
        );
        assert_eq!(status.latest_version, Some("2024.12.31".to_owned()));
    }

    #[test]
    fn an_installed_tool_behind_the_release_reports_an_update() {
        let status = status(
            true,
            Some("2024.01.01".to_owned()),
            Some("2024.12.31".to_owned()),
        );

        assert_eq!(status.update_available, Some(true));
    }

    #[test]
    fn an_installed_tool_with_an_unreachable_release_api_reports_no_update() {
        let status = status(true, Some("2024.01.01".to_owned()), None);

        assert_eq!(
            status.update_available,
            Some(false),
            "a failed probe must never prompt a reinstall it cannot justify"
        );
    }

    #[test]
    fn the_label_carries_a_counter_only_when_both_tools_are_being_installed() {
        assert_eq!(label_for(Tool::Ytdlp, 0, 1), "Installing yt-dlp");
        assert_eq!(label_for(Tool::Ytdlp, 0, 2), "Installing yt-dlp (1/2)");
        assert_eq!(label_for(Tool::Ffmpeg, 1, 2), "Installing ffmpeg (2/2)");
    }

    #[test]
    fn the_combined_percentage_splits_the_bar_between_two_tools() {
        use std::sync::Mutex;

        #[derive(Default)]
        struct Recorder(Mutex<Vec<u32>>);

        impl InstallProgressSink for Recorder {
            fn progress(&self, event: DependencyInstallProgress) {
                self.0
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .push(event.overall_percent);
            }
        }

        let recorder = Recorder::default();

        let first = InstallStage {
            sink: Some(&recorder),
            target: Tool::Ytdlp,
            offset: 0.0,
            step_weight: 50.0,
            label: "Installing yt-dlp (1/2)".to_owned(),
        };
        first.percent(0);
        first.percent(50);
        first.percent(100);

        let second = InstallStage {
            sink: Some(&recorder),
            target: Tool::Ffmpeg,
            offset: 50.0,
            step_weight: 50.0,
            label: "Installing ffmpeg (2/2)".to_owned(),
        };
        second.percent(50);
        second.percent(100);

        assert_eq!(
            recorder
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone(),
            vec![0, 25, 50, 75, 100]
        );
    }

    #[test]
    fn a_single_tool_run_uses_the_whole_bar() {
        use std::sync::Mutex;

        #[derive(Default)]
        struct Recorder(Mutex<Vec<u32>>);

        impl InstallProgressSink for Recorder {
            fn progress(&self, event: DependencyInstallProgress) {
                self.0
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .push(event.overall_percent);
            }
        }

        let recorder = Recorder::default();
        let only = InstallStage {
            sink: Some(&recorder),
            target: Tool::Ytdlp,
            offset: 0.0,
            step_weight: 100.0,
            label: "Installing yt-dlp".to_owned(),
        };

        only.percent(33);
        only.percent(100);

        assert_eq!(
            recorder
                .0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone(),
            vec![33, 100]
        );
    }
}
