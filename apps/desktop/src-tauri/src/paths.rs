//! Where the shell resolves its own directories, and the one guard that decides
//! whether the renderer may name a filesystem path.
//!
//! `shiranami_core::paths` owns the *rules* — normalisation, symlink-resolving
//! containment, the allowed-roots cache. This module owns the two things those
//! rules cannot know from rank 0: which directories **this process** was given
//! by Tauri, and where the roots come from at runtime.
//!
//! # The guard is not optional and not per-namespace
//!
//! v1 put `isPathAllowed` in front of `shell:show-in-folder`, `shell:trash-file`
//! and the audio protocol, and the reason is the same in all three: the renderer
//! supplies the string. Without containment, `shell:trash-file` is
//! "delete any file on the machine" behind a single unvalidated argument.
//! [`ensure_allowed`] lives here rather than in `commands/shell.rs` because the
//! stream server and the storage namespace need the identical check, and a
//! second copy of a security boundary is a second thing that can drift out of
//! agreement with the first.
//!
//! # Why the authority is a snapshot
//!
//! [`PathAuthority`] is synchronous — deliberately, so
//! [`FoldersCache::is_path_allowed`] stays a plain function the audio route can
//! call under `spawn_blocking`. But two of its three answers come from SQLite,
//! which is `async` here. So the async half runs **first**, in the command, and
//! hands the cache a [`Snapshot`] of already-resolved facts. That inverts the
//! laziness — the tracks lookup happens even when containment would have
//! answered on its own — which costs one indexed `SELECT` on a right-click. The
//! alternative is `block_on` inside a `PathAuthority`, on a thread that may be
//! the runtime's own, which is a deadlock rather than a cost.
//!
//! The snapshot is therefore built per check and answers for **one** path. It is
//! not a cache and must not be kept: Phase 16 owns the long-lived
//! [`FoldersCache`] the audio route needs, with a real authority behind it.
//!
//! # Degradation matches v1 exactly
//!
//! v1's `readFolderPaths` caught its own failure and continued with no folder
//! roots; its tracks lookup denied on failure ("fails closed if the database is
//! unavailable"). Both are reproduced, because the asymmetry is deliberate: a
//! missing folder root narrows what is allowed, while a failed tracks lookup
//! that defaulted to *allow* would widen it.

use std::path::PathBuf;
use std::sync::Arc;

use shiranami_core::CoreError;
use shiranami_core::error::ErrorPayload;
use shiranami_core::paths::{FoldersCache, PathAuthority, PathAuthorityResult};
use shiranami_db::repo;
use shiranami_downloader::location;
use tauri::Manager as _;

use crate::error::{CommandResult, bad_request};
use crate::state::AppState;

/// The log directory's name inside the app data directory.
///
/// v1 wrote to `<userData>/logs` and named its files `shiranami-<date>.log`.
/// Tauri offers `app_log_dir()`, which on macOS is `~/Library/Logs/<bundle id>`
/// — a *different* directory, and one that §3's first-run continuity does not
/// copy, since it copies the v1 data tree. Keeping the logs beside the data is
/// what makes "open the log folder" show the user the same files it did before
/// the upgrade.
pub const LOGS_DIRECTORY_NAME: &str = "logs";

/// An OS-level failure, as the renderer's frozen `INTERNAL` code.
///
/// The plugin and `trash` errors are opaque strings with no registry entry of
/// their own, and inventing one per OS surface would give the renderer codes it
/// has no branch for. [`CoreError::Io`] is the existing vocabulary for "an
/// operation on this path failed", and it already renders the path into the
/// message, which is the part a user can act on.
pub fn io_failure(
    operation: &'static str,
    path: impl Into<PathBuf>,
    source: impl std::fmt::Display,
) -> ErrorPayload {
    ErrorPayload::of(&CoreError::Io {
        operation,
        path: path.into(),
        source: std::io::Error::other(source.to_string()),
    })
}

/// This app's data directory, as Tauri resolved it.
///
/// `shiranami_core::paths::data_dir` computes the same location from `$HOME` and
/// the bundle identifier, and exists so the settings store can resolve it
/// without a `tauri::App`. Here there *is* an app, so the resolver is the
/// authority and core's copy is the fallback — never the other way round, or a
/// platform where the two disagree would split the app's data in half.
pub fn data_dir(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    if let Ok(resolved) = app.path().app_data_dir() {
        return Ok(resolved);
    }

    shiranami_core::paths::data_dir().ok_or_else(|| {
        io_failure(
            "resolve the data directory",
            shiranami_core::paths::V2_DIRECTORY_NAME,
            "neither Tauri nor the environment names a home directory",
        )
    })
}

