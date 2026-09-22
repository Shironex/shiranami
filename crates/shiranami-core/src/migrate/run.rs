//! §3.1's first-run sequence, as a state machine.
//!
//! ```text
//!   marker present?                          ── yes ─→ AlreadyMigrated
//!   v1 directory with a database?            ── no  ─→ NoLegacyData
//!   v2 database present, no run in progress? ── yes ─→ Skipped (marker written)
//!   otherwise:  sentinel → backup → copy → marker → sentinel removed → Migrated
//! ```
//!
//! # The sentinel is what tells a resume from a collision
//!
//! §3.1 assumes two states and the marker distinguishes them: written last, so
//! an interrupted run leaves none and the next launch redoes the copy. That is
//! sound, but it leaves one question unanswerable — a v2 data directory holding
//! `shiranami.db` and no marker is *either* a run that died mid-copy (redo it)
//! *or* a v2 install that already has its own library on a machine where a v1
//! directory also exists (never touch it). Copying in the second case overwrites
//! live data with an older library, which is R6 arriving from the direction §3.1
//! did not consider.
//!
//! `.v1-migration-in-progress` answers it. Written before the first byte,
//! removed after the marker, so its presence means "a previous run of *this*
//! sequence was interrupted" and its absence beside a database means "that
//! database is not ours to overwrite".

use std::path::Path;

use super::error::Result;
use super::marker::{MigrationMarker, SkipReason};
use super::plan::{DATABASE_FILE, DATABASE_SIDECARS, Discovery, ENTRIES};
use super::{backup, copy, handoff};

/// Written while a copy is in flight; removed once the marker lands.
pub const IN_PROGRESS_FILE: &str = ".v1-migration-in-progress";

/// What first-run continuity did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// The marker was already there. §3.1 step 1: nothing runs.
    AlreadyMigrated,
    /// No v1 directory, or one with no library in it. A fresh install.
    NoLegacyData,
    /// A v1 library exists but was deliberately not copied.
    Skipped(SkipReason),
    /// A v1 library was copied.
    Migrated(Migrated),
}

/// The detail of a completed migration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Migrated {
    /// Bytes copied by this run. A resumed run reports only what *it* moved,
    /// which is why the marker's figure can be lower than the tree's size.
    pub copied_bytes: u64,
    /// The v1 version, when `v2-handoff.json` named one.
    pub v1_version: Option<String>,
    /// Whether this run picked up after an interrupted one.
    pub resumed: bool,
}

impl Outcome {
    /// Whether a v1 library landed in the v2 directory, now or on an earlier
    /// run. Drives §3.5's onboarding fallback.
    #[must_use]
    pub fn carries_a_v1_library(&self) -> bool {
        matches!(self, Self::Migrated(_))
    }
}

