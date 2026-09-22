//! Duration, file count and RSS delta for one scan.
//!
//! Ported from `startScanTelemetry` (`library.ts:174-220`), minus the half that
//! no longer has a subject. v1 logged two records: `phase: 'scan-end'` right
//! after the parses finished, and `phase: 'utility-exit'` once the OS had reaped
//! the child — the second existing solely to prove that killing the
//! `utilityProcess` handed its RSS back. v2 has no child, so only `scan-end`
//! survives, and it survives because it is the measurement that would catch a
//! scan whose memory does not come back down.

use std::time::Instant;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

/// Which entry point is being measured. v1's `kind`, so log lines from the two
/// scan paths stay distinguishable without a second channel.
#[derive(Debug, Clone, Copy)]
pub(crate) enum ScanKind {
    /// `library:scan-folder`.
    Flat,
    /// `library:scan-folder-grouped`.
    Grouped,
}

impl ScanKind {
    /// The literal v1 wrote into the log record.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Flat => "scan-folder",
            Self::Grouped => "scan-folder-grouped",
        }
    }
}

/// An in-flight measurement. Built at the top of a scan, consumed at the end.
pub(crate) struct ScanTelemetry {
    kind: ScanKind,
    start: Instant,
    start_rss: Option<u64>,
}

impl ScanTelemetry {
    /// Sample the baseline and start the clock.
    pub(crate) fn start(kind: ScanKind) -> Self {
        Self {
            kind,
            start: Instant::now(),
            start_rss: resident_bytes(),
        }
    }

    /// Log the record. Called on every exit path, cancellation included — a
    /// cancelled scan's cost is worth knowing too.
    pub(crate) fn record_end(self, file_count: usize, cancelled: bool) {
        let duration_ms = self.start.elapsed().as_millis();
        let rss_delta_mb = self
            .start_rss
            .zip(resident_bytes())
            .map(|(start, end)| rss_delta_mb(start, end));

        tracing::info!(
            kind = self.kind.as_str(),
            phase = "scan-end",
            rss_delta_mb,
            scan_duration_ms = %duration_ms,
            file_count,
            cancelled,
            "scan telemetry"
        );
    }
}

/// v1's `Math.round(((endRss - startRssBytes) / (1024 * 1024)) * 100) / 100` —
/// mebibytes to two decimal places, signed, because a scan that frees more than
/// it takes is a perfectly good outcome to see in a log.
fn rss_delta_mb(start: u64, end: u64) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "an f64 holds byte counts exactly to 2^53; RSS is nowhere near it"
    )]
    let delta = (end as f64) - (start as f64);

    (delta / (1024.0 * 1024.0) * 100.0).round() / 100.0
}

/// This process's resident set size, or `None` when the platform will not say.
///
/// Deliberately best-effort: telemetry must never be the reason a scan fails,
/// and `sysinfo` returning nothing for the current pid is a condition to log
/// around rather than to propagate.
fn resident_bytes() -> Option<u64> {
    let pid = sysinfo::get_current_pid().ok()?;

    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );

    Some(system.process(pid)?.memory())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_delta_is_mebibytes_to_two_places() {
        // 1.5 MiB exactly.
        assert!((rss_delta_mb(0, 1_572_864) - 1.5).abs() < f64::EPSILON);
        // Rounds, rather than truncating: 1 MiB + 5 KiB ≈ 1.0049 MiB.
        assert!((rss_delta_mb(0, 1_053_696) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn a_scan_that_frees_memory_reports_a_negative_delta() {
        assert!((rss_delta_mb(2_097_152, 1_048_576) + 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn the_kind_keeps_v1s_spelling() {
        assert_eq!(ScanKind::Flat.as_str(), "scan-folder");
        assert_eq!(ScanKind::Grouped.as_str(), "scan-folder-grouped");
    }

    #[test]
    fn resident_bytes_answers_for_the_test_process() {
        // Not asserting a value — only that the platform path resolves, so a
        // silently-`None` telemetry field is caught here rather than in a log
        // nobody reads.
        assert!(resident_bytes().is_some_and(|bytes| bytes > 0));
    }
}
