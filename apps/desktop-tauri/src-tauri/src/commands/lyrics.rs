//! `lyrics:fetch` — the one lyrics channel.
//!
//! Ported from `apps/desktop/src/main/ipc/lyrics.ts`, which is a one-line
//! delegate to `fetchLyrics`. Everything interesting is one rank down and stays
//! there: the precedence ladder (local synced → embedded synced → local plain →
//! embedded plain → LRCLIB, reordered by `lyrics.preferSyncedFromLrclib`), the
//! sidecar probing order, the LRU, the request coalescing, and the containment
//! gate that keeps this channel from becoming an arbitrary-file reader.
//!
//! # What this layer owns
//!
//! The five-element argument tuple and its bounds. v1 guarded the channel with
//! `z.tuple([z.string().min(1), z.string().min(1), z.string().optional(),
//! z.number().optional(), z.string().min(1).optional()])`, so title and artist
//! are required and non-empty, `filePath` is non-empty **when present**, and
//! `album` may be the empty string. serde gives the arity and the types; the
//! three `min(1)`s are semantic and are re-raised here as `BAD_REQUEST`, the
//! same code v1's zod failure produced.
//!
//! # A failed lookup is an error, and it is not cached
//!
//! That asymmetry is the crate's and is deliberately not re-stated here: a 404
//! from LRCLIB is a cacheable *miss* (`Ok` with an empty result), while a
//! failure to reach it at all is `LyricsError::Lookup` and is not written to the
//! LRU — Phase 9's 429-vs-miss rule. The renderer has to be able to tell "this
//! track has no lyrics" from "we could not find out", because the first is a
//! quiet empty pane and the second is worth retrying on the next track change.
//! Collapsing either into the other here would undo that.
//!
//! # `duration` is seconds, and is a hint rather than a filter
//!
//! LRCLIB matches on it loosely, so a track whose tagged duration disagrees with
//! the directory's still resolves. It is `Option<f64>` because v1's
//! `z.number().optional()` was, and because a radio stream has no duration to
//! send.

use std::path::PathBuf;

use shiranami_core::models::lyrics::LyricsResult;
use shiranami_integrations::lyrics::LyricsRequest;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request, not_booted};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::lyrics::lyrics_fetch,
            ]
        }
    };
}
pub(crate) use commands;

/// `lyrics:fetch` — resolve lyrics for one track.
///
/// The five arguments are v1's, in v1's order. `album`, `duration` and
/// `filePath` are optional: a radio stream has none of the three, and the
/// service falls back to LRCLIB alone when there is no path to probe beside.
#[tauri::command]
#[specta::specta]
pub async fn lyrics_fetch(
    state: State<'_, AppState>,
    title: String,
    artist: String,
    album: Option<String>,
    duration: Option<f64>,
    file_path: Option<String>,
) -> CommandResult<LyricsResult> {
    let request = build_request(title, artist, album, duration, file_path)?;

    let service = state
        .deferred()
        .lyrics
        .as_ref()
        .ok_or_else(|| not_booted("the lyrics service"))?;

    service.fetch(&request).await.wire()
}

/// v1's `lyricsFetchArgs`, applied to the arguments serde has already typed.
///
/// Extracted rather than inlined so it is reachable from a test without a Tauri
/// runtime — the alternative is a second copy of the guard in the test module,
/// which is a guard that can silently stop matching the one that runs.
fn build_request(
    title: String,
    artist: String,
    album: Option<String>,
    duration: Option<f64>,
    file_path: Option<String>,
) -> CommandResult<LyricsRequest> {
    if title.is_empty() {
        return Err(bad_request("the lyrics title must not be empty"));
    }
    if artist.is_empty() {
        return Err(bad_request("the lyrics artist must not be empty"));
    }
    // `z.string().min(1).optional()`: absent is fine, present and blank is not.
    // The distinction matters — an empty path would be probed against the
    // containment gate and denied, turning a missing argument into a confusing
    // denial rather than a plain LRCLIB lookup.
    if file_path.as_ref().is_some_and(String::is_empty) {
        return Err(bad_request("the lyrics file path must not be empty"));
    }

    Ok(LyricsRequest {
        title,
        artist,
        // Deliberately not `filter(|a| !a.is_empty())`: v1's schema was
        // `z.string().optional()` for this one field alone, so an empty album
        // reaches the query builder exactly as it did before.
        album,
        duration_seconds: duration,
        file_path: file_path.map(PathBuf::from),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::codes;

    fn request(title: &str, artist: &str) -> CommandResult<LyricsRequest> {
        build_request(title.to_owned(), artist.to_owned(), None, None, None)
    }

    #[test]
    fn the_two_required_arguments_must_be_non_empty() {
        for (title, artist) in [("", "Artist"), ("Title", "")] {
            let error = request(title, artist).expect_err("v1's min(1) refuses it");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }

        assert!(request("Title", "Artist").is_ok());
    }

    /// v1 spelled `album` as `z.string().optional()` and `filePath` as
    /// `z.string().min(1).optional()`. The difference is not an oversight to
    /// tidy: an empty album is a legitimate "untagged", while an empty path
    /// would be probed for sidecar files and denied by the containment gate.
    #[test]
    fn an_empty_album_is_accepted_and_an_empty_file_path_is_not() {
        let with_blank_album = build_request(
            "Title".to_owned(),
            "Artist".to_owned(),
            Some(String::new()),
            None,
            None,
        )
        .expect("an empty album is v1's `z.string().optional()`");
        assert_eq!(with_blank_album.album.as_deref(), Some(""));

        let error = build_request(
            "Title".to_owned(),
            "Artist".to_owned(),
            None,
            None,
            Some(String::new()),
        )
        .expect_err("an empty path is refused");
        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    /// The three optional arguments are genuinely optional — a radio stream
    /// sends none of them, and the service falls through to LRCLIB alone.
    #[test]
    fn all_three_optional_arguments_may_be_absent() {
        let built = request("Title", "Artist").expect("the minimal call");

        assert_eq!(built.album, None);
        assert_eq!(built.duration_seconds, None);
        assert_eq!(built.file_path, None);
    }

    #[test]
    fn the_optional_arguments_reach_the_request_unchanged() {
        let built = build_request(
            "Title".to_owned(),
            "Artist".to_owned(),
            Some("Album".to_owned()),
            Some(204.5),
            Some("/music/a.flac".to_owned()),
        )
        .expect("the full call");

        assert_eq!(built.title, "Title");
        assert_eq!(built.artist, "Artist");
        assert_eq!(built.album.as_deref(), Some("Album"));
        assert_eq!(built.duration_seconds, Some(204.5));
        assert_eq!(built.file_path, Some(PathBuf::from("/music/a.flac")));
    }

    /// A run with no lyrics service answers with a code rather than an empty
    /// result. An empty [`LyricsResult`] means "this track has no lyrics", and
    /// returning one here would be a lie the renderer caches as a quiet pane.
    #[tokio::test]
    async fn an_absent_service_is_an_error_and_not_an_empty_result() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = crate::state::tests::state_over(dir.path()).await;

        assert!(state.deferred().lyrics.is_none());
        let error = state
            .deferred()
            .lyrics
            .as_ref()
            .ok_or_else(|| not_booted("the lyrics service"))
            .err()
            .expect("no service is installed");
        assert_eq!(error.code, codes::INTERNAL);
    }
}
