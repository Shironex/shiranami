//! Phase 17 end to end: a v1 profile on disk, copied by
//! `shiranami_core::migrate`, then opened by the real `shiranami_db::open`.
//!
//! The unit tests in `shiranami-core` prove the copy moves bytes. This file
//! proves the thing that actually matters — that what lands is a database v2
//! **adopts**, with the same rows in it — and it is here rather than in `core`
//! because that is the crate boundary: core is rank 0 and cannot open a
//! database, so nothing over there can tell a faithful copy from a plausible
//! one.
//!
//! The Phase 17 done-criterion is *"end-to-end test against a synthetic v1
//! profile (DB + art + peaks + config) produces identical counts; second run is
//! a no-op"*. Both are below, plus the refusal cases, because a migration that
//! fails closed is worth as much as one that succeeds.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use std::path::{Path, PathBuf};

use shiranami_core::migrate::{self, Outcome};
use shiranami_db::{Adoption, DbError};

use schema::count;
use v1::{build_v1_database, connect, seed_rows};

/// The tables whose counts are compared before and after. Every one of them
/// holds something a user would notice losing.
const COUNTED: [&str; 7] = [
    "tracks",
    "playlists",
    "playlist_tracks",
    "play_history",
    "folders",
    "smart_playlists",
    "youtube_mappings",
];

struct Profile {
    _root: tempfile::TempDir,
    legacy: PathBuf,
    data: PathBuf,
}

impl Profile {
    /// A v1 data directory: a database `through` migrations along, seeded with
    /// rows, plus the caches and settings a real profile carries — and the
    /// Chromium state a real profile also carries, which must not travel.
    async fn build(through: usize) -> Self {
        let root = tempfile::tempdir().expect("a temp root");
        let legacy = root.path().join("Shiranami");
        let data = root.path().join("com.shironex.shiranami");
        std::fs::create_dir_all(&legacy).expect("create the v1 directory");
        std::fs::create_dir_all(&data).expect("create the v2 directory");

        let mut conn = connect(&legacy.join("shiranami.db")).await;
        build_v1_database(&mut conn, through).await;
        seed_rows(&mut conn).await;
        drop(conn);

        std::fs::create_dir_all(legacy.join("album-art")).expect("art");
        std::fs::create_dir_all(legacy.join("waveform-peaks")).expect("peaks");
        std::fs::write(legacy.join("album-art/deadbeef.jpg"), b"\xff\xd8\xffjpeg").expect("cover");
        std::fs::write(
            legacy.join("waveform-peaks/cafe.json"),
            br#"{"peaks":[0.5]}"#,
        )
        .expect("peaks file");
        std::fs::write(
            legacy.join("config.json"),
            b"{\n\t\"theme\": \"dark\",\n\t\"player\": {\n\t\t\"volume\": 0.02\n\t}\n}",
        )
        .expect("config");

        // What a real Electron userData is mostly made of.
        std::fs::create_dir_all(legacy.join("Cache")).expect("cache");
        std::fs::write(legacy.join("Cache/data_0"), vec![0_u8; 4096]).expect("cache file");
        std::fs::write(legacy.join("Preferences"), b"{}").expect("prefs");

        Self {
            _root: root,
            legacy,
            data,
        }
    }

    fn migrate(&self) -> migrate::Result<Outcome> {
        migrate::run(Some(&self.legacy), &self.data)
    }

    fn v2_database(&self) -> PathBuf {
        self.data.join("shiranami.db")
    }
}

/// Row counts straight out of a database file, through a throwaway connection.
///
/// Per table from a fixed list rather than "every table there is": adoption
/// legitimately *adds* tables — `_sqlx_migrations`, and `scrobble_queue` from
/// v2's own `0002` — so a whole-schema comparison would fail for the one reason
/// that is not a bug. The question here is whether any row the user had stopped
/// existing.
async fn counts(path: &Path) -> Vec<(&'static str, i64)> {
    let mut conn = connect(path).await;
    let mut counted = Vec::with_capacity(COUNTED.len());
    for table in COUNTED {
        counted.push((table, count(&mut conn, table).await));
    }
    drop(conn);
    counted
}

