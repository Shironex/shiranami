//! When a missing file counts as *moved away*, rather than merely unreachable.
//!
//! A re-point is only safe when the old file is really gone. [`Path::exists`]
//! alone cannot tell "gone" from "on storage that is not attached right now":
//! an unmounted external drive, a NAS that is asleep, a Windows mapped drive or
//! UNC share that is offline, a share that went stale after sleep, a share
//! mounted *inside* a watched folder. Treating those as moves would hand the
//! offline rows' history to whatever copies happen to be imported meanwhile,
//! and the history would then be deleted with the copies. So a missing file
//! counts as moved away only when all of these hold:
//!
//! 1. its **volume root** ([`volume_root`]: `/Volumes/<name>` on macOS,
//!    `/media/<user>/<name>`, `/run/media/<user>/<name>` and `/mnt/<name>` on
//!    Linux, the drive root `X:\` or the share `\\server\share\` on Windows)
//!    definitely exists and lists a real entry. A path on the system volume
//!    has no separate root to check;
//! 2. the **registered music folder** that contains it (the longest registered
//!    folder the path lies under), when one does, answers the same way;
//! 3. the file itself definitely does not exist;
//! 4. its **nearest existing ancestor directory** (walking up from the file,
//!    stopping at the registered folder or the volume root) lists a real
//!    entry. This is what catches a share mounted below a watched folder
//!    (`~/Music` registered, a NAS at `~/Music/nas`): after an unmount the
//!    mount point stays behind as an empty directory inside a folder that is
//!    otherwise healthy.
//!
//! "Definitely" means [`Path::try_exists`] and `read_dir` answers, never
//! [`Path::exists`]: any error (`EACCES`, `EIO`, `ETIMEDOUT` from a dead
//! share, …) reads as "not moved". A "real entry" is any name that is not an
//! OS dropping ([`is_os_dropping`]: `.DS_Store`, `._*`, `desktop.ini`,
//! `Thumbs.db` and the like), because a leftover mount point can still hold
//! those.
//!
//! # What this cannot tell apart (accepted)
//!
//! Every miss below costs only a missed move: the file is inserted as a new
//! track, which is the behaviour before move detection existed.
//!
//! - **Files moved out of a folder that is left empty**, or holding only OS
//!   droppings: after an unmount a mount point is exactly such a folder, so
//!   the two cannot be distinguished. Moving a folder itself is followed as
//!   long as the folder it left still holds something real (another album,
//!   any file that is not an OS dropping); moving a folder that was its
//!   parent's only content leaves that parent empty and is not followed.
//!   Renaming a file in place, or moving some but not all of a folder's
//!   files, is followed.
//! - A registered folder the user has emptied completely.
//!
//! And these can produce a false move, because the storage answers
//! definitively that the file is not there:
//!
//! - **Windows Offline Files**, which serve a cached copy of a share that can
//!   omit a file the share still holds;
//! - **a different drive taking the same letter** (or mounted at the same
//!   path) while the original is unplugged;
//! - **two FAT sticks with the same volume label**, which macOS mounts at the
//!   same `/Volumes/<label>`.
//!
//! Recording each file's volume identity (`st_dev`, the volume serial) at hash
//! time would close the last two and the emptied-folder case; it is not done.
//!
//! # What a batch bounds
//!
//! Roots are checked before the file and their verdict is cached per
//! [`MovedAway`] instance. A root that fails, or a file whose own stat errors
//! (a mount that hangs after its root answered), marks the roots in play as
//! failed, so the rest of the batch under them is never statted: a hung mount
//! costs at most one timeout for the root and one for the first file. That
//! bound only exists where there is a root to cache: a file under no
//! registered folder and on no recognised volume root (see [`volume_root`])
//! has nothing to mark failed, so each such file costs its own stat. A file
//! that answers "not found" is re-checked against fresh (uncached) root
//! verdicts before it is accepted, so a root that went away mid-batch is not
//! trusted from a stale cache.
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
    /// Whether the directory lists at least one entry that is not an OS
    /// dropping ([`is_os_dropping`]).
    fn has_real_entries(&self, path: &Path) -> io::Result<bool>;
}

/// The real filesystem.
#[derive(Debug, Clone, Copy, Default)]
pub struct Filesystem;

impl Probe for Filesystem {
    fn exists(&self, path: &Path) -> io::Result<bool> {
        path.try_exists()
    }

    fn has_real_entries(&self, path: &Path) -> io::Result<bool> {
        for entry in std::fs::read_dir(path)? {
            if !is_os_dropping(&entry?.file_name().to_string_lossy()) {
                return Ok(true);
            }
        }
        Ok(false)
    }
}

