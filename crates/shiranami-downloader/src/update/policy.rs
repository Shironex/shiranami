//! When to check for a newer yt-dlp or ffmpeg, and what a check's outcome
//! does to the persisted record. Pure: no clock, no I/O, every time passed in.
//!
//! # The windows, and why they differ
//!
//! | Tool   | Window      | Why                                                   |
//! | ------ | ----------- | ----------------------------------------------------- |
//! | yt-dlp | 24 hours    | YouTube breaks it, and a fix usually ships in days    |
//! | ffmpeg | 7 days      | 25 to 150 MB per update, and it rarely breaks downloads |
//! | yt-dlp after a failed download | 1 hour | the owner's main case: a site change should not wait a day |
//!
//! A window is measured from the last check that **reached the upstream**, and
//! that timestamp is persisted, so restarting the app does not re-check. A check
//! that could not reach it (offline, GitHub's unauthenticated rate limit) is not
//! recorded, so the next scheduler tick tries again instead of waiting out a
//! full window with no answer.
//!
//! # No unattended ffmpeg on macOS
//!
//! evermeet.cx, the macOS ffmpeg upstream, publishes no checksum, only an
//! OpenPGP signature this crate does not verify (see `bin::checksum`). A manual
//! install there is the user's own act; an unattended replacement of an
//! executable checked by nothing but TLS is not something to do on their
//! behalf. So [`auto_updatable`] answers `false` for ffmpeg on macOS and the
//! scheduler never checks it there. Manual ffmpeg installs are unchanged.
//!
//! A timestamp in the future means the wall clock moved backwards since it was
//! written. That reads as due rather than as "checked very recently", because
//! the alternative is a machine whose clock was once wrong never checking again.

use shiranami_core::models::{Tool, ToolAutoUpdateState, ToolUpdateRecord};

use crate::bin::Platform;

/// One hour, in the epoch milliseconds every timestamp here uses.
pub const HOUR_MS: i64 = 60 * 60 * 1000;

/// yt-dlp's scheduled window.
pub const YT_DLP_INTERVAL_MS: i64 = 24 * HOUR_MS;

/// ffmpeg's scheduled window.
pub const FFMPEG_INTERVAL_MS: i64 = 7 * 24 * HOUR_MS;

/// The cap on out-of-schedule yt-dlp checks triggered by failed downloads.
///
/// A playlist of fifty videos failing the same way is one check, not fifty.
pub const FAILURE_CHECK_INTERVAL_MS: i64 = HOUR_MS;

/// How many failed attempts in a row it takes to tell the user.
///
/// One failure is a flaky mirror or a laptop waking without Wi-Fi, and goes to
/// the log only. Two in a row is a pattern worth one quiet notice.
pub const REPEATED_FAILURES: u32 = 2;

/// What one automatic check came to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateOutcome {
    /// The tool is not installed. Automatic updating never installs a tool
    /// the user has not.
    NotInstalled,
    /// The upstream could not be reached. Not a check; see the module docs.
    Unreachable,
    /// This tool is not updated automatically on this platform (ffmpeg on
    /// macOS; see the module docs).
    NotSupported,
    /// The installed version is the newest.
    UpToDate,
    /// Downloads were still running when the swap's wait ran out. The staged
    /// update was dropped and the next window tries again.
    Busy,
    /// A newer version was installed.
    Updated {
        /// What was installed before, when it could be read.
        from: Option<String>,
        /// What is installed now, as the new binary reports it.
        to: String,
    },
    /// The update was attempted and refused or failed: a bad checksum, a
    /// binary that would not run, a failed download.
    Failed(String),
}

/// What the caller should do after an outcome is recorded.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Consequence {
    /// Announce this newly installed version.
    pub announce_update: Option<String>,
    /// Tell the user that updating keeps failing.
    pub announce_failure: bool,
}

/// The scheduled window for `tool`.
pub fn interval_ms(tool: Tool) -> i64 {
    match tool {
        Tool::Ytdlp => YT_DLP_INTERVAL_MS,
        Tool::Ffmpeg => FFMPEG_INTERVAL_MS,
    }
}

/// Whether a window of `interval` has passed since `last`.
pub fn is_due(last: Option<i64>, now: i64, interval: i64) -> bool {
    match last {
        None => true,
        Some(last) if last > now => true,
        Some(last) => now - last >= interval,
    }
}

/// `tool`'s record.
pub fn record(state: &ToolAutoUpdateState, tool: Tool) -> &ToolUpdateRecord {
    match tool {
        Tool::Ytdlp => &state.ytdlp,
        Tool::Ffmpeg => &state.ffmpeg,
    }
}

fn record_mut(state: &mut ToolAutoUpdateState, tool: Tool) -> &mut ToolUpdateRecord {
    match tool {
        Tool::Ytdlp => &mut state.ytdlp,
        Tool::Ffmpeg => &mut state.ffmpeg,
    }
}

