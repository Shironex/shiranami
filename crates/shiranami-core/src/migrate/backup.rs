//! §3.1 step 2: snapshot the v1 database into the v1 `backups/` directory
//! before the migration reads it.
//!
//! v1's own `services/db-backup.ts` runs on every launch, before its migrator,
//! and this reproduces its directory (`backups/`, beside the database) and its
//! filename (`shiranami-<ISO with `:` and `.` replaced by `-`>.db`). Three
//! things about it are deliberately **not** reproduced, and each is a decision
//! rather than an omission.
//!
//! # It does not prune
//!
//! v1 keeps five backups and unlinks the rest, which is right for something that
//! runs on every launch. This runs **once, ever**, so the cap it protects can be
//! exceeded by at most one file — and pruning would mean v2 deleting files out
//! of the v1 tree during a sequence whose entire contract (D13) is "copy, never
//! move, never delete". Of everything in this phase, unlinking a user's existing
//! backups is the one act with no undo.
//!
//! # It copies bytes rather than using SQLite's online backup API
//!
//! v1 opens the database read-only and calls better-sqlite3's `.backup()`, which
//! is WAL-aware and yields one consistent file. This crate is rank 0 and has no
//! SQLite: `shiranami-db` is two ranks up and could not be reached from here
//! without inverting the spine. Opening the v1 database through sqlx would also
//! be the first thing in this whole sequence that *writes* to the v1 tree — WAL
//! recovery on open creates and mutates `-wal` and `-shm` — which is precisely
//! what "before anything is touched" rules out. So the `-wal` and `-shm`
//! sidecars are copied alongside, and the set restores to the same state.
//!
//! # A failure here does not refuse the launch
//!
//! This is the one deliberate exception to §3.1 step 7, and it is v1's own
//! documented policy: *"a backup failure must not block launch"*. Step 7 exists
//! to stop the app continuing into a **fresh empty database**, which a failed
//! backup cannot cause — the migration only ever reads the v1 database, so there
//! is nothing here for the backup to protect against. It is belt-and-braces, and
//! belt-and-braces that refuses to start is worse than the risk it covers.

use std::path::Path;

/// The directory name v1 uses, beside the database.
pub const BACKUP_DIRECTORY_NAME: &str = "backups";

/// v1's `-wal`/`-shm` sidecars, in the order they must be copied: the database
/// first, then the log that may be newer than it.
const SIDECARS: [&str; 2] = ["-wal", "-shm"];

/// v1's filename stamp: `toISOString()` with `:` and `.` replaced by `-`.
///
/// Split out from [`snapshot`] so the format is checkable against a fixed
/// instant rather than against whatever the clock says.
#[must_use]
pub fn stamp(iso8601: &str) -> String {
    iso8601.replace([':', '.'], "-")
}

/// Copy the v1 database into the v1 `backups/` directory.
///
/// Best-effort: every failure is logged and swallowed. See the module docs.
/// Returns the backup's path when one was made.
pub fn snapshot(legacy_dir: &Path) -> Option<std::path::PathBuf> {
    let database = legacy_dir.join(super::DATABASE_FILE);
    if !database.is_file() {
        // A v1 directory with no database is a fresh v1 install; v1 itself
        // returns `null` here for the same reason.
        return None;
    }

    let directory = legacy_dir.join(BACKUP_DIRECTORY_NAME);
    if let Err(error) = std::fs::create_dir_all(&directory) {
        tracing::warn!(
            path = %directory.display(),
            %error,
            "could not create the v1 backup directory; continuing without a pre-migration backup"
        );
        return None;
    }

    let destination = directory.join(format!(
        "shiranami-{}.db",
        stamp(&crate::time::iso8601::now())
    ));

    if let Err(error) = std::fs::copy(&database, &destination) {
        tracing::warn!(
            path = %destination.display(),
            %error,
            "could not write the pre-migration backup; continuing"
        );
        return None;
    }

    // The sidecars carry whatever v1 had not yet checkpointed. Individually
    // optional: a cleanly closed database has neither.
    for suffix in SIDECARS {
        let from = with_suffix(&database, suffix);
        if !from.is_file() {
            continue;
        }
        let to = with_suffix(&destination, suffix);
        if let Err(error) = std::fs::copy(&from, &to) {
            tracing::warn!(path = %to.display(), %error, "could not copy a backup sidecar");
        }
    }

    tracing::info!(path = %destination.display(), "backed the v1 library up before migrating");
    Some(destination)
}

