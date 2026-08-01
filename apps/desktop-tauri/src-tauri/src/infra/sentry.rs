//! Opt-in crash reporting, and the gate that decides whether it exists at all.
//!
//! Architecture §2.8 step 3 is unusually specific, and every clause of it is
//! load-bearing:
//!
//! > Sentry: read consent **before** `tauri::Builder`; skip `.plugin(sentry)`
//! > entirely when consent is absent (the plugin auto-injects browser Sentry —
//! > a no-op DSN is not enough).
//!
//! That is why this module hands back an `Option` rather than exposing an
//! `init()` that decides internally. A disabled Sentry is not a client with
//! nothing to send to; it is **no client and no plugin**, because
//! `tauri-plugin-sentry` injects a browser-side SDK into the webview when it is
//! registered, and a webview SDK pointed at an empty DSN still installs global
//! error handlers in the renderer. "Consent absent" has to mean nothing was
//! installed anywhere.
//!
//! # The gate is v1's, clause for clause
//!
//! ```js
//! store.get('app.telemetryEnabled') === true && (app.isPackaged || forceEnabled)
//! ```
//!
//! - **Strict `=== true`.** The key has no default, so a fresh install reads
//!   `undefined`, and `undefined` is not consent.
//!   `SettingsStore::telemetry_enabled` already encodes this and documents it:
//!   "Absent means **no**: a fresh install must never initialise Sentry."
//! - **`app.isPackaged`,** so a development build does not report its own
//!   noise into the production project. `SENTRY_FORCE_ENABLE` overrides *only*
//!   this clause — never consent, and never a missing DSN.
//!
//! # Consent turned on at runtime does not start reporting until next launch
//!
//! v1's `setTelemetryEnabled` says so out loud: enabling after `app.isReady()`
//! logs "crash reporting starts on next launch" and initialises nothing. That is
//! not a limitation being tolerated, it is the §2.8 ordering being respected —
//! the plugin has to be registered on the `Builder`, and by the time a user
//! ticks the box the `Builder` is long gone.
//!
//! Turning consent **off** is different and takes effect immediately, because
//! there is a live client to close. That asymmetry is v1's and is reproduced by
//! [`watch_consent`].

use std::sync::Arc;

use shiranami_core::scrub;
use shiranami_core::store::SettingsStore;

/// The environment variable that lifts the `isPackaged` clause for a local run.
///
/// v1 accepted `'true'` or `'1'`; both are kept, because a habit that works in
/// one shell should not silently stop working in another.
const FORCE_ENABLE_VAR: &str = "SENTRY_FORCE_ENABLE";

/// The DSN, compiled in.
///
/// `option_env!` rather than `std::env::var`, for the reason Phase 12 lane B
/// recorded about the Last.fm credentials: v1's were inlined by esbuild at build
/// time **precisely because** a packaged main process cannot see build-time
/// variables at runtime. A runtime read would compile fine and leave every
/// shipped build permanently unconfigured.
///
/// v1 also kept a runtime `process.env.SENTRY_DSN` fallback so a local shell
/// could inject one without rebuilding; [`dsn`] reproduces that, in that order.
const COMPILED_DSN: Option<&str> = option_env!("SENTRY_DSN");

/// A live Sentry client, kept alive for the process's lifetime.
///
/// Dropping this flushes and shuts the client down, so boot hands it to managed
/// state rather than letting it fall out of scope at the end of setup.
pub struct SentryGuard {
    _inner: sentry::ClientInitGuard,
}

impl std::fmt::Debug for SentryGuard {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SentryGuard")
    }
}

/// Whether this run may initialise Sentry at all.
///
/// Split out from [`init`] so the decision is testable without a client: the
/// thing worth asserting is the truth table, and `sentry::init` reaches the
/// network.
pub fn is_enabled(consented: bool, packaged: bool, forced: bool) -> bool {
    consented && (packaged || forced)
}

/// v1's `SENTRY_FORCE_ENABLE` reading.
pub fn force_enabled() -> bool {
    std::env::var(FORCE_ENABLE_VAR).is_ok_and(|value| value == "true" || value == "1")
}

