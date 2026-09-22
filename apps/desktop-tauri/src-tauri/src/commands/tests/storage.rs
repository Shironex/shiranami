//! `storage:get-usage` command tests: volume bucketing, unreadable disks,
//! and the wire shape the settings panel reads.

use super::*;
use shiranami_core::error::codes;
use shiranami_library::VolumeUsage;
use std::path::Path;

#[tokio::test]
async fn an_empty_folder_list_answers_with_no_volumes() {
    let usage = storage_get_usage(Vec::new())
        .await
        .expect("an empty library is not an error");

    assert!(usage.volumes.is_empty());
    assert!(
        !usage.computed_at.is_empty(),
        "the panel's `updated x ago` caption needs a timestamp even for nothing"
    );
}

#[tokio::test]
async fn an_empty_path_is_a_bad_request() {
    let error = storage_get_usage(vec![PathBuf::new()])
        .await
        .expect_err("an empty path is refused");

    assert_eq!(error.code, codes::validation::BAD_REQUEST);
}

/// A real folder with real bytes in it, measured end to end through the
/// command. The assertion is deliberately `>= size` rather than `== size`:
/// the walk sums logical file sizes, and a filesystem may report more for
/// the directory entries themselves.
#[tokio::test]
async fn a_real_folder_reports_the_bytes_inside_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    std::fs::write(dir.path().join("track.mp3"), vec![0_u8; 4096]).expect("the fixture writes");

    let usage = storage_get_usage(vec![dir.path().to_path_buf()])
        .await
        .expect("measure");

    let volume = usage
        .volumes
        .first()
        .expect("a temp dir lives on a readable volume");
    assert!(volume.music_bytes >= 4096, "{} bytes", volume.music_bytes);
    assert!(volume.total_bytes > 0);
    assert_eq!(volume.unavailable, None);
    assert!(
        volume.folder_paths.iter().any(|path| path == dir.path()),
        "the entry records which watched folder fed it"
    );
}

/// Two folders on one disk are one bar, not two. The renderer draws per
/// volume, so a library split across `~/Music` and `~/Downloads` must not
/// paint the same disk's capacity twice.
#[tokio::test]
async fn two_folders_on_one_volume_collapse_into_one_entry() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let first = dir.path().join("one");
    let second = dir.path().join("two");
    std::fs::create_dir(&first).expect("the fixture writes");
    std::fs::create_dir(&second).expect("the fixture writes");
    std::fs::write(first.join("a.mp3"), vec![0_u8; 2048]).expect("the fixture writes");
    std::fs::write(second.join("b.mp3"), vec![0_u8; 2048]).expect("the fixture writes");

    let usage = storage_get_usage(vec![first.clone(), second.clone()])
        .await
        .expect("measure");

    assert_eq!(usage.volumes.len(), 1, "one disk, one bar");
    let volume = &usage.volumes[0];
    assert_eq!(volume.folder_paths.len(), 2);
    assert!(volume.music_bytes >= 4096);
}

/// A path that does not exist is an unreadable volume, not a rejection. One
/// removed drive must leave the internal disk beside it measurable.
#[tokio::test]
async fn a_missing_folder_is_reported_as_unavailable_rather_than_raised() {
    let dir = tempfile::tempdir().expect("a temp dir");
    std::fs::write(dir.path().join("track.mp3"), vec![0_u8; 1024]).expect("the fixture writes");
    let gone = Path::new("/no-such-volume-8f2a/Music").to_path_buf();

    let usage = storage_get_usage(vec![dir.path().to_path_buf(), gone.clone()])
        .await
        .expect("an unreadable volume is reported, not raised");

    let unavailable: Vec<&VolumeUsage> = usage
        .volumes
        .iter()
        .filter(|volume| volume.unavailable == Some(true))
        .collect();
    assert_eq!(unavailable.len(), 1);
    assert_eq!(unavailable[0].total_bytes, 0);

    assert!(
        usage
            .volumes
            .iter()
            .any(|volume| volume.unavailable.is_none() && volume.total_bytes > 0),
        "the readable disk is still measured"
    );
    assert_eq!(
        usage.volumes.last().map(|volume| volume.unavailable),
        Some(Some(true)),
        "v1 appends the unreadable volumes after the readable ones"
    );
}

/// The keys the settings panel reads off each entry. A rename here is a bar
/// that draws as zero-width with no error anywhere.
#[test]
fn a_volume_serializes_with_v1s_key_names() {
    let json = serde_json::to_value(VolumeUsage {
        volume_key: "16777233".to_owned(),
        mount_label: "/".to_owned(),
        folder_paths: vec![PathBuf::from("/Users/x/Music")],
        music_bytes: 1,
        total_bytes: 2,
        free_bytes: 3,
        used_bytes: 4,
        unavailable: None,
    })
    .expect("serialize");

    for key in [
        "volumeKey",
        "mountLabel",
        "folderPaths",
        "musicBytes",
        "totalBytes",
        "freeBytes",
        "usedBytes",
    ] {
        assert!(json.get(key).is_some(), "{key} missing from {json}");
    }
    // v1 omitted the key on a readable volume; the crate sends an explicit
    // `null`. Deliberately asserted as "not `true`" rather than "absent":
    // the renderer only ever reads this for truthiness, and `undefined` and
    // `null` are both falsy, so the two spellings are indistinguishable
    // there. What must never happen is a readable volume claiming to be
    // unavailable, which would grey out a disk the user can see.
    assert_ne!(json["unavailable"], serde_json::json!(true));
}

/// The other half of that flag: an unreadable volume says so, and zeroes
/// every byte field rather than reporting a half-measured disk.
#[test]
fn an_unavailable_volume_says_so_and_zeroes_its_bytes() {
    let json = serde_json::to_value(VolumeUsage {
        volume_key: "unavailable:/Volumes/Gone".to_owned(),
        mount_label: "Gone".to_owned(),
        folder_paths: vec![PathBuf::from("/Volumes/Gone/Music")],
        music_bytes: 0,
        total_bytes: 0,
        free_bytes: 0,
        used_bytes: 0,
        unavailable: Some(true),
    })
    .expect("serialize");

    assert_eq!(json["unavailable"], serde_json::json!(true));
    for key in ["musicBytes", "totalBytes", "freeBytes", "usedBytes"] {
        assert_eq!(json[key], 0, "{key} must not be guessed at");
    }
}
