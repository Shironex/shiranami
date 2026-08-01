//! What a v1 directory holds, and what of it §3.1 step 3 copies.
//!
//! The list is deliberately an **allowlist of names**, not "everything in the
//! directory". A real Electron `userData` is mostly Chromium: `Cache/` alone was
//! 498 MB in the profile this was developed against, beside `Code Cache/`,
//! `GPUCache/`, `Session Storage/`, `Cookies`, `Preferences` and a dozen more.
//! None of it means anything to a WKWebView or a WebView2, and copying it would
//! turn a 62 MB migration into a 650 MB one whose result is inert.
//!
//! `Local Storage/leveldb/` is the pointed case: it holds the renderer state
//! that matters, in a format v2 cannot read at all. That is exactly why the
//! bridge writes `renderer-state.json` (§3.5) and why this list takes the JSON
//! and leaves the leveldb.

use std::path::{Path, PathBuf};

use super::copy::OnExisting;

/// The library database's file name, shared by both trees.
pub const DATABASE_FILE: &str = "shiranami.db";

/// SQLite's sidecars, in copy order: the database first, then the write-ahead
/// log, then the shared-memory index.
///
/// The `-shm` file is pure derived state that SQLite rebuilds when it does not
/// match, so copying it is an optimisation rather than a correctness
/// requirement — but a copy that is torn across the set is caught downstream
/// regardless, because Phase 6 made `quick_check` fatal rather than advisory.
pub const DATABASE_SIDECARS: [&str; 2] = ["-wal", "-shm"];

/// One entry on §3.1 step 3's copy list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Entry {
    /// The name, identical in both trees.
    pub name: &'static str,
    /// Whether it is a directory.
    pub directory: bool,
    /// What to do when the destination already exists.
    pub on_existing: OnExisting,
}

/// §3.1 step 3's list, in the order it copies.
///
/// The database is **last** on purpose. It is the file whose presence the next
/// launch reads as "there is a library here", so everything it points at — the
/// art cache, the peaks cache — is already in place by the time it appears. A
/// run interrupted between the two leaves caches with no database, which the
/// next launch simply re-copies over; the reverse would be a library whose
/// covers are all missing until something re-extracted them.
pub const ENTRIES: [Entry; 8] = [
    // Settings first: it is the smallest, and it is the one whose absence is
    // most visible to a returning user (theme, language, Last.fm credentials).
    Entry {
        name: crate::paths::SETTINGS_FILE,
        directory: false,
        on_existing: OnExisting::Replace,
    },
    Entry {
        name: super::handoff::HANDOFF_FILE,
        directory: false,
        on_existing: OnExisting::Replace,
    },
    Entry {
        name: super::handoff::RENDERER_STATE_FILE,
        directory: false,
        on_existing: OnExisting::Replace,
    },
    // Content-addressed: the filename is the content hash, so an existing
    // destination entry already holds the same bytes (§3.3).
    Entry {
        name: "album-art",
        directory: true,
        on_existing: OnExisting::Skip,
    },
    Entry {
        name: "waveform-peaks",
        directory: true,
        on_existing: OnExisting::Skip,
    },
    // Timestamp-named and immutable.
    Entry {
        name: super::backup::BACKUP_DIRECTORY_NAME,
        directory: true,
        on_existing: OnExisting::Skip,
    },
    // yt-dlp, ffmpeg and ffprobe. Copying beats re-downloading ~190 MB, and it
    // is the difference between a first launch that can convert a download and
    // one that cannot until the user notices.
    Entry {
        name: "bin",
        directory: true,
        on_existing: OnExisting::Skip,
    },
    // Skip-on-existing, because the file appender already holds today's log
    // open — logging is boot stage one. See `copy`'s module docs.
    Entry {
        name: "logs",
        directory: true,
        on_existing: OnExisting::Skip,
    },
];

/// What was found in a v1 directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Discovery {
    /// The directory this describes.
    pub legacy_dir: PathBuf,
    /// Whether `shiranami.db` is there. The whole migration turns on this: a
    /// directory without one has no library to carry over.
    pub database: bool,
    /// Whether `config.json` is there.
    pub settings: bool,
    /// Whether the bridge's `v2-handoff.json` is there.
    pub handoff: bool,
    /// Whether the bridge's `renderer-state.json` is there.
    pub renderer_state: bool,
    /// The entries from [`ENTRIES`] that exist, by name.
    pub present: Vec<&'static str>,
}