/// Run §3.1's first-run sequence.
///
/// `legacy_dir` is `None` on a platform whose home directory could not be
/// resolved, which is [`Outcome::NoLegacyData`] rather than a failure — there is
/// nothing to copy and nothing to lose.
///
/// # Errors
///
/// [`super::MigrateError`] for anything that leaves the copy incomplete. Every
/// variant refuses the launch (§3.1 step 7); the caller must not continue into a
/// fresh database.
pub fn run(legacy_dir: Option<&Path>, data_dir: &Path) -> Result<Outcome> {
    // Step 1.
    if crate::paths::is_migrated(data_dir) {
        return Ok(Outcome::AlreadyMigrated);
    }

    let Some(legacy_dir) = legacy_dir else {
        return Ok(Outcome::NoLegacyData);
    };
    let found = Discovery::inspect(legacy_dir);
    if !found.is_migratable() {
        tracing::debug!(
            path = %legacy_dir.display(),
            "no v1 library to migrate"
        );
        return Ok(Outcome::NoLegacyData);
    }

    let sentinel = data_dir.join(IN_PROGRESS_FILE);
    let resumed = sentinel.exists();

    // The collision case. See the module docs.
    if !resumed && data_dir.join(DATABASE_FILE).exists() {
        tracing::warn!(
            legacy = %legacy_dir.display(),
            "found a v1 library but this install already has its own; leaving both alone"
        );
        let marker = MigrationMarker::skipped(legacy_dir, SkipReason::V2DataAlreadyPresent);
        marker.write(data_dir)?;
        return Ok(Outcome::Skipped(SkipReason::V2DataAlreadyPresent));
    }

    tracing::info!(
        legacy = %legacy_dir.display(),
        entries = ?found.present,
        resumed,
        "migrating the v1 library"
    );

    std::fs::create_dir_all(data_dir).map_err(|source| super::MigrateError::CreateDirectory {
        path: data_dir.to_path_buf(),
        source,
    })?;
    std::fs::write(&sentinel, b"").map_err(|source| super::MigrateError::CreateDirectory {
        path: sentinel.clone(),
        source,
    })?;

    // Step 2. Best-effort by design — see `backup`'s module docs.
    backup::snapshot(legacy_dir);

    // Step 3.
    let copied_bytes = copy_everything(legacy_dir, data_dir)?;

    // Steps 4 and 5 need no work here: `config.json` is byte-compatible between
    // electron-store and `core::store`, so copying the file *is* the key-by-key
    // import (§3.4), and `renderer-state.json` is read from the copy by the
    // shell when it builds the seed script (§3.5).
    let v1_version =
        handoff::Handoff::read(legacy_dir).and_then(|descriptor| descriptor.v1_version);

    // Step 6.
    MigrationMarker::completed(legacy_dir, copied_bytes, v1_version.clone()).write(data_dir)?;

    // Only now: the marker is the durable record, and a sentinel outliving it
    // would only cost the next run a redundant existence check.
    if let Err(error) = std::fs::remove_file(&sentinel) {
        tracing::warn!(%error, "could not clear the migration sentinel");
    }

    tracing::info!(copied_bytes, resumed, "the v1 library was migrated");

    Ok(Outcome::Migrated(Migrated {
        copied_bytes,
        v1_version,
        resumed,
    }))
}

