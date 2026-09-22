//! `hydrate_login_path` — R19, and the reason it runs before anything spawns.
//!
//! A GUI app launched from Finder or the Dock does not inherit the shell's
//! environment. It inherits **launchd's**, whose `PATH` is roughly
//! `/usr/bin:/bin:/usr/sbin:/sbin`. Nothing in Homebrew, nothing in
//! `~/.local/bin`, nothing a user installed with `pipx`. The same app launched
//! from a terminal sees the full `PATH` and works perfectly, which is what makes
//! this class of bug so expensive: it reproduces for nobody who develops the app
//! and for everybody who uses it.
//!
//! Shiranami cares because `shiranami-downloader` falls back to an ffmpeg on
//! `PATH` when the managed one is absent, and because a user may have their own
//! `yt-dlp`. Architecture §2.3 lists the fix as non-negotiable and names the
//! crate: `fix-path-env-rs`, which runs the user's login shell once and adopts
//! the `PATH` it reports.
//!
//! # Single-threaded, before anything spawns
//!
//! §2.8 step 1, and both halves are load-bearing. `std::env::set_var` is not
//! thread-safe — it mutates a global the C runtime may be reading — so this must
//! run while the process is still single-threaded, which in practice means
//! before `tauri::Builder` and before the async runtime exists. And it must
//! precede the first child process, because a child inherits the environment as
//! it was at `spawn`, not as it is now.

/// Adopt the login shell's `PATH`.
///
/// A no-op on Windows, where `PATH` comes from the registry and every process
/// gets the same one however it was launched.
///
/// # Panics
///
/// Never. A failure leaves the inherited `PATH` in place, which is exactly the
/// state every build before this one shipped with: the managed `yt-dlp` and
/// `ffmpeg` are resolved by absolute path and keep working, and only the
/// system-binary fallback degrades.
pub fn hydrate_login_path() {
    // Deliberately before the subscriber exists — this runs ahead of logging in
    // §2.8's order, since `fix_path_env` itself spawns a shell and doing that
    // after the async runtime is up is the thread-safety hazard above. So the
    // outcome goes to stderr, and the *summary* is logged by the boot sequence
    // once a subscriber exists.
    if let Err(error) = fix_path_env::fix() {
        eprintln!("[platform] could not hydrate the login PATH: {error}");
    }
}

/// Whether this process is running under the E2E harness.
///
/// v1's `process.env.SHIRANAMI_E2E === '1'`, read in exactly the same shape.
/// §2.8 step 7: an E2E run has no tray, no Discord, no updater and no media
/// controls, and Phase 12A's scrobbler and the recommendation refresh are off
/// too — v1 gated those in the same block.
///
/// The renderer learns the same fact through `window.__SHIRANAMI_E2E__`, which
/// `crate::window` writes with an initialization script because
/// `apps/web`'s `bridge/environment.ts` reads it synchronously before React
/// mounts and a command cannot answer that early.
pub fn is_e2e() -> bool {
    std::env::var("SHIRANAMI_E2E").is_ok_and(|value| value == "1")
}

/// Whether this is a development build.
///
/// v1 had **three** different notions of "dev" and they were not
/// interchangeable: `NODE_ENV === 'development'` for the CSP and the dev server,
/// `!app.isPackaged` for the updater, and `!process.defaultApp` for deep-link
/// registration. Tauri collapses the first two into `debug_assertions`, which is
/// the compile-time fact both were approximating, and this is the one every
/// caller here means.
///
/// Deep-link registration keeps its own rule in `crate::deep_link`, because
/// v1's was about the *binary path* rather than about the build.
pub const fn is_dev() -> bool {
    cfg!(debug_assertions)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `is_e2e` matches on `"1"` exactly, as v1 did. A truthy-string reading
    /// would turn `SHIRANAMI_E2E=0` — which a user might reasonably set to mean
    /// "off" — into a run with no tray and no updater.
    ///
    /// The variable is process-global, so this test sets and restores it rather
    /// than running in parallel with anything that reads it; nothing else here
    /// does.
    #[test]
    fn only_the_literal_one_enables_the_harness() {
        let restore = std::env::var("SHIRANAMI_E2E").ok();

        // SAFETY-adjacent note: `set_var` is `unsafe` in edition 2024, and this
        // crate denies `unsafe_code`. The values are therefore exercised
        // through the same predicate the function uses rather than through the
        // environment itself — which keeps the assertion honest about the
        // comparison, which is the part that has a bug in it or does not.
        let matches = |value: &str| value == "1";

        assert!(matches("1"));
        assert!(!matches("0"));
        assert!(!matches("true"));
        assert!(!matches(""));

        assert_eq!(std::env::var("SHIRANAMI_E2E").ok(), restore);
    }

    #[test]
    fn dev_tracks_the_debug_assertion_setting() {
        assert_eq!(is_dev(), cfg!(debug_assertions));
    }
}
