//! The extension allowlists and MIME tables, ported from v1's
//! `src/main/shared/media-types.ts`.
//!
//! These are a security boundary before they are a convenience. The audio route
//! checks the extension *before* it checks containment, so a path that is inside
//! an allowed root but is not an audio file — a database, a private key, the
//! settings file — is refused on the way in rather than served with a guessed
//! content type.
//!
//! The v1 Electron app is gone from this repo; a test below pins these tables
//! to a frozen copy of what its final release served. If a later phase needs the same set for the library scan, this
//! module moves down to `shiranami-core` — it is here for now because the serve
//! routes are its only consumer.

use std::path::Path;

/// Audio extensions the server will read off disk. Lowercase, leading dot.
pub const AUDIO_EXTENSIONS: [&str; 10] = [
    ".mp3", ".flac", ".wav", ".ogg", ".aac", ".m4a", ".opus", ".wma", ".weba", ".webm",
];

/// Cover-art extensions the art route will serve. Lowercase, leading dot.
pub const IMAGE_EXTENSIONS: [&str; 6] = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];

/// What a stream with no declared content type is called.
///
/// v1's `DEFAULT_AUDIO_MIME`, and used where v1 used it: the radio proxy, when a
/// station sends no `Content-Type` at all. A stream still has to decode, and
/// most of them are MP3 — guessing is better than handing the media element
/// nothing, which is a hard failure rather than a wrong guess.
pub const DEFAULT_AUDIO_MIME: &str = "audio/mpeg";

/// What an audio *file* with an unrecognised extension is called.
///
/// A different fallback from [`DEFAULT_AUDIO_MIME`], as it was in v1, and the
/// difference is deliberate: a file the allowlist has already vetted but the
/// table does not know is a bug in the tables, so it gets the honest "unknown
/// bytes" type rather than a guess that would make the bug play.
///
/// Unreachable through the routes today, because the allowlist gate runs first
/// and holds exactly the keys the table does. Kept because removing it is how
/// the next extension added to one list and not the other becomes a silent
/// mislabel.
pub const UNKNOWN_AUDIO_MIME: &str = "application/octet-stream";

/// What an image with an unrecognised extension is called. v1's default.
pub const DEFAULT_IMAGE_MIME: &str = "image/jpeg";

/// Audio content type for a lowercase dotted extension.
pub fn audio_mime(extension: &str) -> &'static str {
    match extension {
        ".mp3" => "audio/mpeg",
        ".flac" => "audio/flac",
        ".wav" => "audio/wav",
        ".ogg" => "audio/ogg",
        ".aac" => "audio/aac",
        // Not `audio/m4a`: an iTunes rip is an MP4 container whatever the codec
        // inside it, and WebKit dispatches on the container.
        ".m4a" => "audio/mp4",
        ".opus" => "audio/opus",
        ".wma" => "audio/x-ms-wma",
        ".weba" | ".webm" => "audio/webm",
        _ => UNKNOWN_AUDIO_MIME,
    }
}

/// Image content type for a lowercase dotted extension.
pub fn image_mime(extension: &str) -> &'static str {
    match extension {
        ".jpg" | ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        _ => DEFAULT_IMAGE_MIME,
    }
}

/// A path's extension, lowercased and dotted, or `None` when it has none.
///
/// Matches node's `path.extname().toLowerCase()` on the inputs that reach it,
/// including the dotfile case: `.env` has no extension in either language, so a
/// file named `.mp3` is not an audio file.
pub fn extension_of(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    Some(format!(".{}", extension.to_ascii_lowercase()))
}

