//! Finding the audio files under a folder.
//!
//! Ported from `scanDirectoryRecursive` and `scanDirectoryGrouped` in
//! `apps/desktop/src/main/ipc/library.ts:31-86`.
//!
//! # What v1 excludes, exhaustively: nothing
//!
//! There is no hidden-file rule, no dot-directory rule, no `node_modules` or
//! `$RECYCLE.BIN` blocklist, no minimum size. `.Trashes/`, `.git/` and
//! `.Spotlight-V100/` are all walked. That is reproduced rather than fixed,
//! including its one visibly bad consequence: a macOS AppleDouble sidecar named
//! `._track.mp3` passes the extension test, fails to parse, and becomes a
//! placeholder row titled `._track`. Filtering it would be an improvement, and
//! improvements are how a port stops being comparable to the thing it ports —
//! it is called out in the crate docs so the decision can be taken deliberately
//! later.
//!
//! The only thing that *is* skipped is a symlink, and even that is incidental:
//! v1 tested `entry.isDirectory()` then `entry.isFile()`, and a `Dirent` for a
//! symlink answers `false` to both. [`walkdir`] with `follow_links` off
//! reproduces it exactly — and, as a bonus, needs no cycle detection for the
//! same reason v1 needed none.

use std::path::{Path, PathBuf};

use walkdir::WalkDir;

/// The audio extensions the app scans, from
/// `apps/desktop/src/main/shared/media-types.ts:10-22`.
///
/// Ten of them, lowercase and dot-prefixed exactly as the `Set` holds them.
/// Note that this is wider than what `shiranami-audio` can decode: `.opus` and
/// `.wma` are listed, were ffmpeg-fallback-only in v1, and are still accepted
/// here — discovery's job is to match v1's file set, not to predict which files
/// will later analyse.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    ".mp3", ".flac", ".wav", ".ogg", ".aac", ".m4a", ".opus", ".wma", ".weba", ".webm",
];

/// v1's `maxDepth` for the recursive walk, in v1's own units: the number of
/// directory levels below the root whose contents are read.
///
/// The guard is `depth > maxDepth` with the root at `depth = 0`, so directories
/// at levels 0 through 5 are read and the deepest file found sits six levels
/// under the root.
pub const SCAN_MAX_DEPTH: usize = 5;

/// The same bound in `walkdir`'s units, where the root is depth 0 and its direct
/// children are depth 1.
///
/// A file at walkdir depth `k` lives in a directory at walkdir depth `k - 1`,
/// which is v1's `depth` — readable while `k - 1 <= 5`. Hence `6`.
const WALK_MAX_DEPTH: usize = SCAN_MAX_DEPTH + 1;

/// Whether a file name ends in one of [`AUDIO_EXTENSIONS`].
///
/// Ported operator-for-operator from `isAudioExtension`:
///
/// ```js
/// const dot = filePath.lastIndexOf('.');
/// if (dot === -1) return false;
/// return AUDIO_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
/// ```
///
/// Two consequences of `lastIndexOf` that `Path::extension` would *not*
/// reproduce, which is why this is hand-rolled:
///
/// - A file named exactly `.mp3` matches. `Path::extension` reads it as a
///   dotfile with no extension and returns `None`.
/// - A file named `noextension` does not match, and neither does one whose only
///   dot is in a parent directory — v1 tests `entry.name`, never the full path.
pub fn is_audio_file(file_name: &str) -> bool {
    let Some(dot) = file_name.rfind('.') else {
        return false;
    };

    // `to_lowercase`, not `to_ascii_lowercase`, because JavaScript's
    // `toLowerCase` is Unicode-aware. The two agree for every extension in the
    // set, but agreeing by accident is not the same as agreeing.
    let extension = file_name[dot..].to_lowercase();
    AUDIO_EXTENSIONS.contains(&extension.as_str())
}

/// Every audio file under `root`, in the order v1 would have produced them.
///
/// Order is the filesystem's own `readdir` order, depth-first and pre-order:
/// v1 appends a subdirectory's whole subtree at the position the subdirectory
/// appeared in its parent's listing, which is precisely what `walkdir` yields.
/// It is deliberately *not* sorted. The order reaches the database as insert
/// order, and every library read tie-breaks on `rowid` because a whole scan
/// stamps an identical second-resolution `created_at` — so sorting here would
/// silently reorder an existing user's library view.
///
/// An unreadable directory is logged and contributes nothing, and the walk
/// continues with its siblings. So does an unreadable *root*: v1 wraps its
/// whole `readdir` in a `try/catch` that returns an empty list, so scanning a
/// folder that has been deleted or unmounted is an empty scan, never a failure.
pub fn discover_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root).max_depth(WALK_MAX_DEPTH) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                tracing::warn!(%error, "failed to scan directory");
                continue;
            }
        };

        // `is_file()` is false for a symlink here, which is the whole of v1's
        // symlink handling.
        if !entry.file_type().is_file() {
            continue;
        }

        if is_audio_file(&entry.file_name().to_string_lossy()) {
            files.push(entry.into_path());
        }
    }

    files
}