/// §3.1 step 3, in order: the listed entries, then the database last.
fn copy_everything(legacy_dir: &Path, data_dir: &Path) -> Result<u64> {
    let mut copied = 0_u64;

    for entry in ENTRIES {
        let from = legacy_dir.join(entry.name);
        let to = data_dir.join(entry.name);
        copied += if entry.directory {
            copy::tree(&from, &to, entry.on_existing)?
        } else {
            copy::file(&from, &to, entry.on_existing)?
        };
    }

    // The database last, and its sidecars after it: a `-wal` newer than the
    // database it belongs to is a state SQLite recovers from, where the reverse
    // is not.
    copied += copy::file(
        &legacy_dir.join(DATABASE_FILE),
        &data_dir.join(DATABASE_FILE),
        copy::OnExisting::Replace,
    )?;

    for suffix in DATABASE_SIDECARS {
        let name = format!("{DATABASE_FILE}{suffix}");
        copied += copy::file(
            &legacy_dir.join(&name),
            &data_dir.join(&name),
            copy::OnExisting::Replace,
        )?;
    }

    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A v1 profile with a library, the caches and the settings.
    fn v1_profile(root: &Path) -> std::path::PathBuf {
        let dir = root.join("Shiranami");
        std::fs::create_dir_all(dir.join("album-art")).expect("art");
        std::fs::create_dir_all(dir.join("waveform-peaks")).expect("peaks");
        std::fs::write(dir.join(DATABASE_FILE), b"SQLite format 3\0library").expect("db");
        std::fs::write(dir.join("config.json"), b"{\"theme\":\"dark\"}").expect("config");
        std::fs::write(dir.join("album-art/cover.jpg"), b"jpegbytes").expect("cover");
        std::fs::write(dir.join("waveform-peaks/peaks.json"), b"{\"peaks\":[]}").expect("peaks");
        // Chromium state that must not travel.
        std::fs::create_dir_all(dir.join("Cache")).expect("cache");
        std::fs::write(dir.join("Cache/data_0"), b"chromium").expect("cache file");
        dir
    }

    fn v2_dir(root: &Path) -> std::path::PathBuf {
        let dir = root.join("com.shironex.shiranami");
        std::fs::create_dir_all(&dir).expect("create the data dir");
        dir
    }

    #[test]
    fn a_full_v1_profile_is_copied_and_the_source_survives() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());

        let outcome = run(Some(&legacy), &data).expect("migrate");

        let Outcome::Migrated(migrated) = outcome else {
            panic!("expected a migration, got {outcome:?}");
        };
        assert!(!migrated.resumed);
        assert!(migrated.copied_bytes > 0);

        assert_eq!(
            std::fs::read(data.join(DATABASE_FILE)).expect("db"),
            b"SQLite format 3\0library"
        );
        assert_eq!(
            std::fs::read(data.join("config.json")).expect("config"),
            b"{\"theme\":\"dark\"}"
        );
        assert!(data.join("album-art/cover.jpg").is_file());
        assert!(data.join("waveform-peaks/peaks.json").is_file());

        // D13: copy, never move.
        assert!(legacy.join(DATABASE_FILE).is_file());
        assert!(legacy.join("album-art/cover.jpg").is_file());

        // The allowlist held.
        assert!(!data.join("Cache").exists());
    }

    /// §3.1 step 1 and the Phase 17 done-criterion: "second run is a no-op".
    #[test]
    fn a_second_run_is_a_no_op() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());

        run(Some(&legacy), &data).expect("first run");

        // A change the user made after migrating must survive the second run.
        std::fs::write(data.join("config.json"), b"{\"theme\":\"light\"}").expect("edit");

        assert_eq!(
            run(Some(&legacy), &data).expect("second run"),
            Outcome::AlreadyMigrated
        );
        assert_eq!(
            std::fs::read(data.join("config.json")).expect("config"),
            b"{\"theme\":\"light\"}",
            "the marker must stop v1's older settings being copied back over"
        );
    }

    #[test]
    fn a_fresh_install_with_no_v1_directory_does_nothing_and_writes_no_marker() {
        let root = tempfile::tempdir().expect("a temp dir");
        let data = v2_dir(root.path());

        assert_eq!(
            run(Some(&root.path().join("Shiranami")), &data).expect("run"),
            Outcome::NoLegacyData
        );
        assert!(!crate::paths::is_migrated(&data));
    }

    #[test]
    fn an_unresolvable_home_directory_is_not_a_failure() {
        let root = tempfile::tempdir().expect("a temp dir");
        let data = v2_dir(root.path());
        assert_eq!(run(None, &data).expect("run"), Outcome::NoLegacyData);
    }

    /// An interrupted run resumes: the sentinel says the half-copied database is
    /// ours, so it is overwritten rather than protected.
    #[test]
    fn an_interrupted_copy_resumes_and_completes() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());

        // What a run that died mid-copy leaves: the sentinel, a truncated
        // database, and none of the caches.
        std::fs::write(data.join(IN_PROGRESS_FILE), b"").expect("sentinel");
        std::fs::write(data.join(DATABASE_FILE), b"SQLite fo").expect("partial db");

        let outcome = run(Some(&legacy), &data).expect("resume");

        let Outcome::Migrated(migrated) = outcome else {
            panic!("expected a migration, got {outcome:?}");
        };
        assert!(migrated.resumed);
        assert_eq!(
            std::fs::read(data.join(DATABASE_FILE)).expect("db"),
            b"SQLite format 3\0library",
            "the truncated file was replaced, not kept"
        );
        assert!(data.join("album-art/cover.jpg").is_file());
        assert!(
            !data.join(IN_PROGRESS_FILE).exists(),
            "the sentinel is cleared"
        );
        assert!(crate::paths::is_migrated(&data));
    }

    /// The collision case the sentinel exists to distinguish. A v2 install with
    /// its own library must never be overwritten by an older v1 one.
    #[test]
    fn a_v2_install_that_already_has_a_library_is_never_overwritten() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());
        std::fs::write(data.join(DATABASE_FILE), b"SQLite format 3\0v2 library").expect("v2 db");

        let outcome = run(Some(&legacy), &data).expect("run");

        assert_eq!(outcome, Outcome::Skipped(SkipReason::V2DataAlreadyPresent));
        assert_eq!(
            std::fs::read(data.join(DATABASE_FILE)).expect("db"),
            b"SQLite format 3\0v2 library",
            "the live v2 library survived"
        );
        // And the decision is recorded, so it is not re-taken every launch.
        assert!(crate::paths::is_migrated(&data));
        assert_eq!(
            run(Some(&legacy), &data).expect("again"),
            Outcome::AlreadyMigrated
        );
    }

    /// A v1 directory Electron created but the user never used.
    #[test]
    fn a_v1_directory_with_no_database_is_not_migrated() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = root.path().join("Shiranami");
        std::fs::create_dir_all(legacy.join("Cache")).expect("cache");
        let data = v2_dir(root.path());

        assert_eq!(
            run(Some(&legacy), &data).expect("run"),
            Outcome::NoLegacyData
        );
        assert!(!crate::paths::is_migrated(&data));
    }

    #[test]
    fn the_bridge_handoff_supplies_the_v1_version_for_the_marker() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        std::fs::write(
            legacy.join("v2-handoff.json"),
            br#"{"schemaVersion":1,"v1Version":"1.0.0"}"#,
        )
        .expect("handoff");
        let data = v2_dir(root.path());

        let outcome = run(Some(&legacy), &data).expect("migrate");
        let Outcome::Migrated(migrated) = outcome else {
            panic!("expected a migration");
        };

        assert_eq!(migrated.v1_version.as_deref(), Some("1.0.0"));
        assert_eq!(
            MigrationMarker::read(&data)
                .expect("marker")
                .v1_version
                .as_deref(),
            Some("1.0.0")
        );
        // And the dump itself travelled, so the shell can seed from the copy.
        assert!(data.join("v2-handoff.json").is_file());
    }

    /// The common case today: PR #364 has not shipped, so no user has either
    /// bridge file. The migration must not care.
    #[test]
    fn a_v1_profile_without_the_bridge_files_migrates_with_no_version_recorded() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());

        let outcome = run(Some(&legacy), &data).expect("migrate");
        let Outcome::Migrated(migrated) = outcome else {
            panic!("expected a migration");
        };

        assert_eq!(migrated.v1_version, None);
        assert!(migrated.copied_bytes > 0);
        assert!(!data.join("renderer-state.json").exists());
    }

    /// The database is copied last, so a run that dies before it leaves caches
    /// with no library rather than a library with no covers.
    #[test]
    fn the_database_is_the_last_thing_copied() {
        let names: Vec<_> = ENTRIES.iter().map(|entry| entry.name).collect();
        assert!(
            !names.contains(&DATABASE_FILE),
            "the database is copied after every entry, by `copy_everything`"
        );
    }

    #[test]
    fn the_wal_and_shm_sidecars_travel_with_the_database() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        std::fs::write(legacy.join("shiranami.db-wal"), b"wal").expect("wal");
        std::fs::write(legacy.join("shiranami.db-shm"), b"shm").expect("shm");
        let data = v2_dir(root.path());

        run(Some(&legacy), &data).expect("migrate");

        assert_eq!(
            std::fs::read(data.join("shiranami.db-wal")).expect("wal"),
            b"wal"
        );
        assert_eq!(
            std::fs::read(data.join("shiranami.db-shm")).expect("shm"),
            b"shm"
        );
    }

    /// §3.1 step 2, and D13's hardest edge: the backup lands in the *v1* tree
    /// and nothing there is removed.
    #[test]
    fn the_v1_library_is_backed_up_before_it_is_read() {
        let root = tempfile::tempdir().expect("a temp dir");
        let legacy = v1_profile(root.path());
        let data = v2_dir(root.path());

        run(Some(&legacy), &data).expect("migrate");

        let backups: Vec<_> = std::fs::read_dir(legacy.join("backups"))
            .expect("the backup directory exists")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();

        assert_eq!(backups.len(), 1, "got {backups:?}");
        assert!(backups[0].starts_with("shiranami-") && backups[0].ends_with(".db"));
    }

    #[test]
    fn only_a_migrated_outcome_carries_a_v1_library() {
        assert!(
            Outcome::Migrated(Migrated {
                copied_bytes: 1,
                v1_version: None,
                resumed: false,
            })
            .carries_a_v1_library()
        );

        for outcome in [
            Outcome::AlreadyMigrated,
            Outcome::NoLegacyData,
            Outcome::Skipped(SkipReason::V2DataAlreadyPresent),
        ] {
            assert!(!outcome.carries_a_v1_library(), "{outcome:?}");
        }
    }
}
