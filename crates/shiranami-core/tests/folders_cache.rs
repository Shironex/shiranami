//! Ported from `apps/desktop/src/main/shared/folders-cache.test.ts`.
//!
//! Every case in the TypeScript suite has a counterpart here. Where that suite
//! mocked `electron`, the store and drizzle, this one drives a fake
//! [`PathAuthority`] — the seam that exists precisely so the guard is testable
//! without a database (architecture §2.1: crate boundaries give
//! `cargo test -p shiranami-core` with no webview and no sqlite).

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use shiranami_core::paths::{
    FoldersCache, PathAuthority, PathAuthorityResult, normalize_for_compare,
};

/// Stand-in for the settings store and the database.
#[derive(Default)]
struct FakeAuthority {
    download_location: PathBuf,
    folder_roots: Vec<PathBuf>,
    track_paths: Mutex<Vec<PathBuf>>,
    /// When true, every database method fails — the fail-closed case.
    database_down: bool,
    /// How many times the tracks table was consulted.
    track_lookups: Mutex<usize>,
    /// How many times the folders table was consulted.
    folder_reads: Mutex<usize>,
}

impl PathAuthority for FakeAuthority {
    fn download_location(&self) -> PathBuf {
        self.download_location.clone()
    }

    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        *self.folder_reads.lock().expect("lock folder_reads") += 1;
        if self.database_down {
            return Err("folders table unavailable".into());
        }
        Ok(self.folder_roots.clone())
    }

    fn has_track_at(&self, path: &Path) -> PathAuthorityResult<bool> {
        *self.track_lookups.lock().expect("lock track_lookups") += 1;
        if self.database_down {
            return Err("tracks table unavailable".into());
        }
        Ok(self
            .track_paths
            .lock()
            .expect("lock track_paths")
            .iter()
            .any(|known| known == path))
    }
}

const MOCK_DATA_DIR: &str = "/mock/userData";
const MOCK_DEFAULT_DOWNLOADS: &str = "/mock/music/Shiranami Downloads";

fn cache_with(authority: FakeAuthority) -> (FoldersCache, Arc<FakeAuthority>) {
    let authority = Arc::new(authority);
    let cache = FoldersCache::new(
        PathBuf::from(MOCK_DATA_DIR),
        Arc::clone(&authority) as Arc<_>,
    );
    (cache, authority)
}

fn default_authority() -> FakeAuthority {
    FakeAuthority {
        download_location: PathBuf::from(MOCK_DEFAULT_DOWNLOADS),
        ..FakeAuthority::default()
    }
}

fn norm(path: &str) -> PathBuf {
    normalize_for_compare(Path::new(path))
}

/* ------------------------------ allowed_roots ------------------------------ */

#[test]
fn returns_the_data_dir_and_download_dir_when_no_folders_are_registered() {
    let (cache, _) = cache_with(default_authority());
    let roots = cache.allowed_roots();
    assert!(roots.contains(&norm(MOCK_DATA_DIR)));
    assert!(roots.contains(&norm(MOCK_DEFAULT_DOWNLOADS)));
}

#[test]
fn includes_folder_rows_from_the_database() {
    let (cache, _) = cache_with(FakeAuthority {
        folder_roots: vec![PathBuf::from("/mock/library/music")],
        ..default_authority()
    });
    assert!(cache.allowed_roots().contains(&norm("/mock/library/music")));
}

#[test]
fn respects_the_configured_download_location_override() {
    let (cache, _) = cache_with(FakeAuthority {
        download_location: PathBuf::from("/mock/custom-downloads"),
        ..FakeAuthority::default()
    });
    assert!(
        cache
            .allowed_roots()
            .contains(&norm("/mock/custom-downloads"))
    );
}

#[test]
fn de_duplicates_roots_that_normalize_to_the_same_path() {
    let (cache, _) = cache_with(FakeAuthority {
        folder_roots: vec![
            PathBuf::from("/mock/library/music"),
            PathBuf::from("/mock/library/music/"),
            PathBuf::from("/mock/library/other/../music"),
        ],
        ..default_authority()
    });
    let roots = cache.allowed_roots();
    let hits = roots
        .iter()
        .filter(|root| **root == norm("/mock/library/music"))
        .count();
    assert_eq!(hits, 1, "the same root must not be listed three times");
}

/// Caching is by design: the roots are rebuilt only on `invalidate()`, so a
/// folder added behind the cache's back is deliberately not visible yet.
#[test]
fn caches_the_result_so_later_calls_do_not_re_query() {
    let (cache, authority) = cache_with(FakeAuthority {
        folder_roots: vec![PathBuf::from("/mock/library/a")],
        ..default_authority()
    });

    let first = cache.allowed_roots();
    let second = cache.allowed_roots();

    assert_eq!(first, second);
    assert_eq!(
        *authority.folder_reads.lock().expect("lock folder_reads"),
        1,
        "the folders table must be read once, not once per call"
    );
}

#[test]
fn invalidate_forces_a_rebuild() {
    let (cache, authority) = cache_with(default_authority());
    cache.allowed_roots();
    cache.invalidate();
    cache.allowed_roots();
    assert_eq!(
        *authority.folder_reads.lock().expect("lock folder_reads"),
        2
    );
}

