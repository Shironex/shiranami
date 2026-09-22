//! The allowed-roots cache, ported from
//! `apps/desktop/src/main/shared/folders-cache.ts`.
//!
//! Holds the set of filesystem roots the renderer may reach through the shell
//! handlers and the audio stream server, plus a bounded cache of paths already
//! authorized. Rebuilt lazily on first access and held until [`FoldersCache::invalidate`];
//! the handlers that change the allowed set (`db:folders:add`, `db:folders:remove`,
//! `downloader:set-download-location`) call that after a successful write.
//!
//! Everything here is synchronous. The v1 version was `async` only because of
//! `fs.promises.realpath`; in v2 the command layer wraps calls in
//! `spawn_blocking` (architecture §2.3), which keeps the guard itself a plain
//! function that is trivial to test.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::paths::authority::PathAuthority;
use crate::paths::safety::{is_path_within_any, normalize_for_compare};
use crate::sync::lock_or_recover;

/// How many positive authorizations to remember. Ported verbatim.
const ALLOWED_PATHS_LIMIT: usize = 1024;

/// The two normalized root sets, built together from one read of the tables.
///
/// Two sets rather than one because reading and writing are different
/// questions. A read may reach anything the shell handlers may reach; a write
/// must land inside a folder the user actually pointed the library at, and
/// nowhere else. Built in one pass so the narrower set costs no extra database
/// round-trip.
#[derive(Clone)]
struct Roots {
    /// Data directory, downloads location and every watched folder.
    allowed: Vec<PathBuf>,
    /// The watched folders alone.
    library: Vec<PathBuf>,
}

#[derive(Default)]
struct CacheState {
    /// Normalized roots; `None` until the first build.
    roots: Option<Roots>,
    /// Paths already authorized, mapped to the tick at which they last hit.
    granted: HashMap<PathBuf, u64>,
    /// Monotonic counter providing the recency ordering for eviction.
    tick: u64,
    /// Bumped by every [`FoldersCache::invalidate`]. A build that started before
    /// an invalidate must not install its now-stale result afterwards.
    generation: u64,
}

/// Cache of allowed filesystem roots, and of the paths already checked against
/// them.
///
/// Roots are the app data directory (which covers the on-disk album-art cache),
/// the active downloads location, and every row in the `folders` table.
/// [`FoldersCache::is_path_allowed`] additionally honours a fourth case: any
/// path present in the `tracks` table, because standalone files imported through
/// a file dialog legitimately live outside every registered root. That
/// deliberately means removing a folder does **not** immediately revoke access
/// to tracks beneath it — they stay in the database until the user removes them.
///
/// [`FoldersCache::is_within_library_folder`] answers the narrower question a
/// *write* has to ask, against the watched folders alone.
pub struct FoldersCache {
    data_dir: PathBuf,
    authority: Arc<dyn PathAuthority>,
    state: Mutex<CacheState>,
}

impl FoldersCache {
    /// Build a cache rooted at `data_dir` (the app's own data directory), asking
    /// `authority` for everything else. Nothing is read until first use.
    pub fn new(data_dir: PathBuf, authority: Arc<dyn PathAuthority>) -> Self {
        Self {
            data_dir,
            authority,
            state: Mutex::new(CacheState::default()),
        }
    }

    /// Drop the cached roots **and** every positive authorization.
    ///
    /// Both halves matter: a granted path must never outlive a change to the
    /// allowed-root set, or removing a folder would leave stale access behind.
    pub fn invalidate(&self) {
        let mut state = lock_or_recover(&self.state);
        state.roots = None;
        state.granted.clear();
        state.generation = state.generation.wrapping_add(1);
    }

    /// The normalized allowed roots, building them on first call.
    ///
    /// The build runs **without** the lock held. It reads the settings store,
    /// the database and the filesystem, none of which should be serialized
    /// behind a guard the audio route takes on every Range request — and a
    /// [`PathAuthority`] that reached back into this cache while it held the
    /// lock would deadlock outright.
    ///
    /// The cost is that two callers can build concurrently. That is wasted work,
    /// never a wrong answer, because the build reads nothing from the cache. The
    /// generation counter covers the case that would be wrong: a build racing an
    /// [`Self::invalidate`] refuses to install its stale result, so a removed
    /// folder can never be resurrected by an in-flight rebuild.
    pub fn allowed_roots(&self) -> Vec<PathBuf> {
        self.roots().allowed
    }

