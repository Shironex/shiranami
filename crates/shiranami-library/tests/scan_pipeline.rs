//! End-to-end scans over a fixture tree: results, order, metadata and progress.

#[path = "support/tree.rs"]
mod tree;

use std::path::PathBuf;
use std::sync::Mutex;

use shiranami_core::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_library::scan::{ScanProgress, scan_folder, scan_folder_grouped};
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

fn temp() -> TempDir {
    tempfile::tempdir().expect("a temp dir")
}

/// A progress sink that records every tick.
#[derive(Default)]
struct Recorder(Mutex<Vec<ScanProgress>>);

impl Recorder {
    fn record(&self, progress: ScanProgress) {
        self.0.lock().expect("the recorder lock").push(progress);
    }

    fn ticks(&self) -> Vec<ScanProgress> {
        self.0.lock().expect("the recorder lock").clone()
    }
}

#[test]
fn a_flat_scan_returns_one_entry_per_file_with_its_tags() {
    let dir = temp();
    let tagged = tree::wav(dir.path(), "tagged.wav");
    tree::tag(&tagged, "Real Title", "Real Artist", "Real Album");
    tree::wav(dir.path(), "untagged.wav");

    let cancel = CancellationToken::new();
    let recorder = Recorder::default();
    let sink = |progress| recorder.record(progress);

    let scanned = scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(scanned.len(), 2);

    let tagged_entry = scanned
        .iter()
        .find(|entry| entry.file_path == tagged)
        .expect("the tagged file is in the result");
    assert_eq!(tagged_entry.metadata.title, "Real Title");
    assert_eq!(tagged_entry.metadata.artist, "Real Artist");
    assert_eq!(tagged_entry.metadata.album, "Real Album");

    let untagged_entry = scanned
        .iter()
        .find(|entry| entry.file_path.ends_with("untagged.wav"))
        .expect("the untagged file is in the result");
    assert_eq!(
        untagged_entry.metadata.title, "untagged",
        "an untagged file takes its filename as the title"
    );
    assert_eq!(untagged_entry.metadata.artist, UNKNOWN_ARTIST);
    assert_eq!(untagged_entry.metadata.album, UNKNOWN_ALBUM);
}

#[test]
fn an_unparseable_file_becomes_a_placeholder_rather_than_sinking_the_scan() {
    let dir = temp();
    tree::raw(dir.path(), "broken.mp3", b"this is not audio at all");
    tree::wav(dir.path(), "fine.wav");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let scanned = scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(scanned.len(), 2, "the good file survives the bad one");

    let broken = scanned
        .iter()
        .find(|entry| entry.file_path.ends_with("broken.mp3"))
        .expect("the unparseable file still produces a row");
    assert_eq!(broken.metadata.title, "broken");
    assert_eq!(broken.metadata.artist, UNKNOWN_ARTIST);
    assert_eq!(broken.metadata.duration, 0.0);
}

#[test]
fn album_artist_never_falls_back_to_the_track_artist() {
    // Phase 9's rule, re-asserted through the scan because this is the path
    // that populates it for a whole library at once: `None` means untagged, and
    // the grouping layer keys on the album title alone in that case.
    let dir = temp();
    let path = tree::wav(dir.path(), "no-album-artist.wav");
    let mut file = lofty::probe::Probe::open(&path)
        .expect("the fixture opens")
        .read()
        .expect("the fixture parses");
    let mut tag = lofty::tag::Tag::new(lofty::tag::TagType::Id3v2);
    lofty::prelude::Accessor::set_artist(&mut tag, "Only A Track Artist".to_owned());
    lofty::file::TaggedFileExt::insert_tag(&mut file, tag);
    lofty::file::AudioFile::save_to_path(&file, &path, lofty::config::WriteOptions::default())
        .expect("the fixture tags");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;
    let scanned = scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(scanned[0].metadata.artist, "Only A Track Artist");
    assert_eq!(scanned[0].metadata.album_artist, None);
}

