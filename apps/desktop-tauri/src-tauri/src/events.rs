//! The twenty event channels, and the one place their names are written.
//!
//! §2.6 fixes the surface at 155 channels: 135 invoke and **20 events**. v1
//! leaves the split implicit — `ALL_IPC_CHANNELS` is one flat list, and whether
//! an entry is an invoke or an event is discoverable only by finding either a
//! `createIpcListener` in the preload or a `webContents.send` in the main
//! process. This module makes it explicit, which is the single largest
//! readability gain the port gets for free.
//!
//! # One channel-name registry
//!
//! §2.5: *"event names live in one Rust const block, emitted into the bindings;
//! a `cargo test` asserts every scattered `*_EVENT` const equals its registry
//! entry."* Here the two are collapsed rather than cross-checked: the name is
//! the `#[tauri_specta(event_name = …)]` attribute, there is nowhere else for
//! one to be written, and [`ALL_EVENT_NAMES`] is derived from the same
//! constants. A scattered const cannot drift from the registry because there is
//! no second place to scatter one to.
//!
//! Without the attribute, `tauri-specta`'s derive kebab-cases the struct name —
//! `ScanProgress` would become `scan-progress` and the renderer would listen on
//! a channel nothing emits. Every event below therefore names its channel
//! explicitly, and [`the_event_names_are_v1s_channel_strings`] pins all twenty
//! against the literals `packages/contracts/src/ipc/channels.ts` declares.
//!
//! [`the_event_names_are_v1s_channel_strings`]: tests::the_event_names_are_v1s_channel_strings
//!
//! # Payload shape
//!
//! v1's `createIpcListener<T>` strips the Electron event object and hands the
//! callback **one** argument. So every event here is a newtype over exactly one
//! payload — never a tuple, never two fields the shim would have to re-pack —
//! and `#[serde(transparent)]` keeps the emitted JSON identical to what
//! `webContents.send(channel, payload)` produced.
//!
//! # Throttling is not here
//!
//! The high-frequency emitters (scan progress, download progress) keep their
//! 250 ms throttle with an immediate flush on a structural change (R24), and
//! that throttle lives in the crate producing the values, where it already does.
//! An event type is a shape, not a policy.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::wire::Json;
use shiranami_core::SystemNotice;
use shiranami_core::models::{
    DependencyInstallProgress, DownloadProgress, DownloadQueueSnapshot, InstallProgress,
    PlaylistExtractProgress,
};

