//! `debug:*` — the dev-only CPU/memory panel's sampler.
//!
//! Ported from `apps/desktop/src/main/ipc/debug.ts`. Two channels that start and
//! stop a 1 Hz sampler, plus the `debug:metrics` event it pushes.
//!
//! # This is architecture §2.2 #31: the shape changes, and that is recorded
//!
//! v1 sampled three Chromium APIs — `app.getAppMetrics()` for a per-process
//! breakdown by Electron process *type*, `process.getCPUUsage()` for the main
//! process, and `process.getHeapStatistics()` for the V8 heap. None has a Tauri
//! equivalent, and two could not have one: there is no V8 in the backend to
//! report a heap for, and no Chromium process registry to label a process
//! `Browser` or `GPU`. R13 lists the debug panel's shape as one of two
//! **accepted** losses for exactly this reason.
//!
//! What v2 reports instead is what `sysinfo` can answer honestly: this process
//! and the processes it spawned, each with CPU percentage and resident set size.
//! The fields keep v1's names (`pid`, `cpu`, `mem`) and `mem` keeps v1's unit
//! (kibibytes), so the panel's formatting survives; `type` becomes [`ProcessKind`],
//! which says `main` or `child` rather than inventing Electron's vocabulary for
//! processes that are not Electron's.
//!
//! # The safety rules from v1's header are rules, not preferences
//!
//! - **1 Hz, never per-frame.** A monitor that becomes the load it measures is
//!   worse than no monitor.
//! - **Only while the panel is open.** Sampling starts on `debug:start` and stops
//!   on `debug:stop`, so a closed overlay costs nothing at all.
//! - **No per-tick logging.** One `info` line on start and one on stop. A log
//!   line per sample would rotate the file logger out within the hour.
//! - **Numbers and process kinds only** — never a path, a title, a URL, `argv`
//!   or an environment variable. [`the_snapshot_carries_no_identifying_strings`]
//!   pins that against the serialized payload rather than against review.
//!
//! [`the_snapshot_carries_no_identifying_strings`]: tests::the_snapshot_carries_no_identifying_strings
//!
//! # `DebugSampler` is managed state Phase 16 installs
//!
//! v1 kept its interval handle in a module-level `let timer`. §2.3 forbids a
//! global outright, so the handle lives in a managed [`DebugSampler`] instead —
//! which means these two commands answer "state not managed" until Phase 16
//! calls `manage`, exactly as every `State<'_, AppState>` command does today.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::State;
use tauri_specta::Event as _;

use crate::error::CommandResult;
use crate::events::DebugMetrics;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::debug::debug_start,
                crate::commands::debug::debug_stop,
            ]
        }
    };
}
pub(crate) use commands;

/// v1's `SAMPLE_INTERVAL_MS`, unchanged.
const SAMPLE_INTERVAL: Duration = Duration::from_millis(1_000);

/// Which process a row describes.
///
/// v1 forwarded Electron's `type` string (`Browser`, `GPU`, `Tab`, `Utility`).
/// Tauri has no such registry, so the honest distinction is the only one this
/// process can actually make about its own tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ProcessKind {
    /// The app process itself.
    Main,
    /// A process it spawned — the webview host, or a helper it owns.
    Child,
}

/// One process's slice of a sample.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ProcessMetric {
    /// Whether this is the app process or one of its children.
    pub kind: ProcessKind,
    /// The OS process id.
    pub pid: u32,
    /// CPU usage as a percentage. May exceed 100 on a multi-core machine, which
    /// is what v1's `percentCPUUsage` did too.
    #[specta(type = Number)]
    pub cpu: f64,
    /// Resident set size in **kibibytes** — v1's unit, kept so the panel's
    /// formatting does not have to change.
    #[specta(type = Number)]
    pub mem: u64,
}

/// What `debug:metrics` carries.
///
/// `procs` is the whole payload beside the timestamp: v1's `cpu` and `heap`
/// blocks described the Electron main process's V8 runtime, and there is none.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct MetricsSnapshot {
    /// Milliseconds since the epoch, as `Date.now()` produced.
    #[specta(type = Number)]
    pub ts: i64,
    /// This process first, then its children by ascending pid.
    pub procs: Vec<ProcessMetric>,
}

