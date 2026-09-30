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
//! # Where the scheme is declared
//!
//! `tauri.conf.json` declares `shiranami` under `plugins.deep-link.desktop`.
//! That entry is what the bundler turns into `CFBundleURLTypes` in the macOS
//! `Info.plist` and into the NSIS installer's registry keys on Windows, and it
//! is the only way to claim a scheme on macOS: the plugin's `register` returns
//! `UnsupportedPlatform` there. Until it existed, a macOS build never owned
//! `shiranami://` at all. [`register`] still claims it at runtime on Windows
//! (and Linux), as v1 did, so an install moved after setup keeps working.
//!
//! On macOS the link arrives as `RunEvent::Opened`, and `lib.rs`'s run loop
//! hands it to [`on_opened`]. Not the plugin's `deep-link://new-url` event,
//! for two reasons:
//!
//! - **The launching link comes before `setup`.** tao forwards
//!   `application:openURLs:` the moment AppKit sends it, with no wait for
//!   `applicationDidFinishLaunching:`, and the link that launches the app is
//!   sent in between. Tauri runs `setup` on `Ready`, which is that second
//!   callback, so a listener installed in `setup` never hears the one link a
//!   cold start is about. The run loop callback exists from `app.run` on and
//!   Tauri forwards every event to it without waiting for `setup`, so it hears
//!   that link and every later one, with no `get_current` catch-up that could
//!   dispatch the same link a second time.
//! - **The webview can emit that event itself.** `core:default` lets the page
//!   emit any event name, so trusting `deep-link://new-url` would let page
//!   script forge a share link. `RunEvent::Opened` only comes from the OS.
//!
//! Windows keeps its two argv paths above, and `RunEvent::Opened` does not
//! exist there, so no link is dispatched twice.
//!
//! # A link that arrives before the renderer is held, once
//!
//! Every cold-start path above lands before React has mounted the hook that
//! listens for `share:deep-link`: the Windows argv link is dispatched from
//! `setup`, and the macOS `open-url` that launched the app arrives before
//! `setup` has even created the window. An event emitted then reaches no listener, so the
//! link was dropped with no error anywhere; closing the argv gap above only
//! moved the drop one step later.
//!
//! [`PendingDeepLink`] is the slot that closes it. Until the renderer drains it
//! (the `share_take_pending_deep_link` command, called once per page load by
//! the bridge shim), a link is **held instead of emitted**, never both, so it
//! cannot be delivered twice. After the drain every link goes straight through
//! the live event, exactly as before. Only the latest held link survives: two
//! clicks during a launch mean the user wants the second one.
//!
//! A reload replaces the page, and the new one has no listener until it mounts
//! again, so [`PendingDeepLink::renderer_reset`] runs when the main webview
//! starts a new document and puts the slot back to holding. The new page's
//! bridge drains it exactly as the first one did.
//!
//! This is not the queue v1 declined. v1's `handleDeepLink` returned silently
//! when its `mainWindow` was null, and its reasoning was that a queue would
//! replay an import prompt at an arbitrary later moment. The slot is drained
//! by the first render of each page load, the moment the app becomes usable,
//! so the prompt appears as part of the launch (or reload) the link caused. A link that finds
//! no window **after** the drain is still dropped, as v1 did.

use shiranami_core::sync::lock_or_recover;
use shiranami_integrations::share::deep_link::{
    DeepLink, find_deep_link_argument, parse_deep_link,
};
use tauri::{AppHandle, Manager as _};
use tauri_specta::Event as _;

/// Windows and Linux: claim `shiranami://` for this executable at runtime.
///
/// macOS has nothing to do here: the bundle's `Info.plist` is the claim, and
/// links arrive through [`on_opened`] (see the module docs).
///
/// v1 registered only when `process.defaultApp` was false, that is only in a
/// packaged build, because a dev build could not resolve the Electron binary
/// correctly on Windows. The equivalent fact here is whether the running
/// binary is the installed one, and `debug_assertions` is the honest stand-in:
/// a dev build registering the scheme would point the OS at a target directory
/// that moves.
#[cfg(not(target_os = "macos"))]
pub fn register(app: &AppHandle) {
    if crate::infra::platform::is_dev() {
        tracing::debug!("not claiming shiranami:// from a development build");
        return;
    }

    use tauri_plugin_deep_link::DeepLinkExt as _;
    if let Err(error) = app.deep_link().register(SCHEME) {
        // Not fatal: the app works, share links do not. v1 did not check the
        // result at all.
        tracing::warn!(%error, "could not claim the shiranami:// scheme");
    }
}

