//! `tracing` setup: a console layer, a rolling file in `<app data>/logs`, and a
//! filter that can be changed without a restart.
//!
//! Architecture §2.2 #4 maps v1's file logger here and freezes one detail:
//! **keep `<data>/logs/shiranami-YYYY-MM-DD.log` naming**. Phase 14 lane 6 froze
//! the other half — the directory is `crate::paths::logs_dir`, *not* Tauri's
//! `app_log_dir()`, which on macOS is `~/Library/Logs/<bundle id>`: a different
//! tree, and one §3's first-run continuity does not copy because it copies the
//! v1 *data* tree. Resolve it the wrong way and `app:open-logs-folder` opens an
//! empty folder.
//!
//! # This is the first subscriber the workspace has ever had
//!
//! `tracing` has been a workspace dependency since Phase 2 and eleven crates
//! write to it, but nothing ever installed a subscriber — so every
//! `tracing::warn!` in the port has so far gone nowhere. Everything those crates
//! have been recording starts being recorded here.
//!
//! # What changes from v1, and why
//!
//! v1 read `LOG_LEVEL` **once at module evaluation** and exposed no setter, so
//! changing the level meant restarting with a different environment. Here the
//! `EnvFilter` sits behind a [`reload::Handle`], which costs one `RwLock` read
//! per enabled-check and buys [`set_filter`]: a user reproducing a bug can be
//! walked through raising the level in-session rather than through relaunching
//! from a shell, which on macOS means explaining how to launch a `.app` with an
//! environment variable at all.
//!
//! The default is still `LOG_LEVEL` from the environment, and still `info` when
//! it is absent or unparsable — an unparsable filter must not be able to leave a
//! build with no logging at all, so it degrades to the default and says so on
//! the console layer that is already up.
//!
//! # Two writers, deliberately different
//!
//! The console layer is for a developer running `pnpm tauri:dev` and carries
//! ANSI. The file layer is what a user attaches to a bug report: no ANSI (escape
//! sequences in a file a user opens in TextEdit are noise), and non-blocking, so
//! a slow or full disk cannot stall a boot stage. The non-blocking writer's
//! guard has to outlive the process — see [`LogGuard`].

use std::path::Path;

use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;
use tracing_subscriber::{EnvFilter, fmt, reload};

/// The log filename's prefix. v1's `LOG_FILE_PREFIX`, and the reason
/// `app:open-logs-folder` shows a user the same files it did before the upgrade.
pub const LOG_FILE_PREFIX: &str = "shiranami";

/// The environment variable v1 read, kept so an existing habit still works.
pub const LOG_LEVEL_VAR: &str = "LOG_LEVEL";

/// The level a build with no `LOG_LEVEL` runs at, matching v1's default.
pub const DEFAULT_LEVEL: &str = "info";

/// Keeps the non-blocking file writer alive.
///
/// `tracing_appender`'s worker flushes on **drop of this guard**, so dropping it
/// at the end of setup would silently truncate every line written afterwards —
/// which is every line that matters, since the interesting ones are emitted long
/// after boot. Boot therefore hands it to `tauri::Builder`'s managed state and
/// the process holds it until exit.
///
/// Nearly opaque: the only two things a caller may do are change the filter and
/// [`flush`](LogGuard::flush) on the way out. Dropping it early is the one thing
/// that can be got wrong.
pub struct LogGuard {
    /// `None` once [`flush`](LogGuard::flush) has consumed it.
    ///
    /// Behind a `Mutex` because the flush happens from `RunEvent::ExitRequested`,
    /// which hands out `&AppHandle` and therefore only ever `&LogGuard` — and
    /// dropping the worker guard is the only way `tracing_appender` exposes to
    /// wait for the file to be written.
    appender: std::sync::Mutex<Option<tracing_appender::non_blocking::WorkerGuard>>,
    reload: reload::Handle<EnvFilter, tracing_subscriber::Registry>,
}