/// A folders-table failure degrades to "no folder roots" rather than taking the
/// data dir and downloads location down with it.
#[test]
fn a_folders_table_failure_still_yields_the_non_database_roots() {
    let (cache, _) = cache_with(FakeAuthority {
        download_location: PathBuf::from(MOCK_DEFAULT_DOWNLOADS),
        database_down: true,
        ..FakeAuthority::default()
    });
    let roots = cache.allowed_roots();
    assert!(roots.contains(&norm(MOCK_DATA_DIR)));
    assert!(roots.contains(&norm(MOCK_DEFAULT_DOWNLOADS)));
}

/* ----------------------------- is_path_allowed ----------------------------- */

#[test]
fn accepts_a_path_inside_an_allowed_folder_root() {
    let (cache, _) = cache_with(FakeAuthority {
        folder_roots: vec![PathBuf::from("/mock/library/music")],
        ..default_authority()
    });
    assert!(cache.is_path_allowed(Path::new("/mock/library/music/sub/song.mp3")));
}

#[test]
fn accepts_a_known_track_path_outside_every_allowed_root() {
    let standalone = PathBuf::from("/somewhere/else/standalone.mp3");
    let (cache, _) = cache_with(FakeAuthority {
        track_paths: Mutex::new(vec![standalone.clone()]),
        ..default_authority()
    });
    assert!(cache.is_path_allowed(&standalone));
}

#[test]
fn rejects_a_path_outside_the_roots_and_absent_from_tracks() {
    let (cache, _) = cache_with(default_authority());
    assert!(!cache.is_path_allowed(Path::new("/etc/passwd")));
}

#[test]
fn rejects_an_empty_path() {
    let (cache, _) = cache_with(default_authority());
    assert!(!cache.is_path_allowed(Path::new("")));
}

#[test]
fn denies_when_the_tracks_lookup_fails() {
    let (cache, _) = cache_with(FakeAuthority {
        download_location: PathBuf::from(MOCK_DEFAULT_DOWNLOADS),
        database_down: true,
        ..FakeAuthority::default()
    });
    assert!(
        !cache.is_path_allowed(Path::new("/totally/unknown/file.mp3")),
        "a database failure must deny, never allow"
    );
}

/// Without symlink resolution a textual containment check would pass while the
/// stream server's downstream open happily served the file outside the root.
#[test]
fn rejects_a_symlink_inside_an_allowed_root_pointing_outside() {
    let allowed = tempfile::tempdir().expect("create the allowed root");
    let outside = tempfile::tempdir().expect("create the outside dir");
    let secret = outside.path().join("secret.mp3");
    std::fs::write(&secret, b"x").expect("write the secret");

    let link = allowed.path().join("shortcut.mp3");
    #[cfg(unix)]
    let created = std::os::unix::fs::symlink(&secret, &link).is_ok();
    #[cfg(windows)]
    let created = std::os::windows::fs::symlink_file(&secret, &link).is_ok();
    if !created {
        // Windows without developer mode cannot create symlinks.
        return;
    }

    let (cache, _) = cache_with(FakeAuthority {
        folder_roots: vec![allowed.path().to_path_buf()],
        ..default_authority()
    });

    assert!(!cache.is_path_allowed(&link));
}

#[test]
fn caches_a_positive_authorization_so_a_repeat_check_skips_the_lookup() {
    let standalone = PathBuf::from("/cached/standalone.mp3");
    let (cache, authority) = cache_with(FakeAuthority {
        track_paths: Mutex::new(vec![standalone.clone()]),
        ..default_authority()
    });

    assert!(cache.is_path_allowed(&standalone));

    // Drop the row. An uncached check would now fail; the cached grant holds.
    authority.track_paths.lock().expect("lock tracks").clear();
    assert!(cache.is_path_allowed(&standalone));
    assert_eq!(
        *authority.track_lookups.lock().expect("lock lookups"),
        1,
        "the second check must not reach the database at all"
    );
}

#[test]
fn invalidate_clears_the_positive_authorization_cache() {
    let standalone = PathBuf::from("/cached/cleared.mp3");
    let (cache, authority) = cache_with(FakeAuthority {
        track_paths: Mutex::new(vec![standalone.clone()]),
        ..default_authority()
    });

    assert!(cache.is_path_allowed(&standalone));

    authority.track_paths.lock().expect("lock tracks").clear();
    cache.invalidate();
    assert!(
        !cache.is_path_allowed(&standalone),
        "a stale grant must not survive an invalidate"
    );
}

/// Negatives are never cached: a path can legitimately become allowed later.
#[test]
fn never_caches_a_negative_result() {
    let unknown = PathBuf::from("/never/cached/denied.mp3");
    let (cache, authority) = cache_with(default_authority());

    assert!(!cache.is_path_allowed(&unknown));

    authority
        .track_paths
        .lock()
        .expect("lock tracks")
        .push(unknown.clone());
    assert!(cache.is_path_allowed(&unknown));
}

/// The renderer forwards its path verbatim, so a row stored canonically still
/// has to match a request carrying `..` segments.
#[test]
fn matches_a_known_track_when_the_path_has_collapsible_segments() {
    let stored = PathBuf::from("/somewhere/else/standalone.mp3");
    let (cache, _) = cache_with(FakeAuthority {
        track_paths: Mutex::new(vec![stored]),
        ..default_authority()
    });
    assert!(cache.is_path_allowed(Path::new("/somewhere/else/foo/../standalone.mp3")));
}