/// The Phase 17 done-criterion, both halves.
#[tokio::test]
async fn a_v1_profile_migrates_with_identical_counts_and_a_second_run_is_a_no_op() {
    let profile = Profile::build(9).await;
    let before = counts(&profile.legacy.join("shiranami.db")).await;

    assert!(
        matches!(profile.migrate().expect("migrate"), Outcome::Migrated(_)),
        "a populated v1 profile migrates"
    );

    // The real boot-path open: quick_check, adoption, then the migrator.
    let opened = shiranami_db::open(&profile.v2_database())
        .await
        .expect("the copied database opens");
    assert_eq!(
        opened.adoption,
        Adoption::Adopted {
            legacy: false,
            healed_disc_number: false,
            replayed: Vec::new(),
        },
        "a current v1 database is adopted with no DDL replayed"
    );
    opened.pool.close().await;

    let after = counts(&profile.v2_database()).await;
    assert_eq!(before, after, "every counted table survived the migration");
    assert!(
        before.iter().any(|(_, count)| *count > 0),
        "the fixture has to have rows, or this asserts nothing: {before:?}"
    );

    // The caches and the settings travelled; Chromium did not.
    assert_eq!(
        std::fs::read(profile.data.join("album-art/deadbeef.jpg")).expect("cover"),
        b"\xff\xd8\xffjpeg"
    );
    assert!(profile.data.join("waveform-peaks/cafe.json").is_file());
    assert!(!profile.data.join("Cache").exists());

    // …and the v1 tree is exactly where it was (D13).
    assert_eq!(
        counts(&profile.legacy.join("shiranami.db")).await,
        before,
        "the source database must not have been touched"
    );

    // Second run.
    assert_eq!(
        profile.migrate().expect("second run"),
        Outcome::AlreadyMigrated
    );
}

/// A user who stopped upgrading v1 three migrations back. Adoption replays the
/// rest rather than refusing, and the rows survive the replay.
#[tokio::test]
async fn a_v1_profile_behind_on_migrations_is_brought_forward() {
    let profile = Profile::build(6).await;
    let tracks_before = counts(&profile.legacy.join("shiranami.db"))
        .await
        .into_iter()
        .find(|(table, _)| *table == "tracks")
        .expect("tracks counted");

    profile.migrate().expect("migrate");

    let opened = shiranami_db::open(&profile.v2_database())
        .await
        .expect("the copied database opens");
    let Adoption::Adopted { replayed, .. } = &opened.adoption else {
        panic!("expected an adoption, got {:?}", opened.adoption);
    };
    assert_eq!(
        replayed.len(),
        3,
        "the three v1 migrations it never ran: {replayed:?}"
    );
    opened.pool.close().await;

    let tracks_after = counts(&profile.v2_database())
        .await
        .into_iter()
        .find(|(table, _)| *table == "tracks")
        .expect("tracks counted");
    assert_eq!(tracks_before, tracks_after, "no row was lost to the replay");
}

/// Fail closed, and lose nothing doing it. The copy is faithful — a corrupt v1
/// database produces a corrupt v2 one — and `open` refuses it rather than
/// adopting whatever it can read.
#[tokio::test]
async fn a_corrupt_v1_database_is_refused_and_both_copies_are_preserved() {
    let profile = Profile::build(9).await;

    // Overwrite the pages after the header: a real SQLite file by its magic,
    // unreadable past it, which is the shape `quick_check` exists to catch.
    let path = profile.legacy.join("shiranami.db");
    let mut bytes = std::fs::read(&path).expect("read the database");
    for byte in bytes.iter_mut().skip(100) {
        *byte = 0x5a;
    }
    std::fs::write(&path, &bytes).expect("corrupt it");

    // The migration itself succeeds: it copies bytes and does not judge them.
    assert!(matches!(
        profile
            .migrate()
            .expect("the copy does not fail on content"),
        Outcome::Migrated(_)
    ));

    let refused = shiranami_db::open(&profile.v2_database()).await.err();
    assert!(
        matches!(
            refused,
            Some(DbError::Corrupt { .. } | DbError::Query { .. })
        ),
        "a corrupt library must be refused, got {refused:?}"
    );

    // Neither copy was deleted or truncated in the process — the user's bytes
    // are still there for a support conversation to recover from.
    assert_eq!(
        std::fs::read(&path).expect("the source survives"),
        bytes,
        "the v1 database is byte-identical to what we found"
    );
    assert_eq!(
        std::fs::read(profile.v2_database()).expect("the copy survives"),
        bytes,
        "the refused copy is kept, not cleaned up"
    );
}