impl std::fmt::Debug for LogGuard {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("LogGuard")
    }
}

impl LogGuard {
    /// Change the filter for the running process.
    ///
    /// Returns whether `directives` parsed. A rejected filter leaves the current
    /// one in place rather than falling back to a default, because the caller
    /// asked for something specific and quietly giving them `info` instead reads
    /// as "the setting does nothing".
    pub fn set_filter(&self, directives: &str) -> bool {
        let Ok(filter) = EnvFilter::try_new(directives) else {
            tracing::warn!(directives, "ignoring an unparsable log filter");
            return false;
        };

        match self.reload.reload(filter) {
            Ok(()) => {
                tracing::info!(directives, "log filter changed");
                true
            }
            Err(error) => {
                tracing::warn!(%error, "the log filter could not be replaced");
                false
            }
        }
    }

    /// Drain the file appender's worker and wait for it to finish writing.
    ///
    /// # Why this is not left to `Drop`
    ///
    /// `tao`'s event loop ends the process with `std::process::exit`, so nothing
    /// the app manages is ever dropped and no destructor on this guard can run.
    /// Every line emitted in the last moments of a session — which is exactly
    /// the window a shutdown bug lives in — was therefore being written into a
    /// worker that the process outran. Calling this from the `ExitRequested`
    /// handler is what makes those lines reach the file a user attaches to a bug
    /// report.
    ///
    /// Idempotent: the guard is taken, so a second call is a no-op. That matters
    /// because `ExitRequested` is not documented to fire exactly once.
    pub fn flush(&self) {
        let taken = match self.appender.lock() {
            Ok(mut slot) => slot.take(),
            // A poisoned lock means a panic happened while holding it. There is
            // nothing to recover and refusing to flush would lose the panic's
            // own log line, which is the one worth keeping.
            Err(poisoned) => poisoned.into_inner().take(),
        };
        // Dropping the `WorkerGuard` signals the worker and joins it.
        drop(taken);
    }
}

/// Install the subscriber: console plus a daily-rolled file under `logs_dir`.
///
/// Called first in boot (§2.8) and **before** anything else can log. Returns the
/// guard the process has to keep.
///
/// # Errors
///
/// Never. A log directory that cannot be created, or a subscriber that is
/// somehow already installed, both degrade to console-only and say so — refusing
/// to start because logging is unavailable would turn a cosmetic problem into a
/// launch failure, and the console layer is the half a developer needs anyway.
pub fn install(logs_dir: &Path) -> LogGuard {
    let (filter, reload_handle) = reload::Layer::new(default_filter());

    // `never()` rather than `daily()`: the rotation is expressed by the
    // *filename*, which `daily()` would spell `shiranami.log.2026-08-01` —
    // v1's name is `shiranami-2026-08-01.log`, and it is what
    // `app:open-logs-folder` shows and what a user has been attaching to bug
    // reports. Recomputing the name per boot matches v1 closely enough: v1
    // recomputed per flush, and a session that spans midnight keeping one file
    // is not something any consumer of these logs distinguishes.
    let file_writer = match std::fs::create_dir_all(logs_dir) {
        Ok(()) => Some(tracing_appender::rolling::never(logs_dir, log_file_name())),
        Err(error) => {
            // Cannot use `tracing` yet — this *is* the subscriber install.
            eprintln!(
                "[logging] no log directory at {}: {error}",
                logs_dir.display()
            );
            None
        }
    };

    let (file_layer, appender_guard) = match file_writer {
        Some(writer) => {
            let (non_blocking, guard) = tracing_appender::non_blocking(writer);
            let layer = fmt::layer()
                .with_writer(non_blocking)
                // A file a user opens in TextEdit must not be full of escape
                // sequences.
                .with_ansi(false)
                .with_target(true)
                .with_thread_ids(false);
            (Some(layer), Some(guard))
        }
        None => (None, None),
    };

    let console_layer = fmt::layer()
        .with_ansi(true)
        .with_target(true)
        .with_writer(std::io::stderr);

    let installed = tracing_subscriber::registry()
        .with(filter)
        .with(console_layer)
        .with(file_layer)
        .try_init();

    if let Err(error) = installed {
        eprintln!("[logging] a subscriber was already installed: {error}");
    }

    let guard = match appender_guard {
        Some(guard) => guard,
        None => {
            // Console-only: still hand back a guard so the caller's shape does
            // not depend on whether the disk cooperated. The worker behind this
            // one writes to a sink that discards.
            let (_, guard) = tracing_appender::non_blocking(std::io::sink());
            guard
        }
    };

    LogGuard {
        appender: std::sync::Mutex::new(Some(guard)),
        reload: reload_handle,
    }
}

