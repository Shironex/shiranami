//! Lyrics wire types, ported from `packages/contracts/src/domain/lyrics.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Where resolved lyrics came from.
///
/// The TypeScript union includes `null`; in Rust that is carried by the
/// `Option<LyricsSource>` on [`LyricsResult::source`] rather than by a variant,
/// so the generated union stays exhaustive over the real sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum LyricsSource {
    /// Fetched from the LRCLIB directory.
    Lrclib,
    /// A sidecar `.lrc` file next to the audio file.
    LocalLrc,
    /// A sidecar `.txt` file next to the audio file.
    LocalTxt,
    /// Embedded in the audio file's tags.
    Embedded,
}

/// One timestamped lyric line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    /// Seconds from track start.
    #[specta(type = Number)]
    pub time: f64,
    /// The line itself.
    pub text: String,
}

/// The `lyrics:fetch` result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    /// Timestamped lyrics, or `None` when only plain text (or nothing) exists.
    pub synced: Option<Vec<LyricLine>>,
    /// Plain, untimed lyrics.
    pub plain: Option<String>,
    /// Which source won; `None` when nothing was found.
    pub source: Option<LyricsSource>,
}