/// The directory `app:open-logs-folder` opens.
pub fn logs_dir(app: &tauri::AppHandle) -> CommandResult<PathBuf> {
    Ok(data_dir(app)?.join(LOGS_DIRECTORY_NAME))
}

/// Refuse a renderer-supplied path that is outside every allowed root.
///
/// Returns the path itself on success, so a caller reads as
/// `let path = ensure_allowed(…).await?;` and cannot accidentally act on the
/// unvalidated string it passed in.
///
/// # Errors
///
/// `BAD_REQUEST` for an empty path (v1's `z.string().min(1)`), `FORBIDDEN` for
/// one outside the roots.
pub async fn ensure_allowed(
    app: &tauri::AppHandle,
    state: &AppState,
    path: &str,
) -> CommandResult<PathBuf> {
    if path.is_empty() {
        return Err(bad_request("the file path must not be empty"));
    }

    let data_dir = data_dir(app)?;
    let snapshot = Snapshot::resolve(app, state, path).await?;
    let candidate = PathBuf::from(path);

    // `is_path_allowed` calls `canonicalize`, which is disk I/O and must not run
    // on the thread answering the invoke.
    let owned = candidate.clone();
    let allowed = tauri::async_runtime::spawn_blocking(move || {
        FoldersCache::new(data_dir, Arc::new(snapshot)).is_path_allowed(&owned)
    })
    .await
    .map_err(|error| io_failure("check", &candidate, error))?;

    if !allowed {
        // v1 logged the same line before rejecting, and it is the only record
        // that a guard fired at all — the renderer sees a code, not a reason.
        tracing::warn!(path, "blocked a path outside every allowed root");
        return Err(ErrorPayload::of(&CoreError::PathNotAllowed {
            path: candidate,
        }));
    }

    Ok(candidate)
}

/// Everything [`PathAuthority`] would have gone to disk for, resolved up front
/// for exactly one path. See the module docs.
struct Snapshot {
    download_location: PathBuf,
    folder_roots: Vec<PathBuf>,
    has_track: bool,
}

impl Snapshot {
    async fn resolve(app: &tauri::AppHandle, state: &AppState, path: &str) -> CommandResult<Self> {
        // One acquire, both queries — the pool holds a single connection, so a
        // second acquire while this one is held hangs rather than fails.
        let mut conn = state.conn().await?;

        let folder_roots = match repo::folders::get_all(&mut conn).await {
            Ok(folders) => folders.into_iter().map(|f| PathBuf::from(f.path)).collect(),
            Err(error) => {
                // v1: "folders table read failed; continuing without folder
                // roots". Narrowing what is allowed is safe; widening is not.
                tracing::warn!(%error, "folders read failed; continuing with no folder roots");
                Vec::new()
            }
        };

        let has_track = match repo::tracks::exists(&mut conn, path).await {
            Ok(found) => found,
            Err(error) => {
                tracing::warn!(%error, "tracks lookup failed; denying the path");
                false
            }
        };
        drop(conn);

        Ok(Self {
            download_location: download_location(app, state),
            folder_roots,
            has_track,
        })
    }
}

impl PathAuthority for Snapshot {
    fn download_location(&self) -> PathBuf {
        self.download_location.clone()
    }

    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(self.folder_roots.clone())
    }

    fn has_track_at(&self, _path: &std::path::Path) -> PathAuthorityResult<bool> {
        Ok(self.has_track)
    }
}

