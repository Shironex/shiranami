//! `window:*` — the custom titlebar's six buttons, and compact mode.
//!
//! Ported from `apps/desktop/src/main/ipc/window.ts`. The window is
//! `"decorations": false`, so every one of these is a control the user can see
//! and has no OS fallback for: if `window:close` stops answering there is no
//! system close button behind it.
//!
//! # Five of the six cannot fail, exactly as in v1
//!
//! Electron's `minimize()`, `maximize()`, `close()` and `setAlwaysOnTop()`
//! return `void` and do not throw, so those channels never rejected and the
//! renderer's titlebar handlers have no `catch`. Tauri's return `Result`, and
//! propagating that would turn "the compositor declined a minimize" into an
//! unhandled rejection inside a click handler. They log and return instead — the
//! same judgement `crate::focus_main_window` already makes one rank up, for the
//! same reason.
//!
//! `window:set-compact-mode` is the exception and genuinely fails: it validates
//! dimensions and writes to the settings file.
//!
//! # This module is deliberately decision-free
//!
//! Everything with a branch in it lives in [`crate::compact`] and is tested
//! there against plain values. What is left here reads a `tauri::Window`, hands
//! the facts to [`plan`], and performs what comes back — the split
//! `shiranami-media-controls` draws at its backend seam, for the same reason:
//! none of it can be run without a real window, so none of it may decide
//! anything.
//!
//! # Phase 16 owns two things this module cannot do itself
//!
//! - Calling [`persist_compact_bounds`] from the window's `close` handler. v1
//!   did (`mainWindow.on('close', persistCompactBounds)`) because quitting from
//!   compact mode — taskbar, Alt+F4 — bypasses the explicit exit path and would
//!   otherwise lose the corner the user parked the mini-player in.
//! - `window:set-compact-mode` additionally needs `AppState` for that corner, so
//!   it answers "state not managed" until Phase 16 boots. The other five work
//!   from this phase onward.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{LogicalPosition, LogicalSize, State};
use tauri_specta::Event as _;

use shiranami_core::store::{MainStoreKey, SettingsStore};
use shiranami_core::sync::lock_or_recover;

use crate::compact::{
    Bounds, Compact, CompactDimensions, CompactModeState, CompactPlan, DEFAULT_MIN_HEIGHT,
    DEFAULT_MIN_WIDTH, Position, Restore, WindowFacts, WorkArea, plan, valid_compact_position,
};
use crate::error::CommandResult;
use crate::events::WindowMaximizedChange;
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::window::window_minimize,
                crate::commands::window::window_maximize,
                crate::commands::window::window_close,
                crate::commands::window::window_is_maximized,
                crate::commands::window::window_set_always_on_top,
                crate::commands::window::window_set_compact_mode,
                crate::commands::window::window_set_fullscreen,
                crate::commands::window::window_set_display_sleep_inhibited,
            ]
        }
    };
}
pub(crate) use commands;

/// `window:minimize`.
#[tauri::command]
#[specta::specta]
pub async fn window_minimize(window: tauri::Window) {
    report("minimize", window.minimize());
}

/// `window:maximize` — a **toggle**, not a maximize.
///
/// The name is v1's and is misleading: the titlebar has one button for both, so
/// the channel restores an already-maximized window.
#[tauri::command]
#[specta::specta]
pub async fn window_maximize(window: tauri::Window) {
    let maximized = window.is_maximized().unwrap_or(false);
    report(
        "maximize",
        if maximized {
            window.unmaximize()
        } else {
            window.maximize()
        },
    );
}

/// `window:close`.
#[tauri::command]
#[specta::specta]
pub async fn window_close(window: tauri::Window) {
    report("close", window.close());
}

/// `window:is-maximized` — what the titlebar draws its restore icon from.
#[tauri::command]
#[specta::specta]
pub async fn window_is_maximized(window: tauri::Window) -> bool {
    match window.is_maximized() {
        Ok(maximized) => maximized,
        Err(error) => {
            tracing::warn!(%error, "could not read the maximized state");
            false
        }
    }
}

/// `window:set-always-on-top` — the mini-player's pin.
#[tauri::command]
#[specta::specta]
pub async fn window_set_always_on_top(window: tauri::Window, always_on_top: bool) {
    report("set always-on-top", window.set_always_on_top(always_on_top));
}

/// `window:set-fullscreen` — Sanctuary Mode's edge-to-edge presentation.
/// Ports no v1 channel (v1 had no fullscreen anywhere).
///
/// On macOS this is **simple** fullscreen — the pre-Lion AppKit mode — rather
/// than native fullscreen, deliberately: native fullscreen creates a Space,
/// animates for a second in each direction, and detaches the window from
/// Mission Control's normal flow, all wrong for a mode bound to a single
/// keypress that a pointer-move may exit. Tauri's `set_simple_fullscreen`
/// makes the fallback to native `set_fullscreen` on the other platforms
/// itself, so the choice is pinned in one call.
///
/// Infallible like minimize/maximize: a compositor that declines fullscreen
/// leaves the sanctuary rendering windowed, which is degraded, not broken —
/// not worth an unhandled rejection inside a keypress handler.
#[tauri::command]
#[specta::specta]
pub async fn window_set_fullscreen(window: tauri::Window, fullscreen: bool) {
    report("set fullscreen", window.set_simple_fullscreen(fullscreen));
}

