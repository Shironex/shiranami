//! Which files a scan finds, and which it refuses to.
//!
//! The exclusion filters, the depth bounds and the flat-versus-grouped shape,
//! over synthesised trees. These are the properties a "tidier" rewrite would
//! silently change, so each one is pinned against v1's behaviour rather than
//! against what the behaviour arguably ought to be.

#[path = "support/tree.rs"]
mod tree;

use std::path::PathBuf;

use shiranami_library::scan::discover::{discover_files, discover_grouped};
use shiranami_library::scan::{AUDIO_EXTENSIONS, SCAN_MAX_DEPTH};
use tempfile::TempDir;

fn temp() -> TempDir {
    tempfile::tempdir().expect("a temp dir")
}

#[test]
fn every_accepted_extension_is_discovered() {
    let dir = temp();
    for (index, extension) in AUDIO_EXTENSIONS.iter().enumerate() {
        tree::raw(dir.path(), &format!("track{index}{extension}"), b"x");
    }

    assert_eq!(discover_files(dir.path()).len(), AUDIO_EXTENSIONS.len());
}

#[test]
fn non_audio_files_are_left_alone() {
    let dir = temp();
    tree::raw(dir.path(), "keep.mp3", b"x");
    for name in ["cover.jpg", "album.nfo", "list.m3u", "readme", "video.mp4"] {
        tree::raw(dir.path(), name, b"x");
    }

    assert_eq!(tree::names(&discover_files(dir.path())), vec!["keep.mp3"]);
}

#[test]
fn hidden_files_and_dot_directories_are_scanned() {
    // v1 has no exclusion rules whatsoever. `.Trashes`, `.git` and friends are
    // walked, and a dotfile with an audio extension is imported.
    let dir = temp();
    tree::raw(dir.path(), ".hidden.mp3", b"x");
    tree::raw(dir.path(), ".Trashes/deleted.mp3", b"x");
    tree::raw(dir.path(), "node_modules/vendored.flac", b"x");

    assert_eq!(
        tree::names(&discover_files(dir.path())),
        vec![".hidden.mp3", "deleted.mp3", "vendored.flac"]
    );
}

#[test]
fn an_appledouble_sidecar_is_discovered_as_v1_discovers_it() {
    // `._track.mp3` passes the extension test, fails to parse, and becomes a
    // placeholder row. Reproduced deliberately — see `scan::discover`'s docs.
    let dir = temp();
    tree::raw(dir.path(), "._track.mp3", b"not audio");

    assert_eq!(
        tree::names(&discover_files(dir.path())),
        vec!["._track.mp3"]
    );
}

#[test]
fn a_flat_scan_reaches_five_levels_below_the_root_and_no_further() {
    let dir = temp();

    // v1 reads a directory while its own depth is <= 5, counting the root as 0.
    // Five nested directories therefore put the last readable one at depth 5,
    // and its files — one level further down — are the deepest discoverable.
    let mut relative = String::new();
    for level in 0..SCAN_MAX_DEPTH {
        relative.push_str(&format!("d{level}/"));
    }
    tree::raw(dir.path(), &format!("{relative}deepest.mp3"), b"x");
    tree::raw(dir.path(), &format!("{relative}d5/beyond.mp3"), b"x");

    assert_eq!(
        tree::names(&discover_files(dir.path())),
        vec!["deepest.mp3"],
        "a file seven levels down is past the bound"
    );
}

#[test]
fn a_grouped_scan_reaches_one_level_deeper_than_a_flat_one() {
    // The asymmetry is real: v1 re-enters each immediate subdirectory with
    // default arguments, so the depth counter restarts. Preserved because
    // "fixing" it would add files to real libraries on the next rescan.
    let dir = temp();

    let mut relative = String::from("Artist/");
    for level in 0..SCAN_MAX_DEPTH {
        relative.push_str(&format!("d{level}/"));
    }
    tree::raw(dir.path(), &format!("{relative}deepest.mp3"), b"x");

    assert!(
        discover_files(dir.path()).is_empty(),
        "the group directory costs a level, putting this file out of a flat scan's reach"
    );

    let grouped = discover_grouped(dir.path());
    assert_eq!(grouped.subfolders.len(), 1);
    assert_eq!(
        tree::names(&grouped.subfolders[0].files),
        vec!["deepest.mp3"]
    );
}