impl Discovery {
    /// Inspect a v1 directory. Reads nothing but directory metadata.
    #[must_use]
    pub fn inspect(legacy_dir: &Path) -> Self {
        let present = ENTRIES
            .iter()
            .filter(|entry| {
                let path = legacy_dir.join(entry.name);
                if entry.directory {
                    path.is_dir()
                } else {
                    path.is_file()
                }
            })
            .map(|entry| entry.name)
            .collect();

        Self {
            legacy_dir: legacy_dir.to_path_buf(),
            database: legacy_dir.join(DATABASE_FILE).is_file(),
            settings: legacy_dir.join(crate::paths::SETTINGS_FILE).is_file(),
            handoff: legacy_dir.join(super::handoff::HANDOFF_FILE).is_file(),
            renderer_state: legacy_dir
                .join(super::handoff::RENDERER_STATE_FILE)
                .is_file(),
            present,
        }
    }

    /// Whether there is anything worth migrating.
    ///
    /// The database is the test, not "the directory exists": Electron creates
    /// `userData` on first launch and fills it with Chromium caches, so a
    /// directory left behind by a v1 the user opened once and never used is not
    /// a library.
    #[must_use]
    pub fn is_migratable(&self) -> bool {
        self.database
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The names §3.1 step 3 lists, all of them, spelled the way both trees
    /// spell them. A typo here is a silently missing cache.
    #[test]
    fn the_copy_list_is_section_3_1_step_3s() {
        let names: Vec<_> = ENTRIES.iter().map(|entry| entry.name).collect();
        assert_eq!(
            names,
            vec![
                "config.json",
                "v2-handoff.json",
                "renderer-state.json",
                "album-art",
                "waveform-peaks",
                "backups",
                "bin",
                "logs",
            ]
        );
    }

    /// The database is not on the entry list because it is copied separately,
    /// last, with its sidecars — see [`ENTRIES`]' docs.
    #[test]
    fn the_database_is_not_an_ordinary_entry() {
        assert!(!ENTRIES.iter().any(|entry| entry.name == DATABASE_FILE));
    }

    /// Chromium's directories are not on the list. Stated as a test because the
    /// tempting "just copy the whole tree" change would pass every other test in
    /// this module.
    #[test]
    fn chromium_state_is_not_copied() {
        for junk in [
            "Cache",
            "Code Cache",
            "GPUCache",
            "Local Storage",
            "Session Storage",
            "Cookies",
            "Preferences",
        ] {
            assert!(
                !ENTRIES.iter().any(|entry| entry.name == junk),
                "{junk} is Chromium state and means nothing to a webview v2 ships"
            );
        }
    }

    #[test]
    fn a_directory_with_a_database_is_migratable_and_reports_what_it_holds() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(dir.path().join(DATABASE_FILE), b"db").expect("db");
        std::fs::write(dir.path().join("config.json"), b"{}").expect("config");
        std::fs::create_dir_all(dir.path().join("album-art")).expect("art");

        let found = Discovery::inspect(dir.path());

        assert!(found.is_migratable());
        assert!(found.database && found.settings);
        assert!(!found.handoff && !found.renderer_state);
        assert_eq!(found.present, vec!["config.json", "album-art"]);
    }

    /// The case the whole check exists for: Electron made the directory, the
    /// user never built a library.
    #[test]
    fn a_chromium_only_directory_is_not_migratable() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::create_dir_all(dir.path().join("Cache")).expect("cache");
        std::fs::write(dir.path().join("Preferences"), b"{}").expect("prefs");

        let found = Discovery::inspect(dir.path());

        assert!(!found.is_migratable());
        assert!(found.present.is_empty());
    }

    #[test]
    fn an_absent_directory_is_not_migratable() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert!(!Discovery::inspect(&dir.path().join("nope")).is_migratable());
    }

    #[test]
    fn the_bridge_files_are_detected_when_present() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(dir.path().join(DATABASE_FILE), b"db").expect("db");
        std::fs::write(dir.path().join("v2-handoff.json"), b"{}").expect("handoff");
        std::fs::write(dir.path().join("renderer-state.json"), b"{}").expect("state");

        let found = Discovery::inspect(dir.path());
        assert!(found.handoff && found.renderer_state);
    }
}