/// The scheme, as `tauri.conf.json` declares it. A test keeps the two equal.
pub const SCHEME: &str = "shiranami";

/// macOS: the OS asked this app to open `urls`, from `RunEvent::Opened`.
///
/// Called from `lib.rs`'s run loop, which is the one place that hears the
/// launching link as well as later ones; the module docs say why the plugin's
/// event is not used. Runs in every build, including a development one: only a
/// bundle whose `Info.plist` carries the scheme is ever sent a link, so a dev
/// binary simply never hears from it.
#[cfg(target_os = "macos")]
pub fn on_opened(app: &AppHandle, urls: &[tauri::Url]) {
    if let Some(url) = last_import_url(urls.iter().map(tauri::Url::as_str)) {
        dispatch(app, url);
    }
}

/// The last `shiranami://import/...` link in `urls`, if any.
///
/// One `open-url` can carry several URLs. They are one request, so one
/// import prompt answers it, for the same reason the pending slot keeps only
/// the latest link: the last thing the user clicked is what they want now.
/// Anything else in the list is ignored, as [`dispatch`] would ignore it.
#[cfg(any(target_os = "macos", test))]
fn last_import_url<'a>(urls: impl IntoIterator<Item = &'a str>) -> Option<&'a str> {
    urls.into_iter()
        .filter(|url| matches!(parse_deep_link(url), Some(DeepLink::Import { .. })))
        .last()
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

/// The import code a link carried before the renderer could hear it.
///
/// Managed on the builder rather than in `setup`, so it exists before `setup`
/// runs the Windows cold-start dispatch. `Default` and purely in-memory, like
/// the other holders managed beside it. See the module docs for why this is a
/// slot of one rather than a queue.
#[derive(Default)]
pub struct PendingDeepLink {
    inner: std::sync::Mutex<Pending>,
}

#[derive(Default)]
struct Pending {
    /// Set by [`PendingDeepLink::take`], cleared by
    /// [`PendingDeepLink::renderer_reset`] when a new page starts loading.
    renderer_ready: bool,
    code: Option<String>,
}

impl PendingDeepLink {
    /// Decide what happens to a freshly parsed `code`.
    ///
    /// Before the renderer has drained the slot, the code is stored (replacing
    /// any earlier one) and `None` comes back, which tells the caller **not**
    /// to emit: an emitted and a held copy of the same link would open the
    /// import prompt twice. After the drain the code is handed straight back
    /// for the live event and nothing is stored.
    pub fn offer(&self, code: String) -> Option<String> {
        let mut pending = lock_or_recover(&self.inner);
        if pending.renderer_ready {
            return Some(code);
        }
        pending.code = Some(code);
        None
    }

    /// Mark the renderer as listening, and hand it whatever arrived first.
    ///
    /// Taking rather than reading: a second call, from a reload or a second
    /// subscriber, finds nothing, so the held link opens one prompt at most.
    pub fn take(&self) -> Option<String> {
        let mut pending = lock_or_recover(&self.inner);
        pending.renderer_ready = true;
        pending.code.take()
    }

    /// The renderer is being replaced (a reload or a navigation), so hold links
    /// again until the new page drains the slot. A link already held stays
    /// held: the new page is the one that will take it.
    pub fn renderer_reset(&self) {
        lock_or_recover(&self.inner).renderer_ready = false;
    }
}

/// `Builder::on_page_load`: a new document in the main webview means its live
/// listener is gone until the new page subscribes and drains again.
///
/// `Started` is the committed new document on every backend (WebView2's
/// `ContentLoading`, WebKit's `didCommitNavigation`), so a cancelled or
/// same-document navigation does not reset the slot. `Finished` would be too
/// late: it can land after the new page's take and park every later link.
pub fn on_page_load(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<'_>) {
    if webview.label() != "main" || payload.event() != tauri::webview::PageLoadEvent::Started {
        return;
    }
    if let Some(pending) = webview.try_state::<PendingDeepLink>() {
        pending.renderer_reset();
    }
}

