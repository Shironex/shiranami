//! The type vocabulary that crosses the IPC boundary, and what it asserts.
//!
//! Architecture §2.5 and decision D7.
//!
//! # This module declares; `shiranami-desktop` emits
//!
//! Phase 2 both declared the vocabulary *and* wrote it to
//! `packages/contracts/src/generated/core.ts`, with a note that Phase 14 would
//! extend the file with the command and event collections. That extension could
//! not happen here: commands live in the composition root, and this crate is
//! rank 0 and cannot depend on it. Emitting a second file beside `core.ts`
//! would have been worse — `specta-typescript` writes a definition for every
//! type a signature references, so the command file would carry a second copy of
//! `Track`, `Playlist` and forty others, two declarations of one contract in one
//! directory.
//!
//! So Phase 14 moved the *writing* to `shiranami_desktop_lib::bindings`, which
//! feeds [`types`] to its `tauri-specta` builder and emits one `bindings.ts`.
//! The file guards — compile-time export path, not-git-ignored, lands-in-the-
//! diffed-directory, all of them lessons from nightcore #422 — moved with it,
//! because they guard the writing.
//!
//! What stays here is what this crate is authoritative about: **which types
//! cross**, and **what their emitted TypeScript has to say**. The tests below
//! render the vocabulary in memory and assert on the text — camelCase keys,
//! yt-dlp's snake_case survivors, the string unions the renderer switches over,
//! and the store-key allowlist that must never carry a main-only key. None of
//! that needs a file, and asserting it here keeps it failing in the crate that
//! owns the type rather than three crates away.

use specta::Types;
use specta_typescript::Typescript;

use crate::error::ErrorPayload;
use crate::models;
use crate::notice::SystemNotice;
use crate::store::RendererStoreKey;

/// Every type that crosses the IPC boundary.
///
/// Registering a type also registers everything it references, so the leaf enums
/// arrive with their parents. `shiranami_desktop_lib::bindings` feeds this whole
/// collection to its `tauri-specta` builder rather than letting command
/// signatures pull types in one at a time — otherwise a model no landed command
/// mentions yet would vanish from the emitted file and reappear when its lane
/// merged, producing diff churn with nothing to do with drift.
pub fn types() -> Types {
    Types::default()
        // Errors and notices — the two shapes every namespace can produce.
        .register::<ErrorPayload>()
        .register::<SystemNotice>()
        // The settings key space the renderer is allowed to name.
        .register::<RendererStoreKey>()
        // Domain models, in the order `models::mod` declares them.
        .register::<models::InstallDependenciesResult>()
        .register::<models::ToolInstallResult>()
        .register::<models::DiscordRpcSettings>()
        .register::<models::DiscordRpcSettingsPatch>()
        .register::<models::DiscordMusicPresenceActivity>()
        .register::<models::DownloadQueueItem>()
        .register::<models::DownloadQueueSnapshot>()
        .register::<models::EnqueueDownloadInput>()
        .register::<models::ToolStatus>()
        .register::<models::DownloadLocation>()
        .register::<models::CachedToolStatus>()
        .register::<models::DependencyCheck>()
        .register::<models::DownloadProgress>()
        .register::<models::DependencyInstallProgress>()
        .register::<models::WatchedFolder>()
        .register::<models::RecordPlayInput>()
        .register::<models::PlayHistoryRecord>()
        .register::<models::ListeningHistoryEntry>()
        .register::<models::ListeningStatsSummary>()
        .register::<models::ListeningStatsTrack>()
        .register::<models::ListeningStatsArtist>()
        .register::<models::ListeningActivityPoint>()
        .register::<models::ListeningHourlyActivityPoint>()
        .register::<models::ListeningAlbumStat>()
        .register::<models::WeeklyInsights>()
        .register::<models::LyricsResult>()
        .register::<models::LyricLine>()
        .register::<models::PlaylistExtractResult>()
        .register::<models::SearchResult>()
        .register::<models::TrackMetadata>()
        .register::<models::Playlist>()
        .register::<models::PlaylistCreateInput>()
        .register::<models::PlaylistCreateWithTracksInput>()
        .register::<models::PlaylistUpdateInput>()
        .register::<models::RadioFavorite>()
        .register::<models::RadioStationInput>()
        .register::<models::DiscoverShelf>()
        .register::<models::LibraryShelf>()
        .register::<models::RecommendationShelves>()
        .register::<models::SimilarTrackResult>()
        .register::<models::SmartMixResult>()
        .register::<models::SmartMixSignals>()
        .register::<models::ScrobbleStatus>()
        .register::<models::ScrobbleConnectResult>()
        .register::<models::LastfmAuthStart>()
        .register::<models::SmartPlaylist>()
        .register::<models::SmartPlaylistDefinition>()
        .register::<models::SmartPlaylistRule>()
        .register::<models::DisplayTrack>()
        .register::<models::NewTrack>()
        .register::<models::Track>()
        .register::<models::TrackCreateInput>()
        .register::<models::TrackUpdateInput>()
        .register::<models::GeocodeResult>()
        .register::<models::WeatherCurrent>()
}

