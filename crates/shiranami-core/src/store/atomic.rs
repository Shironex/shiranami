//! Atomic file writes, owner-only creation and corrupt-file quarantine.
//!
//! Ported wholesale from nightcore's `src/store/atomic.rs`, which architecture
//! §2.3 names as a must-carry: *"a torn write or defaults-over-corruption bug
//! loses a user's library"*. Decision D17 is what makes this module exist at all
//! — `tauri-plugin-store` was rejected because it offers none of the three
//! guarantees below.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Write `bytes` to `path` atomically.
///
/// The bytes go to a sibling temp file which is flushed and then renamed over
/// the target, so a concurrent reader sees either the old file or the new one
/// and never a truncated write. The temp file is removed when anything fails, so
/// a failed write leaves no `.<name>.<pid>.<nonce>.tmp` litter behind.
///
/// The temp file is created owner-only, which is the part that is easy to get
/// wrong: chmod-ing after the rename leaves a window in which a secret-bearing
/// settings file exists at the default umask, and leaves it world-readable
/// permanently if the process dies inside that window.
///
/// # Errors
///
/// Returns the underlying I/O failure from creating, writing, flushing or
/// renaming.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("tmp");

    // pid + nanos, so two writers targeting different files in one directory
    // cannot collide on the temp name.
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let temp = directory.join(format!(".{file_name}.{}.{nonce}.tmp", std::process::id()));

    let write_then_rename = || -> std::io::Result<()> {
        let mut file = create_owner_only(&temp)?;
        file.write_all(bytes)?;
        // `sync_data` (fdatasync), not `sync_all` (fsync): durability here needs
        // the contents plus the metadata required to read them back, on disk
        // before the rename. The inode metadata `sync_all` additionally flushes
        // — mtime, atime — is pure overhead on a per-mutation path. The atomic
        // rename is what gives a reader old-or-new, never torn.
        file.sync_data()?;
        drop(file);
        std::fs::rename(&temp, path)
    };

    let result = write_then_rename();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// Create (or truncate) a file for writing with owner-only `0600` permissions
/// applied **at creation** on Unix.
///
/// The settings file holds the Last.fm session key and the ListenBrainz token
/// (§3.4, R22), so it must never exist at the default umask — not even for the
/// temp-file window, and not permanently if a crash lands between the rename and
/// a late chmod. Windows has no mode bit; a plain create is used there.
///
/// # Errors
///
/// Returns the underlying I/O failure from opening the file.
pub fn create_owner_only(path: &Path) -> std::io::Result<File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
    }
    #[cfg(not(unix))]
    {
        File::create(path)
    }
}

/// Move an unparsable file aside to a non-clobbering
/// `<name>.corrupt-<millis>` sibling, returning the backup path.
///
/// A single-file store loads all-or-nothing: on a parse error the caller falls
/// back to defaults, and the **next write would persist those defaults over the
/// bad file**, permanently erasing recoverable data — including the plaintext
/// scrobble secrets. Quarantining first means that later overwrite lands on a
/// now-absent path instead.
///
/// # Errors
///
/// Returns the rename failure — a read-only directory, say. Callers log and
/// continue: quarantine is best-effort, and failing to quarantine is not a
/// reason to refuse to start.
pub fn quarantine_corrupt(path: &Path) -> std::io::Result<PathBuf> {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "store.json".to_owned());

    let backup = path.with_file_name(format!("{name}.corrupt-{millis}"));
    std::fs::rename(path, &backup)?;
    Ok(backup)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_bytes_that_read_back_verbatim() {
        let dir = tempfile::tempdir().expect("create a store dir");
        let path = dir.path().join("config.json");
        write_atomic(&path, br#"{"theme":"dark"}"#).expect("write the settings");
        assert_eq!(
            std::fs::read(&path).expect("read it back"),
            br#"{"theme":"dark"}"#
        );
    }

    #[test]
    fn overwrites_an_existing_file_in_place() {
        let dir = tempfile::tempdir().expect("create a store dir");
        let path = dir.path().join("config.json");
        write_atomic(&path, b"old").expect("first write");
        write_atomic(&path, b"new").expect("second write");
        assert_eq!(std::fs::read(&path).expect("read it back"), b"new");
    }

    /// R22: the file holds plaintext secrets, so the mode has to be right from
    /// the moment the bytes exist — including on the temp file, which is what
    /// actually receives them.
    #[cfg(unix)]
    #[test]
    fn creates_the_file_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().expect("create a store dir");
        let path = dir.path().join("config.json");
        write_atomic(&path, br#"{"scrobble":{"settings":{}}}"#).expect("write the settings");

        let mode = std::fs::metadata(&path)
            .expect("stat the settings file")
            .permissions()
            .mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "the settings file must never be readable by anyone but its owner"
        );
    }

    /// Pins the cleanup arm: a failed rename must not leave the temp sibling it
    /// already created behind. The rename is forced to fail by making the target
    /// a directory, which errors on every platform, so the create, write and
    /// sync all succeed and control reaches the cleanup.
    #[test]
    fn removes_the_temp_file_when_the_rename_fails() {
        let dir = tempfile::tempdir().expect("create a store dir");
        let target = dir.path().join("config.json");
        std::fs::create_dir(&target).expect("create the blocking directory");

        assert!(
            write_atomic(&target, br#"{"token":"s3cr3t"}"#).is_err(),
            "renaming onto a directory must fail"
        );

        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .expect("read the store dir")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(".config.json.") && name.ends_with(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "a failed write must leave no temp file: {leftovers:?}"
        );
    }

    #[test]
    fn quarantine_moves_the_file_to_a_non_clobbering_sibling() {
        let dir = tempfile::tempdir().expect("create a store dir");
        let path = dir.path().join("config.json");
        std::fs::write(&path, b"{ not valid json").expect("seed a corrupt file");

        let backup = quarantine_corrupt(&path).expect("quarantine it");

        assert!(!path.exists(), "the corrupt file moves off its path");
        assert_ne!(backup, path);
        assert_eq!(backup.parent(), path.parent());
        assert!(
            backup
                .file_name()
                .map(|name| name.to_string_lossy().starts_with("config.json.corrupt-"))
                .unwrap_or(false)
        );
        assert_eq!(
            std::fs::read(&backup).expect("read the backup"),
            b"{ not valid json",
            "the bytes are preserved verbatim for recovery, secrets included"
        );
    }
}