/// The other refusal: a database from a v2 newer than this build. It reaches
/// adoption through a faithful copy and is turned away at the floor.
#[tokio::test]
async fn a_database_from_a_newer_build_is_refused_after_being_copied() {
    let profile = Profile::build(9).await;

    let mut conn = connect(&profile.legacy.join("shiranami.db")).await;
    v1::set_user_version(&mut conn, shiranami_db::SCHEMA_FLOOR + 1).await;
    drop(conn);

    profile.migrate().expect("migrate");

    let refused = shiranami_db::open(&profile.v2_database()).await.err();
    assert!(
        matches!(refused, Some(DbError::SchemaTooNew { .. })),
        "got {refused:?}"
    );
    assert!(
        profile.legacy.join("shiranami.db").is_file(),
        "the v1 database is still there to roll back to"
    );
}

/// An interrupted first run, resumed: the half-copied database is replaced and
/// the library opens with its rows intact.
#[tokio::test]
async fn an_interrupted_migration_resumes_into_an_openable_library() {
    let profile = Profile::build(9).await;
    let before = counts(&profile.legacy.join("shiranami.db")).await;

    // What a run killed mid-copy leaves behind.
    std::fs::write(profile.data.join(".v1-migration-in-progress"), b"").expect("sentinel");
    std::fs::write(profile.v2_database(), b"SQLite format 3\0truncated").expect("partial");

    let outcome = profile.migrate().expect("resume");
    let Outcome::Migrated(migrated) = outcome else {
        panic!("expected a migration, got {outcome:?}");
    };
    assert!(migrated.resumed);

    let opened = shiranami_db::open(&profile.v2_database())
        .await
        .expect("the resumed copy opens");
    opened.pool.close().await;

    assert_eq!(counts(&profile.v2_database()).await, before);
}

/// A v2 install with its own library, on a machine that also has a v1 tree. The
/// live database is never overwritten by the older one.
#[tokio::test]
async fn a_v2_library_is_not_overwritten_by_an_older_v1_one() {
    let profile = Profile::build(9).await;

    // A v2 database of its own, with a different number of rows.
    let opened = shiranami_db::open(&profile.v2_database())
        .await
        .expect("a fresh v2 library");
    assert_eq!(opened.adoption, Adoption::Fresh);
    opened.pool.close().await;
    let v2_counts = counts(&profile.v2_database()).await;

    let outcome = profile.migrate().expect("run");
    assert!(matches!(outcome, Outcome::Skipped(_)), "got {outcome:?}");

    assert_eq!(
        counts(&profile.v2_database()).await,
        v2_counts,
        "the live v2 library is untouched"
    );
    assert!(
        shiranami_core::paths::is_migrated(&profile.data),
        "and the decision is recorded so it is not retaken every launch"
    );
}

/// A fresh install with no v1 tree at all: nothing copied, nothing marked, and
/// a normal fresh database.
#[tokio::test]
async fn a_fresh_install_opens_a_new_library_and_records_no_migration() {
    let root = tempfile::tempdir().expect("a temp root");
    let data = root.path().join("com.shironex.shiranami");
    std::fs::create_dir_all(&data).expect("create the data directory");

    assert_eq!(
        migrate::run(Some(&root.path().join("Shiranami")), &data).expect("run"),
        Outcome::NoLegacyData
    );
    assert!(!shiranami_core::paths::is_migrated(&data));

    let opened = shiranami_db::open(&data.join("shiranami.db"))
        .await
        .expect("a fresh library");
    assert_eq!(opened.adoption, Adoption::Fresh);
    opened.pool.close().await;
}

/// The settings file crosses as bytes, and `SettingsStore` reads it in place —
/// §3.4's "read the v1 config.json rather than converting it", end to end.
#[tokio::test]
async fn the_v1_settings_file_is_readable_by_the_v2_store_after_migrating() {
    let profile = Profile::build(9).await;
    profile.migrate().expect("migrate");

    let (settings, quarantined) = shiranami_core::store::SettingsStore::load(
        profile.data.join(shiranami_core::paths::SETTINGS_FILE),
    );
    assert_eq!(quarantined, None, "the v1 file parses as-is");

    assert_eq!(
        settings.get(shiranami_core::store::RendererStoreKey::Theme),
        Some(serde_json::json!("dark"))
    );
    assert_eq!(
        settings.get(shiranami_core::store::RendererStoreKey::PlayerVolume),
        Some(serde_json::json!(0.02)),
        "electron-store's dot-notation nesting reads back through the same paths"
    );
}