/// Whether a sampler is running, and how to stop it.
///
/// Managed state rather than a module global (§2.3). Holding the flag rather
/// than a `JoinHandle` is what keeps the start/stop decision testable without a
/// runtime: the caller owns the task, this owns the answer to "is one already
/// running?".
#[derive(Default)]
pub struct DebugSampler {
    running: std::sync::Mutex<Option<Arc<AtomicBool>>>,
}

impl DebugSampler {
    /// Claim the sampler, returning the flag a new run should watch.
    ///
    /// `None` means one is already running, which is v1's `if (timer) return;` —
    /// a second `debug:start` from a re-mounted panel must not double the
    /// sampling rate.
    pub fn start(&self) -> Option<Arc<AtomicBool>> {
        let mut running = shiranami_core::sync::lock_or_recover(&self.running);
        if running.is_some() {
            return None;
        }

        let flag = Arc::new(AtomicBool::new(true));
        *running = Some(Arc::clone(&flag));
        Some(flag)
    }

    /// Release the sampler. `false` means none was running — v1's `if (!timer) return;`.
    pub fn stop(&self) -> bool {
        let mut running = shiranami_core::sync::lock_or_recover(&self.running);
        let Some(flag) = running.take() else {
            return false;
        };

        flag.store(false, Ordering::Release);
        true
    }

    /// Whether a run is currently claimed.
    pub fn is_running(&self) -> bool {
        shiranami_core::sync::lock_or_recover(&self.running).is_some()
    }
}

/// `debug:start` — begin sampling and pushing `debug:metrics`.
#[tauri::command]
#[specta::specta]
pub async fn debug_start(
    app: tauri::AppHandle,
    sampler: State<'_, DebugSampler>,
) -> CommandResult<()> {
    let Some(running) = sampler.start() else {
        return Ok(());
    };

    tracing::info!("metrics sampling started");
    // `tauri::async_runtime::spawn`, never a bare `tokio::spawn`: R16, and this
    // is reachable from a command the webview drives.
    tauri::async_runtime::spawn(async move {
        sample_until_stopped(&app, &running).await;
        tracing::info!("metrics sampling stopped");
    });

    Ok(())
}

/// `debug:stop` — end sampling. Idempotent, as v1's was.
#[tauri::command]
#[specta::specta]
pub async fn debug_stop(sampler: State<'_, DebugSampler>) -> CommandResult<()> {
    sampler.stop();
    Ok(())
}

/// The loop itself: refresh, shape, emit, wait.
///
/// Untestable by design — it owns a clock, a `System` and an `AppHandle`.
/// Everything with a decision in it ([`select`], [`ProcessMetric::kilobytes`])
/// is a free function below, tested exhaustively. The pattern
/// `shiranami-media-controls` draws at its backend seam.
async fn sample_until_stopped(app: &tauri::AppHandle, running: &AtomicBool) {
    let Ok(own) = sysinfo::get_current_pid() else {
        tracing::warn!("the platform will not name this process; metrics unavailable");
        return;
    };

    let mut system = System::new();
    let wanted = ProcessRefreshKind::nothing().with_cpu().with_memory();

    while running.load(Ordering::Acquire) {
        // sysinfo derives CPU from the delta between two refreshes, so the first
        // tick reports zero for every process. At 1 Hz that is one second of a
        // dev-only overlay reading 0%, which is preferable to a synthetic first
        // sample that looks like data.
        system.refresh_processes_specifics(ProcessesToUpdate::All, true, wanted);

        let rows: Vec<Row> = system
            .processes()
            .iter()
            .map(|(pid, process)| Row {
                pid: pid.as_u32(),
                parent: process.parent().map(Pid::as_u32),
                cpu: f64::from(process.cpu_usage()),
                memory_bytes: process.memory(),
            })
            .collect();

        let snapshot = MetricsSnapshot {
            ts: shiranami_core::time::now_ms(),
            procs: select(&rows, own.as_u32()),
        };

        if let Err(error) = DebugMetrics(snapshot).emit(app) {
            // A webview that has gone away is the normal end of a dev session,
            // not something to keep sampling for.
            tracing::warn!(%error, "metrics listener unreachable; stopping");
            return;
        }

        tokio::time::sleep(SAMPLE_INTERVAL).await;
    }
}

