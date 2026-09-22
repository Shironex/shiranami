//! Application-directory resolution, including the v1 tree the first run copies
//! from (architecture §3.1).
//!
//! Tauri derives its app directories from the **bundle identifier**. Electron
//! derives `userData` from `app.name`, which is the bundled `package.json`'s
//! `productName`, else its `name` — and `apps/desktop/package.json` has always
//! had no `productName` and the scoped name `@shiranami/desktop`, whose `/`
//! becomes a directory level. So the two do not coincide:
//!
//! |         | Electron (v1)                                      | Tauri (v2)                                             |
//! | ------- | -------------------------------------------------- | ------------------------------------------------------ |
//! | macOS   | `~/Library/Application Support/@shiranami/desktop` | `~/Library/Application Support/com.shironex.shiranami` |
//! | Windows | `%APPDATA%\@shiranami\desktop`                     | `%APPDATA%\com.shironex.shiranami`                     |
//!
//! `electron-builder.json`'s `productName: "Shiranami"` names the executable and
//! the installer, not this directory. Until 2026-09-22 this module believed it
//! did and resolved `<root>/Shiranami`, a directory no v1 build ever wrote; a
//! packaged v1.0.1 on real hardware (#412) is what showed it.
//!
//! Phase 17 owns the copy itself. Core owns only the question "where is the v1
//! tree, and has it already been adopted?", because the settings loader has to
//! answer it before anything else runs.

use std::path::PathBuf;

/// v1's `package.json` `name`, and so its `userData` directory: `@shiranami`
/// then `desktop`, one level each.
pub const V1_DIRECTORY_SEGMENTS: [&str; 2] = ["@shiranami", "desktop"];

/// The Tauri bundle identifier, and so the v2 directory name.
pub const V2_DIRECTORY_NAME: &str = "com.shironex.shiranami";

/// Marker written into the v2 directory once the v1 copy has completed.
///
/// Its presence is what makes first-run continuity a no-op on every later
/// launch. Holds `{ from, copied_bytes, at, v1_version }`.
pub const MIGRATION_MARKER_FILE: &str = "migrated_from_v1.json";

/// The settings file name, unchanged from electron-store's default.
///
/// Reading the v1 file in place is the whole point of keeping the name: §3.4
/// imports `config.json` key-by-key rather than starting from defaults.
pub const SETTINGS_FILE: &str = "config.json";

/// The platform directory that holds per-application data directories.
///
/// Mirrors Electron's `app.getPath('userData')` parent on each platform:
/// `~/Library/Application Support` on macOS, `%APPDATA%` on Windows,
/// `$XDG_CONFIG_HOME` (else `~/.config`) elsewhere.
///
/// Returns `None` when the environment does not name a home directory, which is
/// a genuinely unusable state rather than something to paper over with a guess.
pub fn app_data_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
    }
}

/// The v1 (Electron) data directory, whether or not it exists.
pub fn legacy_data_dir() -> Option<PathBuf> {
    app_data_root().map(|root| {
        V1_DIRECTORY_SEGMENTS
            .iter()
            .fold(root, |dir, part| dir.join(part))
    })
}

/// The v2 (Tauri) data directory, whether or not it exists.
///
/// The real app takes this path from Tauri's path resolver; this exists so the
/// settings store and its tests can resolve it without a `tauri::App`, and so
/// the two are pinned against each other by [`Self`]'s own tests.
pub fn data_dir() -> Option<PathBuf> {
    app_data_root().map(|root| root.join(V2_DIRECTORY_NAME))
}

/// Whether the v1 tree has already been adopted into `data_dir`.
///
/// Checked before anything reads or writes the v2 database, so a second run
/// never re-copies (and never re-imports settings over changes the user has
/// since made).
pub fn is_migrated(data_dir: &std::path::Path) -> bool {
    data_dir.join(MIGRATION_MARKER_FILE).exists()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::repo_file;

    /// The v2 directory name is the bundle identifier, so it has to *be* the
    /// bundle identifier the shell actually ships. A rename on either side sends
    /// first-run continuity looking in the wrong place, which is R6 — silent
    /// data loss through a wrong directory.
    #[test]
    fn the_v2_directory_name_matches_the_shipped_bundle_identifier() {
        let config = repo_file("apps/desktop-tauri/src-tauri/tauri.conf.json");
        assert!(
            config.contains(&format!("\"identifier\": \"{V2_DIRECTORY_NAME}\"")),
            "tauri.conf.json no longer declares identifier {V2_DIRECTORY_NAME}; \
             the v2 data directory would move without the migration following it"
        );
    }

    /// Likewise for the v1 side, pinned to what Electron actually reads.
    ///
    /// `app.getPath('userData')` is `<appData>/<app.name>`, and `app.name` is
    /// the bundled `package.json`'s `productName`, else its `name`. So the
    /// invariant is two facts about that file: the name, and the *absence* of a
    /// `productName` that would override it. This test used to read
    /// `electron-builder.json`'s `productName` instead — the installer's name —
    /// and passed while pointing continuity at a directory no v1 had written.
    #[test]
    fn the_v1_directory_matches_what_electron_derives_from_package_json() {
        let package = repo_file("apps/desktop/package.json");
        let name = format!("\"name\": \"{}\"", V1_DIRECTORY_SEGMENTS.join("/"));
        assert!(
            package.contains(&name),
            "apps/desktop/package.json no longer declares {name}; v1's userData              directory moved and the legacy lookup would miss the user's data"
        );
        assert!(
            !package.contains("\"productName\""),
            "apps/desktop/package.json now declares productName, which Electron              prefers over name for userData; the legacy lookup must follow it"
        );
    }

    #[test]
    fn the_two_directories_share_a_root_and_are_distinct() {
        let (Some(root), Some(v1), Some(v2)) = (app_data_root(), legacy_data_dir(), data_dir())
        else {
            // No HOME in the environment; nothing to assert.
            return;
        };
        assert!(
            v1.starts_with(&root) && v2.starts_with(&root),
            "both live under the same root"
        );
        assert_ne!(
            v1, v2,
            "v2 must not resolve onto the v1 tree it copies from"
        );
        assert!(
            !v2.starts_with(&v1) && !v1.starts_with(&v2),
            "neither may nest inside the other, or the copy would recurse"
        );
    }

    #[test]
    fn migration_is_detected_only_once_the_marker_exists() {
        let dir = tempfile::tempdir().expect("create a data dir");
        assert!(!is_migrated(dir.path()), "a fresh directory is unmigrated");
        std::fs::write(dir.path().join(MIGRATION_MARKER_FILE), b"{}").expect("write the marker");
        assert!(is_migrated(dir.path()));
    }
}