    /// Whether `directory` is inside a folder the user pointed the library at.
    ///
    /// The **write** containment gate, and narrower than [`Self::is_path_allowed`]
    /// in both of the ways a write needs it to be:
    ///
    /// - Only the `folders` rows count. The read gate also grants the app's own
    ///   data directory, the downloads location, and any row in the `tracks`
    ///   table — the last of which would make the folder of a standalone file
    ///   imported through a file dialog years ago a writable destination
    ///   anywhere on the disk.
    /// - Symlinks are resolved first, for [`Self::is_path_allowed`]'s reason:
    ///   [`crate::paths::safety`] is purely textual, so a link inside a watched
    ///   folder pointing outside it reads as contained, and the downstream
    ///   `open` would happily follow it out of the library.
    ///
    /// Not cached. A grant table exists on the read path because the audio route
    /// re-checks on every Range request of a seek; a write happens once per
    /// file, so the `realpath` is not worth a second cache to keep coherent.
    ///
    /// Fails closed: an empty path and an empty root set both deny.
    pub fn is_within_library_folder(&self, directory: &Path) -> bool {
        if directory.as_os_str().is_empty() {
            return false;
        }

        is_path_within_any(&resolve_symlinks(directory), &self.roots().library)
    }

    /// Both root sets, building them on first call. See [`Self::allowed_roots`].
    fn roots(&self) -> Roots {
        let generation = {
            let state = lock_or_recover(&self.state);
            if let Some(roots) = &state.roots {
                return roots.clone();
            }
            state.generation
        };

        let roots = self.build_roots();

        let mut state = lock_or_recover(&self.state);
        if state.generation == generation {
            state.roots = Some(roots.clone());
        }
        roots
    }

    /// Build the cache eagerly, so the first user-triggered request does not pay
    /// for it. Called from boot once the database is open.
    pub fn prewarm(&self) {
        let _ = self.allowed_roots();
    }

    /// Whether `path` is safe to expose through the shell or audio handlers.
    ///
    /// Three steps, in the order v1 used:
    ///
    /// 1. **Fast path.** The exact input was authorized since the last
    ///    [`Self::invalidate`]. The audio route issues a stable URL per file and
    ///    re-checks on every Range request of a seek, so this is what keeps a
    ///    `realpath` (and, for standalone imports, a database round-trip) off
    ///    the hot path.
    /// 2. **Containment.** Resolve symlinks, then check against the allowed
    ///    roots. Resolution is required, not optional: the stream server's
    ///    downstream `open` follows symlinks, so a textual check alone would let
    ///    a link inside an allowed root serve a file outside it.
    /// 3. **Tracks fallback.** A row in `tracks` matching the lexically resolved
    ///    path. Looked up resolved rather than raw so a renderer path carrying
    ///    `..` segments still matches the row stored in canonical form.
    ///
    /// Fails closed: a database error denies. Negative results are never cached,
    /// because a path can legitimately become allowed later through an import.
    pub fn is_path_allowed(&self, path: &Path) -> bool {
        if path.as_os_str().is_empty() {
            return false;
        }

        if self.is_granted(path) {
            return true;
        }

        // `realpath` swallowing ENOENT/EACCES is intentional: the textual path
        // is then checked, and the downstream open surfaces the real error to
        // the renderer instead of this guard reporting a misleading denial.
        let resolved = resolve_symlinks(path);
        if is_path_within_any(&resolved, &self.allowed_roots()) {
            self.grant(path);
            return true;
        }

        match self.authority.has_track_at(&lexically_resolve(path)) {
            Ok(true) => {
                self.grant(path);
                true
            }
            Ok(false) => false,
            Err(error) => {
                tracing::warn!(
                    %error,
                    path = %path.display(),
                    "tracks lookup failed; denying path (fail-closed)"
                );
                false
            }
        }
    }