/// Parse `url` and hand the result to the renderer, now or when it asks.
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

    // `try_state` so a shell that never managed the slot (a test harness, a
    // future builder that forgets it) degrades to today's live event rather
    // than panicking on a link click.
    let code = match app.try_state::<PendingDeepLink>() {
        Some(pending) => match pending.offer(code) {
            Some(code) => code,
            None => {
                tracing::info!("deep link held until the renderer is listening");
                return;
            }
        },
        None => code,
    };

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

    /// macOS can only receive a scheme the bundle declares, so the config
    /// entry is load-bearing. Read from the file the bundler reads, so a
    /// rename of either side fails here instead of in a user's browser.
    #[test]
    fn the_scheme_is_declared_where_the_bundler_reads_it() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is JSON");

        let schemes = &config["plugins"]["deep-link"]["desktop"]["schemes"];
        assert_eq!(*schemes, serde_json::json!([SCHEME]), "{schemes}");
    }

    /// The gap v1 left: a cold launch carrying a link. This asserts the helper
    /// that closes it reads the same argv the OS hands over.
    #[test]
    fn the_cold_start_scan_reads_the_process_arguments() {
        // The test binary's own argv carries no `shiranami://`, which is the
        // answer every ordinary launch gives too.
        assert_eq!(initial_argument(), None);
    }

    /// The cold-start case: nothing is listening yet, so the link is held and
    /// the caller is told not to emit. Emitting as well would open the import
    /// prompt twice once the renderer drains the slot.
    #[test]
    fn a_link_before_the_drain_is_held_and_not_emitted() {
        let pending = PendingDeepLink::default();

        assert_eq!(pending.offer("AbC123".to_owned()), None);
        assert_eq!(pending.take(), Some("AbC123".to_owned()));
    }

    /// The drain is a take: a reload, or a second subscriber, finds nothing.
    #[test]
    fn a_held_link_is_taken_once() {
        let pending = PendingDeepLink::default();
        pending.offer("AbC123".to_owned());

        assert_eq!(pending.take(), Some("AbC123".to_owned()));
        assert_eq!(pending.take(), None);
    }

    /// Once the renderer has drained, links travel the live event as they did
    /// before the slot existed, and none is left behind for a later take.
    #[test]
    fn a_link_after_the_drain_is_emitted_and_not_stored() {
        let pending = PendingDeepLink::default();
        assert_eq!(pending.take(), None);

        assert_eq!(
            pending.offer("XyZ789".to_owned()),
            Some("XyZ789".to_owned())
        );
        assert_eq!(pending.take(), None);
    }

    /// An `open-url` carrying several URLs opens one prompt, for the last
    /// import link among them; anything that is not one is passed over.
    #[test]
    fn the_last_import_link_in_an_open_request_is_the_one_taken() {
        let urls = [
            "shiranami://import/first1",
            "https://example.com",
            "shiranami://import/second2",
            "shiranami://something-else",
        ];

        assert_eq!(last_import_url(urls), Some("shiranami://import/second2"));
        assert_eq!(last_import_url(["https://example.com"]), None);
        assert_eq!(last_import_url([]), None);
    }

    /// A reload drops the page's listener, so a link that arrives before the
    /// new page drains is held again rather than emitted into nothing.
    #[test]
    fn a_link_after_a_reload_is_held_until_the_new_page_drains() {
        let pending = PendingDeepLink::default();
        assert_eq!(pending.take(), None);

        pending.renderer_reset();

        assert_eq!(pending.offer("XyZ789".to_owned()), None);
        assert_eq!(pending.take(), Some("XyZ789".to_owned()));
        assert_eq!(pending.offer("next1".to_owned()), Some("next1".to_owned()));
    }

    /// A link held when the reload starts survives it, for the new page to take.
    #[test]
    fn a_held_link_survives_a_reset() {
        let pending = PendingDeepLink::default();
        pending.offer("AbC123".to_owned());

        pending.renderer_reset();

        assert_eq!(pending.take(), Some("AbC123".to_owned()));
    }

    /// Two clicks during one launch: the second is what the user wants now.
    #[test]
    fn the_latest_link_before_the_drain_wins() {
        let pending = PendingDeepLink::default();
        pending.offer("first1".to_owned());
        pending.offer("second2".to_owned());

        assert_eq!(pending.take(), Some("second2".to_owned()));
    }
}
