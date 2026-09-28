//! The tray's label table.
//!
//! v1's were English literals: its main process had no i18n at all, and
//! `react-i18next` lived in the renderer where the tray could not reach it.
//! [`TrayLabels`] keeps those six literals as its `Default` and adds
//! [`TrayLabels::for_language`], a two-row table keyed by the `app.language`
//! tag the renderer already persists to the settings store. That is the whole
//! Rust-side translation surface, so a table beats an i18n crate: the tray has
//! six strings and the app ships two languages. The Polish wording matches the
//! player bar's (`apps/web/src/locales/pl/player.json`), so the same button
//! reads the same in both places.

use super::APP_NAME;

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

impl TrayLabels {
    /// The labels for an `app.language` tag.
    ///
    /// `pl` is Polish; everything else, including an absent tag, is v1's
    /// English. The renderer falls back to English for an unsupported tag too
    /// (`isSupportedLanguage` in `apps/web/src/lib/i18n.ts`), so the tray and
    /// the window cannot disagree about which language a stray value means.
    pub fn for_language(tag: Option<&str>) -> Self {
        match tag {
            Some("pl") => Self {
                play: "Odtwórz".to_owned(),
                pause: "Pauza".to_owned(),
                previous: "Poprzedni".to_owned(),
                next: "Następny".to_owned(),
                show: format!("Pokaż {APP_NAME}"),
                quit: "Zakończ".to_owned(),
            },
            _ => Self::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1's labels, verbatim. The main process had no i18n to read them from.
    #[test]
    fn the_default_labels_are_v1s_literals() {
        let labels = TrayLabels::default();

        assert_eq!(labels.play, "Play");
        assert_eq!(labels.pause, "Pause");
        assert_eq!(labels.previous, "Previous");
        assert_eq!(labels.next, "Next");
        assert_eq!(labels.show, "Show Shiranami");
        assert_eq!(labels.quit, "Quit");
    }

    /// The two languages the app ships, and English for anything else.
    #[test]
    fn the_labels_follow_the_app_language() {
        let polish = TrayLabels::for_language(Some("pl"));
        assert_eq!(polish.play, "Odtwórz");
        assert_eq!(polish.pause, "Pauza");
        assert_eq!(polish.previous, "Poprzedni");
        assert_eq!(polish.next, "Następny");
        assert_eq!(polish.show, "Pokaż Shiranami");
        assert_eq!(polish.quit, "Zakończ");

        for tag in [Some("en"), None, Some("de"), Some("PL"), Some("")] {
            assert_eq!(
                TrayLabels::for_language(tag),
                TrayLabels::default(),
                "{tag:?} is English, as the renderer reads it"
            );
        }
    }
}
