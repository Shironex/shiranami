//! `shiranami://` — registration, and getting a link to the renderer.
//!
//! `shiranami_integrations::share::deep_link` owns the parsing and says what is
//! left here: *"Registering the scheme, claiming the single-instance lock and
//! forwarding the parsed link to the webview all belong to `src-tauri` in Phase
//! 16."*
//!
//! # Three arrival paths, and v1 only handled two
//!
//! | Platform | How the URL arrives                            |
//! | -------- | ---------------------------------------------- |
//! | macOS    | an `open-url` event on the running process     |
//! | Windows  | an argv entry, on a **second** instance        |
//! | Windows  | an argv entry, on a **cold** launch            |
//!
//! v1 handled the first two. The third it did not: `index.ts`'s
//! `second-instance` handler scans `argv`, but nothing reads `process.argv` on
//! the first launch — so clicking a share link with the app closed opened the
//! app and dropped the link. [`initial_argument`] closes that, because
//! `find_deep_link_argument` already exists and the fix is one call.
//!
//! # A link that arrives before the window is dropped, and that is v1's rule
//!
//! v1's `handleDeepLink` reads the module-scoped `mainWindow` and returns
//! silently when it is null. Preserved rather than queued: a queue would replay
//! an import prompt at an arbitrary later moment, and "nothing happened, click
//! it again" is a better failure than "a dialog appeared four seconds after you
//! stopped looking". Boot registers the handler before the window is shown, so
//! the gap is small.

use shiranami_integrations::share::deep_link::{
    DeepLink, find_deep_link_argument, parse_deep_link,
};
use tauri::{AppHandle, Manager as _};
use tauri_specta::Event as _;

/// Register `shiranami://` with the OS, when this build should own it.
///
/// v1's condition was `!process.defaultApp`, whose comment reads: *"Only
/// register in packaged builds — dev mode can't resolve the Electron binary
/// correctly on Windows."* The equivalent fact here is whether the running
/// binary is the installed one, and `debug_assertions` is the honest stand-in:
/// a dev build registering the scheme would point the OS at a target directory
/// that moves.
pub fn register(app: &AppHandle) {
    if crate::infra::platform::is_dev() {
        tracing::debug!("not claiming shiranami:// from a development build");
        return;
    }

    use tauri_plugin_deep_link::DeepLinkExt as _;
    if let Err(error) = app.deep_link().register("shiranami") {
        // Not fatal: the app works, share links do not. v1 did not check the
        // result at all.
        tracing::warn!(%error, "could not claim the shiranami:// scheme");
    }
}

/// The deep link this process was launched with, if any.
///
/// Windows and Linux deliver a cold-start link as an argument. **v1 dropped
/// this case** — see the module docs.
pub fn initial_argument() -> Option<String> {
    let arguments: Vec<String> = std::env::args().collect();
    let borrowed: Vec<&str> = arguments.iter().map(String::as_str).collect();

    find_deep_link_argument(borrowed).map(str::to_owned)
}

/// Parse `url` and hand the result to the renderer.
///
/// Silent for anything that is not a link we act on: v1's `parseDeepLink`
/// returned `null` for an unrecognised shape and `handleDeepLink` returned
/// without logging. Preserved — the OS can hand us any URL registered to the
/// scheme, and a warning per stray one would be noise.
pub fn dispatch(app: &AppHandle, url: &str) {
    let Some(DeepLink::Import { code }) = parse_deep_link(url) else {
        return;
    };

    tracing::info!(%code, "deep link: import request");

    // v1 showed and focused the window *before* sending, so the import prompt
    // appears on a window the user can see.
    crate::focus_main_window(app);

    if app.get_webview_window("main").is_none() {
        // v1's exact behaviour: no window, no delivery, no queue.
        tracing::warn!("a deep link arrived before the window existed; dropping it");
        return;
    }

    if let Err(error) = crate::events::ShareDeepLink(code).emit(app) {
        tracing::warn!(%error, "a deep link did not reach the webview");
    }
}

/// Handle a second launch: focus the window, and take its link if it carried
/// one.
///
/// This is the `tauri-plugin-single-instance` callback's body, factored out so
/// the argv half is testable.
pub fn on_second_instance(app: &AppHandle, arguments: &[String]) {
    let borrowed: Vec<&str> = arguments.iter().map(String::as_str).collect();

    match find_deep_link_argument(borrowed) {
        Some(url) => dispatch(app, url),
        // v1: a second launch with no link just raises the window. That is the
        // behaviour a user expects from clicking a dock icon twice.
        None => crate::focus_main_window(app),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The shape v1 recognised, and the ones it did not. Delegated to the crate,
    /// so this asserts the *wiring* reads the same answer rather than
    /// re-testing the parser.
    #[test]
    fn only_an_import_link_is_acted_on() {
        assert!(matches!(
            parse_deep_link("shiranami://import/AbC123"),
            Some(DeepLink::Import { .. })
        ));
        assert!(parse_deep_link("shiranami://something-else").is_none());
        assert!(parse_deep_link("https://example.com").is_none());
    }

    /// The argv scan finds a link anywhere in the list, which is what a
    /// cold-start launch needs: the URL is not argv[1] — the binary path is —
    /// and on Windows it can arrive after other switches.
    #[test]
    fn a_launch_argument_is_found_wherever_it_sits() {
        let arguments = [
            "C:\\Program Files\\Shiranami\\shiranami.exe",
            "--some-switch",
            "shiranami://import/XyZ789",
        ];

        assert_eq!(
            find_deep_link_argument(arguments),
            Some("shiranami://import/XyZ789")
        );
    }

    /// A second launch with no link is a raise, not a dropped event.
    #[test]
    fn an_ordinary_second_launch_carries_no_link() {
        let arguments = ["/Applications/Shiranami.app/Contents/MacOS/shiranami"];

        assert_eq!(find_deep_link_argument(arguments), None);
    }

    /// The gap v1 left: a cold launch carrying a link. This asserts the helper
    /// that closes it reads the same argv the OS hands over.
    #[test]
    fn the_cold_start_scan_reads_the_process_arguments() {
        // The test binary's own argv carries no `shiranami://`, which is the
        // answer every ordinary launch gives too.
        assert_eq!(initial_argument(), None);
    }
}