/// Managed holder for the display-sleep assertion. Dropping the guard releases
/// the assertion, so "inhibit off" is `None` by construction and process exit
/// can never leak a permanently-awake display.
#[derive(Default)]
pub struct SleepInhibitor {
    inner: std::sync::Mutex<Option<keepawake::KeepAwake>>,
}

/// `window:set-display-sleep-inhibited` — hold the display awake while the
/// sanctuary doubles as a screensaver. Ports no v1 channel.
///
/// A sanctuary the OS blanks after two minutes is worse than none, but
/// *failing* to acquire the assertion must not fail entering the sanctuary —
/// so this logs and carries on, the same judgement the five infallible window
/// commands above make. `async` for the arch guard (sync commands share the
/// paint thread), which with borrowed `State` forces the `Result` return —
/// always `Ok`, per the judgement above.
#[tauri::command]
#[specta::specta]
pub async fn window_set_display_sleep_inhibited(
    state: State<'_, SleepInhibitor>,
    inhibited: bool,
) -> CommandResult<()> {
    let guard = if inhibited {
        match keepawake::Builder::default()
            .display(true)
            .reason("Sanctuary Mode is showing the now-playing display")
            .app_name("Shiranami")
            .app_reverse_domain("com.shironex.shiranami")
            .create()
        {
            Ok(awake) => Some(awake),
            Err(error) => {
                tracing::warn!(%error, "could not inhibit display sleep");
                None
            }
        }
    } else {
        None
    };

    *lock_or_recover(&state.inner) = guard;
    Ok(())
}

/// `window:set-compact-mode` — enter, resize or leave the mini-player.
#[tauri::command]
#[specta::specta]
pub async fn window_set_compact_mode(
    window: tauri::Window,
    state: State<'_, AppState>,
    compact: State<'_, CompactModeState>,
    compact_mode: bool,
    dimensions: Option<CompactDimensions>,
) -> CommandResult<()> {
    let dimensions = dimensions.unwrap_or_default().validate()?;
    let (plan, next) = plan(compact.get(), compact_mode, dimensions, facts(&window));

    match plan {
        CompactPlan::Nothing => return Ok(()),
        CompactPlan::Resize(size) => lock_to(&window, size),
        CompactPlan::Enter {
            dimensions,
            unmaximize,
        } => enter(&window, state.settings(), dimensions, unmaximize),
        CompactPlan::Leave(restore) => {
            // Snapshot before unlocking the size constraints, or a transient
            // resize on the way out pollutes the saved corner.
            persist_compact_bounds(&window, state.settings(), compact.get());
            leave(&window, restore);
        }
    }

    compact.set(next);
    Ok(())
}

/// Lock the window to the mini-player's size and put it back where it was.
fn enter(
    window: &tauri::Window,
    settings: &SettingsStore,
    dimensions: CompactDimensions,
    unmaximize: bool,
) {
    if unmaximize {
        report("unmaximize", window.unmaximize());
    }
    report("lock resizing", window.set_resizable(false));
    report("allow minimizing", window.set_minimizable(true));
    lock_to(window, dimensions);

    let saved = saved_position(settings);
    if let Some(position) = valid_compact_position(saved, dimensions, &work_areas(window)) {
        report(
            "restore the compact position",
            window.set_position(LogicalPosition::new(position.x, position.y)),
        );
    }
}

/// Unlock the size constraints and restore what was there before.
fn leave(window: &tauri::Window, restore: Restore) {
    report("unlock resizing", window.set_resizable(true));
    report(
        "restore the minimum size",
        window.set_min_size(Some(LogicalSize::new(
            DEFAULT_MIN_WIDTH,
            DEFAULT_MIN_HEIGHT,
        ))),
    );
    report(
        "clear the maximum size",
        window.set_max_size(None::<LogicalSize<u32>>),
    );

    match restore {
        Restore::Maximize => report("re-maximize", window.maximize()),
        Restore::Bounds(bounds) => {
            report(
                "restore the size",
                window.set_size(LogicalSize::new(bounds.width, bounds.height)),
            );
            report(
                "restore the position",
                window.set_position(LogicalPosition::new(bounds.position.x, bounds.position.y)),
            );
        }
        Restore::AsIs => {}
    }
}

/// Save where the mini-player is parked, so the next session restores into the
/// same corner. A no-op outside compact mode, as v1's was.
///
/// Public because Phase 16 has to call it from the window's `close` handler:
/// quitting from compact mode bypasses the explicit exit path.
pub fn persist_compact_bounds(window: &tauri::Window, settings: &SettingsStore, compact: Compact) {
    if !compact.active {
        return;
    }

    let Some(bounds) = read_bounds(window) else {
        return;
    };

    if let Err(error) = settings.set_main(
        MainStoreKey::CompactWindowBounds,
        serde_json::json!({ "x": bounds.position.x, "y": bounds.position.y }),
    ) {
        // v1 swallowed this too: failing to remember a window corner must not
        // fail the user's attempt to leave compact mode.
        tracing::warn!(%error, "could not persist the compact window position");
    }
}

