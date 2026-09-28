//! When a missing file counts as *moved away*, rather than merely unreachable.
//!
//! A re-point is only safe when the old file is really gone. [`Path::exists`]
//! alone cannot tell "gone" from "on storage that is not attached right now":
//! an unmounted external drive, a NAS that is asleep, a Windows mapped drive or
//! UNC share that is offline. Treating those as moves would hand the offline
//! rows' history to whatever copies happen to be imported meanwhile, and the
//! history would then be deleted with the copies. So a missing file counts as
//! moved away only when the storage it lived on is demonstrably present:
//!
//! 1. the file itself does not exist;
//! 2. its **volume root** exists ([`volume_root`]: `/Volumes/<name>` on macOS,
//!    `/media/<user>/<name>`, `/run/media/<user>/<name>` and `/mnt/<name>` on
//!    Linux, the drive root `X:\` or the share `\\server\share\` on Windows).
//!    A path on the system volume has no separate root to check;
//! 3. the **registered music folder** that contains it exists, when one does
//!    (the longest registered folder the path lies under). That catches a
//!    network mount that sits on the system volume, and a watched folder that
//!    was itself renamed or removed.
//!
//! A path under no registered folder (a download that lived in the downloads
//! directory, say) is judged by rules 1 and 2 alone.
//!
//! Paths are compared as the strings the scanner stored, so on Windows the
//! comparison is as case-sensitive as the scanner's own output, which is what
//! the library holds.

use std::path::Path;

/// Whether `old_path` is gone from storage that is present (see module docs).
///
/// Performs up to three existence checks, so it is file I/O and must never be
/// called while the database's only connection is held.
pub fn moved_away<S: AsRef<str>>(old_path: &str, music_roots: &[S]) -> bool {
    if Path::new(old_path).exists() {
        return false;
    }

    if let Some(root) = volume_root(old_path)
        && !Path::new(&root).exists()
    {
        return false;
    }

    let containing = music_roots
        .iter()
        .map(AsRef::as_ref)
        .filter(|root| lies_under(old_path, root))
        .max_by_key(|root| root.len());

    containing.is_none_or(|root| Path::new(root).exists())
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
mod tests {
    use super::*;

    #[test]
    fn volume_roots_are_found_for_every_removable_and_network_shape() {
        assert_eq!(
            volume_root("/Volumes/NAS/Music/a.mp3").as_deref(),
            Some("/Volumes/NAS")
        );
        assert_eq!(
            volume_root("/media/kacper/USB/a.mp3").as_deref(),
            Some("/media/kacper/USB")
        );
        assert_eq!(
            volume_root("/run/media/kacper/USB/a.mp3").as_deref(),
            Some("/run/media/kacper/USB")
        );
        assert_eq!(volume_root("/mnt/nas/a.mp3").as_deref(), Some("/mnt/nas"));
        assert_eq!(volume_root(r"D:\Music\a.mp3").as_deref(), Some(r"D:\"));
        assert_eq!(volume_root("e:/Music/a.mp3").as_deref(), Some(r"E:\"));
        assert_eq!(
            volume_root(r"\\nas\music\Album\a.mp3").as_deref(),
            Some(r"\\nas\music\")
        );
        assert_eq!(
            volume_root(r"\\?\UNC\nas\music\a.mp3").as_deref(),
            Some(r"\\nas\music\")
        );
        assert_eq!(volume_root(r"\\?\C:\Music\a.mp3").as_deref(), Some(r"C:\"));
    }

    #[test]
    fn the_system_volume_has_no_separate_root() {
        assert_eq!(volume_root("/Users/me/Music/a.mp3"), None);
        assert_eq!(volume_root("/home/me/a.mp3"), None);
        assert_eq!(volume_root("/Volumes"), None);
    }

    #[test]
    fn a_path_lies_under_a_root_only_on_a_separator_boundary() {
        assert!(lies_under("/music/a.mp3", "/music"));
        assert!(lies_under("/music/a.mp3", "/music/"));
        assert!(lies_under(r"D:\Music\a.mp3", r"D:\Music"));
        assert!(!lies_under("/music-old/a.mp3", "/music"));
        assert!(!lies_under("/a.mp3", "/"));
    }

    #[test]
    fn a_file_on_present_storage_that_is_gone_has_moved_away() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let root = dir.path().to_string_lossy().into_owned();
        let gone = dir.path().join("Album").join("song.mp3");

        assert!(moved_away(
            &gone.to_string_lossy(),
            std::slice::from_ref(&root)
        ));
        assert!(moved_away(&gone.to_string_lossy(), &[] as &[String]));
    }

    #[test]
    fn a_file_that_exists_has_not_moved() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let here = dir.path().join("song.mp3");
        std::fs::write(&here, b"x").expect("the fixture writes");

        assert!(!moved_away(&here.to_string_lossy(), &[] as &[String]));
    }

    /// The offline-NAS case: the watched folder that held the file is itself
    /// missing, so its files are unreachable, not moved.
    #[test]
    fn a_file_whose_music_folder_is_missing_is_offline_not_moved() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let nas = dir.path().join("nas-share");
        let old = nas.join("Album").join("song.mp3");
        let roots = [
            dir.path().to_string_lossy().into_owned(),
            nas.to_string_lossy().into_owned(),
        ];

        assert!(
            !moved_away(&old.to_string_lossy(), &roots),
            "the longest containing root is the missing one"
        );
    }

    #[test]
    fn a_file_on_an_unmounted_volume_is_offline_not_moved() {
        let old = "/Volumes/ShiranamiNoSuchVolume-7f3a/Music/song.mp3";
        assert!(!moved_away(old, &[] as &[String]));
        assert!(!moved_away(
            old,
            &["/Volumes/ShiranamiNoSuchVolume-7f3a/Music"]
        ));
    }
}
