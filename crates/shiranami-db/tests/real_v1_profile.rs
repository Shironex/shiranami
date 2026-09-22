//! The migration, run against a **real** v1 profile.
//!
//! Every other test in this phase builds its fixture, which means every other
//! test can only find bugs its author thought to encode. A real profile carries
//! things nobody would write down: 500-odd covers whose names came from two
//! different JPEG encoders (§3.3), a `config.json` with a `player-state` blob
//! tens of kilobytes long, backups going back months, a `bin/` directory of
//! ~190 MB, and a `youtube_mappings` table with two different `searched_at`
//! formats in it.
//!
//! # Gated, and provably skipped
//!
//! Point `SHIRANAMI_V1_PROFILE` at a v1 data directory to run it; with the
//! variable unset the test is a no-op, so CI stays hermetic and no contributor
//! needs a v1 install. Phase 11 established this pattern for the real-`yt-dlp`
//! tests and also established its hazard — a skipping test proves nothing about
//! itself — so `the_gate_refuses_a_directory_that_is_not_a_v1_profile` runs
//! *unconditionally* and fails if the gate would let rubbish through.
//!
//! # It never touches the directory you point it at
//!
//! The profile is copied into a temp directory first and the migration runs
//! against the copy, because §3.1 step 2 writes a backup into the **v1** tree —
//! the one write in the whole sequence. The test then re-checksums the original
//! and fails if a single byte moved. That is the property this file exists to
//! demonstrate: "copy, never move" (D13), measured rather than asserted.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use shiranami_core::migrate::{self, Outcome};
use shiranami_db::Adoption;
use sqlx::Connection as _;

use schema::count;
use v1::connect;

/// The env var that supplies a profile.
const PROFILE_VAR: &str = "SHIRANAMI_V1_PROFILE";

/// Tables reported and compared. The same list the synthetic matrix uses.
const COUNTED: [&str; 7] = [
    "tracks",
    "playlists",
    "playlist_tracks",
    "play_history",
    "folders",
    "smart_playlists",
    "youtube_mappings",
];

/// A v1 profile is a directory with a `shiranami.db` in it. Anything else is a
/// misconfiguration and must not silently pass as "nothing to do".
fn is_v1_profile(path: &Path) -> bool {
    path.join("shiranami.db").is_file()
}

/// Every regular file under `root`, as `relative path -> sha256`.
///
/// Hashing rather than comparing mtimes: a copy that read a file and wrote it
/// back identically would pass an mtime check on some filesystems and is exactly
/// the mistake worth catching.
fn digest_tree(root: &Path) -> BTreeMap<String, String> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, String>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                walk(root, &path, out);
            } else if let Ok(bytes) = std::fs::read(&path) {
                let relative = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .into_owned();
                out.insert(relative, sha256_hex(&bytes));
            }
        }
    }

    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest as _, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

async fn counts(path: &Path) -> Vec<(&'static str, i64)> {
    let mut conn = connect(path).await;
    let mut counted = Vec::with_capacity(COUNTED.len());
    for table in COUNTED {
        counted.push((table, count(&mut conn, table).await));
    }
    // Closed rather than dropped: sqlx shuts a dropped connection down on a
    // background worker, and this test compares file bytes immediately
    // afterwards. A WAL checkpoint arriving late would look like the migration
    // having modified a tree it only read.
    conn.close().await.expect("the counting connection closes");
    counted
}

/// The gate itself, run whether or not a profile is configured.
///
/// Without this, `SHIRANAMI_V1_PROFILE=/tmp/typo` would skip silently and the
/// suite would report a pass for a test that never ran — R17's lesson, applied
/// to a skipping test.
#[test]
fn the_gate_refuses_a_directory_that_is_not_a_v1_profile() {
    let dir = tempfile::tempdir().expect("a temp dir");
    assert!(
        !is_v1_profile(dir.path()),
        "an empty directory is not a profile"
    );

    std::fs::create_dir_all(dir.path().join("Cache")).expect("cache");
    assert!(
        !is_v1_profile(dir.path()),
        "a Chromium-only directory is not a profile either"
    );

    std::fs::write(dir.path().join("shiranami.db"), b"x").expect("db");
    assert!(is_v1_profile(dir.path()), "a database is what makes it one");
}