/// The DSN this build reports to, if any.
///
/// Compiled-in first, then the environment. Empty strings count as absent —
/// `SENTRY_DSN=""` in CI is how a build says "no DSN", and treating it as a
/// value would hand `sentry::init` something it cannot parse.
pub fn dsn() -> Option<String> {
    COMPILED_DSN
        .map(str::to_owned)
        .or_else(|| std::env::var("SENTRY_DSN").ok())
        .filter(|value| !value.trim().is_empty())
}

/// v1's traces sample rate.
///
/// Zero unless performance monitoring is separately consented to; then 20 % in a
/// packaged build and everything in a development one, where the volume is one
/// developer's.
pub fn traces_sample_rate(performance_enabled: bool, packaged: bool) -> f32 {
    if !performance_enabled {
        return 0.0;
    }
    if packaged { 0.2 } else { 1.0 }
}

/// Initialise Sentry, or return `None` when this run must not.
///
/// **Call before `tauri::Builder`.** The caller registers
/// `tauri_plugin_sentry` only when this returns `Some`, which is what §2.8 step
/// 3 means by "skip `.plugin(sentry)` entirely".
pub fn init(settings: &SettingsStore) -> Option<SentryGuard> {
    let consented = settings.telemetry_enabled();
    let packaged = !crate::infra::platform::is_dev();

    if !is_enabled(consented, packaged, force_enabled()) {
        // Deliberately not a warning: this is the state almost every run is in,
        // and a warning per launch trains people to ignore warnings.
        tracing::info!(
            consented,
            packaged,
            "telemetry disabled — consent off, or an unpackaged build without SENTRY_FORCE_ENABLE"
        );
        return None;
    }

    let Some(dsn) = dsn() else {
        tracing::info!("telemetry consented but no DSN is compiled in — skipping init");
        return None;
    };

    let performance = settings
        .get(shiranami_core::store::RendererStoreKey::AppPerformanceMonitoringEnabled)
        == Some(serde_json::Value::Bool(true));

    // `ClientOptions` is `#[non_exhaustive]`, so it is filled in rather than
    // written as a literal — which is also what keeps a sentry upgrade that adds
    // a field from being a compile error here.
    let mut options = sentry::ClientOptions::default();
    options.release = Some(format!("shiranami@{}", env!("CARGO_PKG_VERSION")).into());
    options.environment = Some(
        if packaged {
            "production"
        } else {
            "development"
        }
        .into(),
    );
    // Never the default PII bundle: §3.4's whole posture is that this app knows
    // what a user listens to.
    options.send_default_pii = false;

    // v1 passed `tracesSampleRate` directly; sentry-rust 0.49 replaced that
    // field with a strategy, where a rate of zero and "off" are distinguishable.
    // `Disabled` is the honest spelling of "performance monitoring was not
    // consented to" — `FixedRate(0.0)` still honours an *inherited* sampling
    // decision, which for an app that starts its own traces would mean sampling
    // after the user declined.
    let rate = traces_sample_rate(performance, packaged);
    options.traces_sampling_strategy = if rate > 0.0 {
        sentry::TracesSamplingStrategy::FixedRate(rate)
    } else {
        sentry::TracesSamplingStrategy::Disabled
    };

    options.before_send = Some(Arc::new(|event| Some(scrub_event(event))));
    options.before_breadcrumb = Some(Arc::new(scrub_breadcrumb));

    let guard = sentry::init((dsn, options));

    tracing::info!(
        environment = if packaged {
            "production"
        } else {
            "development"
        },
        performance,
        "telemetry enabled"
    );

    Some(SentryGuard { _inner: guard })
}

/// Watch the consent key and act on a change.
///
/// Only one direction does anything, and that is v1's behaviour rather than an
/// omission — see the module docs. Turning consent **off** closes the live
/// client immediately; turning it **on** cannot register a plugin that is
/// already past, so it takes effect on the next launch.
pub fn watch_consent(settings: &SettingsStore) {
    settings.bus().subscribe(
        shiranami_core::store::RendererStoreKey::AppTelemetryEnabled.path(),
        |event| {
            if event.is_enabled() {
                tracing::info!("telemetry consent enabled — crash reporting starts on next launch");
                return;
            }

            // `close` on the current hub's client, with v1's two-second budget.
            // Best effort: a client that will not flush in two seconds is not a
            // reason to keep reporting for a user who just withdrew consent.
            if let Some(client) = sentry::Hub::current().client() {
                client.close(Some(std::time::Duration::from_secs(2)));
                tracing::info!("telemetry consent withdrawn — the client is closed");
            }
        },
    );
}

