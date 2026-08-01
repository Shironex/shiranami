//! v1's tray menu, as a value.
//!
//! The menu is a pure function of the playback state, so it is modelled as one
//! here and the `tauri::tray` wiring — icons, template images, the click
//! handler — is left to Phase 16. That split is what makes "the tray shows the
//! right thing" a `cargo test` rather than a thing somebody checks by looking at
//! their menu bar.
//!
//! # The menu, exactly as v1 built it
//!
//! From `apps/desktop/src/main/app/tray.ts`, in order:
//!
//! ```text
//! ┌─ (only while a track is loaded)
//! │  <title>                 disabled, display only
//! │  <artist>                disabled, display only
//! │  ─────────
//! │  Play / Pause            → 'toggle-play'
//! │  Previous                → 'previous'
//! │  Next                    → 'next'
//! │  ─────────
//! └─
//!    Show Shiranami          → show + focus the window
//!    ─────────
//!    Quit                    → app.quit()
//! ```
//!
//! Tooltip: `Shiranami`, or `Shiranami - <title> - <artist>` while loaded.
//!
//! # About the labels
//!
//! They are English literals, and that is the faithful port rather than an
//! oversight. v1's main process has no i18n at all — `react-i18next` lives in
//! the renderer and cannot reach across the process boundary, which
//! `packages/shared/src/types/discord.ts` states outright: *"There is no
//! main-process i18n in Shiranami … default template fields ship as literal
//! English strings."* The only localized strings anywhere near this surface are
//! the `settings:sys.*` keys describing the toggles in the settings UI.
//!
//! So [`TrayLabels`] carries v1's six literals as its `Default`, and exists as a
//! struct rather than as `const`s only so that a later phase can hand localized
//! strings in without touching the model. Nothing in v2 has to change for the
//! port to be correct; the seam costs one struct.

use crate::command::MediaCommand;
use crate::state::MediaState;

/// The tooltip base, and the label of the "Show …" item.
pub const APP_NAME: &str = "Shiranami";

/// The visible text of every tray item.
///
/// `Default` is v1's, verbatim. See the module docs for why they are not
/// translation keys.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayLabels {
    /// Shown on the toggle item while paused.
    pub play: String,
    /// Shown on the toggle item while playing.
    pub pause: String,
    /// The previous-track item.
    pub previous: String,
    /// The next-track item.
    pub next: String,
    /// The show-window item.
    pub show: String,
    /// The quit item.
    pub quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            play: "Play".to_owned(),
            pause: "Pause".to_owned(),
            previous: "Previous".to_owned(),
            next: "Next".to_owned(),
            show: format!("Show {APP_NAME}"),
            quit: "Quit".to_owned(),
        }
    }
}

/// Which tray item was clicked.
///
/// Stable identifiers, because `tauri::tray` dispatches on a menu-item id
/// string and matching on a label would break the moment one is translated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayItemId {
    /// Play or pause, whichever the current state is not.
    TogglePlay,
    /// Previous track.
    Previous,
    /// Next track.
    Next,
    /// Show and focus the window.
    Show,
    /// Quit the app.
    Quit,
}

impl TrayItemId {
    /// The id string the shell registers this item under.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TogglePlay => "toggle-play",
            Self::Previous => "previous",
            Self::Next => "next",
            Self::Show => "show",
            Self::Quit => "quit",
        }
    }

    /// What clicking it means.
    ///
    /// The tray and the OS media buttons produce the same commands, so the
    /// shell has one dispatch table rather than two. In v1 these were separate
    /// paths — the tray called `sendMediaCommand` while Show and Quit were
    /// handled inline in `tray.ts` — and [`MediaCommand::is_playback`] is what
    /// keeps that distinction.
    pub fn command(self) -> MediaCommand {
        match self {
            Self::TogglePlay => MediaCommand::TogglePlay,
            Self::Previous => MediaCommand::Previous,
            Self::Next => MediaCommand::Next,
            Self::Show => MediaCommand::Raise,
            Self::Quit => MediaCommand::Quit,
        }
    }
}