/// One process as `sysinfo` reported it, before any decision is taken about it.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Row {
    pid: u32,
    parent: Option<u32>,
    cpu: f64,
    memory_bytes: u64,
}

/// This process and the ones it spawned, in a stable order.
///
/// v1's `getAppMetrics()` returned Electron's own process table, which is
/// exactly the app's tree. `sysinfo` returns *every* process on the machine, so
/// the filter is what stands in for that — and without it the panel would
/// publish the pid and memory of everything the user is running, which the
/// module header rules out.
///
/// One level of children, not a full ancestry walk: the webview host and the
/// helpers Tauri spawns are direct children on all three platforms, and a
/// transitive walk would sweep in anything a *user's* yt-dlp went on to start.
fn select(rows: &[Row], own: u32) -> Vec<ProcessMetric> {
    let mut selected: Vec<ProcessMetric> = rows
        .iter()
        .filter(|row| row.pid == own || row.parent == Some(own))
        .map(|row| ProcessMetric {
            kind: if row.pid == own {
                ProcessKind::Main
            } else {
                ProcessKind::Child
            },
            pid: row.pid,
            cpu: row.cpu,
            mem: kilobytes(row.memory_bytes),
        })
        .collect();

    // The app first, then children by pid. A stable order matters because the
    // panel renders a list: sysinfo's map iteration order is arbitrary, and rows
    // that reshuffle every second are unreadable.
    selected.sort_by_key(|metric| (metric.kind != ProcessKind::Main, metric.pid));
    selected
}

