//! Path containment guards, ported from
//! `apps/desktop/src/main/shared/path-safety.ts`.
//!
//! These decide whether a renderer-supplied path may be read by the shell
//! handlers and the audio stream server, so their test vectors are ported ahead
//! of the implementation (architecture §2.2, subsystem 12).
//!
//! **Symlink caveat, carried over verbatim.** Nothing here touches the
//! filesystem — there is no `realpath` call. A symlink inside an allowed root
//! whose target lives outside is treated as contained. That trade-off is
//! deliberate: the audio route may service hundreds of Range requests per track
//! and a per-request `stat` is too expensive. [`crate::paths::FoldersCache`] is
//! the layer that resolves symlinks, once per authorization rather than once per
//! request.

use std::path::{Component, Path, PathBuf};

/// Normalize an absolute path into a comparable form.
///
/// Mirrors Node's `path.resolve` plus the two adjustments the TypeScript made:
///
/// - `.` and `..` segments are collapsed **lexically**, without consulting the
///   filesystem, and a `..` at the root stays at the root.
/// - On case-insensitive filesystems (macOS, Windows) the result is lowercased,
///   so `/Users/Me/Music` and `/users/me/music` compare equal.
/// - A trailing separator is dropped unless the result is a filesystem root;
///   rebuilding from [`Path::components`] does this for free.
///
/// A relative path is resolved against the current directory, as `path.resolve`
/// does. That is the only call that reads process state, and it matches v1.
pub fn normalize_for_compare(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        // `path.resolve` joins a relative input onto the cwd. A cwd we cannot
        // read leaves the path relative, which then fails every containment
        // check — the fail-closed direction.
        std::env::current_dir().unwrap_or_default().join(path)
    };

    let mut normalized = PathBuf::new();
    // `PathBuf::pop` would happily walk off the root, so depth is tracked
    // explicitly and `..` above the root is discarded the way `path.resolve`
    // discards it.
    let mut depth = 0_usize;
    for component in absolute.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => normalized.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if depth > 0 {
                    normalized.pop();
                    depth -= 1;
                }
            }
            Component::Normal(part) => {
                normalized.push(part);
                depth += 1;
            }
        }
    }

    lowercase_if_case_insensitive(normalized)
}

/// Lowercase on the platforms whose filesystems compare case-insensitively.
///
/// A path that is not valid UTF-8 is returned unchanged rather than mangled by a
/// lossy round-trip: leaving the case alone can only make a containment check
/// stricter, which is the safe direction.
fn lowercase_if_case_insensitive(path: PathBuf) -> PathBuf {
    if cfg!(any(target_os = "macos", target_os = "windows")) {
        match path.to_str() {
            Some(text) => PathBuf::from(text.to_lowercase()),
            None => path,
        }
    } else {
        path
    }
}

/// Return `true` when `child` is equal to or nested beneath `root`.
///
/// Both inputs must already have been through [`normalize_for_compare`].
///
/// The comparison is component-wise, which is what rejects the classic
/// string-prefix bug: `/home/user/music-evil` is not inside `/home/user/music`
/// even though one string starts with the other. It also subsumes the
/// TypeScript's separate filesystem-root check — paths on different roots
/// (`C:\foo` vs `D:\foo`) differ in their very first component.
pub fn is_path_within(child: &Path, root: &Path) -> bool {
    child.strip_prefix(root).is_ok()
}