/// One row of the tray menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrayItem {
    /// A row that only displays text.
    ///
    /// v1's `{ label, enabled: false }` now-playing rows. Disabled is what makes
    /// them read as a header rather than as something to click.
    Text {
        /// The text.
        label: String,
    },
    /// A divider.
    Separator,
    /// A clickable row.
    Action {
        /// Which item this is.
        id: TrayItemId,
        /// Its visible text.
        label: String,
    },
}

/// The whole tray menu, plus its tooltip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayModel {
    /// The menu rows, in order.
    pub items: Vec<TrayItem>,
    /// The hover tooltip.
    pub tooltip: String,
}

impl TrayModel {
    /// Build the menu for a playback state.
    pub fn build(state: &MediaState, labels: &TrayLabels) -> Self {
        let mut items = Vec::new();

        if let Some(track) = state.track() {
            // v1 pushed `currentState.title` and `.artist` unchanged, including
            // when they were empty. They never are — the metadata pipeline
            // collapses missing tags to UNKNOWN_ARTIST / UNKNOWN_ALBUM before
            // anything reaches the renderer — and inventing a fallback here
            // would put a different string on the tray than in the player.
            items.push(TrayItem::Text {
                label: track.title.clone(),
            });
            items.push(TrayItem::Text {
                label: track.artist.clone(),
            });
            items.push(TrayItem::Separator);
            items.push(TrayItem::Action {
                id: TrayItemId::TogglePlay,
                label: if track.is_playing {
                    labels.pause.clone()
                } else {
                    labels.play.clone()
                },
            });
            items.push(TrayItem::Action {
                id: TrayItemId::Previous,
                label: labels.previous.clone(),
            });
            items.push(TrayItem::Action {
                id: TrayItemId::Next,
                label: labels.next.clone(),
            });
            items.push(TrayItem::Separator);
        }

        items.push(TrayItem::Action {
            id: TrayItemId::Show,
            label: labels.show.clone(),
        });
        items.push(TrayItem::Separator);
        items.push(TrayItem::Action {
            id: TrayItemId::Quit,
            label: labels.quit.clone(),
        });

        Self {
            items,
            tooltip: tooltip(state),
        }
    }

    /// The clickable rows, in order.
    pub fn actions(&self) -> Vec<TrayItemId> {
        self.items
            .iter()
            .filter_map(|item| match item {
                TrayItem::Action { id, .. } => Some(*id),
                TrayItem::Text { .. } | TrayItem::Separator => None,
            })
            .collect()
    }
}

/// v1's `Shiranami` / `Shiranami - <title> - <artist>`.
fn tooltip(state: &MediaState) -> String {
    match state.track() {
        None => APP_NAME.to_owned(),
        Some(track) => format!("{APP_NAME} - {} - {}", track.title, track.artist),
    }
}

/// Tracks what the tray currently shows, so it is rebuilt only when it changed.
///
/// v1 called `Menu.buildFromTemplate` on *every* playback-state push — up to
/// once a second for the whole of every track, to produce a menu that differs
/// only when the title, artist or play/pause label does. Since the throttle
/// upstream already lets structural changes through immediately, comparing here
/// is close to free and removes a per-second allocation and a native menu
/// rebuild. The rendered result is identical; only the number of times it is
/// built changes.
#[derive(Debug, Default)]
pub struct TrayView {
    labels: TrayLabels,
    current: Option<TrayModel>,
}

impl TrayView {
    /// A view using v1's labels.
    pub fn new() -> Self {
        Self::default()
    }

    /// A view using the given labels.
    pub fn with_labels(labels: TrayLabels) -> Self {
        Self {
            labels,
            current: None,
        }
    }

    /// Offer a state, and get the new menu back when it differs.
    pub fn apply(&mut self, state: &MediaState) -> Option<&TrayModel> {
        let next = TrayModel::build(state, &self.labels);

        if self.current.as_ref() == Some(&next) {
            return None;
        }

        Some(self.current.insert(next))
    }