/// Bytes to kibibytes, v1's unit for `memory.workingSetSize`.
///
/// Truncating rather than rounding: the panel shows whole kibibytes, and a value
/// that rounds *up* past a threshold the user set an alert on is a worse lie
/// than one that is at most 1023 bytes low.
const fn kilobytes(bytes: u64) -> u64 {
    bytes / 1024
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pid: u32, parent: Option<u32>) -> Row {
        Row {
            pid,
            parent,
            cpu: 0.0,
            memory_bytes: 0,
        }
    }

    /// A second `debug:start` — a re-mounted panel, a double click — must not
    /// leave two loops running at 1 Hz each.
    #[test]
    fn starting_twice_claims_the_sampler_once() {
        let sampler = DebugSampler::default();

        assert!(sampler.start().is_some(), "the first start claims it");
        assert!(sampler.start().is_none(), "the second finds it claimed");
        assert!(sampler.is_running());
    }

    #[test]
    fn stopping_signals_the_running_loop_and_releases_the_claim() {
        let sampler = DebugSampler::default();
        let flag = sampler.start().expect("claimed");

        assert!(flag.load(Ordering::Acquire), "the loop is told to run");
        assert!(sampler.stop());
        assert!(!flag.load(Ordering::Acquire), "the loop is told to stop");
        assert!(!sampler.is_running());
    }

    /// v1's `if (!timer) return;`. The panel sends `debug:stop` on unmount
    /// whether or not it ever sent `debug:start`.
    #[test]
    fn stopping_an_idle_sampler_is_a_no_op() {
        let sampler = DebugSampler::default();

        assert!(!sampler.stop());
        assert!(!sampler.is_running());
    }

    #[test]
    fn a_sampler_can_be_restarted_after_being_stopped() {
        let sampler = DebugSampler::default();
        let first = sampler.start().expect("claimed");
        sampler.stop();

        let second = sampler.start().expect("re-claimed");
        assert!(second.load(Ordering::Acquire));
        assert!(!first.load(Ordering::Acquire), "the old loop stays stopped");
    }

    /// The filter that stands in for Electron's process table. Without it the
    /// panel would publish every process on the machine.
    #[test]
    fn only_this_process_and_its_direct_children_are_reported() {
        let rows = [
            row(100, Some(1)),   // us
            row(101, Some(100)), // our webview host
            row(102, Some(100)), // another child of ours
            row(200, Some(1)),   // somebody else's process
            row(201, Some(200)), // somebody else's child
        ];

        let pids: Vec<u32> = select(&rows, 100).iter().map(|m| m.pid).collect();

        assert_eq!(pids, [100, 101, 102]);
    }

    /// A grandchild is not ours to report: a `yt-dlp` the user's shell started
    /// under one of our children would otherwise appear in the panel.
    #[test]
    fn a_grandchild_is_not_swept_in() {
        let rows = [row(100, Some(1)), row(101, Some(100)), row(102, Some(101))];

        let pids: Vec<u32> = select(&rows, 100).iter().map(|m| m.pid).collect();

        assert_eq!(pids, [100, 101]);
    }

    /// The main row is labelled and sorted first regardless of pid, because the
    /// panel reads top-down and the app's own row is the one being looked for.
    #[test]
    fn the_app_process_is_labelled_main_and_sorted_first() {
        let rows = [row(50, Some(999)), row(999, Some(1)), row(20, Some(999))];

        let selected = select(&rows, 999);

        assert_eq!(selected[0].kind, ProcessKind::Main);
        assert_eq!(selected[0].pid, 999);
        assert_eq!(
            selected.iter().map(|m| m.pid).collect::<Vec<_>>(),
            [999, 20, 50],
            "children follow in ascending pid order, not sysinfo's map order"
        );
    }

    #[test]
    fn an_empty_process_table_yields_an_empty_snapshot_rather_than_a_panic() {
        assert_eq!(select(&[], 100), Vec::new());
    }

    /// v1 reported `memory.workingSetSize`, which Electron documents in
    /// kibibytes. Reporting bytes here would make every number in the panel a
    /// thousand times too large with no unit label to notice it by.
    #[test]
    fn memory_is_reported_in_kibibytes_and_truncates() {
        assert_eq!(kilobytes(0), 0);
        assert_eq!(kilobytes(1023), 0, "under a kibibyte truncates to zero");
        assert_eq!(kilobytes(1024), 1);
        assert_eq!(kilobytes(1_048_576), 1024);
    }

    /// The one field name that would break the panel silently: `type` in v1
    /// became `kind`, and the values are lowercase strings rather than an
    /// externally-tagged object.
    #[test]
    fn the_wire_shape_is_flat_numbers_and_a_lowercase_kind() {
        let json = serde_json::to_value(MetricsSnapshot {
            ts: 1_700_000_000_000,
            procs: vec![ProcessMetric {
                kind: ProcessKind::Child,
                pid: 42,
                cpu: 12.5,
                mem: 2048,
            }],
        })
        .expect("the snapshot serializes");

        assert_eq!(json["ts"], 1_700_000_000_000_i64);
        assert_eq!(json["procs"][0]["kind"], "child");
        assert_eq!(json["procs"][0]["pid"], 42);
        assert_eq!(json["procs"][0]["cpu"], 12.5);
        assert_eq!(json["procs"][0]["mem"], 2048);
    }

    /// The module header's safety rule, asserted rather than reviewed: no path,
    /// title, URL, `argv` or environment variable may reach the renderer. The
    /// tempting field to add is the process *name* — `sysinfo` hands it over for
    /// free and it would leak whatever the user is running.
    #[test]
    fn the_snapshot_carries_no_identifying_strings() {
        /// Every string *value* in the payload, keys excluded — a key is a field
        /// name this module chose, a value is data about the machine.
        fn values(json: &serde_json::Value, found: &mut Vec<String>) {
            match json {
                serde_json::Value::String(text) => found.push(text.clone()),
                serde_json::Value::Array(items) => {
                    for item in items {
                        values(item, found);
                    }
                }
                serde_json::Value::Object(fields) => {
                    for field in fields.values() {
                        values(field, found);
                    }
                }
                _ => {}
            }
        }

        let json = serde_json::to_value(MetricsSnapshot {
            ts: 1,
            procs: vec![
                ProcessMetric {
                    kind: ProcessKind::Main,
                    pid: 7,
                    cpu: 1.0,
                    mem: 1,
                },
                ProcessMetric {
                    kind: ProcessKind::Child,
                    pid: 8,
                    cpu: 2.0,
                    mem: 2,
                },
            ],
        })
        .expect("the snapshot serializes");

        let mut found = Vec::new();
        values(&json, &mut found);

        assert_eq!(
            found,
            ["main", "child"],
            "the only strings in a metrics payload are the process kinds. \
             Anything else — a process name, an executable path, a window title \
             — is data about what the user is running, and the panel exists to \
             show numbers"
        );
    }
}