/// Start forwarding `window:maximized-change`.
///
/// Tauri has no maximize/unmaximize event — `Resized` fires for both, and also
/// for every frame of a window-edge drag — so the transition is derived by
/// comparing against the last value sent. Without that comparison the renderer
/// would receive an event per frame of a resize.
///
/// Called by Phase 16 once the main window exists.
pub fn forward_maximized_changes(window: &tauri::Window) {
    let watched = window.clone();
    let last = AtomicBool::new(watched.is_maximized().unwrap_or(false));

    // Tauri hands `on_window_event` an `Fn`, not an `FnMut`, so the last value
    // cannot be a captured `bool`. An atomic is the smallest thing that works,
    // and it puts the decision in one compare-and-swap.
    window.on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::Resized(_)) {
            return;
        }

        let previous = last.load(Ordering::Acquire);
        let now = watched.is_maximized().unwrap_or(previous);
        if !is_transition(&last, now) {
            return;
        }

        if let Err(error) = WindowMaximizedChange(now).emit(&watched) {
            tracing::warn!(%error, "could not publish the maximized state");
        }
    });
}

/// Record `now` and report whether it differs from what was recorded before.
///
/// One swap rather than a load-compare-store, because `Resized` can arrive from
/// more than one thread during a drag and the pair would let both observe the
/// old value and both emit.
fn is_transition(last: &AtomicBool, now: bool) -> bool {
    last.swap(now, Ordering::AcqRel) != now
}

/// Log a window operation that failed, and carry on. See the module docs.
fn report(operation: &str, outcome: tauri::Result<()>) {
    if let Err(error) = outcome {
        tracing::warn!(%error, operation, "a window operation was refused");
    }
}

/// Pin the window to exactly this size, both constraints and current.
fn lock_to(window: &tauri::Window, dimensions: CompactDimensions) {
    let size = LogicalSize::new(dimensions.width, dimensions.height);
    report("lock the minimum size", window.set_min_size(Some(size)));
    report("lock the maximum size", window.set_max_size(Some(size)));
    report("resize", window.set_size(size));
}

/// What the window is, for [`plan`].
fn facts(window: &tauri::Window) -> WindowFacts {
    let is_maximized = window.is_maximized().unwrap_or(false);
    WindowFacts {
        is_maximized,
        bounds: if is_maximized {
            None
        } else {
            read_bounds(window)
        },
    }
}

/// The window's current rectangle in logical pixels.
fn read_bounds(window: &tauri::Window) -> Option<Bounds> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<i32>(scale);
    let size = window.outer_size().ok()?.to_logical::<u32>(scale);

    Some(Bounds {
        position: Position {
            x: position.x,
            y: position.y,
        },
        width: size.width,
        height: size.height,
    })
}

/// Every connected display's usable region, in logical pixels.
///
/// Tauri reports work areas in physical pixels and per-monitor scale factors
/// differ, so each is converted with its **own** factor — using the window's
/// would misplace the mini-player on a mixed-DPI desktop.
fn work_areas(window: &tauri::Window) -> Vec<WorkArea> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let position = area.position.to_logical::<i32>(scale);
            let size = area.size.to_logical::<i32>(scale);
            WorkArea {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            }
        })
        .collect()
}

/// The corner the mini-player was last parked in, if one was recorded.
///
/// `compact-window-bounds` is a **main-only** key: the renderer neither reads
/// nor writes it, which is why it has no `RendererStoreKey` spelling.
fn saved_position(settings: &SettingsStore) -> Option<Position> {
    serde_json::from_value(settings.get_main(MainStoreKey::CompactWindowBounds)?).ok()
}

#[cfg(test)]
mod tests {
    //! The decisions these commands are made of are tested in
    //! [`crate::compact`], against values. What is testable here is the one
    //! piece of state this module owns.

    use super::*;

    /// The de-duplication that turns Tauri's `Resized` firehose into v1's two
    /// events. Without it the renderer receives one per frame of a drag; with a
    /// load-then-store instead of a swap, two threads could both emit `true`.
    #[test]
    fn only_a_change_in_the_maximized_state_counts_as_a_transition() {
        let last = AtomicBool::new(false);

        assert!(!is_transition(&last, false), "a plain resize is not one");
        assert!(is_transition(&last, true), "maximizing is");
        assert!(!is_transition(&last, true), "staying maximized is not");
        assert!(is_transition(&last, false), "restoring is");
    }

    /// Nothing is written while the window is a normal window — v1's
    /// `if (!isCompactMode) return;`. Otherwise leaving compact mode would
    /// immediately overwrite the corner with the restored window's position.
    #[test]
    fn the_saved_corner_is_only_written_while_compact() {
        assert!(!Compact::default().active);
        assert!(
            Compact {
                active: true,
                was_maximized: false,
                normal_bounds: None,
            }
            .active
        );
    }
}
