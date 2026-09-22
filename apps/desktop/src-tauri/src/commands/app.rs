//! `app:*` — the three facts the renderer asks the shell about itself.
//!
//! Ported from `apps/desktop/src/main/ipc/app.ts`. All three took no arguments
//! in v1 and two of them cannot fail, which is why they are not all
//! `CommandResult`: a channel that never rejected must not start rejecting, or
//! the renderer grows an error branch for a state that does not exist.
//!
//! # The version is the bundle's, not the crate's
//!
//! v1's `app.getVersion()` read `package.json`, which is also what
//! electron-builder stamped onto the installer, so the string in the About
//! dialog was the string on the download. Tauri's equivalent is
//! `package_info().version`, which `generate_context!` fills from
//! `tauri.conf.json` — the same file the bundler reads. `CARGO_PKG_VERSION`
//! would be a *third* number, correct today only because the workspace and the
//! config happen to agree.
//!
//! # The locale country is an approximation, and a recorded one
//!
//! `app.getLocaleCountryCode()` returns the OS **region** — on macOS
//! `NSLocale.countryCode`, which a user can set independently of the UI
//! language. `sys-locale` reports the UI locale's BCP-47 tag, so a user reading
//! the interface in `en-US` while living in Poland now geolocates to `US` where
//! v1 said `PL`. There is no crate that reads the region separately on all three
//! platforms, and the one consumer is radio's "Near you" shortcut, whose failure
//! mode is a list of stations from the wrong country rather than an error. The
//! contract is unchanged: an ISO 3166-1 alpha-2 code, or `""` when unknown.

use tauri_plugin_opener::OpenerExt as _;

use crate::error::CommandResult;
use crate::paths::{io_failure, logs_dir};

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::app::app_get_version,
                crate::commands::app::app_open_logs_folder,
                crate::commands::app::app_get_locale_country,
            ]
        }
    };
}
pub(crate) use commands;

/// `app:get-version` — the version the About dialog and the updater compare.
#[tauri::command]
#[specta::specta]
pub async fn app_get_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// `app:open-logs-folder` — reveal the log directory in the file manager.
///
/// v1 created the directory before opening it (`getLogsDir` ends in an
/// `mkdirSync`), which matters on a fresh install where nothing has been logged
/// yet — without it the open silently does nothing.
///
/// # A deliberate difference: this one reports failure
///
/// Electron's `shell.openPath` *resolves* with an error string rather than
/// throwing, and v1 ignored the result, so a failed open was invisible. That was
/// an artifact of the API rather than a decision — the same handler's
/// `mkdirSync` could already throw, so the channel was rejection-capable and the
/// renderer already handles it. Reporting both halves the same way is the
/// smaller inconsistency.
#[tauri::command]
#[specta::specta]
pub async fn app_open_logs_folder(app: tauri::AppHandle) -> CommandResult<()> {
    let dir = logs_dir(&app)?;
    let reported = dir.clone();

    // Creating a directory and handing a path to Explorer/Finder are both
    // blocking syscalls; §2.3 keeps them off the thread answering the invoke.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir)
            .map_err(|error| io_failure("create the log directory", &dir, error))?;

        app.opener()
            .open_path(dir.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| io_failure("open the log directory", &dir, error))
    })
    .await
    .map_err(|error| io_failure("open the log directory", &reported, error))?
}

/// `app:get-locale-country` — the OS region as ISO 3166-1 alpha-2, or `""`.
///
/// Backs radio's "Near you" shortcut for renderers whose locale tag carries no
/// region subtag (a bare `pl`), which is why it exists at all.
#[tauri::command]
#[specta::specta]
pub async fn app_get_locale_country() -> String {
    sys_locale::get_locale()
        .as_deref()
        .and_then(country_from_locale)
        .unwrap_or_default()
}

/// The region subtag of a BCP-47 tag, uppercased.
///
/// Extracted so it is reachable from a test without an OS locale, which is the
/// only way to cover the tags that make this non-trivial. Three rules, each
/// earning its place:
///
/// - **Skip the first subtag.** It is the language, and `en` is two letters just
///   like a region is.
/// - **Stop at a single-character subtag.** That is a BCP-47 extension singleton,
///   and everything after it is extension data — `en-u-ca-gregory` has no region
///   at all, but a naive scan reads `ca` as Canada.
/// - **Two ASCII letters only.** UN M.49 numeric regions (`es-419`) have no
///   alpha-2 spelling, and `getLocaleCountryCode` returned `""` for them too.
fn country_from_locale(tag: &str) -> Option<String> {
    tag.split(['-', '_'])
        .skip(1)
        .take_while(|subtag| subtag.len() != 1)
        .find(|subtag| subtag.len() == 2 && subtag.bytes().all(|byte| byte.is_ascii_alphabetic()))
        .map(str::to_uppercase)
}

#[cfg(test)]
mod tests {
    use super::country_from_locale;

    #[test]
    fn a_region_subtag_is_uppercased() {
        assert_eq!(country_from_locale("en-US").as_deref(), Some("US"));
        assert_eq!(country_from_locale("pl-pl").as_deref(), Some("PL"));
        assert_eq!(country_from_locale("en_GB").as_deref(), Some("GB"));
    }

    /// A bare language is exactly the case this channel exists for: the renderer
    /// cannot derive a region from it, so it asks the OS and gets `""`.
    #[test]
    fn a_tag_with_no_region_yields_nothing() {
        assert_eq!(country_from_locale("pl"), None);
        assert_eq!(country_from_locale(""), None);
    }

    /// The language subtag is two letters too, so a scan that did not skip it
    /// would report `EN` as a country for every English locale.
    #[test]
    fn the_language_subtag_is_never_read_as_a_region() {
        assert_eq!(country_from_locale("en"), None);
        assert_eq!(country_from_locale("de"), None);
    }

    /// A script subtag sits between the language and the region and is four
    /// characters, so it is skipped by length rather than by position.
    #[test]
    fn a_script_subtag_does_not_hide_the_region() {
        assert_eq!(country_from_locale("zh-Hans-CN").as_deref(), Some("CN"));
        assert_eq!(country_from_locale("sr-Latn-RS").as_deref(), Some("RS"));
    }

    /// Everything after a singleton is extension data. `u` opens the Unicode
    /// extension, and `ca` there names a *calendar*, not Canada.
    #[test]
    fn an_extension_singleton_ends_the_search() {
        assert_eq!(country_from_locale("en-u-ca-gregory"), None);
        assert_eq!(
            country_from_locale("de-DE-u-co-phonebk").as_deref(),
            Some("DE"),
            "a real region before the singleton still counts"
        );
    }

    /// UN M.49 regions have no alpha-2 spelling, and Electron returned `""`
    /// rather than the digits.
    #[test]
    fn a_numeric_region_is_not_reported_as_a_country() {
        assert_eq!(country_from_locale("es-419"), None);
    }

    /// Variants are five to eight characters, so they cannot be mistaken for a
    /// region, and the region before them still wins.
    #[test]
    fn a_variant_subtag_does_not_displace_the_region() {
        assert_eq!(country_from_locale("ca-ES-valencia").as_deref(), Some("ES"));
        assert_eq!(country_from_locale("en-US-POSIX").as_deref(), Some("US"));
    }
}