/// v1's `beforeSend`: scrub every place a path can appear, and **never drop**.
///
/// Dropping an event because it mentioned a path would lose exactly the crashes
/// worth having — the ones involving the user's library.
fn scrub_event(mut event: sentry::protocol::Event<'static>) -> sentry::protocol::Event<'static> {
    // v1 set `dist` to the platform in `ClientOptions` so a crash could be
    // attributed to one OS without a tag search. sentry-rust 0.49 has no such
    // client option — `dist` is a field on the *event* — so it is stamped here,
    // which is the one hook every event passes through.
    if event.dist.is_none() {
        event.dist = Some(std::env::consts::OS.into());
    }

    if let Some(message) = event.message.take() {
        event.message = Some(scrub::scrub_path(&message));
    }

    for exception in &mut event.exception.values {
        exception.value = exception.value.as_deref().map(scrub::scrub_path);

        let Some(stacktrace) = exception.stacktrace.as_mut() else {
            continue;
        };
        for frame in &mut stacktrace.frames {
            frame.filename = frame.filename.as_deref().map(scrub::scrub_path);
            frame.abs_path = frame.abs_path.as_deref().map(scrub::scrub_path);
            frame.module = frame.module.as_deref().map(scrub::scrub_path);
        }
    }

    for breadcrumb in &mut event.breadcrumbs.values {
        breadcrumb.message = breadcrumb.message.as_deref().map(scrub::scrub_path);
    }

    // The free-form bags, where a path can be at any depth.
    event.extra = event
        .extra
        .into_iter()
        .map(|(key, value)| (key, scrub::scrub_deep(value)))
        .collect();
    event.tags = event
        .tags
        .into_iter()
        .map(|(key, value)| (key, scrub::scrub_path(&value)))
        .collect();

    event
}

/// v1's `beforeBreadcrumb`: drop a **console** breadcrumb carrying a path,
/// scrub everything else.
///
/// The asymmetry is deliberate and is v1's. A console breadcrumb is a log line
/// the app itself wrote, so it is reproducible from the log file the user still
/// has; an event breadcrumb is context for a crash and is not. Dropping the
/// cheap one outright is strictly safer than scrubbing it, because a log line
/// can contain a path in a shape the pattern does not match.
fn scrub_breadcrumb(mut breadcrumb: sentry::Breadcrumb) -> Option<sentry::Breadcrumb> {
    let is_console = breadcrumb.category.as_deref() == Some("console");

    if let Some(message) = breadcrumb.message.as_deref() {
        if is_console && scrub::contains_home_path(message) {
            return None;
        }
        breadcrumb.message = Some(scrub::scrub_path(message));
    }

    breadcrumb.data = breadcrumb
        .data
        .into_iter()
        .map(|(key, value)| (key, scrub::scrub_deep(value)))
        .collect();

    Some(breadcrumb)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// v1's gate as a truth table. The row that matters most is the first: a
    /// fresh install has never written the key, so consent is absent and
    /// nothing initialises however packaged the build is.
    #[test]
    fn the_consent_gate_reproduces_v1s_two_clauses() {
        // consent, packaged, forced → enabled
        assert!(!is_enabled(false, true, false), "no consent, packaged");
        assert!(
            !is_enabled(false, true, true),
            "force cannot bypass consent"
        );
        assert!(!is_enabled(false, false, false), "no consent, dev");
        assert!(is_enabled(true, true, false), "consent + packaged");
        assert!(
            !is_enabled(true, false, false),
            "consent alone is not enough in a dev build"
        );
        assert!(
            is_enabled(true, false, true),
            "SENTRY_FORCE_ENABLE lifts the packaged clause"
        );
    }

    /// The single most important property in the file, stated on its own so it
    /// cannot be lost in the table above.
    #[test]
    fn absent_consent_never_initialises() {
        for packaged in [true, false] {
            for forced in [true, false] {
                assert!(
                    !is_enabled(false, packaged, forced),
                    "packaged={packaged} forced={forced} initialised without consent"
                );
            }
        }
    }

    #[test]
    fn performance_monitoring_is_separately_consented_to() {
        assert_eq!(traces_sample_rate(false, true), 0.0);
        assert_eq!(traces_sample_rate(false, false), 0.0);
        assert_eq!(traces_sample_rate(true, true), 0.2);
        assert_eq!(traces_sample_rate(true, false), 1.0);
    }

    /// An empty DSN is absent. `SENTRY_DSN=""` is how a build without a project
    /// says so, and passing it through would hand `sentry::init` a string it
    /// cannot parse.
    #[test]
    fn an_empty_dsn_counts_as_no_dsn() {
        assert_eq!(
            Some("   ".to_owned()).filter(|v| !v.trim().is_empty()),
            None
        );
        assert_eq!(
            Some("https://k@o.ingest.sentry.io/1".to_owned())
                .filter(|v| !v.trim().is_empty())
                .as_deref(),
            Some("https://k@o.ingest.sentry.io/1")
        );
    }

    /// A settings store with no consent key written — the fresh-install state.
    #[test]
    fn a_fresh_settings_file_reports_no_consent() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (settings, _) = SettingsStore::load(dir.path().join("config.json"));

        assert!(!settings.telemetry_enabled());
        assert!(init(&settings).is_none(), "nothing may initialise");
    }

    /// Consent written but false is still not consent, which is what a strict
    /// `=== true` buys over a truthiness check.
    #[test]
    fn consent_explicitly_declined_is_not_consent() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (settings, _) = SettingsStore::load(dir.path().join("config.json"));
        settings
            .set(
                shiranami_core::store::RendererStoreKey::AppTelemetryEnabled,
                json!(false),
            )
            .expect("the settings file writes");

        assert!(!settings.telemetry_enabled());
        assert!(init(&settings).is_none());
    }

    /// Consent granted, but this is a debug test binary and therefore not
    /// packaged, so the second clause still refuses. That is the property that
    /// keeps `cargo test` from reporting into the production project.
    #[test]
    fn consent_in_an_unpackaged_build_still_does_not_initialise() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (settings, _) = SettingsStore::load(dir.path().join("config.json"));
        settings
            .set(
                shiranami_core::store::RendererStoreKey::AppTelemetryEnabled,
                json!(true),
            )
            .expect("the settings file writes");

        assert!(settings.telemetry_enabled(), "consent is recorded");
        assert!(
            init(&settings).is_none(),
            "a debug build must not report without SENTRY_FORCE_ENABLE"
        );
    }

    /// The scrubbers are wired to the right hooks. Proven on the values rather
    /// than through a client, which would need a DSN and a network.
    #[test]
    fn an_event_is_scrubbed_and_never_dropped() {
        let mut event = sentry::protocol::Event::new();
        event.message = Some("crash in /Users/alice/app/index.js".to_owned());
        event
            .extra
            .insert("cwd".to_owned(), json!("/Users/alice/app"));
        event
            .tags
            .insert("config".to_owned(), r"C:\Users\alice\cfg.json".to_owned());

        let scrubbed = scrub_event(event);

        assert_eq!(scrubbed.message.as_deref(), Some("crash in ~/app/index.js"));
        assert_eq!(scrubbed.extra["cwd"], json!("~/app"));
        assert_eq!(scrubbed.tags["config"], r"~\cfg.json");
    }

    /// v1's one drop rule, and its boundary: only `console`, only with a path.
    #[test]
    fn a_console_breadcrumb_carrying_a_path_is_dropped() {
        let mut crumb = sentry::Breadcrumb {
            category: Some("console".to_owned()),
            message: Some("read /Users/alice/x".to_owned()),
            ..Default::default()
        };

        assert!(scrub_breadcrumb(crumb.clone()).is_none());

        // Same category, no path: kept.
        crumb.message = Some("app ready".to_owned());
        assert_eq!(
            scrub_breadcrumb(crumb.clone()).and_then(|kept| kept.message),
            Some("app ready".to_owned())
        );

        // A path, but not a console breadcrumb: kept and scrubbed.
        crumb.category = Some("navigation".to_owned());
        crumb.message = Some("opened /Users/alice/lib".to_owned());
        assert_eq!(
            scrub_breadcrumb(crumb).and_then(|kept| kept.message),
            Some("opened ~/lib".to_owned())
        );
    }
}