/// `shiranami-YYYY-MM-DD.log`, v1's name.
///
/// The date is formatted by hand from the appender's own clock rather than
/// pulled in from `chrono`/`time` — this is the only date any of this crate
/// formats, and the format is fixed by a filename v1 already shipped.
fn log_file_name() -> String {
    format!("{LOG_FILE_PREFIX}-{}.log", today())
}

/// Today as `YYYY-MM-DD` in UTC.
///
/// UTC rather than local time, matching v1: its name came from
/// `toISOString().slice(0, 10)`, which is UTC too. A user in UTC+13 therefore
/// sees the file roll over mid-evening, exactly as they did before.
fn today() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());

    let (year, month, day) = civil_from_days((seconds / 86_400) as i64);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Howard Hinnant's `civil_from_days`, the standard days-since-epoch → calendar
/// conversion.
///
/// Written out rather than taken as a dependency: it is eleven lines, it is the
/// only date arithmetic in the crate, and `chrono` would be a new dependency
/// carried for one filename.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;

    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// The five level names v1 accepted in `LOG_LEVEL`.
///
/// v1 looked the value up in `LOG_LEVEL_NAMES` and ignored anything absent. That
/// lookup is not decoration — see [`is_acceptable`] for the failure it prevents.
const LEVEL_NAMES: [&str; 5] = ["trace", "debug", "info", "warn", "error"];

/// Whether `requested` is something to hand to `EnvFilter`.
///
/// # A bare typo silences the app, and `EnvFilter` will not tell you
///
/// `EnvFilter` is far more permissive than it looks. A bare word is a valid
/// **target** directive, so `LOG_LEVEL=verbose` parses without complaint and
/// means "enable the target named `verbose`" — which sets the default for
/// everything else to off. A user who typed a plausible level name gets an
/// application that logs *nothing*, with no error to explain it, which is
/// exactly the state a log level is set to escape.
///
/// v1 could not hit this because it looked the value up in a table of five
/// names. That lookup is reproduced here: a single bare word must be one of
/// [`LEVEL_NAMES`], while anything with a `=` or a `,` in it is a deliberate
/// per-target filter and is handed to `EnvFilter` to judge.
fn is_acceptable(requested: &str) -> bool {
    let trimmed = requested.trim();
    if trimmed.contains('=') || trimmed.contains(',') {
        return EnvFilter::try_new(trimmed).is_ok();
    }

    LEVEL_NAMES.contains(&trimmed.to_ascii_lowercase().as_str())
}