#[tokio::test]
async fn a_real_v1_profile_migrates_with_its_rows_and_covers_intact() {
    let Some(source) = std::env::var_os(PROFILE_VAR).map(PathBuf::from) else {
        eprintln!("{PROFILE_VAR} is unset; skipping the real-profile migration");
        return;
    };
    assert!(
        is_v1_profile(&source),
        "{PROFILE_VAR} does not name a v1 profile: {}",
        source.display()
    );

    // Never migrate the directory the caller named — §3.1 step 2 writes into it.
    let root = tempfile::tempdir().expect("a temp root");
    let legacy = root.path().join("Shiranami");
    let data = root.path().join("com.shironex.shiranami");
    std::fs::create_dir_all(&data).expect("data dir");
    copy_in(&source, &legacy);

    let source_before = digest_tree(&source);

    // Count first, *then* snapshot the tree. Opening a database creates its
    // `-wal` and `-shm` and closing it cleanly removes them, so a snapshot taken
    // before the count would record sidecars that this test's own connection
    // then deleted — and the "nothing in the v1 tree changed" assertion below
    // would be measuring the harness rather than the migration.
    let counts_before = counts(&legacy.join("shiranami.db")).await;
    let legacy_before = digest_tree(&legacy);
    let art_before = digest_tree(&legacy.join("album-art"));
    let peaks_before = digest_tree(&legacy.join("waveform-peaks"));

    let outcome = migrate::run(Some(&legacy), &data).expect("the real profile migrates");
    let Outcome::Migrated(migrated) = outcome else {
        panic!("expected a migration, got {outcome:?}");
    };

    let opened = shiranami_db::open(&data.join("shiranami.db"))
        .await
        .expect("the migrated library opens");
    let adoption = opened.adoption.clone();
    opened.pool.close().await;

    let counts_after = counts(&data.join("shiranami.db")).await;
    let art_after = digest_tree(&data.join("album-art"));
    let peaks_after = digest_tree(&data.join("waveform-peaks"));

    // ── the report ──────────────────────────────────────────────────────────
    eprintln!("\n=== real v1 profile migration ===");
    eprintln!("source          {}", source.display());
    eprintln!("adoption        {adoption:?}");
    eprintln!("copied          {} bytes", migrated.copied_bytes);
    eprintln!("v1 version      {:?}", migrated.v1_version);
    for (table, rows) in &counts_after {
        eprintln!("{table:<18}{rows}");
    }
    eprintln!("album-art       {} files", art_after.len());
    eprintln!("waveform-peaks  {} files", peaks_after.len());
    eprintln!("=================================\n");

    // ── the assertions ──────────────────────────────────────────────────────
    assert!(
        matches!(adoption, Adoption::Adopted { .. }),
        "a real v1 library is adopted, not treated as fresh: {adoption:?}"
    );
    assert_eq!(counts_before, counts_after, "every row survived");
    assert!(
        counts_after
            .iter()
            .any(|(table, rows)| *table == "tracks" && *rows > 0),
        "the profile has to hold tracks for this to mean anything"
    );

    assert_eq!(art_before, art_after, "every cover is byte-identical");
    assert_eq!(
        peaks_before, peaks_after,
        "every peaks file is byte-identical"
    );

    assert_eq!(
        std::fs::read(legacy.join("config.json")).expect("v1 config"),
        std::fs::read(data.join("config.json")).expect("v2 config"),
        "the settings file crossed as bytes (§3.4)"
    );

    // The v1 tree gained exactly one thing — the pre-migration backup — and lost
    // nothing.
    let legacy_after = digest_tree(&legacy);
    for (path, digest) in &legacy_before {
        assert_eq!(
            legacy_after.get(path),
            Some(digest),
            "{path} changed in the v1 tree; D13 says copy, never move"
        );
    }
    let added: Vec<_> = legacy_after
        .keys()
        .filter(|path| !legacy_before.contains_key(*path))
        .collect();
    assert!(
        added.iter().all(|path| path.starts_with("backups/")),
        "the only thing v2 may add to a v1 tree is its backup: {added:?}"
    );

    // And the directory the caller actually named was never opened for writing.
    assert_eq!(
        source_before,
        digest_tree(&source),
        "the source profile must be byte-identical after the run"
    );
}

/// A plain recursive copy, used to build the staging profile.
fn copy_in(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).expect("create the staging directory");
    for entry in std::fs::read_dir(from).expect("read the source").flatten() {
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_symlink() {
            continue;
        }
        let destination = to.join(entry.file_name());
        if metadata.is_dir() {
            copy_in(&path, &destination);
        } else {
            let _ = std::fs::copy(&path, &destination);
        }
    }
}
