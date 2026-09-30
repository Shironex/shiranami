//! The system tray, driven by `shiranami-media-controls`' tray model.
//!
//! The crate already decides *what* the menu says: [`TrayModel::build`] turns a
//! `MediaState` into an item list and a tooltip, and [`TrayView::apply`] returns
//! `Some` **only when the menu actually changed**. That split is the whole
//! reason the tray is testable at all — v1's equivalent held a `Tray` and a
//! `BrowserWindow` in module scope and rebuilt the menu on every playhead tick.
//!
//! What is left here is the half that needs Tauri: turning an item list into a
//! `tauri::menu::Menu`, and routing a click back as a `media:command` event.
//!
//! # The now-playing block appears and disappears
//!
//! v1 prepended five items — title, artist, a separator, play/pause, previous,
//! next — only when something was playing, and `TrayModel` reproduces that. So
//! the menu is **rebuilt**, not mutated: Tauri has no "insert item at index",
//! and a menu that only ever grew would leave a stale title up after the queue
//! emptied.
//!
//! # Who calls `update`, and in which language
//!
//! [`Tray::update`] is driven from `crate::adapters::MediaFanOut`, the same
//! `crate::seam::MediaControls` value `media:playback-state` publishes to, so
//! the OS media surface, this menu and the Windows taskbar bar are three
//! renderings of one push. The labels come from `app.language`, the tag the
//! renderer persists to the settings store, read at install and followed on
//! the settings bus by [`watch_language`].
//!
//! # Every action is the same event the media keys send
//!
//! `TrayItemId::command` maps each action to a `MediaCommand`, which is what the
//! global shortcuts and souvlaki's remote-command surface also produce. All
//! three arrive at the renderer as `media:command` carrying a bare string —
//! v1's channel and v1's payload — so the renderer's switch does not know or
//! care which one fired.

use std::sync::Mutex;

use shiranami_core::store::{RendererStoreKey, SettingsStore};
use shiranami_media_controls::tray::{TrayItem, TrayItemId, TrayLabels, TrayModel, TrayView};
use shiranami_media_controls::{MediaCommand, MediaState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager as _};

/// The live tray, and the view that decides when to rebuild it.
pub struct Tray {
    icon: tauri::tray::TrayIcon,
    inner: Mutex<Inner>,
}

/// The view, and the state it last drew, so a language change can redraw the
/// same menu in new words without waiting for the next push.
struct Inner {
    view: TrayView,
    last: MediaState,
    /// The newest model not drawn yet. The draw runs later on the main thread
    /// and takes whatever is here then, so a playback push and a language
    /// change racing each other cannot leave the older model on screen.
    pending: Option<TrayModel>,
}

impl Tray {
    /// Show a tray icon with the idle menu, in the given language.
    ///
    /// # Errors
    ///
    /// Whatever Tauri refused. The caller logs and carries on: v1 wrapped
    /// `createTray` in its own try/catch for the same reason — a desktop
    /// environment with no tray is a degraded app, not a failed launch.
    pub fn install(app: &AppHandle, labels: TrayLabels) -> tauri::Result<Self> {
        let mut view = TrayView::with_labels(labels.clone());
        // `apply` returns `Some` only on a change, and the first call is always
        // a change, so this is the initial model.
        let model = view
            .apply(&MediaState::default())
            .cloned()
            .unwrap_or_else(|| TrayModel::build(&MediaState::default(), &labels));

        let icon = TrayIconBuilder::new()
            .icon(
                app.default_window_icon()
                    .cloned()
                    .ok_or_else(|| tauri::Error::UnknownPath)?,
            )
            .tooltip(&model.tooltip)
            .menu(&build_menu(app, &model)?)
            .show_menu_on_left_click(false)
            .on_menu_event(handle_menu_event)
            .on_tray_icon_event(handle_icon_event)
            .build(app)?;

        Ok(Self {
            icon,
            inner: Mutex::new(Inner {
                view,
                last: MediaState::default(),
                pending: None,
            }),
        })
    }

    /// Re-render the menu for a new playback state.
    ///
    /// A no-op when the model is unchanged, which is the common case: the
    /// renderer pushes state on every playhead tick and only a track change or a
    /// play/pause moves the menu.
    pub fn update(&self, app: &AppHandle, state: &MediaState) {
        {
            let mut inner = self.lock();
            inner.last = state.clone();
            let Some(model) = inner.view.apply(state).cloned() else {
                return;
            };
            inner.pending = Some(model);
        }

        schedule_render(app);
    }