/// `shiranami.db` + `-wal` → `shiranami.db-wal`, the way SQLite names them.
fn with_suffix(path: &Path, suffix: &str) -> std::path::PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    std::path::PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1's exact transformation, pinned against a real `toISOString()` output.
    /// The filename is what `db-backup.ts`'s lexicographic prune sorts on, so a
    /// changed shape would reorder a user's backups by something other than age.
    #[test]
    fn the_stamp_is_v1s_iso_string_with_colons_and_dots_replaced() {
        assert_eq!(
            stamp("2026-08-01T09:14:22.531Z"),
            "2026-08-01T09-14-22-531Z"
        );
    }

    /// The names v1 actually left in a real profile still parse under this
    /// scheme, and still sort oldest-first.
    #[test]
    fn real_v1_backup_names_sort_lexicographically_by_age() {
        let mut names = [
            "shiranami-2026-07-10T10-53-12-745Z.db",
            "shiranami-2026-06-24T13-28-21-868Z.db",
            "shiranami-2026-07-10T10-12-31-230Z.db",
        ];
        names.sort_unstable();

        assert_eq!(
            names,
            [
                "shiranami-2026-06-24T13-28-21-868Z.db",
                "shiranami-2026-07-10T10-12-31-230Z.db",
                "shiranami-2026-07-10T10-53-12-745Z.db",
            ]
        );
    }

    #[test]
    fn a_snapshot_lands_in_the_v1_backups_directory_and_carries_its_sidecars() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(dir.path().join(super::super::DATABASE_FILE), b"main").expect("db");
        std::fs::write(dir.path().join("shiranami.db-wal"), b"log").expect("wal");

        let path = snapshot(dir.path()).expect("a backup is made");

        assert_eq!(path.parent(), Some(dir.path().join("backups").as_path()));
        assert_eq!(std::fs::read(&path).expect("read the backup"), b"main");

        let wal = with_suffix(&path, "-wal");
        assert_eq!(std::fs::read(&wal).expect("read the sidecar"), b"log");
    }

    /// D13 in the one place it would be easiest to break: v2 must not unlink a
    /// user's existing v1 backups, however many there are.
    #[test]
    fn existing_backups_are_never_pruned() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(dir.path().join(super::super::DATABASE_FILE), b"main").expect("db");
        let backups = dir.path().join("backups");
        std::fs::create_dir_all(&backups).expect("create the backup dir");

        let existing = [
            "shiranami-2026-01-01T00-00-00-000Z.db",
            "shiranami-2026-02-01T00-00-00-000Z.db",
            "shiranami-2026-03-01T00-00-00-000Z.db",
            "shiranami-2026-04-01T00-00-00-000Z.db",
            "shiranami-2026-05-01T00-00-00-000Z.db",
            "shiranami-2026-06-01T00-00-00-000Z.db",
        ];
        for name in existing {
            std::fs::write(backups.join(name), b"old").expect("seed a backup");
        }

        snapshot(dir.path()).expect("a backup is made");

        for name in existing {
            assert!(
                backups.join(name).is_file(),
                "{name} was pruned; D13 says never delete"
            );
        }
        assert_eq!(
            std::fs::read_dir(&backups).expect("read").count(),
            existing.len() + 1,
            "exactly one backup was added"
        );
    }

    /// A fresh v1 install has no database, and that is not a failure.
    #[test]
    fn a_v1_directory_with_no_database_produces_no_backup() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert_eq!(snapshot(dir.path()), None);
        assert!(!dir.path().join("backups").exists());
    }
}