/// Return `true` when `child` is contained within any of `roots`.
///
/// `child` is normalized here; `roots` must already be normalized. Iteration
/// short-circuits on the first hit.
pub fn is_path_within_any(child: &Path, roots: &[PathBuf]) -> bool {
    let normalized_child = normalize_for_compare(child);
    roots
        .iter()
        .any(|root| is_path_within(&normalized_child, root))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Case-insensitive platforms lowercase, so expectations are built through
    /// the same rule rather than hard-coded per platform.
    fn expected(path: &str) -> PathBuf {
        lowercase_if_case_insensitive(PathBuf::from(path))
    }

    fn norm(path: &str) -> PathBuf {
        normalize_for_compare(Path::new(path))
    }

    /* ---------------- normalize_for_compare ---------------- */

    #[test]
    fn strips_a_trailing_separator_when_not_a_root() {
        assert_eq!(norm("/foo/bar/"), norm("/foo/bar"));
    }

    #[test]
    fn keeps_the_root_itself_intact() {
        assert_eq!(norm("/"), expected("/"));
    }

    #[test]
    fn lowercases_paths_on_case_insensitive_platforms() {
        if cfg!(any(target_os = "macos", target_os = "windows")) {
            assert_eq!(norm("/Users/Me/Music"), norm("/users/me/music"));
        } else {
            assert_ne!(norm("/Users/Me/Music"), norm("/users/me/music"));
        }
    }

    #[test]
    fn collapses_dot_and_parent_segments_lexically() {
        assert_eq!(norm("/a/b/../c/./d"), expected("/a/c/d"));
    }

    /// `path.resolve('/..')` is `/`; walking off the root would otherwise turn a
    /// traversal attempt into a path that compares equal to something else.
    #[test]
    fn a_parent_segment_at_the_root_stays_at_the_root() {
        assert_eq!(norm("/../../etc"), expected("/etc"));
    }

    /* ---------------- is_path_within ---------------- */

    #[test]
    fn accepts_a_deeply_nested_child_of_the_root() {
        assert!(is_path_within(
            &norm("/home/user/music/folder/sub/song.mp3"),
            &norm("/home/user/music"),
        ));
    }

    #[test]
    fn accepts_a_child_equal_to_the_root() {
        assert!(is_path_within(
            &norm("/home/user/music"),
            &norm("/home/user/music")
        ));
    }

    #[test]
    fn rejects_traversal_out_of_the_root() {
        assert!(!is_path_within(
            &norm("/home/user/other/secret.txt"),
            &norm("/home/user/music"),
        ));
    }

    #[test]
    fn rejects_an_absolute_path_outside_the_root() {
        assert!(!is_path_within(
            &norm("/etc/passwd"),
            &norm("/home/user/music")
        ));
    }

    /// The classic string-`startsWith` bug: `music-evil` is not inside `music`.
    #[test]
    fn rejects_a_sibling_whose_name_prefixes_the_root() {
        assert!(!is_path_within(
            &norm("/home/user/music-evil/song.mp3"),
            &norm("/home/user/music"),
        ));
    }

    #[test]
    fn treats_a_trailing_separator_on_the_root_as_equivalent() {
        let child = norm("/home/user/music/song.mp3");
        assert!(is_path_within(&child, &norm("/home/user/music/")));
        assert!(is_path_within(&child, &norm("/home/user/music")));
    }

    #[cfg(windows)]
    #[test]
    fn rejects_paths_on_a_different_windows_drive() {
        assert!(!is_path_within(
            &norm(r"D:\music\song.mp3"),
            &norm(r"C:\music")
        ));
    }

    /* ---------------- is_path_within_any ---------------- */

    #[test]
    fn accepts_when_any_root_contains_the_child() {
        let roots = [norm("/home/user/music"), norm("/home/user/podcasts")];
        assert!(is_path_within_any(
            Path::new("/home/user/podcasts/ep01.mp3"),
            &roots
        ));
    }

    #[test]
    fn rejects_when_no_root_contains_the_child() {
        let roots = [norm("/home/user/music"), norm("/home/user/podcasts")];
        assert!(!is_path_within_any(Path::new("/etc/passwd"), &roots));
    }

    #[test]
    fn rejects_against_an_empty_roots_list() {
        assert!(!is_path_within_any(
            Path::new("/home/user/music/song.mp3"),
            &[]
        ));
    }

    /// Documents the ported caveat rather than a desirable property: these
    /// helpers never call `realpath`, so a link inside the root reads as
    /// contained. [`crate::paths::FoldersCache`] is what closes it.
    #[test]
    fn a_symlink_inside_the_root_is_textually_contained() {
        let root = tempfile::tempdir().expect("create the allowed root");
        let outside = tempfile::tempdir().expect("create the outside dir");
        let target = outside.path().join("secret.mp3");
        std::fs::write(&target, b"x").expect("write the secret");

        let link = root.path().join("shortcut.mp3");
        #[cfg(unix)]
        let created = std::os::unix::fs::symlink(&target, &link).is_ok();
        #[cfg(windows)]
        let created = std::os::windows::fs::symlink_file(&target, &link).is_ok();

        if !created {
            // Windows without developer mode cannot create symlinks.
            return;
        }

        assert!(is_path_within(
            &normalize_for_compare(&link),
            &normalize_for_compare(root.path()),
        ));
    }
}
