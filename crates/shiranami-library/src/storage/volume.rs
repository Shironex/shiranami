//! Which physical volume a folder sits on, and what to call it.
//!
//! Ported from `volumeKeyFor` and `mountLabelFor`
//! (`apps/desktop/src/main/ipc/storage.ts:26-51`).
//!
//! # Why the Windows path parsing is hand-rolled
//!
//! v1 calls `path.win32.parse` explicitly rather than the platform-dispatched
//! `path.parse`, with a comment saying why: so the drive-root grouping stays
//! correct *under test on a POSIX host*, while at runtime on Windows the two are
//! identical. Rust's `std::path` has no equivalent — it is compiled for one
//! platform and there is no `Path::win32` — so [`windows_drive_root`] parses the
//! string directly. That keeps the Windows bucketing rule testable on every
//! host, which is the property v1 was protecting.

use std::path::Path;

/// A stable per-volume bucket key. Two folders sharing one live on the same
/// disk and share one usage bar.
///
/// - **POSIX**: the device id from `stat`, which is the reliable signal.
/// - **Windows**: `dev` is not reliable, so the drive or UNC-share root is used
///   instead, uppercased because `C:\` and `c:\` name one volume.
///
/// `device` is `None` on platforms that do not report one; see [`device_of`].
pub fn volume_key_for(folder_path: &Path, device: Option<u64>) -> String {
    if cfg!(windows) {
        return windows_drive_root(&folder_path.to_string_lossy()).to_uppercase();
    }

    device.map_or_else(
        || folder_path.to_string_lossy().into_owned(),
        |device| device.to_string(),
    )
}

/// Best-effort friendly label for the volume a folder sits on.
///
/// - **Windows**: the drive root without its trailing separator, e.g. `C:`.
/// - **macOS**: the volume name for a `/Volumes/<name>` path; everything else
///   falls back to `/`.
///
/// Naming the internal disk properly ("Macintosh HD") needs a privileged
/// lookup, so `/` is v1's accepted fallback and stays v2's.
pub fn mount_label_for(folder_path: &Path) -> String {
    let path = folder_path.to_string_lossy();

    if cfg!(windows) {
        let root = windows_drive_root(&path);
        let trimmed = root.trim_end_matches(['\\', '/']);
        return if trimmed.is_empty() {
            root
        } else {
            trimmed.to_owned()
        };
    }

    volume_name(&path).unwrap_or_else(|| "/".to_owned())
}

/// The device id, on platforms that have one.
///
/// Split out so the caller can `stat` once and reuse the result: v1 stats each
/// folder root for `dev` and treats a failure as "this volume is unavailable",
/// which is a decision about the folder, not about the device id.
#[cfg(unix)]
pub fn device_of(metadata: &std::fs::Metadata) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    Some(metadata.dev())
}

/// The device id, on platforms that have one.
#[cfg(not(unix))]
pub fn device_of(_metadata: &std::fs::Metadata) -> Option<u64> {
    // Windows exposes a volume serial number only through an unstable API, and
    // v1 does not use it there anyway — the drive root is the bucket.
    None
}

/// v1's `/^\/Volumes\/([^/]+)/` capture.
fn volume_name(path: &str) -> Option<String> {
    let rest = path.strip_prefix("/Volumes/")?;
    let name = rest.split('/').next().unwrap_or_default();

    (!name.is_empty()).then(|| name.to_owned())
}