/// Files and folders an OS leaves in a directory by itself, which say nothing
/// about whether the directory holds the user's music.
pub fn is_os_dropping(name: &str) -> bool {
    const EXACT: &[&str] = &[
        ".DS_Store",
        ".localized",
        ".directory",
        ".Spotlight-V100",
        ".Trashes",
        ".fseventsd",
        ".TemporaryItems",
    ];
    // Windows names are case-insensitive on disk.
    const ANY_CASE: &[&str] = &[
        "desktop.ini",
        "thumbs.db",
        "$recycle.bin",
        "system volume information",
    ];
    name.starts_with("._")
        || EXACT.contains(&name)
        || ANY_CASE
            .iter()
            .any(|candidate| name.eq_ignore_ascii_case(candidate))
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

    /// Start from the root verdicts an earlier batch cached
    /// ([`Self::into_verdicts`]), so work split into several batches asks
    /// each root once across all of them.
    #[must_use]
    pub fn with_verdicts(mut self, verdicts: HashMap<String, bool>) -> Self {
        self.roots_present = verdicts;
        self
    }

    /// The root verdicts this batch has cached, to seed the next one.
    pub fn into_verdicts(self) -> HashMap<String, bool> {
        self.roots_present
    }

    /// Whether every root `path` lies on (rules 1 and 2: its volume root and
    /// its registered music folder) is present, from the batch's cached
    /// verdicts. Says nothing about the file itself, which is never statted.
    ///
    /// File I/O: never call it while the database's only connection is held.
    pub fn roots_present(&mut self, path: &str) -> bool {
        let (roots, _) = self.roots_in_play(path);
        roots.iter().all(|root| self.root_present_cached(root))
    }

    /// Whether `old_path` has moved away (see module docs).
    ///
    /// File I/O: never call it while the database's only connection is held.
    pub fn check(&mut self, old_path: &str) -> bool {
        let (roots, stop) = self.roots_in_play(old_path);

        if !roots.iter().all(|root| self.root_present_cached(root)) {
            return false;
        }

        match self.probe.exists(Path::new(old_path)) {
            Ok(false) => {}
            Ok(true) => return false,
            Err(_) => {
                self.fail(&roots);
                return false;
            }
        }

        // "Not found" is the answer that re-points a row, so it is only
        // accepted against fresh root verdicts, never a cached one.
        for root in &roots {
            let present = self.root_present_fresh(root);
            self.roots_present.insert(root.clone(), present);
            if !present {
                return false;
            }
        }

        match self.nearest_existing_ancestor_has_real_entries(old_path, stop.as_deref()) {
            Ok(verdict) => verdict,
            Err(_) => {
                self.fail(&roots);
                false
            }
        }
    }

    /// The roots `path` lies on (its volume root, then the registered folder
    /// containing it) and the innermost of them, where the walk up from the
    /// file stops.
    fn roots_in_play(&self, path: &str) -> (Vec<String>, Option<String>) {
        let containing = self
            .music_roots
            .iter()
            .map(AsRef::as_ref)
            .filter(|root| lies_under(path, root))
            .max_by_key(|root| root.len())
            .map(str::to_owned);
        let volume = volume_root(path);
        let stop = containing.clone().or_else(|| volume.clone());
        let roots = volume.into_iter().chain(containing).collect();
        (roots, stop)
    }

    /// Rule 4: walk up to the nearest directory that exists and ask whether
    /// it lists a real entry. Reaching the stop root without finding one is a
    /// "no"; any error is an error.
    fn nearest_existing_ancestor_has_real_entries(
        &self,
        old_path: &str,
        stop: Option<&str>,
    ) -> io::Result<bool> {
        let stop = stop.map(|root| Path::new(root.trim_end_matches(['/', '\\'])));
        let mut dir = Path::new(old_path).parent();
        while let Some(candidate) = dir {
            if candidate.as_os_str().is_empty() {
                return Ok(false);
            }
            if self.probe.exists(candidate)? {
                return self.probe.has_real_entries(candidate);
            }
            if stop == Some(candidate) {
                return Ok(false);
            }
            dir = candidate.parent();
        }
        Ok(false)
    }

    /// Mark every root in play as not present for the rest of the batch.
    fn fail(&mut self, roots: &[String]) {
        for root in roots {
            self.roots_present.insert(root.clone(), false);
        }
    }

    /// Whether `root` definitely exists and lists a real entry, asked once
    /// per batch.
    fn root_present_cached(&mut self, root: &str) -> bool {
        if let Some(&known) = self.roots_present.get(root) {
            return known;
        }
        let present = self.root_present_fresh(root);
        self.roots_present.insert(root.to_owned(), present);
        present
    }

    /// The same question, asked of the filesystem now.
    fn root_present_fresh(&self, root: &str) -> bool {
        let path = Path::new(root);
        matches!(self.probe.exists(path), Ok(true))
            && matches!(self.probe.has_real_entries(path), Ok(true))
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
