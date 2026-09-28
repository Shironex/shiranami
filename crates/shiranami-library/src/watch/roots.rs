//! Which registered folder an event belongs to.
//!
//! Events arrive as absolute paths and the renderer thinks in folder ids, so
//! every event is attributed to one [`WatchRoot`] before it is coalesced.
//!
//! # Two spellings per root
//!
//! The OS does not always report a path the way the user registered it. macOS
//! FSEvents reports the *resolved* path, so a folder registered through a
//! symlink (`/var/...` is `/private/var/...`, and so is every temp dir) would
//! match nothing. Windows reports the path as it was given to the watch, but
//! `canonicalize` there adds a `\\?\` prefix. Each root therefore answers to
//! both its registered and its canonical spelling, whichever the backend uses.
//!
//! # Nested folders go to the innermost
//!
//! A user can register `~/Music` and `~/Music/Lofi` both. A change under the
//! second is attributed to it alone: its scan covers the change, and scoping the
//! follow-up to the smaller folder is the whole point of scoping.
//!
//! # Depth follows the scan
//!
//! The scan reads [`SCAN_MAX_DEPTH`] directory levels below a root. A change
//! deeper than that is invisible to the rescan it would trigger, so it is not
//! attributed at all.

use std::path::{Component, Path, PathBuf};

use crate::scan::SCAN_MAX_DEPTH;

/// A registered library folder, as the watcher needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchRoot {
    /// The `folders.id` the renderer rescans by.
    pub id: String,
    /// The folder as registered.
    pub path: PathBuf,
}

/// The deepest relative path, in components, whose change the scan can see.
///
/// A file at relative depth `k` lives in a directory `k - 1` levels down, which
/// the scan reads while `k - 1 <= SCAN_MAX_DEPTH`.
const MAX_RELATIVE_COMPONENTS: usize = SCAN_MAX_DEPTH + 1;

#[derive(Debug, Clone)]
struct Entry {
    id: String,
    registered: PathBuf,
    spellings: Vec<PathBuf>,
}

/// The current roots, indexed for attribution.
#[derive(Debug, Clone, Default)]
pub struct RootIndex {
    entries: Vec<Entry>,
}

impl RootIndex {
    /// Index `roots`, resolving each one's canonical spelling now.
    ///
    /// A root that cannot be resolved (a missing drive) keeps only its
    /// registered spelling, and is still indexed: the watch on it will fail and
    /// be retried, and nothing is attributed to it meanwhile anyway.
    pub fn new(roots: &[WatchRoot]) -> Self {
        let entries = roots
            .iter()
            .map(|root| {
                let mut spellings = vec![root.path.clone()];
                if let Ok(canonical) = root.path.canonicalize()
                    && canonical != root.path
                {
                    spellings.push(canonical);
                }
                Entry {
                    id: root.id.clone(),
                    registered: root.path.clone(),
                    spellings,
                }
            })
            .collect();
        Self { entries }
    }

    /// The id of the innermost root containing `path`, if the scan would see
    /// a change there.
    pub fn attribute(&self, path: &Path) -> Option<&str> {
        let mut best: Option<(&str, usize)> = None;

        for entry in &self.entries {
            for spelling in &entry.spellings {
                let Ok(relative) = path.strip_prefix(spelling) else {
                    continue;
                };
                let depth = relative
                    .components()
                    .filter(|component| matches!(component, Component::Normal(_)))
                    .count();
                if depth == 0 || depth > MAX_RELATIVE_COMPONENTS {
                    continue;
                }
                let specificity = spelling.components().count();
                if best.is_none_or(|(_, current)| specificity > current) {
                    best = Some((entry.id.as_str(), specificity));
                }
            }
        }

        best.map(|(id, _)| id)
    }

    /// The registered path of the root with `id`.
    pub fn path_of(&self, id: &str) -> Option<&Path> {
        self.entries
            .iter()
            .find(|entry| entry.id == id)
            .map(|entry| entry.registered.as_path())
    }

    /// Every indexed id.
    pub fn ids(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|entry| entry.id.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(id: &str, path: &str) -> WatchRoot {
        WatchRoot {
            id: id.to_owned(),
            path: PathBuf::from(path),
        }
    }

    #[test]
    fn a_path_is_attributed_to_the_innermost_root() {
        let index = RootIndex::new(&[root("outer", "/m"), root("inner", "/m/lofi")]);

        assert_eq!(index.attribute(Path::new("/m/a.mp3")), Some("outer"));
        assert_eq!(index.attribute(Path::new("/m/lofi/a.mp3")), Some("inner"));
        assert_eq!(index.attribute(Path::new("/elsewhere/a.mp3")), None);
    }

    #[test]
    fn a_sibling_with_a_shared_prefix_is_not_inside() {
        let index = RootIndex::new(&[root("m", "/m/lofi")]);

        assert_eq!(index.attribute(Path::new("/m/lofi-archive/a.mp3")), None);
    }

    #[test]
    fn the_root_itself_is_not_a_change_inside_it() {
        let index = RootIndex::new(&[root("m", "/m")]);

        assert_eq!(index.attribute(Path::new("/m")), None);
    }

    #[test]
    fn changes_deeper_than_the_scan_reads_are_not_attributed() {
        let index = RootIndex::new(&[root("m", "/m")]);

        assert_eq!(
            index.attribute(Path::new("/m/1/2/3/4/5/a.mp3")),
            Some("m"),
            "six components: a file in a directory five levels down is scanned"
        );
        assert_eq!(index.attribute(Path::new("/m/1/2/3/4/5/6/a.mp3")), None);
    }

    #[test]
    fn a_root_answers_to_its_canonical_spelling() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let canonical = dir.path().canonicalize().expect("canonicalize");
        let index = RootIndex::new(&[WatchRoot {
            id: "t".to_owned(),
            path: dir.path().to_path_buf(),
        }]);

        assert_eq!(index.attribute(&dir.path().join("a.mp3")), Some("t"));
        assert_eq!(index.attribute(&canonical.join("a.mp3")), Some("t"));
        assert_eq!(index.path_of("t"), Some(dir.path()));
    }
}