/// `path.win32.parse(p).root`, reproduced for any host.
///
/// Node keeps the separator character the caller used, so `C:/x` roots at `C:/`
/// and `C:\x` at `C:\`. That distinction is preserved rather than normalised:
/// the value becomes a bucket key, and normalising it here would merge two keys
/// that v1 keeps apart. In practice Windows hands back backslashes, so the two
/// spellings never meet in one library.
fn windows_drive_root(path: &str) -> String {
    let bytes = path.as_bytes();
    let is_separator = |byte: u8| byte == b'\\' || byte == b'/';

    // UNC: `\\server\share\` — two separators, then the host, then the share.
    if bytes.len() >= 2 && is_separator(bytes[0]) && is_separator(bytes[1]) {
        let mut boundaries = path
            .char_indices()
            .skip(2)
            .filter(|(_, character)| *character == '\\' || *character == '/')
            .map(|(index, _)| index);

        return match (boundaries.next(), boundaries.next()) {
            // `\\server\share\rest` — include the trailing separator.
            (Some(_), Some(share_end)) => path[..=share_end].to_owned(),
            // `\\server\share` with nothing after it: Node roots at the whole
            // string, having no separator to include.
            (Some(_), None) => path.to_owned(),
            // `\\server` alone is not yet a root.
            (None, _) => path.to_owned(),
        };
    }

    // Drive-relative (`C:foo`) and drive-absolute (`C:\foo`).
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return if bytes.len() >= 3 && is_separator(bytes[2]) {
            path[..3].to_owned()
        } else {
            path[..2].to_owned()
        };
    }

    // Rooted with no drive (`\foo`).
    if bytes.first().is_some_and(|byte| is_separator(*byte)) {
        return path[..1].to_owned();
    }

    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_drive_absolute_path_roots_at_the_drive() {
        assert_eq!(windows_drive_root(r"C:\Users\x\Music"), r"C:\");
        assert_eq!(windows_drive_root(r"C:\"), r"C:\");
    }

    #[test]
    fn the_separator_the_caller_used_is_preserved() {
        // Node's `path.win32.parse` does not normalise it, and the value is a
        // bucket key.
        assert_eq!(windows_drive_root("C:/Users/x"), "C:/");
    }

    #[test]
    fn a_drive_relative_path_roots_at_the_drive_without_a_separator() {
        assert_eq!(windows_drive_root("C:music"), "C:");
        assert_eq!(windows_drive_root("C:"), "C:");
    }

    #[test]
    fn a_unc_path_roots_at_the_share() {
        assert_eq!(
            windows_drive_root(r"\\server\share\Music"),
            r"\\server\share\"
        );
        assert_eq!(windows_drive_root(r"\\server\share\"), r"\\server\share\");
        assert_eq!(windows_drive_root(r"\\server\share"), r"\\server\share");
    }

    #[test]
    fn a_rooted_path_with_no_drive_roots_at_the_separator() {
        assert_eq!(windows_drive_root(r"\Music"), r"\");
    }

    #[test]
    fn a_relative_path_has_no_root() {
        assert_eq!(windows_drive_root("Music"), "");
        assert_eq!(windows_drive_root(""), "");
    }

    #[test]
    fn an_external_macos_volume_is_labelled_by_name() {
        assert_eq!(
            volume_name("/Volumes/Backup Drive/Music"),
            Some("Backup Drive".to_owned())
        );
        assert_eq!(volume_name("/Volumes/Backup"), Some("Backup".to_owned()));
    }

    #[test]
    fn the_internal_disk_has_no_volume_name() {
        assert_eq!(volume_name("/Users/x/Music"), None);
        assert_eq!(volume_name("/Volumes/"), None);
        assert_eq!(volume_name("/"), None);
    }

    #[cfg(unix)]
    #[test]
    fn two_folders_on_one_device_share_a_key() {
        assert_eq!(
            volume_key_for(Path::new("/a"), Some(16_777_233)),
            volume_key_for(Path::new("/b"), Some(16_777_233))
        );
        assert_ne!(
            volume_key_for(Path::new("/a"), Some(16_777_233)),
            volume_key_for(Path::new("/a"), Some(16_777_234))
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_label_falls_back_to_the_root() {
        assert_eq!(mount_label_for(Path::new("/Users/x/Music")), "/");
        assert_eq!(mount_label_for(Path::new("/Volumes/SSD/Music")), "SSD");
    }
}