/// Render the type collection to TypeScript.
///
/// # Errors
///
/// Returns the exporter's error when a registered type cannot be represented —
/// a bare `i64` without a `#[specta(type = Number)]` override, say, which
/// `specta` refuses rather than silently truncating in the browser.
pub fn render() -> Result<String, specta_typescript::Error> {
    Typescript::default().export(&types(), specta_serde::Format)
}

/// Absolute path to a repo file, resolved from a compile-time constant.
#[cfg(test)]
pub(crate) fn repo_path(relative: &str) -> std::path::PathBuf {
    std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .join(relative)
        .canonicalize()
        .unwrap_or_else(|e| panic!("resolve {relative} from the repo root: {e}"))
}

/// Read a repo file to a string, for the mirror tests that compare a Rust
/// constant against the TypeScript literal it mirrors.
#[cfg(test)]
pub(crate) fn repo_file(relative: &str) -> String {
    let path = repo_path(relative);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rendering is deterministic, or the guard fails on ordering noise instead
    /// of on drift and gets disabled by whoever is unlucky enough to hit it.
    #[test]
    fn rendering_twice_produces_identical_output() {
        assert_eq!(
            render().expect("first render"),
            render().expect("second render")
        );
    }

    /// The three properties the port promised the renderer, asserted against the
    /// emitted text rather than against the Rust types: camelCase keys, yt-dlp's
    /// snake_case survivors, and `number` where TypeScript says `number`.
    #[test]
    fn the_emitted_types_keep_the_casing_the_renderer_sees_today() {
        let ts = render().expect("render the bindings");

        assert!(ts.contains("albumArtist: string | null"));
        assert!(ts.contains("loudnessLufs: number | null"));
        assert!(ts.contains("filePath: string"));

        // yt-dlp's own keys, forwarded verbatim by v1 and still snake_case.
        assert!(
            ts.contains("webpage_url: string"),
            "SearchResult.webpage_url must keep yt-dlp's snake_case"
        );
        assert!(
            ts.contains("view_count?"),
            "SearchResult.view_count must keep yt-dlp's snake_case"
        );
        // …while the fields v1 added itself stay camelCase.
        assert!(ts.contains("matchConfidence?"));

        // A plain TypeScript `number`, not the `number | null` specta widens an
        // unannotated f64 into.
        assert!(
            ts.contains("enqueuedAt: number,"),
            "an epoch-millisecond field must export as a plain number"
        );
    }

    /// Strip JSDoc blocks and collapse whitespace.
    ///
    /// `specta` interleaves a variant's doc comment with the `|` separators, so
    /// a union reads as one line only once the comments are gone. Matching on
    /// the stripped text keeps these assertions about the *contract* rather than
    /// about how the exporter happens to lay out comments.
    fn without_comments(ts: &str) -> String {
        let mut out = String::with_capacity(ts.len());
        let mut rest = ts;
        while let Some(start) = rest.find("/**") {
            out.push_str(&rest[..start]);
            match rest[start..].find("*/") {
                Some(end) => rest = &rest[start + end + 2..],
                None => {
                    rest = "";
                    break;
                }
            }
        }
        out.push_str(rest);
        out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// The string unions the renderer switches over. A variant renamed here is a
    /// `switch` arm that silently stops matching there.
    #[test]
    fn the_emitted_enums_keep_their_string_literals() {
        let ts = without_comments(&render().expect("render the bindings"));

        assert!(ts.contains(
            r#"DownloadQueueStatus = "queued" | "active" | "converting" | "done" | "error" | "canceled";"#
        ));
        assert!(
            ts.contains(r#"LyricsSource = "lrclib" | "local-lrc" | "local-txt" | "embedded";"#)
        );
        assert!(ts.contains(r#"SystemNoticeSource = "discord" | "album-art";"#));
        assert!(ts.contains(r#"SystemNoticeLevel = "error" | "warn" | "info";"#));
        assert!(ts.contains(r#"SmartPlaylistMatchType = "all" | "any";"#));
        assert!(ts.contains(
            r#"WeatherCondition = "clear" | "partly_cloudy" | "cloudy" | "rain" | "snow" | "thunderstorm" | "fog" | "unknown";"#
        ));
        // The store allowlist reaches the renderer as a union of dot paths, so a
        // main-only key appearing here would be a security regression, visible
        // in the diff.
        assert!(ts.contains(r#""metadata-enrich.skippedIds""#));
        assert!(
            !ts.contains(r#""scrobble.settings""#),
            "a main-only key must never appear in the renderer-facing key union"
        );
    }

    // There is deliberately NO test here asserting "the committed file matches
    // the generator". Such a test would have to run after the export that this
    // very binary performs, so it would compare the freshly written file against
    // the generator that just wrote it and could never fail — a guard-shaped
    // thing incapable of guarding, which is the exact failure this whole module
    // exists to avoid. Staleness is caught where it is detectable: by
    // `git diff --exit-code` in CI, against the version control history that a
    // `cargo test` run cannot rewrite.
}
