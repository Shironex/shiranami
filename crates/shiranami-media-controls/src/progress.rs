//! The Windows taskbar progress bar.
//!
//! Ported from the `media:playback-state` handler in
//! `apps/desktop/src/main/ipc/media.ts`, whose entire body was:
//!
//! ```js
//! if (process.platform === 'win32') {
//!   if (state.isPlaying && state.duration > 0) win.setProgressBar(state.currentTime / state.duration);
//!   else if (!state.isPlaying && state.duration > 0) win.setProgressBar(state.currentTime / state.duration, { mode: 'paused' });
//!   else win.setProgressBar(-1);
//! }
//! ```
//!
//! §2.7: *"Windows taskbar progress moves from `win.setProgressBar` to
//! `Window::set_progress_bar`."* That call needs the Tauri window, so it lives
//! behind [`TaskbarProgressBackend`] and Phase 16 supplies it.
//!
//! # Percent, not fraction
//!
//! Electron took a `0.0`–`1.0` double and `-1` as "remove". Tauri's
//! `ProgressBarState` takes a status enum plus an integer percentage, so the
//! mapping rounds — and clamps, which Electron did internally and this does
//! explicitly: `currentTime` briefly exceeds `duration` at the end of a track,
//! and a percentage above 100 is not something the shell should be passing on.
//!
//! # Not ported: the dock, the badge, thumbar buttons
//!
//! v1 had none. A sweep of `apps/desktop/src/main` finds no `setBadgeCount`, no
//! `setThumbarButtons` and no `app.dock.setMenu` — taskbar progress is the whole
//! of v1's taskbar and dock integration, and museeks' migration retro (§4) lists
//! thumbar controls and the dock menu among the things *it* lost, not things we
//! have to keep.

use crate::error::Result;
use crate::state::MediaState;

/// How the taskbar should render the bar.
///
/// Named after Tauri's `ProgressBarStatus`, minus the two variants nothing here
/// produces: `Indeterminate` (the length is always known when a bar is shown)
/// and `Error`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressStatus {
    /// No bar. Electron's `setProgressBar(-1)`.
    None,
    /// A filled bar.
    Normal,
    /// A filled bar in the paused treatment. Electron's `{ mode: 'paused' }`.
    Paused,
}

/// A taskbar progress bar state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskbarProgress {
    /// How to render it.
    pub status: ProgressStatus,
    /// How full, 0–100. `None` when there is no bar.
    pub percent: Option<u64>,
}

impl TaskbarProgress {
    /// No bar.
    pub const CLEARED: Self = Self {
        status: ProgressStatus::None,
        percent: None,
    };

    /// Map a playback state onto the bar.
    pub fn from_state(state: &MediaState) -> Self {
        let Some(track) = state.track() else {
            return Self::CLEARED;
        };

        // v1's `state.duration > 0`, plus the finiteness the division needs.
        if !track.duration.is_finite() || track.duration <= 0.0 {
            return Self::CLEARED;
        }

        Self {
            status: if track.is_playing {
                ProgressStatus::Normal
            } else {
                ProgressStatus::Paused
            },
            percent: Some(percent(track.current_time, track.duration)),
        }
    }
}

/// `current_time / duration` as a 0–100 integer.
fn percent(current_time: f64, duration: f64) -> u64 {
    if !current_time.is_finite() || current_time <= 0.0 {
        return 0;
    }

    let fraction = (current_time / duration).clamp(0.0, 1.0);
    (fraction * 100.0).round() as u64
}

/// Whether this platform has a taskbar progress bar.
///
/// v1 gated the whole block on `process.platform === 'win32'`.
pub const fn is_supported() -> bool {
    cfg!(target_os = "windows")
}

/// Writes the taskbar progress bar.
pub trait TaskbarProgressBackend {
    /// Show, update or remove the bar.
    fn set_progress(&self, progress: TaskbarProgress) -> Result<()>;
}

/// A backend that does nothing, successfully. What every non-Windows target
/// gets.
#[derive(Debug, Default)]
pub struct NoopTaskbarProgress;

impl TaskbarProgressBackend for NoopTaskbarProgress {
    fn set_progress(&self, _progress: TaskbarProgress) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::playing;

    fn loaded(current_time: f64) -> MediaState {
        MediaState::Loaded(playing(current_time))
    }

    fn progress(state: &MediaState) -> TaskbarProgress {
        TaskbarProgress::from_state(state)
    }

    #[test]
    fn playing_fills_a_normal_bar() {
        // 107 of 214 seconds.
        assert_eq!(
            progress(&loaded(107.0)),
            TaskbarProgress {
                status: ProgressStatus::Normal,
                percent: Some(50)
            }
        );
    }

    /// v1's `{ mode: 'paused' }` branch — the same fraction, a different
    /// treatment.
    #[test]
    fn pausing_keeps_the_fraction_and_changes_the_treatment() {
        let mut paused = playing(107.0);
        paused.is_playing = false;

        assert_eq!(
            progress(&MediaState::Loaded(paused)),
            TaskbarProgress {
                status: ProgressStatus::Paused,
                percent: Some(50)
            }
        );
    }

    #[test]
    fn clearing_removes_the_bar() {
        assert_eq!(progress(&MediaState::Cleared), TaskbarProgress::CLEARED);
    }

    /// v1's `else win.setProgressBar(-1)`: without a length there is no
    /// fraction to draw.
    #[test]
    fn an_unusable_duration_removes_the_bar() {
        for value in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let mut unusable = playing(10.0);
            unusable.duration = value;

            assert_eq!(
                progress(&MediaState::Loaded(unusable)),
                TaskbarProgress::CLEARED,
                "duration {value} gives no fraction"
            );
        }
    }

    /// Electron clamped internally; Tauri takes a `u64` percentage, so an
    /// over-100 value would be ours to have produced.
    #[test]
    fn a_playhead_past_the_end_stops_at_a_hundred() {
        assert_eq!(progress(&loaded(9_999.0)).percent, Some(100));
    }

    #[test]
    fn a_negative_or_nan_playhead_reads_as_empty() {
        for value in [-5.0, f64::NAN, f64::NEG_INFINITY] {
            assert_eq!(
                progress(&loaded(value)).percent,
                Some(0),
                "playhead {value} is before the start"
            );
        }
    }

    #[test]
    fn the_start_and_the_end_are_zero_and_a_hundred() {
        assert_eq!(progress(&loaded(0.0)).percent, Some(0));
        assert_eq!(progress(&loaded(214.0)).percent, Some(100));
    }

    #[test]
    fn the_percentage_rounds_rather_than_truncates() {
        // 1 of 214 seconds is 0.467%, which truncation would lose entirely.
        assert_eq!(progress(&loaded(1.07)).percent, Some(1));
        assert_eq!(progress(&loaded(0.5)).percent, Some(0));
    }

    #[test]
    fn support_follows_the_platform() {
        assert_eq!(is_supported(), cfg!(target_os = "windows"));
    }

    #[test]
    fn the_noop_backend_accepts_everything() {
        assert!(
            NoopTaskbarProgress
                .set_progress(TaskbarProgress::CLEARED)
                .is_ok()
        );
        assert!(
            NoopTaskbarProgress
                .set_progress(TaskbarProgress {
                    status: ProgressStatus::Normal,
                    percent: Some(42)
                })
                .is_ok()
        );
    }
}