/// Declare an event: a `#[serde(transparent)]` newtype bound to a v1 channel
/// name, plus a `NAME` re-statement the registry test reads.
///
/// A macro rather than twenty hand-written blocks because the only thing that
/// varies is the name, the payload and the doc — and because the `event_name`
/// attribute and the entry in [`ALL_EVENT_NAMES`] have to agree, which they do
/// here by construction rather than by review.
macro_rules! events {
    ($(
        $(#[doc = $doc:literal])+
        $name:ident = $channel:literal => $payload:ty;
    )*) => {
        $(
            // The channel is deliberately not appended to the docs with
            // `concat!`: `specta`'s derive parses `#[doc]` values as string
            // literals and rejects a macro call there. The attribute below is
            // the channel, and it is two lines away.
            $(#[doc = $doc])+
            #[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
            #[serde(transparent)]
            #[tauri_specta(event_name = $channel)]
            pub struct $name(pub $payload);
        )*

        /// Every event channel, as the renderer names it.
        ///
        /// Derived from the same literals the derives use, so it cannot drift
        /// from them. The count is the other half of the 155-channel parity
        /// checklist.
        pub const ALL_EVENT_NAMES: &[&str] = &[$($channel),*];

        /// Register every event with the `tauri-specta` builder.
        ///
        /// One list, unlike commands: events have no per-namespace ownership
        /// question, because a lane that emits one is *using* a type declared
        /// here rather than declaring a new one. The twenty are frozen by v1.
        pub fn collect() -> ::tauri_specta::Events {
            ::tauri_specta::collect_events![$($name),*]
        }
    };
}

events! {
    /// The main window was maximized or restored.
    WindowMaximizedChange = "window:maximized-change" => bool;

    /// A tick of the debug metrics panel.
    ///
    /// **Shape changes in v2** (§2.2 #31): there is no Chromium `getAppMetrics`
    /// equivalent, so this carries `sysinfo` per-process CPU and RSS only. An
    /// accepted, recorded loss rather than a port gap.
    DebugMetrics = "debug:metrics" => Json;

    /// The OS remote fired — play, pause, next, previous, seek.
    ///
    /// Travels the opposite way from `media:playback-state`: the renderer owns
    /// the audio graph, so an SMTC or `MPRemoteCommandCenter` button has to
    /// reach it as an event. This is what `crate::seam::MediaControls`'
    /// `CommandSink` is wired to.
    MediaCommand = "media:command" => String;

    /// Progress through a library scan. Throttled at 250 ms by the scanner.
    LibraryScanProgress = "library:scan-progress" => Json;

    /// The whole download queue, after any structural change.
    DownloaderQueueState = "downloader:queue-state" => DownloadQueueSnapshot;

    /// Byte progress for the active download. Throttled at 250 ms.
    DownloaderProgress = "downloader:progress" => DownloadProgress;

    /// Percentage progress installing yt-dlp.
    ///
    /// De-duplicated rather than throttled (Phase 11): v1 fired per chunk,
    /// ~19,000 calls to deliver 101 distinct values.
    DownloaderInstallProgress = "downloader:install-progress" => InstallProgress;

    /// Percentage progress installing ffmpeg.
    DownloaderFfmpegInstallProgress = "downloader:ffmpeg-install-progress" => InstallProgress;

    /// Combined progress installing both binaries.
    DownloaderDependencyInstallProgress =
        "downloader:dependency-install-progress" => DependencyInstallProgress;

    /// Progress extracting a YouTube or Spotify playlist.
    ///
    /// Spotify only — YouTube extraction is a single `--flat-playlist` call
    /// with nothing to report partway through.
    PlaylistExtracting = "playlist:extract-progress" => PlaylistExtractProgress;

    /// Progress through a metadata-enrichment batch.
    MetadataEnrichProgress = "metadata:enrich:progress" => Json;

    /// Progress through an EBU R128 loudness analysis.
    LoudnessProgress = "loudness:progress" => Json;

    /// A `shiranami://` deep link arrived.
    ///
    /// The payload is the raw URL. v1 matched its scheme case-sensitively and
    /// unanchored, a quirk Phase 12 preserved deliberately.
    ShareDeepLink = "share:deep-link" => String;

    /// A system notice, deduplicated per `source:code` for five minutes.
    SystemNoticeEmitted = "system:notice" => SystemNotice;

    /// The updater started a check.
    UpdaterCheckingForUpdate = "updater:checking-for-update" => ();

    /// An update is available.
    UpdaterUpdateAvailable = "updater:update-available" => Json;

    /// The app is already current.
    UpdaterUpdateNotAvailable = "updater:update-not-available" => ();

    /// Byte progress downloading an update.
    UpdaterDownloadProgress = "updater:download-progress" => Json;

    /// An update finished downloading and is ready to install.
    UpdaterUpdateDownloaded = "updater:update-downloaded" => Json;

    /// The updater failed. The payload is the message, as v1 sent it.
    UpdaterError = "updater:error" => String;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// §2.6's split of the 155-channel surface. The invoke half is held by
    /// `commands::registry`.
    const V1_EVENT_CHANNEL_COUNT: usize = 20;

    #[test]
    fn every_v1_event_channel_has_a_typed_event() {
        assert_eq!(ALL_EVENT_NAMES.len(), V1_EVENT_CHANNEL_COUNT);
    }

    /// The names are the renderer's contract, so they are pinned against
    /// `packages/contracts/src/ipc/channels.ts` rather than against each other.
    ///
    /// This is what makes the `event_name` attribute non-optional: without it
    /// the derive kebab-cases the *struct* name, so `LibraryScanProgress` would
    /// register as `library-scan-progress` and the renderer's listener on
    /// `library:scan-progress` would simply never fire — a failure with no error
    /// anywhere, which is the worst kind this port can produce.
    #[test]
    fn the_event_names_are_v1s_channel_strings() {
        let manifest = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/contracts/src/ipc/channels.ts"
        ))
        .expect("read v1's channel manifest");

        for name in ALL_EVENT_NAMES {
            assert!(
                manifest.contains(&format!("'{name}'")),
                "`{name}` is not a channel v1 declares — an event name that no \
                 renderer listens on fires into nothing, silently"
            );
        }
    }

    /// The `Event` derive is what actually decides the runtime channel; the
    /// constant list above only decides what this test checks. Reading `NAME`
    /// off two of the derives closes that gap.
    #[test]
    fn the_derive_uses_the_attribute_and_not_the_struct_name() {
        assert_eq!(
            <LibraryScanProgress as Event>::NAME,
            "library:scan-progress"
        );
        assert_eq!(<SystemNoticeEmitted as Event>::NAME, "system:notice");
    }

    #[test]
    fn no_two_events_share_a_channel() {
        let mut seen = ALL_EVENT_NAMES.to_vec();
        seen.sort_unstable();
        let before = seen.len();
        seen.dedup();
        assert_eq!(before, seen.len(), "two events registered the same channel");
    }

    /// v1's `createIpcListener<T>` hands its callback exactly one argument, so
    /// the emitted JSON must be the payload itself and not an object wrapping
    /// it. `#[serde(transparent)]` is what guarantees that, and it is easy to
    /// drop when adding an event by copy-paste.
    #[test]
    fn an_event_serializes_as_its_bare_payload() {
        let json = serde_json::to_value(WindowMaximizedChange(true)).expect("serialize");
        assert_eq!(json, serde_json::json!(true));

        let json =
            serde_json::to_value(ShareDeepLink("shiranami://x".to_owned())).expect("serialize");
        assert_eq!(json, serde_json::json!("shiranami://x"));
    }

    /// The six downloader/playlist payloads, pinned key by key.
    ///
    /// These reach `apps/web`'s downloads UI unchanged (§2.6), through
    /// `createIpcListener<T>` callbacks that destructure them. A renamed key is
    /// therefore not a type error anywhere — it is `undefined` in a progress
    /// bar, which is why the shapes are asserted as JSON rather than trusted to
    /// the `camelCase` attribute.
    #[test]
    fn the_downloader_event_payloads_keep_v1s_keys() {
        use shiranami_core::models::{DownloadProgressStatus, DownloadQueueSnapshot, Tool};

        let json = serde_json::to_value(DownloaderInstallProgress(InstallProgress { percent: 42 }))
            .expect("serialize");
        assert_eq!(json, serde_json::json!({ "percent": 42 }));

        let json = serde_json::to_value(DownloaderFfmpegInstallProgress(InstallProgress {
            percent: 100,
        }))
        .expect("serialize");
        assert_eq!(json, serde_json::json!({ "percent": 100 }));

        let json = serde_json::to_value(DownloaderDependencyInstallProgress(
            DependencyInstallProgress {
                target: Tool::Ffmpeg,
                percent: 50,
                overall_percent: 75,
                label: "Installing ffmpeg (2/2)".to_owned(),
            },
        ))
        .expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "target": "ffmpeg",
                "percent": 50,
                "overallPercent": 75,
                "label": "Installing ffmpeg (2/2)",
            })
        );

        let json = serde_json::to_value(PlaylistExtracting(PlaylistExtractProgress {
            current: 3,
            total: 10,
            track_name: "Cornelius - Drop".to_owned(),
        }))
        .expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({ "current": 3, "total": 10, "trackName": "Cornelius - Drop" })
        );

        // `error` is present and `null` rather than absent. That is
        // `models::mod`'s one recorded widening — `#[serde(skip_serializing_if)]`
        // needs specta's phased export mode, which would split every type into
        // an input and an output form — and the generated `error?: string | null`
        // describes it honestly. v1's consumer tests truthiness, for which
        // `null` and `undefined` behave identically.
        let json = serde_json::to_value(DownloaderProgress(DownloadProgress {
            url: "https://youtu.be/x".to_owned(),
            progress: 12.5,
            status: DownloadProgressStatus::Downloading,
            error: None,
        }))
        .expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "url": "https://youtu.be/x",
                "progress": 12.5,
                "status": "downloading",
                "error": null,
            })
        );

        let json = serde_json::to_value(DownloaderQueueState(DownloadQueueSnapshot {
            items: Vec::new(),
            max_concurrency: 3,
            active_count: 0,
            paused: false,
        }))
        .expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "items": [],
                "maxConcurrency": 3,
                "activeCount": 0,
                "paused": false,
            })
        );
    }

    /// The two install channels are **separate events with the same payload**,
    /// which a copy-paste refactor is apt to collapse into one.
    ///
    /// v1's preload registers `onInstallProgress` and
    /// `onFfmpegInstallProgress` as two listeners, and the settings panel shows
    /// two progress bars. One shared channel would drive both bars from
    /// whichever install ran last.
    #[test]
    fn the_two_install_channels_stay_distinct() {
        assert_eq!(
            <DownloaderInstallProgress as Event>::NAME,
            "downloader:install-progress"
        );
        assert_eq!(
            <DownloaderFfmpegInstallProgress as Event>::NAME,
            "downloader:ffmpeg-install-progress"
        );
        assert_ne!(
            <DownloaderInstallProgress as Event>::NAME,
            <DownloaderFfmpegInstallProgress as Event>::NAME
        );
    }

    /// The extract-progress event's struct name and its channel deliberately
    /// disagree, so the attribute is doing real work here rather than merely
    /// restating a kebab-cased name.
    ///
    /// `PlaylistExtracting` is named around its payload type
    /// (`PlaylistExtractProgress`) to avoid a collision; without the attribute
    /// the derive would register `playlist-extracting`, which nothing listens
    /// on.
    #[test]
    fn the_extract_event_is_addressed_by_its_attribute_not_its_name() {
        assert_eq!(
            <PlaylistExtracting as Event>::NAME,
            "playlist:extract-progress"
        );
    }

    // Whether `collect()` actually registered all twenty is asserted in
    // `crate::bindings` against the emitted TypeScript: `Events` seals its
    // contents, and the emitted file is what the renderer listens through.
}
