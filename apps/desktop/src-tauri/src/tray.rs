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
//! # Every action is the same event the media keys send
//!
//! `TrayItemId::command` maps each action to a `MediaCommand`, which is what the
//! global shortcuts and souvlaki's remote-command surface also produce. All
//! three arrive at the renderer as `media:command` carrying a bare string —
//! v1's channel and v1's payload — so the renderer's switch does not know or
//! care which one fired.

use std::sync::Mutex;

use shiranami_media_controls::tray::{TrayItem, TrayItemId, TrayModel, TrayView};
use shiranami_media_controls::{MediaCommand, MediaState};
use tauri::AppHandle;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;

/// The live tray, and the view that decides when to rebuild it.
pub struct Tray {
    icon: tauri::tray::TrayIcon,
    view: Mutex<TrayView>,
}

impl Tray {
    /// Show a tray icon with the idle menu.
    ///
    /// # Errors
    ///
    /// Whatever Tauri refused. The caller logs and carries on: v1 wrapped
    /// `createTray` in its own try/catch for the same reason — a desktop
    /// environment with no tray is a degraded app, not a failed launch.
    pub fn install(app: &AppHandle) -> tauri::Result<Self> {
        let mut view = TrayView::new();
        // `apply` returns `Some` only on a change, and the first call is always
        // a change, so this is the initial model.
        let model = view
            .apply(&MediaState::default())
            .cloned()
            .unwrap_or_else(|| TrayModel::build(&MediaState::default(), &Default::default()));

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
            view: Mutex::new(view),
        })
    }

    /// Re-render the menu for a new playback state.
    ///
    /// A no-op when the model is unchanged, which is the common case: the
    /// renderer pushes state on every playhead tick and only a track change or a
    /// play/pause moves the menu.
    pub fn update(&self, app: &AppHandle, state: &MediaState) {
        let model = {
            let mut view = self
                .view
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            view.apply(state).cloned()
        };

        let Some(model) = model else {
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
        TrayItemId::Quit => app.exit(0),
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