#[test]
fn grouping_is_one_group_per_immediate_subdirectory() {
    let dir = temp();
    tree::raw(dir.path(), "loose.mp3", b"x");
    tree::raw(dir.path(), "Artist A/one.mp3", b"x");
    tree::raw(dir.path(), "Artist A/Album/two.mp3", b"x");
    tree::raw(dir.path(), "Artist B/three.mp3", b"x");

    let grouped = discover_grouped(dir.path());

    assert_eq!(tree::names(&grouped.root_files), vec!["loose.mp3"]);

    let mut groups: Vec<(String, usize)> = grouped
        .subfolders
        .iter()
        .map(|subfolder| (subfolder.name.clone(), subfolder.files.len()))
        .collect();
    groups.sort();

    assert_eq!(
        groups,
        vec![("Artist A".to_owned(), 2), ("Artist B".to_owned(), 1)],
        "a nested album folds into its top-level ancestor's group"
    );
}

#[test]
fn a_subfolder_with_no_audio_is_omitted_entirely() {
    let dir = temp();
    tree::raw(dir.path(), "Artist/one.mp3", b"x");
    tree::raw(dir.path(), "Scans/cover.jpg", b"x");
    tree::dir(dir.path(), "Empty");

    let grouped = discover_grouped(dir.path());

    assert_eq!(grouped.subfolders.len(), 1);
    assert_eq!(grouped.subfolders[0].name, "Artist");
}

#[test]
fn the_total_counts_root_files_and_every_group() {
    let dir = temp();
    tree::raw(dir.path(), "loose.mp3", b"x");
    tree::raw(dir.path(), "A/one.mp3", b"x");
    tree::raw(dir.path(), "A/two.mp3", b"x");
    tree::raw(dir.path(), "B/three.mp3", b"x");

    assert_eq!(discover_grouped(dir.path()).total_files(), 4);
}

#[test]
fn a_missing_root_is_an_empty_scan_not_a_failure() {
    let dir = temp();
    let missing = dir.path().join("removed");

    assert!(discover_files(&missing).is_empty());

    let grouped = discover_grouped(&missing);
    assert!(grouped.root_files.is_empty());
    assert!(grouped.subfolders.is_empty());
}

#[test]
fn an_unreadable_subdirectory_does_not_sink_its_siblings() {
    let dir = temp();
    tree::raw(dir.path(), "Readable/one.mp3", b"x");
    let locked = tree::dir(dir.path(), "Locked");
    tree::raw(dir.path(), "Locked/hidden.mp3", b"x");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
            .expect("the fixture locks");
    }

    let found = tree::names(&discover_files(dir.path()));

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Restore before the assertion so a failure still cleans up.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
            .expect("the fixture unlocks");

        // Running as root defeats the permission bits entirely.
        assert!(
            found == vec!["one.mp3"] || found == vec!["hidden.mp3", "one.mp3"],
            "{found:?}"
        );
    }

    #[cfg(not(unix))]
    {
        let _ = locked;
        assert!(found.contains(&"one.mp3".to_owned()));
    }
}

#[cfg(unix)]
#[test]
fn symlinked_files_and_directories_are_both_skipped() {
    let dir = temp();
    tree::raw(dir.path(), "real.mp3", b"x");
    tree::raw(dir.path(), "Elsewhere/other.mp3", b"x");

    std::os::unix::fs::symlink(dir.path().join("real.mp3"), dir.path().join("link.mp3"))
        .expect("the fixture links");
    std::os::unix::fs::symlink(dir.path().join("Elsewhere"), dir.path().join("linked-dir"))
        .expect("the fixture links");

    assert_eq!(
        tree::names(&discover_files(dir.path())),
        vec!["other.mp3", "real.mp3"],
        "a symlink is neither a file nor a directory to the walk"
    );
}

#[cfg(unix)]
#[test]
fn a_symlink_cycle_cannot_hang_the_walk() {
    let dir = temp();
    tree::raw(dir.path(), "real.mp3", b"x");
    std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).expect("the fixture links");

    assert_eq!(tree::names(&discover_files(dir.path())), vec!["real.mp3"]);
}

#[test]
fn discovery_order_is_depth_first_and_pre_order() {
    // Not asserting the filesystem's own ordering — only that a subdirectory's
    // whole subtree lands contiguously, which is what makes the grouped scan's
    // flatten-and-slice safe.
    let dir = temp();
    tree::raw(dir.path(), "Artist/a.mp3", b"x");
    tree::raw(dir.path(), "Artist/Album/b.mp3", b"x");
    tree::raw(dir.path(), "Artist/Album/c.mp3", b"x");

    let found: Vec<PathBuf> = discover_files(dir.path());
    let album_positions: Vec<usize> = found
        .iter()
        .enumerate()
        .filter(|(_, path)| path.to_string_lossy().contains("Album"))
        .map(|(index, _)| index)
        .collect();

    assert_eq!(album_positions.len(), 2);
    assert_eq!(
        album_positions[1] - album_positions[0],
        1,
        "the album's files are contiguous: {found:?}"
    );
}