    /// Redraw the current menu with the labels for `language`.
    pub fn set_language(&self, app: &AppHandle, language: Option<&str>) {
        {
            let mut inner = self.lock();
            inner.view.set_labels(TrayLabels::for_language(language));
            let last = inner.last.clone();
            let Some(model) = inner.view.apply(&last).cloned() else {
                return;
            };
            inner.pending = Some(model);
        }

        schedule_render(app);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Draw the newest pending model, if another draw has not already.
    ///
    /// Main thread only, via [`schedule_render`]: the jobs run one at a time in
    /// the order they were queued, and each draws the latest model, so the last
    /// one to run always shows the newest state. The lock is released before
    /// drawing because the tray setters wait on the main thread.
    fn render(&self, app: &AppHandle) {
        let Some(model) = self.lock().pending.take() else {
            return;
        };

        if let Err(error) = self.icon.set_tooltip(Some(&model.tooltip)) {
            tracing::warn!(%error, "could not update the tray tooltip");
        }

        match build_menu(app, &model) {
            Ok(menu) => {
                if let Err(error) = self.icon.set_menu(Some(menu)) {
                    tracing::warn!(%error, "could not update the tray menu");
                }
            }
            Err(error) => tracing::warn!(%error, "could not build the tray menu"),
        }
    }
}

/// Queue a tray draw on the main thread.
///
/// Called with the `Inner` lock released: on the main thread the job runs
/// inline, and it takes that lock itself.
fn schedule_render(app: &AppHandle) {
    let handle = app.clone();
    let queued = app.run_on_main_thread(move || {
        if let Some(tray) = handle.try_state::<Tray>() {
            tray.render(&handle);
        }
    });
    if let Err(error) = queued {
        // Only once the event loop is gone, that is while quitting.
        tracing::debug!(%error, "could not queue a tray redraw");
    }
}

/// The tray labels for the language stored right now.
pub fn labels(settings: &SettingsStore) -> TrayLabels {
    TrayLabels::for_language(language(settings.get(RendererStoreKey::AppLanguage)).as_deref())
}

fn language(value: Option<serde_json::Value>) -> Option<String> {
    value.and_then(|value| value.as_str().map(str::to_owned))
}

/// Follow `app.language` so the tray switches language with the window.
///
/// The tray is looked up per change rather than captured, because it is
/// managed state that may be absent (a desktop with no tray, or the harness).
pub fn watch_language(app: &AppHandle, settings: &SettingsStore) {
    let app = app.clone();
    settings
        .bus()
        .subscribe(RendererStoreKey::AppLanguage.path(), move |event| {
            if let Some(tray) = app.try_state::<Tray>() {
                tray.set_language(&app, language(event.current.clone()).as_deref());
            }
        });
}

/// Turn the crate's item list into a Tauri menu.
fn build_menu(app: &AppHandle, model: &TrayModel) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    for item in &model.items {
        match item {
            TrayItem::Separator => menu.append(&PredefinedMenuItem::separator(app)?)?,
            // v1's title and artist rows are labels: `enabled: false`, so they
            // read as information rather than as something to click.
            TrayItem::Text { label } => {
                menu.append(&MenuItem::with_id(app, label, label, false, None::<&str>)?)?;
            }
            TrayItem::Action { id, label } => {
                menu.append(&MenuItem::with_id(
                    app,
                    id.as_str(),
                    label,
                    true,
                    None::<&str>,
                )?)?;
            }
        }
    }

    Ok(menu)
}

/// Route a menu click.
///
/// The two non-media items are the shell's own: "Show Shiranami" raises the
/// window and "Quit" exits. Everything else becomes a `media:command`.
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let Some(id) = TrayItemId::from_str(&event.id().0) else {
        // A disabled label cannot be clicked, so this is only reachable if the
        // model grows an id the crate has not been taught.
        return;
    };

    match id {
        TrayItemId::Show => crate::focus_main_window(app),
        TrayItemId::Quit => crate::system::quit(app),
        other => send_command(app, other.command()),
    }
}

/// v1 raised the window on a plain left click, on every platform.
fn handle_icon_event(icon: &tauri::tray::TrayIcon, event: tauri::tray::TrayIconEvent) {
    if let tauri::tray::TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        crate::focus_main_window(icon.app_handle());
    }
}

/// Emit `media:command`, the one channel every remote surface shares.
pub fn send_command(app: &AppHandle, command: MediaCommand) {
    let Some(payload) = crate::commands::media::remote_command_payload(&command) else {
        // A command with no v1 wire spelling. Dropped rather than invented:
        // the renderer's switch has no branch for a string it has never seen.
        tracing::debug!(?command, "no renderer payload for this remote command");
        return;
    };

    use tauri_specta::Event as _;
    if let Err(error) = crate::events::MediaCommand(payload).emit(app) {
        tracing::warn!(%error, "a media command did not reach the webview");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every action the model can produce maps to a command, and every command
    /// the tray sends has a renderer payload. Without both halves a menu entry
    /// would be clickable and do nothing.
    #[test]
    fn every_tray_action_reaches_the_renderer() {
        for id in TrayItemId::ALL {
            match id {
                // The two the shell handles itself.
                TrayItemId::Show | TrayItemId::Quit => {}
                other => {
                    assert!(
                        crate::commands::media::remote_command_payload(&other.command()).is_some(),
                        "{other:?} has no wire payload, so its menu entry would do nothing"
                    );
                }
            }
        }
    }

    /// The menu is rebuilt rather than mutated, and `TrayView` is what decides
    /// when. Asserted on the crate's own behaviour because this module's
    /// `update` is a no-op whenever `apply` returns `None`, and a view that
    /// always answered `Some` would rebuild the menu on every playhead tick.
    #[test]
    fn an_unchanged_state_does_not_rebuild_the_menu() {
        let mut view = TrayView::new();
        let state = MediaState::default();

        assert!(view.apply(&state).is_some(), "the first apply is a change");
        assert!(
            view.apply(&state).is_none(),
            "the same state twice must not produce a rebuild"
        );
    }
}