    /// The menu as last built, if it has been.
    pub fn current(&self) -> Option<&TrayModel> {
        self.current.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::playing;

    fn labels() -> TrayLabels {
        TrayLabels::default()
    }

    fn menu(state: &MediaState) -> TrayModel {
        TrayModel::build(state, &labels())
    }

    fn loaded(current_time: f64) -> MediaState {
        MediaState::Loaded(playing(current_time))
    }

    /// v1's labels, verbatim. The main process had no i18n to read them from.
    #[test]
    fn the_default_labels_are_v1s_literals() {
        let labels = labels();

        assert_eq!(labels.play, "Play");
        assert_eq!(labels.pause, "Pause");
        assert_eq!(labels.previous, "Previous");
        assert_eq!(labels.next, "Next");
        assert_eq!(labels.show, "Show Shiranami");
        assert_eq!(labels.quit, "Quit");
    }

    /// v1's idle tray: three rows, no now-playing block.
    #[test]
    fn an_idle_tray_offers_only_show_and_quit() {
        assert_eq!(
            menu(&MediaState::Cleared).items,
            [
                TrayItem::Action {
                    id: TrayItemId::Show,
                    label: "Show Shiranami".to_owned()
                },
                TrayItem::Separator,
                TrayItem::Action {
                    id: TrayItemId::Quit,
                    label: "Quit".to_owned()
                },
            ]
        );
    }

    /// The whole of v1's loaded menu, in order, including both separators.
    #[test]
    fn a_loaded_tray_matches_v1s_template_row_for_row() {
        assert_eq!(
            menu(&loaded(0.0)).items,
            [
                TrayItem::Text {
                    label: "Sakura Nights".to_owned()
                },
                TrayItem::Text {
                    label: "Yumemi".to_owned()
                },
                TrayItem::Separator,
                TrayItem::Action {
                    id: TrayItemId::TogglePlay,
                    label: "Pause".to_owned()
                },
                TrayItem::Action {
                    id: TrayItemId::Previous,
                    label: "Previous".to_owned()
                },
                TrayItem::Action {
                    id: TrayItemId::Next,
                    label: "Next".to_owned()
                },
                TrayItem::Separator,
                TrayItem::Action {
                    id: TrayItemId::Show,
                    label: "Show Shiranami".to_owned()
                },
                TrayItem::Separator,
                TrayItem::Action {
                    id: TrayItemId::Quit,
                    label: "Quit".to_owned()
                },
            ]
        );
    }

    /// v1: `label: currentState.isPlaying ? 'Pause' : 'Play'`. The label is the
    /// action, not the state.
    #[test]
    fn the_toggle_row_is_labelled_with_what_clicking_it_does() {
        let mut paused = playing(0.0);
        paused.is_playing = false;

        assert!(menu(&loaded(0.0)).items.contains(&TrayItem::Action {
            id: TrayItemId::TogglePlay,
            label: "Pause".to_owned()
        }));
        assert!(
            menu(&MediaState::Loaded(paused))
                .items
                .contains(&TrayItem::Action {
                    id: TrayItemId::TogglePlay,
                    label: "Play".to_owned()
                })
        );
    }

    #[test]
    fn the_now_playing_rows_are_text_rather_than_actions() {
        let items = menu(&loaded(0.0)).items;
        assert!(matches!(items.first(), Some(TrayItem::Text { .. })));
        assert!(matches!(items.get(1), Some(TrayItem::Text { .. })));
    }

    #[test]
    fn the_tooltip_names_the_track_only_while_one_is_loaded() {
        assert_eq!(menu(&MediaState::Cleared).tooltip, "Shiranami");
        assert_eq!(
            menu(&loaded(0.0)).tooltip,
            "Shiranami - Sakura Nights - Yumemi"
        );
    }

    #[test]
    fn every_action_maps_to_a_command() {
        for (id, expected) in [
            (TrayItemId::TogglePlay, MediaCommand::TogglePlay),
            (TrayItemId::Previous, MediaCommand::Previous),
            (TrayItemId::Next, MediaCommand::Next),
            (TrayItemId::Show, MediaCommand::Raise),
            (TrayItemId::Quit, MediaCommand::Quit),
        ] {
            assert_eq!(id.command(), expected);
        }
    }

    /// v1 sent `'toggle-play'`, `'previous'`, `'next'` to the renderer and kept
    /// Show and Quit in the main process.
    #[test]
    fn only_the_transport_rows_are_the_renderers_business() {
        let playback: Vec<TrayItemId> = menu(&loaded(0.0))
            .actions()
            .into_iter()
            .filter(|id| id.command().is_playback())
            .collect();

        assert_eq!(
            playback,
            [
                TrayItemId::TogglePlay,
                TrayItemId::Previous,
                TrayItemId::Next
            ]
        );
    }

    #[test]
    fn the_item_ids_are_stable_strings() {
        assert_eq!(TrayItemId::TogglePlay.as_str(), "toggle-play");
        assert_eq!(TrayItemId::Previous.as_str(), "previous");
        assert_eq!(TrayItemId::Next.as_str(), "next");
        assert_eq!(TrayItemId::Show.as_str(), "show");
        assert_eq!(TrayItemId::Quit.as_str(), "quit");
    }

    #[test]
    fn translated_labels_replace_the_text_and_nothing_else() {
        let polish = TrayLabels {
            play: "Odtwórz".to_owned(),
            pause: "Wstrzymaj".to_owned(),
            previous: "Poprzedni".to_owned(),
            next: "Następny".to_owned(),
            show: "Pokaż Shiranami".to_owned(),
            quit: "Zakończ".to_owned(),
        };

        let translated = TrayModel::build(&loaded(0.0), &polish);

        assert_eq!(translated.actions(), menu(&loaded(0.0)).actions());
        assert!(translated.items.contains(&TrayItem::Action {
            id: TrayItemId::TogglePlay,
            label: "Wstrzymaj".to_owned()
        }));
    }

    #[test]
    fn the_first_state_always_builds_a_menu() {
        let mut view = TrayView::new();
        assert!(view.current().is_none());
        assert!(view.apply(&MediaState::Cleared).is_some());
    }

    /// The per-second rebuild v1 did: the playhead is not on the menu, so it
    /// cannot change it.
    #[test]
    fn a_playhead_tick_does_not_rebuild_the_menu() {
        let mut view = TrayView::new();
        view.apply(&loaded(0.0));

        assert!(view.apply(&loaded(30.0)).is_none());
    }

    #[test]
    fn a_track_change_rebuilds_the_menu() {
        let mut view = TrayView::new();
        view.apply(&loaded(0.0));

        let mut next = playing(0.0);
        next.title = "Another Song".to_owned();
        let rebuilt = view
            .apply(&MediaState::Loaded(next))
            .expect("a new title changes the menu");

        assert_eq!(rebuilt.tooltip, "Shiranami - Another Song - Yumemi");
    }

    #[test]
    fn a_pause_rebuilds_the_menu_because_the_toggle_label_flips() {
        let mut view = TrayView::new();
        view.apply(&loaded(10.0));

        let mut paused = playing(10.0);
        paused.is_playing = false;
        assert!(view.apply(&MediaState::Loaded(paused)).is_some());
    }

    #[test]
    fn clearing_rebuilds_the_menu_down_to_show_and_quit() {
        let mut view = TrayView::new();
        view.apply(&loaded(10.0));

        let rebuilt = view
            .apply(&MediaState::Cleared)
            .expect("the now-playing block disappears");

        assert_eq!(rebuilt.actions(), [TrayItemId::Show, TrayItemId::Quit]);
        assert_eq!(rebuilt.tooltip, "Shiranami");
    }

    #[test]
    fn a_view_keeps_its_labels_across_rebuilds() {
        let mut view = TrayView::with_labels(TrayLabels {
            quit: "Zakończ".to_owned(),
            ..TrayLabels::default()
        });
        view.apply(&MediaState::Cleared);
        let rebuilt = view.apply(&loaded(0.0)).expect("loading changes the menu");

        assert!(rebuilt.items.contains(&TrayItem::Action {
            id: TrayItemId::Quit,
            label: "Zakończ".to_owned()
        }));
    }
}
