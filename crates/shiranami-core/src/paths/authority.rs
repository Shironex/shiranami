//! The seam through which the rank-0 path guards reach app-level knowledge.
//!
//! [`crate::paths::FoldersCache`] needs three things that live above it: where
//! downloads go (the settings store), which folders the library watches (the
//! `folders` table) and whether a given path is a known track (the `tracks`
//! table). `shiranami-core` is rank 0 and may not depend on `shiranami-db`, so
//! the dependency is inverted into this trait and satisfied by the composition
//! root — architecture §2.3's "no globals; `app.manage(...)` + `Arc<dyn Trait>`
//! seams for would-be cycles".

use std::path::{Path, PathBuf};

/// Failure from a [`PathAuthority`] lookup.
///
/// Boxed rather than an enum because core cannot name the implementor's error
/// types — `shiranami-db` has not been written yet, and core must not learn
/// about it when it is. Callers only ever log these; the containment decision
/// is made by [`crate::paths::FoldersCache`], which fails closed.
pub type PathAuthorityError = Box<dyn std::error::Error + Send + Sync>;

/// Convenience alias for a [`PathAuthority`] lookup.
pub type PathAuthorityResult<T> = Result<T, PathAuthorityError>;

/// App-level knowledge the path-containment guard depends on.
///
/// Implemented in `src-tauri` over the settings store and the database. The
/// three methods are grouped into one trait because they answer one question —
/// "which paths may the renderer reach?" — and splitting them would mean two
/// seams to keep in sync on every `invalidate()`.
pub trait PathAuthority: Send + Sync {
    /// The active downloads directory: the configured override when set and
    /// non-blank, otherwise the platform default (`<music>/Shiranami
    /// Downloads`). Resolving that fallback is the implementor's job, exactly as
    /// `getConfiguredDownloadDir()` did in v1.
    fn download_location(&self) -> PathBuf;

    /// Every row in the `folders` table — the user's watched library roots.
    ///
    /// # Errors
    ///
    /// Returns the underlying read failure. The cache logs it and continues with
    /// no folder roots, matching v1: a folders-table read failure must not take
    /// the whole app's path handling down with it.
    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>>;

    /// Whether a `tracks` row exists whose `file_path` equals `path` exactly.
    ///
    /// This is the standalone-import escape hatch: a file added through
    /// `dialog:open-file` legitimately lives outside every registered root.
    ///
    /// # Errors
    ///
    /// Returns the underlying read failure. The cache logs it and **denies** the
    /// path — this branch is fail-closed, unlike [`Self::folder_roots`].
    fn has_track_at(&self, path: &Path) -> PathAuthorityResult<bool>;
}