/// Whether `tool` is updated automatically on `platform`.
///
/// Everywhere but ffmpeg on macOS, whose upstream publishes no checksum. See
/// the module docs.
pub fn auto_updatable(tool: Tool, platform: Platform) -> bool {
    !(tool == Tool::Ffmpeg && platform == Platform::MacOs)
}

/// The tools whose scheduled window has passed on `platform`, yt-dlp first.
///
/// yt-dlp goes first because it is the one whose staleness breaks downloads,
/// and a slow ffmpeg archive should not delay it.
pub fn due_tools(state: &ToolAutoUpdateState, now: i64, platform: Platform) -> Vec<Tool> {
    [Tool::Ytdlp, Tool::Ffmpeg]
        .into_iter()
        .filter(|tool| auto_updatable(*tool, platform))
        .filter(|tool| {
            is_due(
                record(state, *tool).last_checked_at,
                now,
                interval_ms(*tool),
            )
        })
        .collect()
}

/// Whether a failed download may trigger an out-of-schedule yt-dlp check now.
pub fn may_check_after_failure(state: &ToolAutoUpdateState, now: i64) -> bool {
    is_due(state.failure_check_at, now, FAILURE_CHECK_INTERVAL_MS)
}

/// Record that a failed download triggered a check at `now`.
pub fn note_failure_check(state: &mut ToolAutoUpdateState, now: i64) {
    state.failure_check_at = Some(now);
}

