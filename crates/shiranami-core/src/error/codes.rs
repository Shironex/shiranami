//! The frozen error-code registries the renderer matches on.
//!
//! Architecture §2.6 keeps these working unchanged across the port: v1 encoded
//! `{ code, message, details }` behind an `__IPC_ERROR__` sentinel stuffed into
//! an `Error` message, because Electron's `invoke` only serialises a rejected
//! error's `name` and `message`. Tauri returns a real `Err` payload, so the
//! sentinel is deleted server-side (decision D9) — but the **codes** are a
//! renderer-visible contract that survives the transport change untouched.
//! `apps/web` matches on these literals and maps them to i18n strings.
//!
//! All four registries live here, in one rank-0 module, even though only
//! `share`, `playlist` and `validation` sit in `packages/contracts` today
//! ([`yt_dlp`]'s three are declared in the desktop main process and re-exported).
//! Splitting a frozen vocabulary across ranks is how one half drifts from the
//! other; the crate that *produces* a code does not have to be the crate that
//! *declares* it. A test in this module reads every TypeScript source and fails
//! if any literal here stops matching.

/// Share and import failures — `packages/contracts/src/ipc/error-codes.ts`.
pub mod share {
    /// The track to share is not in the library.
    pub const TRACK_NOT_FOUND: &str = "share.track_not_found";
    /// No YouTube candidate matched the track.
    pub const NO_YOUTUBE_MATCH: &str = "share.no_youtube_match";
    /// The playlist to share is not in the library.
    pub const PLAYLIST_NOT_FOUND: &str = "share.playlist_not_found";
    /// The playlist has no tracks to share.
    pub const PLAYLIST_EMPTY: &str = "share.playlist_empty";
    /// Not one track in the playlist matched.
    pub const NO_MATCHES_FOR_ANY_TRACK: &str = "share.no_matches_for_any_track";
    /// The share server returned something unparsable.
    pub const INVALID_RESPONSE: &str = "share.invalid_response";
}

/// Playlist-extraction failures — `packages/contracts/src/ipc/error-codes.ts`.
pub mod playlist {
    /// The URL is not a provider we can extract from.
    pub const UNSUPPORTED_URL: &str = "playlist.unsupported_url";
    /// The playlist exists but is private.
    pub const PRIVATE_PLAYLIST: &str = "playlist.private";
    /// The playlist resolved but held no tracks.
    pub const NO_TRACKS: &str = "playlist.no_tracks";
}

/// Argument-validation failures — `packages/contracts/src/ipc/error-codes.ts`.
///
/// v1 raised these from the zod tuples guarding each handler. In v2 `serde`
/// rejects a malformed argument before the command body runs, so these are
/// raised by the guards that outlive schema validation: the renderer store-key
/// allowlist and the path-containment check.
pub mod validation {
    /// The arguments did not match the command's contract.
    pub const BAD_REQUEST: &str = "BAD_REQUEST";
    /// The arguments were well-formed but name something out of bounds.
    pub const FORBIDDEN: &str = "FORBIDDEN";
}

/// Classified yt-dlp failures — `apps/desktop/src/main/utils/ytdlp-spawn.ts`.
///
/// Produced by the failure classifier that lands in `shiranami-downloader` in
/// Phase 11; declared here so the whole frozen vocabulary stays in one place.
/// Unknown failures are **not** given a code — v1 returned the raw tail of
/// yt-dlp's output, which is technical English from the tool itself, and the
/// renderer shows it verbatim.
pub mod yt_dlp {
    /// YouTube demands sign-in cookies for an age-flagged video.
    pub const AGE_RESTRICTED: &str = "yt_dlp_age_restricted";
    /// The video is unavailable or unplayable.
    pub const VIDEO_UNAVAILABLE: &str = "yt_dlp_video_unavailable";
    /// No audio-bearing format was offered.
    pub const NO_AUDIO_FORMAT: &str = "yt_dlp_no_audio_format";
}

/// Fallback code for a failure with no place in the registries above.
///
/// v1 let such failures cross as plain `Error`s with no `code`, so
/// `isIpcError(e)` was false for them. v2 always returns a structured payload,
/// which makes every rejection code-bearing; giving the unclassified ones one
/// stable code keeps the renderer's `switch (err.code)` exhaustive instead of
/// letting `undefined` leak into it.
pub const INTERNAL: &str = "INTERNAL";

#[cfg(test)]
mod tests {
    use crate::bindings::repo_file;

    /// The registries are a mirror of TypeScript literals the renderer matches
    /// on, so a mirror that silently stops matching is the whole risk. Every
    /// constant is re-read from its TypeScript source here; renaming a code on
    /// either side fails this test rather than shipping a code the renderer has
    /// no translation for.
    fn assert_mirrors(source: &str, pairs: &[(&str, &str)]) {
        let ts = repo_file(source);
        for (rust_value, ts_key) in pairs {
            let expected = format!("{ts_key}: '{rust_value}'");
            assert!(
                ts.contains(&expected),
                "{source} no longer declares `{expected}` — the Rust mirror has drifted \
                 from the literal the renderer matches on"
            );
        }
    }

    #[test]
    fn share_codes_mirror_the_typescript_registry() {
        assert_mirrors(
            "packages/contracts/src/ipc/error-codes.ts",
            &[
                (super::share::TRACK_NOT_FOUND, "TRACK_NOT_FOUND"),
                (super::share::NO_YOUTUBE_MATCH, "NO_YOUTUBE_MATCH"),
                (super::share::PLAYLIST_NOT_FOUND, "PLAYLIST_NOT_FOUND"),
                (super::share::PLAYLIST_EMPTY, "PLAYLIST_EMPTY"),
                (
                    super::share::NO_MATCHES_FOR_ANY_TRACK,
                    "NO_MATCHES_FOR_ANY_TRACK",
                ),
                (super::share::INVALID_RESPONSE, "INVALID_RESPONSE"),
            ],
        );
    }

    #[test]
    fn playlist_and_validation_codes_mirror_the_typescript_registry() {
        assert_mirrors(
            "packages/contracts/src/ipc/error-codes.ts",
            &[
                (super::playlist::UNSUPPORTED_URL, "UNSUPPORTED_URL"),
                (super::playlist::PRIVATE_PLAYLIST, "PRIVATE_PLAYLIST"),
                (super::playlist::NO_TRACKS, "NO_TRACKS"),
                (super::validation::BAD_REQUEST, "BAD_REQUEST"),
                (super::validation::FORBIDDEN, "FORBIDDEN"),
            ],
        );
    }

    #[test]
    fn yt_dlp_codes_mirror_the_desktop_classifier() {
        assert_mirrors(
            "apps/desktop/src/main/utils/ytdlp-spawn.ts",
            &[
                (super::yt_dlp::AGE_RESTRICTED, "AGE_RESTRICTED"),
                (super::yt_dlp::VIDEO_UNAVAILABLE, "VIDEO_UNAVAILABLE"),
                (super::yt_dlp::NO_AUDIO_FORMAT, "NO_AUDIO_FORMAT"),
            ],
        );
    }
}