/// Whether `path` ends in an extension the audio route may serve.
pub fn is_audio_path(path: &Path) -> bool {
    extension_of(path).is_some_and(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
}

/// Whether `path` ends in an extension the art route may serve.
pub fn is_image_path(path: &Path) -> bool {
    extension_of(path).is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1's `AUDIO_MIME` table, extension for extension. The v1 Electron app
    /// is gone from this repo, so this is a frozen historical value copied from
    /// its final release (v1.0.1), not a mirror of anything live.
    const V1_AUDIO_MIME: [(&str, &str); 10] = [
        (".mp3", "audio/mpeg"),
        (".flac", "audio/flac"),
        (".wav", "audio/wav"),
        (".ogg", "audio/ogg"),
        (".aac", "audio/aac"),
        (".m4a", "audio/mp4"),
        (".opus", "audio/opus"),
        (".wma", "audio/x-ms-wma"),
        (".weba", "audio/webm"),
        (".webm", "audio/webm"),
    ];

    /// v1's `IMAGE_MIME` table, frozen the same way.
    const V1_IMAGE_MIME: [(&str, &str); 6] = [
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".png", "image/png"),
        (".webp", "image/webp"),
        (".gif", "image/gif"),
        (".bmp", "image/bmp"),
    ];

    /// An extension this server refuses that v1 played is a track that stops
    /// playing after the upgrade — with a 403 that looks like a permissions
    /// bug, not a table drift. One it accepts that v1 refused widens what the
    /// server reads off disk.
    #[test]
    fn the_extension_allowlists_match_v1() {
        let v1_audio: Vec<&str> = V1_AUDIO_MIME.iter().map(|(ext, _)| *ext).collect();
        let v1_image: Vec<&str> = V1_IMAGE_MIME.iter().map(|(ext, _)| *ext).collect();

        assert_eq!(AUDIO_EXTENSIONS.to_vec(), v1_audio);
        assert_eq!(IMAGE_EXTENSIONS.to_vec(), v1_image);
    }

    /// Every content type is the literal v1 sent. A cover art `<img>` tolerates
    /// a wrong type; `MediaElementAudioSource` does not.
    #[test]
    fn the_mime_tables_match_v1() {
        for (extension, mime) in V1_AUDIO_MIME {
            assert_eq!(
                audio_mime(extension),
                mime,
                "v1 mapped {extension} to {mime}"
            );
        }
        for (extension, mime) in V1_IMAGE_MIME {
            assert_eq!(
                image_mime(extension),
                mime,
                "v1 mapped {extension} to {mime}"
            );
        }
    }

    #[test]
    fn extensions_are_matched_case_insensitively() {
        assert_eq!(
            extension_of(Path::new("/music/Track.FLAC")).as_deref(),
            Some(".flac")
        );
        assert!(is_audio_path(Path::new("/music/Track.MP3")));
        assert!(is_image_path(Path::new("cover.JPEG")));
    }

    #[test]
    fn a_file_with_no_extension_is_not_media() {
        assert_eq!(extension_of(Path::new("/music/track")), None);
        assert!(!is_audio_path(Path::new("/music/track")));
    }

    /// A dotfile has no extension, in node and here alike. Pinned because the
    /// naive `rsplit('.')` implementation would call `.mp3` an audio file and
    /// serve any dotfile a user could talk the app into naming that way.
    #[test]
    fn a_dotfile_is_not_an_extension() {
        assert_eq!(extension_of(Path::new("/music/.mp3")), None);
        assert!(!is_audio_path(Path::new("/music/.mp3")));
    }

    #[test]
    fn a_non_media_extension_is_refused_by_both_gates() {
        assert!(!is_audio_path(Path::new("/data/library.db")));
        assert!(!is_audio_path(Path::new("/home/user/.ssh/id_rsa.pub")));
        assert!(!is_image_path(Path::new("/data/config.json")));
    }

    #[test]
    fn unknown_extensions_fall_back_the_way_v1_did() {
        assert_eq!(audio_mime(".aiff"), UNKNOWN_AUDIO_MIME);
        assert_eq!(image_mime(".tiff"), DEFAULT_IMAGE_MIME);
    }

    /// v1 declared two different audio fallbacks and used them in two different
    /// places. Collapsing them would give a typeless radio stream
    /// `application/octet-stream`, which WKWebView will not decode.
    #[test]
    fn the_two_audio_fallbacks_are_v1s_and_are_not_the_same() {
        // Both are v1's literals (`DEFAULT_AUDIO_MIME` and `audioMime`'s
        // `?? 'application/octet-stream'`), frozen with the tables above.
        assert_eq!(DEFAULT_AUDIO_MIME, "audio/mpeg");
        assert_eq!(UNKNOWN_AUDIO_MIME, "application/octet-stream");
        assert_ne!(DEFAULT_AUDIO_MIME, UNKNOWN_AUDIO_MIME);
        assert_eq!(audio_mime(".xyz"), UNKNOWN_AUDIO_MIME);
    }
}