/// Fold one check's outcome into the record and say what to announce.
pub fn apply_outcome(
    state: &mut ToolAutoUpdateState,
    tool: Tool,
    outcome: &UpdateOutcome,
    now: i64,
) -> Consequence {
    let record = record_mut(state, tool);

    match outcome {
        // Neither is a check: nothing was learned about the upstream.
        UpdateOutcome::NotInstalled | UpdateOutcome::Unreachable | UpdateOutcome::NotSupported => {
            Consequence::default()
        }
        // A busy queue is not the tool's fault. The check still happened, so
        // the window restarts, but the failure streak is left alone.
        UpdateOutcome::Busy => {
            record.last_checked_at = Some(now);
            Consequence::default()
        }
        UpdateOutcome::UpToDate => {
            record.last_checked_at = Some(now);
            record.consecutive_failures = 0;
            Consequence::default()
        }
        UpdateOutcome::Updated { to, .. } => {
            record.last_checked_at = Some(now);
            record.last_updated_at = Some(now);
            record.last_updated_version = Some(to.clone());
            record.consecutive_failures = 0;
            Consequence {
                announce_update: Some(to.clone()),
                announce_failure: false,
            }
        }
        UpdateOutcome::Failed(_) => {
            record.last_checked_at = Some(now);
            record.consecutive_failures = record.consecutive_failures.saturating_add(1);
            Consequence {
                announce_update: None,
                // Once per streak, at the moment it becomes a streak: a tool
                // that fails every day for a month is one notice, not thirty.
                announce_failure: record.consecutive_failures == REPEATED_FAILURES,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_790_000_000_000;

    fn checked(tool: Tool, at: i64) -> ToolAutoUpdateState {
        let mut state = ToolAutoUpdateState::default();
        record_mut(&mut state, tool).last_checked_at = Some(at);
        state
    }

    #[test]
    fn a_tool_never_checked_is_due() {
        assert_eq!(
            due_tools(&ToolAutoUpdateState::default(), NOW, Platform::Windows),
            vec![Tool::Ytdlp, Tool::Ffmpeg]
        );
    }

    #[test]
    fn ffmpeg_is_never_updated_unattended_on_macos() {
        assert_eq!(
            due_tools(&ToolAutoUpdateState::default(), NOW, Platform::MacOs),
            vec![Tool::Ytdlp],
            "evermeet.cx publishes no checksum, so macOS ffmpeg is manual only"
        );
        assert!(!auto_updatable(Tool::Ffmpeg, Platform::MacOs));
        assert!(auto_updatable(Tool::Ffmpeg, Platform::Windows));
        assert!(auto_updatable(Tool::Ytdlp, Platform::MacOs));

        let mut state = ToolAutoUpdateState::default();
        assert_eq!(
            apply_outcome(&mut state, Tool::Ffmpeg, &UpdateOutcome::NotSupported, NOW),
            Consequence::default()
        );
        assert_eq!(state.ffmpeg.last_checked_at, None);
    }

    #[test]
    fn yt_dlp_is_checked_at_most_once_a_day() {
        let state = checked(Tool::Ytdlp, NOW - YT_DLP_INTERVAL_MS + 1);
        assert!(!due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ytdlp));

        let state = checked(Tool::Ytdlp, NOW - YT_DLP_INTERVAL_MS);
        assert!(due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ytdlp));
    }

    #[test]
    fn ffmpeg_is_checked_at_most_once_a_week() {
        let state = checked(Tool::Ffmpeg, NOW - 6 * 24 * HOUR_MS);
        assert!(
            !due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ffmpeg),
            "six days is inside ffmpeg's window even though it is well past yt-dlp's"
        );

        let state = checked(Tool::Ffmpeg, NOW - FFMPEG_INTERVAL_MS);
        assert!(due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ffmpeg));
    }

    #[test]
    fn the_persisted_last_check_survives_a_restart() {
        // A restart is a fresh process reading the same record back.
        let mut state = ToolAutoUpdateState::default();
        apply_outcome(&mut state, Tool::Ytdlp, &UpdateOutcome::UpToDate, NOW);

        let persisted = serde_json::to_value(&state).expect("encode");
        let restored: ToolAutoUpdateState = serde_json::from_value(persisted).expect("decode");

        assert!(
            !due_tools(&restored, NOW + HOUR_MS, Platform::Windows).contains(&Tool::Ytdlp),
            "relaunching an hour later must not re-check"
        );
    }

    #[test]
    fn an_absent_or_older_record_reads_as_never_checked() {
        let restored: ToolAutoUpdateState =
            serde_json::from_value(serde_json::json!({})).expect("decode an empty record");
        assert_eq!(restored, ToolAutoUpdateState::default());

        let partial: ToolAutoUpdateState =
            serde_json::from_value(serde_json::json!({ "ytdlp": { "lastCheckedAt": NOW } }))
                .expect("decode a partial record");
        assert_eq!(partial.ytdlp.last_checked_at, Some(NOW));
        assert_eq!(partial.ffmpeg, ToolUpdateRecord::default());
    }

    #[test]
    fn a_check_from_the_future_reads_as_due() {
        let state = checked(Tool::Ytdlp, NOW + HOUR_MS);
        assert!(
            due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ytdlp),
            "a clock that once ran fast must not stop checks for good"
        );
    }

    #[test]
    fn an_unreachable_upstream_is_not_recorded_as_a_check() {
        let mut state = ToolAutoUpdateState::default();
        let consequence = apply_outcome(&mut state, Tool::Ytdlp, &UpdateOutcome::Unreachable, NOW);

        assert_eq!(consequence, Consequence::default());
        assert_eq!(state.ytdlp.last_checked_at, None, "the next tick retries");
    }

    #[test]
    fn failure_triggered_checks_are_capped_at_one_an_hour() {
        let mut state = ToolAutoUpdateState::default();
        assert!(may_check_after_failure(&state, NOW));

        note_failure_check(&mut state, NOW);
        assert!(!may_check_after_failure(&state, NOW + 1));
        assert!(!may_check_after_failure(&state, NOW + HOUR_MS - 1));
        assert!(may_check_after_failure(&state, NOW + HOUR_MS));
    }

    #[test]
    fn the_failure_cap_is_independent_of_the_daily_window() {
        // The whole point of the failure trigger is to ignore the 24 h window.
        let mut state = checked(Tool::Ytdlp, NOW - 1);
        assert!(!due_tools(&state, NOW, Platform::Windows).contains(&Tool::Ytdlp));
        assert!(may_check_after_failure(&state, NOW));

        note_failure_check(&mut state, NOW);
        assert_eq!(state.ytdlp.last_checked_at, Some(NOW - 1));
    }

    #[test]
    fn an_update_is_recorded_and_announced() {
        let mut state = ToolAutoUpdateState::default();
        state.ytdlp.consecutive_failures = 1;

        let consequence = apply_outcome(
            &mut state,
            Tool::Ytdlp,
            &UpdateOutcome::Updated {
                from: Some("2026.01.01".to_owned()),
                to: "2026.09.20".to_owned(),
            },
            NOW,
        );

        assert_eq!(consequence.announce_update.as_deref(), Some("2026.09.20"));
        assert_eq!(
            state.ytdlp.last_updated_version.as_deref(),
            Some("2026.09.20")
        );
        assert_eq!(state.ytdlp.last_updated_at, Some(NOW));
        assert_eq!(state.ytdlp.consecutive_failures, 0);
    }

    #[test]
    fn a_failure_is_announced_once_when_it_repeats() {
        let mut state = ToolAutoUpdateState::default();
        let failed = UpdateOutcome::Failed("checksum".to_owned());

        let first = apply_outcome(&mut state, Tool::Ffmpeg, &failed, NOW);
        let second = apply_outcome(&mut state, Tool::Ffmpeg, &failed, NOW + 1);
        let third = apply_outcome(&mut state, Tool::Ffmpeg, &failed, NOW + 2);

        assert!(!first.announce_failure, "one failure goes to the log only");
        assert!(second.announce_failure);
        assert!(!third.announce_failure, "one notice per streak");
        assert_eq!(state.ffmpeg.last_checked_at, Some(NOW + 2));
    }

    #[test]
    fn a_busy_queue_restarts_the_window_without_counting_as_a_failure() {
        let mut state = ToolAutoUpdateState::default();
        state.ytdlp.consecutive_failures = 1;

        apply_outcome(&mut state, Tool::Ytdlp, &UpdateOutcome::Busy, NOW);

        assert_eq!(state.ytdlp.last_checked_at, Some(NOW));
        assert_eq!(state.ytdlp.consecutive_failures, 1);
    }
}