#[test]
fn a_grouped_scan_keeps_root_files_and_groups_apart() {
    let dir = temp();
    tree::wav(dir.path(), "loose.wav");
    tree::wav(dir.path(), "Artist A/one.wav");
    tree::wav(dir.path(), "Artist A/Album/two.wav");
    tree::wav(dir.path(), "Artist B/three.wav");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let grouped = scan_folder_grouped(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(grouped.root_tracks.len(), 1);
    assert!(grouped.root_tracks[0].file_path.ends_with("loose.wav"));

    let mut groups: Vec<(String, usize)> = grouped
        .subfolders
        .iter()
        .map(|subfolder| (subfolder.name.clone(), subfolder.tracks.len()))
        .collect();
    groups.sort();

    assert_eq!(
        groups,
        vec![("Artist A".to_owned(), 2), ("Artist B".to_owned(), 1)]
    );
}

#[test]
fn every_grouped_track_is_matched_with_its_own_metadata() {
    // The grouped scan flattens every file into one parse pass and slices the
    // results back by position. If that slicing ever drifts, a track gets
    // another track's tags — silently. This is the test that catches it.
    let dir = temp();

    for (folder, title) in [
        ("Artist A/a1.wav", "A One"),
        ("Artist A/a2.wav", "A Two"),
        ("Artist B/b1.wav", "B One"),
    ] {
        let path = tree::wav(dir.path(), folder);
        tree::tag(&path, title, "Artist", "Album");
    }
    let loose = tree::wav(dir.path(), "loose.wav");
    tree::tag(&loose, "Loose One", "Artist", "Album");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;
    let grouped = scan_folder_grouped(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(grouped.root_tracks[0].metadata.title, "Loose One");

    for subfolder in &grouped.subfolders {
        for track in &subfolder.tracks {
            let stem = track
                .file_path
                .file_stem()
                .expect("a stem")
                .to_string_lossy()
                .into_owned();
            let expected = match stem.as_str() {
                "a1" => "A One",
                "a2" => "A Two",
                "b1" => "B One",
                other => panic!("unexpected file {other}"),
            };
            assert_eq!(
                track.metadata.title,
                expected,
                "{} carries the wrong tags",
                track.file_path.display()
            );
        }
    }
}

#[test]
fn progress_reports_one_tick_per_file_ending_exactly_at_the_total() {
    let dir = temp();
    for index in 0..12 {
        tree::wav(dir.path(), &format!("track{index}.wav"));
    }

    let cancel = CancellationToken::new();
    let recorder = Recorder::default();
    let sink = |progress| recorder.record(progress);

    scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    let ticks = recorder.ticks();
    assert_eq!(ticks.len(), 12, "one tick per file, unthrottled");

    assert!(
        ticks.iter().all(|tick| tick.file_count == 12),
        "the total is set once for the whole scan"
    );
    assert!(ticks.iter().all(|tick| tick.ok), "every tick reports ok");

    let mut indices: Vec<usize> = ticks.iter().map(|tick| tick.file_index).collect();
    indices.sort_unstable();
    assert_eq!(
        indices,
        (1..=12).collect::<Vec<_>>(),
        "the settle counter covers 1..=total exactly once each"
    );

    assert!(
        ticks.iter().any(|tick| tick.file_index == tick.file_count),
        "the renderer's final-event flush depends on fileIndex reaching fileCount"
    );
}

#[test]
fn grouped_progress_runs_end_to_end_rather_than_restarting_per_group() {
    // v1 calls `setBatchSize(totalFiles)` once, deliberately, so the bar does
    // not reset at every subfolder. A per-group total would show up here as a
    // `file_count` that changes mid-scan.
    let dir = temp();
    tree::wav(dir.path(), "loose.wav");
    for index in 0..3 {
        tree::wav(dir.path(), &format!("A/a{index}.wav"));
    }
    for index in 0..2 {
        tree::wav(dir.path(), &format!("B/b{index}.wav"));
    }

    let cancel = CancellationToken::new();
    let recorder = Recorder::default();
    let sink = |progress| recorder.record(progress);

    scan_folder_grouped(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    let ticks = recorder.ticks();
    assert_eq!(ticks.len(), 6);
    assert!(
        ticks.iter().all(|tick| tick.file_count == 6),
        "every tick carries the whole-scan total: {:?}",
        ticks.iter().map(|tick| tick.file_count).collect::<Vec<_>>()
    );

    let mut indices: Vec<usize> = ticks.iter().map(|tick| tick.file_index).collect();
    indices.sort_unstable();
    assert_eq!(indices, (1..=6).collect::<Vec<_>>());
}

#[test]
fn an_empty_folder_scans_to_an_empty_result_with_no_progress() {
    let dir = temp();

    let cancel = CancellationToken::new();
    let recorder = Recorder::default();
    let sink = |progress| recorder.record(progress);

    let flat = scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");
    let grouped = scan_folder_grouped(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert!(flat.is_empty());
    assert!(grouped.root_tracks.is_empty());
    assert!(grouped.subfolders.is_empty());
    assert!(recorder.ticks().is_empty());
}

#[test]
fn a_missing_folder_scans_empty_rather_than_failing() {
    let dir = temp();
    let missing = dir.path().join("unmounted");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    assert!(
        scan_folder(&missing, None, &cancel, &sink)
            .expect("an unreadable root is not an error")
            .is_empty()
    );
}

#[test]
fn an_embedded_cover_reaches_the_art_cache() {
    let dir = temp();
    let data_dir = temp();
    let path = tree::wav(dir.path(), "with-cover.wav");
    tree::tag_with_cover(&path, "Covered");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let scanned =
        scan_folder(dir.path(), Some(data_dir.path()), &cancel, &sink).expect("the scan succeeds");

    let url = scanned[0]
        .metadata
        .album_art
        .as_deref()
        .expect("the cover is extracted when a data directory is supplied");
    assert!(url.starts_with("shiranami-art://art/"), "{url}");

    let cached: Vec<PathBuf> = std::fs::read_dir(data_dir.path().join("album-art"))
        .expect("the art directory is created")
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .collect();
    assert_eq!(cached.len(), 1, "one cover, one cache entry");
}

#[test]
fn no_data_directory_means_no_cover_extraction() {
    let dir = temp();
    let path = tree::wav(dir.path(), "with-cover.wav");
    tree::tag_with_cover(&path, "Covered");

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let scanned = scan_folder(dir.path(), None, &cancel, &sink).expect("the scan succeeds");

    assert_eq!(scanned[0].metadata.title, "Covered");
    assert_eq!(scanned[0].metadata.album_art, None);
}

#[test]
fn concurrent_workers_share_one_art_cache_without_colliding() {
    // Every file carries the same cover, so all sixteen workers race to write
    // the same content-addressed filename. `O_EXCL` plus "EEXIST is the dedupe
    // happy path" is what makes that safe; this asserts it under real
    // parallelism rather than trusting the comment.
    let dir = temp();
    let data_dir = temp();
    for index in 0..40 {
        let path = tree::wav(dir.path(), &format!("track{index}.wav"));
        tree::tag_with_cover(&path, &format!("Track {index}"));
    }

    let cancel = CancellationToken::new();
    let sink = shiranami_library::scan::ignore_progress;

    let scanned =
        scan_folder(dir.path(), Some(data_dir.path()), &cancel, &sink).expect("the scan succeeds");

    assert_eq!(scanned.len(), 40);
    assert!(
        scanned
            .iter()
            .all(|entry| entry.metadata.album_art.is_some()),
        "every track resolves a cover, whether it wrote the file or found it"
    );

    let cached = std::fs::read_dir(data_dir.path().join("album-art"))
        .expect("the art directory is created")
        .count();
    assert_eq!(cached, 1, "identical covers deduplicate to one cache entry");
}
