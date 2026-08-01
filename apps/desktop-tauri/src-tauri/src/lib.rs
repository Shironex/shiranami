//! Composition root for the Shiranami desktop shell.
//!
//! This crate is wiring only: it registers plugins, builds managed state and
//! exposes the command surface. All behaviour lives in the `shiranami-*`
//! crates, which is why every one of them is a dependency here and none of
//! them depends on this crate.
//!
//! Boot order is load-bearing (`docs/v2/architecture.md` §2.8) and lives in
//! [`boot::sequence`]. [`run`] below is the plugin registration and the event
//! wiring around it — everything with an *order* to it is one function call
//! away, so this file cannot become a second, competing definition of the
//! sequence.

pub mod adapters;
pub mod arch_guards;
pub mod bindings;
pub mod boot;
pub mod commands;
pub mod compact;
pub mod deep_link;
pub mod discover;
pub mod downloads;
pub mod error;
pub mod events;
pub mod folders;
pub mod infra;
pub mod media;
pub mod paths;
pub mod seam;
pub mod shortcuts;
pub mod state;
pub mod tray;
pub mod updater;
pub mod window;
pub mod wire;

use tauri::Manager as _;

/// Builds and runs the desktop shell. Blocks until the app exits.
///
/// # Registration order is a §2.8 obligation, not a style choice
///
/// `tauri-plugin-single-instance` is **first**, twice over: the plugin
/// documents the requirement, and two processes racing `shiranami.db` and the
/// settings file is a data-loss bug. Everything else follows step 4's list.
///
/// The Sentry plugin is registered *conditionally*, from a decision
/// [`boot::sequence::preflight`] already made before this function ran — §2.8
/// step 3 requires skipping it entirely when consent is absent, because the
/// plugin injects a browser-side SDK into the webview and a no-op DSN is not
/// enough.
pub fn run() {
    // Everything that must precede the builder: PATH hydration, logging,
    // settings, and the consent read that decides the next line.
    let mut preflight = boot::sequence::preflight();
    // The live client, if consent produced one. Taken as a value rather than a
    // boolean because the plugin needs the client itself.
    let sentry_enabled = sentry::Hub::current()
        .client()
        .filter(|_| preflight.sentry.is_some());
    let e2e = preflight.e2e;

    // One builder, shared: `invoke_handler` and `mount_events` must come from
    // the same instance the bindings were exported from, or the renderer calls
    // names the handler does not answer to.
    let specta = bindings::builder();

    // The webview's pre-page script: `__SHIRANAMI_E2E__`, the mediaSession
    // suppression (D10), and §3.5's `localStorage` seed when a v1 dump was
    // migrated.
    //
    // It is delivered as a **plugin** because `tauri.conf.json` declares the
    // main window, so Tauri builds it during `build()` and there is no
    // `WebviewWindowBuilder` here to hang an `initialization_script` on.
    // `plugin::Builder::js_init_script` injects into every webview with the
    // same before-any-page-script timing, which is the property
    // `bridge/environment.ts` depends on — it reads both globals synchronously
    // at module scope, long before an `invoke` could answer.
    //
    // Phase 16 wrote `window::initialization_script` and never called it, so
    // until now neither global reached the webview and the renderer's
    // mediaSession was still live.
    let mut init_script = window::initialization_script(e2e);
    if let Some(seed) = preflight.renderer_seed.take() {
        init_script.push('\n');
        init_script.push_str(&seed);
    }

    let mut builder = tauri::Builder::default()
        // First, and for two independent reasons. See the doc above.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch may carry a `shiranami://` link in its argv, which
            // is how Windows and Linux deliver one to a running app.
            deep_link::on_second_instance(app, &args);
        }))
        .plugin(
            // The `C` parameter is the plugin's `tauri.conf.json` config
            // section. `()` says "this plugin has none" — which matters: a
            // plugin with an inferred config type would fail the builder the
            // way `tauri-plugin-updater` did when its section was absent.
            tauri::plugin::Builder::<tauri::Wry, ()>::new("shiranami-init")
                .js_init_script(init_script)
                .build(),
        );

    // The updater plugin is registered only on a build that has one, behind the
    // *same* predicate `crate::updater::build` uses — so "the plugin is loaded"
    // and "the seam is filled" cannot disagree.
    //
    // This is not an optimisation. `tauri_plugin_updater` deserializes
    // `plugins.updater` from `tauri.conf.json` at init and **fails the whole
    // builder** when the key is absent: `invalid type: null, expected struct
    // Config`. That section carries the endpoints and the minisign public key,
    // which Phase 19 provisions — so until it does, registering this plugin
    // unconditionally means no build starts at all, on any platform. Found by
    // the first `pnpm tauri:dev` boot.
    if updater::is_supported(e2e) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    if let Some(client) = sentry_enabled {
        // Only when consent, packaging and a DSN all agreed.
        //
        // `init_with_no_injection` rather than `init`: the injecting variant
        // installs a browser-side Sentry SDK into the webview, which would
        // report the renderer's errors under the same consent the user gave for
        // *crash* reporting, and would do it through a second client this
        // process does not scrub through `core::scrub`. The Rust client covers
        // the backend, which is what §2.2 #5 asks for.
        builder = builder.plugin(tauri_plugin_sentry::init_with_no_injection(client.as_ref()));
    }

    let app = builder
        // §2.8 step 4's remaining plugins, in its order. Deep-link comes
        // straight after single-instance, because the cold-start and
        // second-instance paths are the same mechanism.
        .plugin(tauri_plugin_deep_link::init())
        // Both dialog and opener are reached from Rust only:
        // `capabilities/default.json` grants neither its JS permission, so the
        // webview cannot call `open_path` or open a picker except through a
        // command that validates the argument first. Granting `opener:default`
        // would hand the renderer an unguarded `reveal_item_in_dir` and make
        // `crate::paths::ensure_allowed` decorative.
        .plugin(tauri_plugin_dialog::init())
        // The click interceptor is off for the same reason: it is the plugin's
        // one webview-reachable behaviour, and nothing in the renderer opens
        // external links through an `<a target="_blank">`.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        // `tauri-plugin-os` gives the shim an exact platform string. Its
        // `bridge/environment.ts` currently sniffs the user agent and documents
        // that as a stand-in "until Phase 16 registers the plugin".
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Phase 14 lane 6's two holders. Unlike `AppState` these open nothing
        // and order against nothing — both are `Default` and purely in-memory.
        .manage(compact::CompactModeState::default())
        .manage(commands::debug::DebugSampler::default())
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            // Required for the typed events to be addressable from the webview.
            specta.mount_events(app);

            let handle = app.handle().clone();

            // `block_on` is correct *here* and almost nowhere else: `setup` runs
            // on the main thread before the event loop starts, so it is not a
            // runtime worker and nothing is waiting on it. Every stage below has
            // to complete before the first command can be answered.
            let booted = match tauri::async_runtime::block_on(boot::sequence::finish(
                &handle,
                &mut preflight,
            )) {
                Ok(booted) => booted,
                // §3.1 step 7. The refusal was already true — an `Err` here
                // aborts `build()` — but it was silent: a user who
                // double-clicked an icon has no stderr to read the panic
                // on, so the app simply failed to appear. The dialog is
                // what makes "refuse to start" a *clear* error rather than
                // an absent one.
                Err(error) => {
                    boot::refuse::refuse_to_start(&handle, &error);
                    return Err(Box::new(error));
                }
            };

            let folders = std::sync::Arc::clone(&booted.folders);
            app.manage(booted.state);
            app.manage(folders);
            // The three cancel slots. Without these, `library:scan-cancel`,
            // `metadata:enrich-cancel` and `audio:loudness-cancel` fail at
            // runtime with "state not managed" — an accumulated Phase 16
            // obligation, and one with no compile-time signal at all.
            app.manage(commands::library::ScanSlot::default());
            app.manage(commands::metadata::EnrichRuns::default());
            app.manage(commands::loudness::LoudnessRuns::default());
            // Keeps the log appender's worker and the Sentry client alive for
            // the process's lifetime; both flush on drop.
            app.manage(preflight.logging);
            if let Some(guard) = preflight.sentry.take() {
                app.manage(guard);
            }

            if let Some(main) = app.get_webview_window("main") {
                window::configure(&main);
                preflight.timer.stage(boot::timer::Stage::Window);
            }

            // §1.2's cold-start measurement line.
            preflight.timer.finish();

            // §2.8 step 7: no tray, no media keys, no Discord, no updater.
            if !e2e {
                match tray::Tray::install(&handle) {
                    Ok(tray) => {
                        app.manage(tray);
                    }
                    // v1 wrapped `createTray` in its own try/catch: a desktop
                    // environment with no tray is a degraded app, not a failed
                    // launch.
                    Err(error) => tracing::warn!(%error, "could not create the tray"),
                }
            }
            shortcuts::register(&handle, e2e);
            deep_link::register(&handle);

            // v1 never handled a cold-start deep link — its argv scan lived in
            // the `second-instance` handler only — so clicking a share link with
            // the app closed opened the app and dropped the link.
            if let Some(url) = deep_link::initial_argument() {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    deep_link::dispatch(&handle, &url);
                });
            }

            // §2.8 step 6: everything with no first-paint dependency.
            boot::reconcile::spawn(&handle, e2e, &booted.handles);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start the Shiranami desktop shell");

    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            shutdown(app);
        }
    });
}

/// Stop the loopback server on the way out.
///
/// §2.4 makes this the server's documented lifetime: *"started in `setup()` …
/// shut down on `ExitRequested`"*. Nothing else needs unwinding — the download
/// queue's children carry `kill_on_drop(true)` (R20) and every background task
/// is a runtime task the process is about to drop.
fn shutdown(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<state::AppState>() else {
        return;
    };
    let Some(serve) = state.deferred().serve.clone() else {
        return;
    };

    // `ServeHandle::shutdown` consumes `self`, and `Deferred` holds it behind an
    // `Arc` so a command can read the base URL. Unwrapping the `Arc` is the only
    // way to call it, and it succeeds exactly when nothing else holds a
    // reference — which at exit is the normal case. When it does not, dropping
    // the process takes the listener with it a moment later, so a missed
    // graceful shutdown costs an in-flight range request that was about to be
    // cancelled anyway.
    match std::sync::Arc::try_unwrap(serve) {
        Ok(handle) => tauri::async_runtime::block_on(handle.shutdown()),
        Err(_) => {
            tracing::debug!("the media server is still referenced; leaving it to process exit")
        }
    }
}

/// Brings the existing main window back to the foreground.
fn focus_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // A window that refuses to focus is not worth aborting a launch over.
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