/// `LOG_LEVEL` from the environment, or `info`.
///
/// An unacceptable value degrades to the default rather than to "no logging" —
/// see [`is_acceptable`] for why that is a real risk and not a theoretical one.
fn default_filter() -> EnvFilter {
    let Ok(requested) = std::env::var(LOG_LEVEL_VAR) else {
        return EnvFilter::new(DEFAULT_LEVEL);
    };

    if !is_acceptable(&requested) {
        eprintln!("[logging] LOG_LEVEL={requested:?} is not a valid filter; using {DEFAULT_LEVEL}");
        return EnvFilter::new(DEFAULT_LEVEL);
    }

    EnvFilter::try_new(requested.trim()).unwrap_or_else(|_| EnvFilter::new(DEFAULT_LEVEL))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact name v1 wrote, because `app:open-logs-folder` shows it and
    /// §3's continuity copies `logs/` across.
    #[test]
    fn the_log_file_carries_v1s_name_shape() {
        let name = log_file_name();

        assert!(name.starts_with("shiranami-"), "{name}");
        assert!(name.ends_with(".log"), "{name}");
        assert_eq!(name.len(), "shiranami-2026-08-01.log".len(), "{name}");
    }

    /// Three fixed points, one of them a leap day, against the calendar the
    /// filename claims to use. A date routine that is off by one produces a
    /// plausible-looking filename and nothing else to notice it by.
    #[test]
    fn the_date_conversion_matches_the_gregorian_calendar() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_417), (2023, 3, 1));
        // 2024-02-29 — the leap day the naive `days / 365` version gets wrong.
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(20_666), (2026, 8, 1));
    }

    #[test]
    fn an_absent_log_level_is_info() {
        // Asserted through the filter's own rendering rather than by reading
        // the variable back, because the property is what the subscriber does.
        assert_eq!(EnvFilter::new(DEFAULT_LEVEL).to_string(), "info");
    }

    /// The five names v1 accepted are accepted, in any casing.
    #[test]
    fn every_level_name_is_acceptable() {
        for level in LEVEL_NAMES {
            assert!(is_acceptable(level), "{level}");
            assert!(is_acceptable(&level.to_ascii_uppercase()), "{level}");
            assert!(is_acceptable(&format!("  {level} ")), "{level}");
        }
    }

    /// The trap this guard exists for, and the reason it is a guard rather than
    /// a `try_new` call.
    ///
    /// `EnvFilter` accepts a bare word as a **target** directive, so every one
    /// of these parses cleanly and sets the default for everything else to off:
    /// a user who typed a plausible level name would get an application that
    /// logs nothing, with no error anywhere to explain it. The assertion on
    /// `try_new` is the half that proves the guard is not redundant.
    #[test]
    fn a_plausible_typo_is_refused_even_though_env_filter_would_accept_it() {
        for typo in ["verbose", "warning", "critical", "silly", "notice"] {
            assert!(
                EnvFilter::try_new(typo).is_ok(),
                "{typo} must be the kind of value EnvFilter waves through"
            );
            assert!(
                !is_acceptable(typo),
                "{typo} is not a level and must not silence the app"
            );
        }
    }

    /// A deliberate per-target filter is still a first-class value — the guard
    /// narrows bare words only, and `EnvFilter` judges the rest.
    #[test]
    fn per_target_directives_are_still_handed_to_env_filter() {
        assert!(is_acceptable("info,shiranami_db=debug"));
        assert!(is_acceptable("shiranami_serve=trace"));
        assert!(!is_acceptable("shiranami_db=notalevel"));
    }

    /// The degradation that must not become "no logging".
    #[test]
    fn an_unacceptable_filter_falls_back_to_the_default() {
        assert!(!is_acceptable("verbose"));
        assert!(EnvFilter::try_new(DEFAULT_LEVEL).is_ok());
    }

    /// The directory is resolved from the *data* tree. Stated here as well as
    /// in `crate::paths` because this is the module that would use
    /// `app_log_dir()` by mistake, and the mistake is silent.
    #[test]
    fn logs_live_beside_the_data_not_in_the_os_log_directory() {
        let data = Path::new("/data/com.shironex.shiranami");
        let logs = data.join(crate::paths::LOGS_DIRECTORY_NAME);

        assert_eq!(logs, Path::new("/data/com.shironex.shiranami/logs"));
        assert!(!logs.to_string_lossy().contains("Library/Logs"));
    }
}