    /// Assemble both sets: data dir, downloads location, then the watched
    /// folders. Each is symlink-resolved once here — cheap, because the count is
    /// O(10) — then normalized and de-duplicated, preserving first-seen order.
    fn build_roots(&self) -> Roots {
        let folder_roots = self.authority.folder_roots().unwrap_or_else(|error| {
            // Ported behaviour: a folders-table read failure degrades to "no
            // folder roots" rather than taking path handling down with it. The
            // data dir and downloads location still authorize.
            tracing::warn!(
                %error,
                "folders table read failed; continuing without folder roots"
            );
            Vec::new()
        });

        let library = normalize_all(folder_roots.iter().cloned());
        let allowed = normalize_all(
            [self.data_dir.clone(), self.authority.download_location()]
                .into_iter()
                .chain(folder_roots),
        );

        Roots { allowed, library }
    }

    fn is_granted(&self, path: &Path) -> bool {
        let mut state = lock_or_recover(&self.state);
        let tick = state.tick.wrapping_add(1);
        let Some(slot) = state.granted.get_mut(path) else {
            return false;
        };
        // Refresh recency on a hit, so the bound evicts least-recently-used.
        *slot = tick;
        state.tick = tick;
        true
    }

    fn grant(&self, path: &Path) {
        let mut state = lock_or_recover(&self.state);
        state.tick = state.tick.wrapping_add(1);
        let tick = state.tick;
        state.granted.insert(path.to_path_buf(), tick);

        // Eviction scans, but only on the insertion that crosses the bound, so
        // the hot path stays O(1). At 1,024 entries the scan is noise next to
        // the `realpath` it exists to avoid.
        while state.granted.len() > ALLOWED_PATHS_LIMIT {
            let Some(oldest) = state
                .granted
                .iter()
                .min_by_key(|&(_, &seen)| seen)
                .map(|(path, _)| path.clone())
            else {
                break;
            };
            state.granted.remove(&oldest);
        }
    }
}

/// Resolve, normalize and de-duplicate a run of roots, preserving first-seen
/// order. Empty entries are dropped: they would normalize to the process's
/// working directory and authorize half the disk.
fn normalize_all(candidates: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for candidate in candidates {
        if candidate.as_os_str().is_empty() {
            continue;
        }
        let normalized = normalize_for_compare(&resolve_symlinks(&candidate));
        if !roots.contains(&normalized) {
            roots.push(normalized);
        }
    }
    roots
}

/// Resolve symlinks, falling back to the input when the path does not exist yet.
///
/// A freshly configured download directory or a not-yet-created root should
/// still authorize paths beneath it once it appears, which is why a failure is a
/// warning rather than a rejection.
fn resolve_symlinks(path: &Path) -> PathBuf {
    match std::fs::canonicalize(path) {
        Ok(resolved) => strip_verbatim_prefix(resolved),
        Err(error) => {
            tracing::warn!(
                %error,
                path = %path.display(),
                "realpath failed; using the path as-is"
            );
            path.to_path_buf()
        }
    }
}

/// Collapse `.` and `..` without touching the filesystem.
///
/// The database stores `tracks.file_path` in canonical form, so a renderer path
/// such as `/music/foo/../song.mp3` has to be folded before it can match.
fn lexically_resolve(path: &Path) -> PathBuf {
    let mut resolved = PathBuf::new();
    let mut depth = 0_usize;
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if depth > 0 {
                    resolved.pop();
                    depth -= 1;
                }
            }
            std::path::Component::Normal(part) => {
                resolved.push(part);
                depth += 1;
            }
            other => resolved.push(other.as_os_str()),
        }
    }
    resolved
}

/// Strip Windows' `\\?\` verbatim prefix from a canonicalized path.
///
/// `std::fs::canonicalize` returns verbatim paths on Windows while Node's
/// `realpath` does not. Left in place, a resolved child (`\\?\C:\music\a.mp3`)
/// would fail to match a root that never got canonicalized because it does not
/// exist yet (`C:\music`) — the two differ in their very first component.
#[cfg(windows)]
fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    use std::path::{Component, Prefix};

    let mut components = path.components();
    let Some(Component::Prefix(prefix)) = components.next() else {
        return path;
    };
    let Prefix::VerbatimDisk(letter) = prefix.kind() else {
        // Verbatim UNC and device paths have no plain equivalent; leave them.
        return path;
    };

    let mut rebuilt = PathBuf::from(format!("{}:\\", letter as char));
    rebuilt.extend(
        components
            .filter(|component| !matches!(component, Component::RootDir | Component::Prefix(_))),
    );
    rebuilt
}

/// No-op off Windows: `canonicalize` returns a plain path there.
#[cfg(not(windows))]
fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    path
}
