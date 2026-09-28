//! When a missing file counts as *moved away*, rather than merely unreachable.
//!
//! A re-point is only safe when the old file is really gone. [`Path::exists`]
//! alone cannot tell "gone" from "on storage that is not attached right now":
//! an unmounted external drive, a NAS that is asleep, a Windows mapped drive or
//! UNC share that is offline, a share that went stale after sleep. Treating
//! those as moves would hand the offline rows' history to whatever copies
//! happen to be imported meanwhile, and the history would then be deleted
//! with the copies. So a missing file counts as moved away only when all of
//! these hold, checked in this order:
//!
//! 1. its **volume root** ([`volume_root`]: `/Volumes/<name>` on macOS,
//!    `/media/<user>/<name>`, `/run/media/<user>/<name>` and `/mnt/<name>` on
//!    Linux, the drive root `X:\` or the share `\\server\share\` on Windows)
//!    answers "exists" **and lists at least one entry**. A path on the system
//!    volume has no separate root to check;
//! 2. the **registered music folder** that contains it (the longest registered
//!    folder the path lies under), when one does, answers the same way;
//! 3. the file itself answers "does not exist", as a *definite* answer.
//!
//! "Answers" means [`Path::try_exists`], never [`Path::exists`]: any error
//! (`EACCES`, `EIO`, `ETIMEDOUT` from a dead share, …) reads as "not moved",
//! because only `Ok(false)` says the file is gone rather than unreadable. The
//! non-empty rule catches the mount-point directory an unmount leaves behind
//! (a custom `mount_smbfs` target, autofs, a stale `/Volumes/<name>`), which
//! exists but is empty. The cost of these rules is only ever a missed move:
//! the file is inserted as a new track, which is the behaviour before move
//! detection existed. In particular a registered folder the user has emptied
//! completely stops following moves out of it.
//!
//! A path under no registered folder (a download that lived in the downloads
//! directory, say) is judged by rules 1 and 3 alone.
//!
//! Roots are checked before the file and their verdict is cached per
//! [`MovedAway`] instance, so a batch whose candidates share a hung mount pays
//! the OS timeout once for the root, never once per file.
//!
//! Paths are compared as the strings the scanner stored, so on Windows the
//! comparison is as case-sensitive as the scanner's own output, which is what
//! the library holds.

use std::collections::{HashMap, HashSet};
use std::io;
use std::path::Path;

/// How the checks ask the filesystem, so tests can inject the errors a dead
/// share produces.
pub trait Probe {
    /// [`Path::try_exists`].
    fn exists(&self, path: &Path) -> io::Result<bool>;
    /// Whether the directory lists at least one entry.
    fn has_entries(&self, path: &Path) -> io::Result<bool>;
}

/// The real filesystem.
#[derive(Debug, Clone, Copy, Default)]
pub struct Filesystem;

impl Probe for Filesystem {
    fn exists(&self, path: &Path) -> io::Result<bool> {
        path.try_exists()
    }

    fn has_entries(&self, path: &Path) -> io::Result<bool> {
        Ok(std::fs::read_dir(path)?.next().transpose()?.is_some())
    }
}

/// A batch of moved-away checks sharing one set of root verdicts.
pub struct MovedAway<'a, S, P = Filesystem> {
    music_roots: &'a [S],
    probe: P,
    roots_present: HashMap<String, bool>,
}

impl<'a, S: AsRef<str>> MovedAway<'a, S, Filesystem> {
    /// Checks against the real filesystem.
    pub fn new(music_roots: &'a [S]) -> Self {
        Self::with_probe(music_roots, Filesystem)
    }
}

impl<'a, S: AsRef<str>, P: Probe> MovedAway<'a, S, P> {
    /// Checks through `probe`.
    pub fn with_probe(music_roots: &'a [S], probe: P) -> Self {
        Self {
            music_roots,
            probe,
            roots_present: HashMap::new(),
        }
    }

    /// Whether `old_path` has moved away (see module docs).
    ///
    /// File I/O: never call it while the database's only connection is held.
    pub fn check(&mut self, old_path: &str) -> bool {
        let containing = self
            .music_roots
            .iter()
            .map(AsRef::as_ref)
            .filter(|root| lies_under(old_path, root))
            .max_by_key(|root| root.len())
            .map(str::to_owned);

        for root in volume_root(old_path).into_iter().chain(containing) {
            if !self.root_present(&root) {
                return false;
            }
        }

        matches!(self.probe.exists(Path::new(old_path)), Ok(false))
    }

    /// Whether `root` definitely exists and lists an entry, asked once.
    fn root_present(&mut self, root: &str) -> bool {
        if let Some(&known) = self.roots_present.get(root) {
            return known;
        }
        let path = Path::new(root);
        let present = matches!(self.probe.exists(path), Ok(true))
            && matches!(self.probe.has_entries(path), Ok(true));
        self.roots_present.insert(root.to_owned(), present);
        present
    }
}

/// Whether `old_path` has moved away, checked on its own.
pub fn moved_away<S: AsRef<str>>(old_path: &str, music_roots: &[S]) -> bool {
    MovedAway::new(music_roots).check(old_path)
}

/// The subset of `paths` that has moved away, sharing root verdicts.
pub fn moved_away_all<S: AsRef<str>>(paths: Vec<String>, music_roots: &[S]) -> HashSet<String> {
    let mut checker = MovedAway::new(music_roots);
    paths
        .into_iter()
        .filter(|path| checker.check(path))
        .collect()
}

/// The root of the removable or network volume `path` lives on, or `None` for
/// the system volume.
///
/// String-based rather than [`Path::components`], so the Windows forms are
/// recognised (and testable) on every platform.
pub fn volume_root(path: &str) -> Option<String> {
    // Windows verbatim prefixes: `\\?\UNC\server\share\…` and `\\?\C:\…`.
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return unc_share(rest);
    }
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);

    if let Some(rest) = path.strip_prefix(r"\\").or_else(|| path.strip_prefix("//")) {
        return unc_share(rest);
    }

    let bytes = path.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Some(format!("{}:\\", char::from(bytes[0]).to_ascii_uppercase()));
    }

    let segments: Vec<&str> = path.split('/').collect();
    let root = match segments.as_slice() {
        ["", "Volumes", name, ..] if !name.is_empty() => vec!["Volumes", name],
        ["", "media", user, name, ..] if !user.is_empty() && !name.is_empty() => {
            vec!["media", user, name]
        }
        ["", "run", "media", user, name, ..] if !user.is_empty() && !name.is_empty() => {
            vec!["run", "media", user, name]
        }
        ["", "mnt", name, ..] if !name.is_empty() => vec!["mnt", name],
        _ => return None,
    };
    Some(format!("/{}", root.join("/")))
}

/// `server\share\` from the text after a UNC prefix.
fn unc_share(rest: &str) -> Option<String> {
    let mut parts = rest.split(['\\', '/']).filter(|part| !part.is_empty());
    let server = parts.next()?;
    let share = parts.next()?;
    Some(format!(r"\\{server}\{share}\"))
}

/// Whether `path` is `root` itself or lies below it, on a separator boundary.
fn lies_under(path: &str, root: &str) -> bool {
    let trimmed = root.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return false;
    }
    match path.strip_prefix(trimmed) {
        Some("") => true,
        Some(rest) => rest.starts_with(['/', '\\']),
        None => false,
    }
}

#[cfg(test)]
#[path = "gone_tests.rs"]
mod tests;