/// Where finished downloads land, which is a root because they are files the
/// user will right-click.
///
/// The name and the "configured, else `<music>/Shiranami Downloads`" rule are
/// `shiranami_downloader::location`'s, reused rather than restated: v1's
/// folders-cache and its settings panel read the same value, and two spellings
/// of it is how the cache starts allowing a directory the panel no longer shows.
fn download_location(app: &tauri::AppHandle, state: &AppState) -> PathBuf {
    let configured = state
        .settings()
        .downloads_location()
        .map(|path| path.to_string_lossy().into_owned());

    match app.path().audio_dir() {
        Ok(music) => location::active_dir(&music, configured.as_deref()),
        Err(error) => {
            // No music directory and no configured one leaves nothing to name.
            // The data directory is already a root, so returning it contributes
            // no reach rather than a guessed path that might grant some.
            tracing::warn!(%error, "no music directory; download root unresolved");
            configured.map_or_else(
                || {
                    shiranami_core::paths::data_dir()
                        .unwrap_or_else(|| PathBuf::from(shiranami_core::paths::V2_DIRECTORY_NAME))
                },
                PathBuf::from,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::codes;

    /// The snapshot has to satisfy the trait the cache actually consults, and
    /// answer with what was resolved rather than going back to disk.
    #[test]
    fn the_snapshot_answers_from_what_was_resolved() {
        let snapshot = Snapshot {
            download_location: PathBuf::from("/music/Shiranami Downloads"),
            folder_roots: vec![PathBuf::from("/music/library")],
            has_track: true,
        };

        assert_eq!(
            snapshot.download_location(),
            PathBuf::from("/music/Shiranami Downloads")
        );
        assert_eq!(
            snapshot.folder_roots().expect("roots resolve"),
            vec![PathBuf::from("/music/library")]
        );
        assert!(
            snapshot
                .has_track_at(std::path::Path::new("/anywhere/at/all.mp3"))
                .expect("the answer is precomputed"),
            "the snapshot is built for one path and answers for it"
        );
    }

    /// Composed against the real [`FoldersCache`], because the property that
    /// matters is not "the struct returns its fields" but "a path under a
    /// watched folder is allowed and one outside every root is not".
    #[test]
    fn containment_and_the_tracks_fallback_both_reach_the_cache() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let root = dir.path().join("library");
        std::fs::create_dir_all(&root).expect("create the watched folder");
        let inside = root.join("song.mp3");
        std::fs::write(&inside, b"x").expect("write a track");

        let outside = dir.path().join("elsewhere.mp3");
        std::fs::write(&outside, b"x").expect("write a stray file");

        let contained = FoldersCache::new(
            dir.path().join("data"),
            Arc::new(Snapshot {
                download_location: dir.path().join("downloads"),
                folder_roots: vec![root.clone()],
                has_track: false,
            }),
        );
        assert!(contained.is_path_allowed(&inside), "under a watched folder");
        assert!(
            !contained.is_path_allowed(&outside),
            "outside every root, and no tracks row to fall back on"
        );

        // The fourth case v1 documents: a standalone import lives outside every
        // root and is allowed because the library holds a row for it.
        let imported = FoldersCache::new(
            dir.path().join("data"),
            Arc::new(Snapshot {
                download_location: dir.path().join("downloads"),
                folder_roots: vec![root],
                has_track: true,
            }),
        );
        assert!(imported.is_path_allowed(&outside));
    }

    /// A symlink inside an allowed root pointing out of it must not pass. The
    /// textual check alone would accept it, and the downstream `trash::delete`
    /// follows the link.
    #[cfg(unix)]
    #[test]
    fn a_symlink_escaping_an_allowed_root_is_refused() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let root = dir.path().join("library");
        std::fs::create_dir_all(&root).expect("create the watched folder");
        let secret = dir.path().join("secret.txt");
        std::fs::write(&secret, b"x").expect("write the target");

        let link = root.join("innocent.mp3");
        std::os::unix::fs::symlink(&secret, &link).expect("create the symlink");

        let cache = FoldersCache::new(
            dir.path().join("data"),
            Arc::new(Snapshot {
                download_location: dir.path().join("downloads"),
                folder_roots: vec![root],
                has_track: false,
            }),
        );

        assert!(
            !cache.is_path_allowed(&link),
            "the link resolves outside the root it sits in"
        );
    }

    #[test]
    fn an_os_failure_carries_the_frozen_internal_code_and_the_path() {
        let payload = io_failure("open", "/var/log/shiranami", "permission denied");

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("/var/log/shiranami"));
        assert!(payload.message.contains("permission denied"));
    }

    /// The refusal the guard produces, pinned at the code the renderer branches
    /// on. v1 threw `IpcError(FORBIDDEN, …)` here.
    #[test]
    fn a_path_outside_every_root_is_forbidden_rather_than_internal() {
        let payload = ErrorPayload::of(&CoreError::PathNotAllowed {
            path: PathBuf::from("/etc/passwd"),
        });

        assert_eq!(payload.code, codes::validation::FORBIDDEN);
    }

    #[test]
    fn an_empty_path_is_a_bad_request_the_way_zod_refused_it() {
        assert_eq!(
            bad_request("the file path must not be empty").code,
            codes::validation::BAD_REQUEST
        );
    }

    /// The log directory sits beside the data, not in Tauri's `app_log_dir()`.
    /// Stated as a test because the two are one function call apart and the
    /// wrong one silently opens an empty folder.
    #[test]
    fn the_log_directory_is_a_child_of_the_data_directory() {
        let data = PathBuf::from("/data/com.shironex.shiranami");
        assert_eq!(
            data.join(LOGS_DIRECTORY_NAME),
            PathBuf::from("/data/com.shironex.shiranami/logs")
        );
    }
}