/// One immediate subdirectory of the scanned root, and the files under it.
pub struct DiscoveredSubfolder {
    /// The directory's own name.
    pub name: String,
    /// Its absolute path.
    pub path: PathBuf,
    /// Every audio file beneath it.
    pub files: Vec<PathBuf>,
}

/// What a grouped scan found before any tags were read.
#[derive(Default)]
pub struct DiscoveredGroups {
    /// Audio files sitting directly in the root.
    pub root_files: Vec<PathBuf>,
    /// One entry per immediate subdirectory that held at least one audio file.
    pub subfolders: Vec<DiscoveredSubfolder>,
}

impl DiscoveredGroups {
    /// Every discovered file across the root and all subfolders.
    ///
    /// This is the count v1 hands to `setBatchSize` once for the whole scan, so
    /// that the progress bar runs end to end instead of restarting per group.
    pub fn total_files(&self) -> usize {
        self.root_files.len()
            + self
                .subfolders
                .iter()
                .map(|subfolder| subfolder.files.len())
                .sum::<usize>()
    }
}

/// Group `root`'s contents: loose files, then one group per immediate
/// subdirectory.
///
/// # The depth asymmetry is real and is preserved
///
/// v1 recurses into each subdirectory with `scanDirectoryRecursive(fullPath)` —
/// **default arguments**, so the depth counter restarts at zero
/// (`library.ts:73`). A grouped scan therefore reaches one directory level
/// deeper than a flat scan of the same tree. It looks like an oversight and may
/// well be one, but `library.test.ts` pins the flat bound explicitly and the
/// grouped path is the only one production uses, so "fixing" it would quietly
/// add files to real users' libraries on the next rescan.
pub fn discover_grouped(root: &Path) -> DiscoveredGroups {
    let mut groups = DiscoveredGroups::default();

    // Exactly one level, in filesystem order — v1's single `readdir` of the
    // root. `min_depth(1)` drops the root itself; `max_depth(1)` stops the walk
    // from descending, so each subdirectory is re-entered below with its own
    // fresh depth budget.
    for entry in WalkDir::new(root).min_depth(1).max_depth(1) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                tracing::warn!(%error, "failed to scan directory for grouping");
                continue;
            }
        };

        let file_type = entry.file_type();
        let name = entry.file_name().to_string_lossy().into_owned();

        if file_type.is_dir() {
            let files = discover_files(entry.path());
            // A subdirectory with no audio anywhere beneath it is omitted
            // entirely rather than reported empty.
            if !files.is_empty() {
                groups.subfolders.push(DiscoveredSubfolder {
                    name,
                    path: entry.into_path(),
                    files,
                });
            }
        } else if file_type.is_file() && is_audio_file(&name) {
            groups.root_files.push(entry.into_path());
        }
    }

    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_listed_extension_matches_case_insensitively() {
        for extension in AUDIO_EXTENSIONS {
            assert!(is_audio_file(&format!("track{extension}")), "{extension}");
            assert!(
                is_audio_file(&format!("track{}", extension.to_uppercase())),
                "{extension} uppercased"
            );
        }
    }

    #[test]
    fn an_unlisted_extension_does_not_match() {
        for name in ["cover.jpg", "notes.txt", "playlist.m3u", "track.mp4"] {
            assert!(!is_audio_file(name), "{name}");
        }
    }

    #[test]
    fn a_name_with_no_dot_does_not_match() {
        assert!(!is_audio_file("noextension"));
        assert!(!is_audio_file(""));
    }

    #[test]
    fn a_name_that_is_only_an_extension_matches() {
        // `lastIndexOf('.')` finds index 0 and the slice is the whole name, so
        // v1 accepts this. `Path::extension` would return `None` and skip it,
        // which is exactly the divergence this function exists to avoid.
        assert!(is_audio_file(".mp3"));
    }

    #[test]
    fn only_the_last_dot_decides() {
        assert!(is_audio_file("my.song.flac"));
        assert!(!is_audio_file("my.flac.txt"));
    }

    #[test]
    fn an_appledouble_sidecar_is_accepted_as_v1_accepts_it() {
        // Documented, deliberate, and the highest-value candidate for a future
        // product decision — see the module docs.
        assert!(is_audio_file("._track.mp3"));
    }

    #[test]
    fn hidden_files_are_not_excluded() {
        assert!(is_audio_file(".hidden.mp3"));
    }
}
