//! The scan's wire types.
//!
//! Ported from `packages/contracts/src/ipc/preload-api.ts:105-127`. Field names
//! match the TypeScript exactly through `#[serde(rename_all = "camelCase")]`,
//! because `apps/web`'s `scanAndPersistFolder` and `ScanProgressCard` read them
//! directly and neither is being changed (architecture §2.6).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use shiranami_core::models::TrackMetadata;
use specta::Type;

/// One file the scan read, and what it read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    /// Absolute path of the audio file.
    pub file_path: PathBuf,
    /// Its tags, or the filename-derived placeholder v1 substitutes for a file
    /// it cannot parse.
    pub metadata: TrackMetadata,
}

/// One immediate subdirectory of the scanned root, and its tracks.
///
/// "Subfolder" is a flat concept: nested directories are folded into their
/// top-level ancestor's group, so `Artist/Album/Disc 1/x.mp3` lands in the group
/// named `Artist`. Grouping exists for exactly one feature — the "create
/// playlists from these subfolders?" prompt — and not for album detection, which
/// `apps/web` derives from tags instead.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderScan {
    /// The directory's own name, which becomes the proposed playlist name.
    pub name: String,
    /// Its absolute path.
    pub path: PathBuf,
    /// Every audio file beneath it, at any depth the walk reached.
    pub tracks: Vec<ScannedFile>,
}

/// The result of a grouped scan.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GroupedScanResult {
    /// Audio files sitting directly in the scanned root.
    pub root_tracks: Vec<ScannedFile>,
    /// One entry per immediate subdirectory that held at least one audio file.
    ///
    /// A subdirectory with no audio anywhere beneath it is omitted entirely,
    /// rather than appearing with an empty `tracks` list — v1's
    /// `if (files.length > 0)` guard, and what keeps the playlist prompt from
    /// offering to create a playlist for an empty folder.
    pub subfolders: Vec<SubfolderScan>,
}

/// One progress tick, emitted per file as its parse settles.
///
/// v1 emits these unthrottled — one per file, so roughly 50,000 for a large
/// library — and `apps/web` coalesces them to ~10 commits/sec with a forced
/// flush of the final event (`App.tsx:241-283`). The throttle stays in the
/// renderer, so this crate keeps emitting one per file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    /// The file whose parse just settled.
    pub file_path: PathBuf,
    /// How many parses have settled, capped at [`ScanProgress::file_count`].
    ///
    /// A **settle counter, not a position**: with parses running in parallel
    /// this does not correspond to `file_path`'s index in the input, and the
    /// pair is deliberately allowed to disagree because v1's does. The renderer
    /// uses the number for the bar and the path for the caption, never together.
    pub file_index: usize,
    /// How many files the whole scan covers.
    ///
    /// Set once per scan, not once per subfolder — v1 is explicit that the bar
    /// must run end-to-end rather than resetting at each group
    /// (`library.ts:439-441`).
    pub file_count: usize,
    /// Whether the file parsed.
    ///
    /// **Always `true`, deliberately.** In v1 this was `false` only when the
    /// `utilityProcess` rejected outright — a crash or an OOM — because a mere
    /// tag-parse failure returned placeholder metadata with `ok: true`. v2 has
    /// no second process to reject, so the condition is unreachable. The field
    /// stays on the wire because `ScanProgress` is a frozen renderer-visible
    /// shape; repurposing it to mean "a placeholder was substituted" would
    /// change the value `apps/web` receives for every corrupt file, which is a
    /// product decision rather than a port one.
    pub ok: bool,
}

/// Progress sink. Called from several rayon workers at once, so it must be
/// `Sync` as well as `Send`.
///
/// Same shape as `shiranami-metadata`'s enrich sink, for the same reason: the
/// crate must not know whether the other end is a Tauri event, a log line or a
/// test's `Vec`.
pub type ProgressFn<'a> = &'a (dyn Fn(ScanProgress) + Send + Sync);

/// A progress sink that discards everything, for callers that want none.
pub fn ignore_progress(_: ScanProgress) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_serialises_with_the_keys_apps_web_reads() {
        let json = serde_json::to_string(&ScanProgress {
            file_path: PathBuf::from("/music/a.mp3"),
            file_index: 3,
            file_count: 10,
            ok: true,
        })
        .expect("serialises");

        assert!(json.contains("\"filePath\":\"/music/a.mp3\""), "{json}");
        assert!(json.contains("\"fileIndex\":3"), "{json}");
        assert!(json.contains("\"fileCount\":10"), "{json}");
        assert!(json.contains("\"ok\":true"), "{json}");
    }

    #[test]
    fn the_grouped_result_serialises_with_v1s_key_names() {
        let json = serde_json::to_string(&GroupedScanResult::default()).expect("serialises");

        // `rootTracks` and `subfolders` are what `scanAndPersistFolder`
        // destructures; a rename here is a silent empty library.
        assert_eq!(json, r#"{"rootTracks":[],"subfolders":[]}"#);
    }

    #[test]
    fn a_scanned_file_serialises_as_path_plus_metadata() {
        let json = serde_json::to_string(&ScannedFile {
            file_path: PathBuf::from("/music/a.mp3"),
            metadata: TrackMetadata {
                title: "A".to_owned(),
                artist: "B".to_owned(),
                album_artist: None,
                album: "C".to_owned(),
                duration: 1.5,
                genre: String::new(),
                year: None,
                track_number: None,
                disc_number: None,
                album_art: None,
            },
        })
        .expect("serialises");

        assert!(json.contains("\"filePath\""), "{json}");
        assert!(json.contains("\"metadata\""), "{json}");
    }
}
