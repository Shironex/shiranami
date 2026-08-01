//! Track shapes, ported from `packages/contracts/src/domain/track.ts`.
//!
//! [`Track`] mirrors the drizzle `tracks` schema column-for-column, nullability
//! included. Consumers that want non-null display strings collapse `None` at the
//! mapper boundary (see [`DisplayTrack`]) rather than quietly tightening the
//! wire type.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

use crate::models::patch::{Patch, double_option};

/// A library track, exactly as the `tracks` table stores it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Primary key (UUID v4, generated at insert).
    pub id: String,
    /// Absolute path to the audio file on disk.
    pub file_path: String,
    /// Display title. Falls back to the file stem when the tag is missing.
    pub title: String,
    /// Track artist; `None` when untagged.
    pub artist: Option<String>,
    /// Album artist, used to group albums. Never falls back to `artist` here.
    pub album_artist: Option<String>,
    /// Album name; `None` when untagged.
    pub album: Option<String>,
    /// Duration in seconds.
    pub duration: Option<f64>,
    /// Genre tag.
    pub genre: Option<String>,
    /// Release year.
    pub year: Option<i32>,
    /// Position within the album.
    pub track_number: Option<i32>,
    /// Disc number for multi-disc releases.
    pub disc_number: Option<i32>,
    /// Cached cover URL, keyed by the content hash stored at scan time.
    pub album_art: Option<String>,
    /// Integrated loudness (LUFS); `None` = unanalysed.
    pub loudness_lufs: Option<f64>,
    /// Favourite flag; nullable in SQLite, so nullable here.
    pub is_favorite: Option<bool>,
    /// Lifetime play count.
    pub play_count: Option<i32>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-update timestamp.
    pub updated_at: String,
}

/// Insert shape: `id` and the timestamps are DB-generated and may be omitted.
///
/// `file_path` and `title` are the only required columns; everything else
/// defaults to `NULL` per the drizzle schema.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewTrack {
    /// Primary key; generated when absent.
    #[specta(optional)]
    pub id: Option<String>,
    /// Absolute path to the audio file on disk.
    pub file_path: String,
    /// Display title.
    pub title: String,
    /// Track artist.
    #[specta(optional)]
    pub artist: Option<String>,
    /// Album artist.
    #[specta(optional)]
    pub album_artist: Option<String>,
    /// Album name.
    #[specta(optional)]
    pub album: Option<String>,
    /// Duration in seconds.
    #[specta(optional)]
    pub duration: Option<f64>,
    /// Genre tag.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Release year.
    #[specta(optional)]
    pub year: Option<i32>,
    /// Position within the album.
    #[specta(optional)]
    pub track_number: Option<i32>,
    /// Disc number for multi-disc releases.
    #[specta(optional)]
    pub disc_number: Option<i32>,
    /// Cached cover URL.
    #[specta(optional)]
    pub album_art: Option<String>,
    /// Integrated loudness (LUFS).
    #[specta(optional)]
    pub loudness_lufs: Option<f64>,
    /// Favourite flag.
    #[specta(optional)]
    pub is_favorite: Option<bool>,
    /// Lifetime play count.
    #[specta(optional)]
    pub play_count: Option<i32>,
    /// ISO-8601 creation timestamp; generated when absent.
    #[specta(optional)]
    pub created_at: Option<String>,
    /// ISO-8601 last-update timestamp; generated when absent.
    #[specta(optional)]
    pub updated_at: Option<String>,
}

/// Renderer → main write payload for `db:tracks:add` / `db:tracks:add-many`.
///
/// Deliberately narrower than [`NewTrack`]: it mirrors the zod schema the v1
/// handlers validated against, which omits the backend-managed columns (`id`,
/// `loudnessLufs`, `isFavorite`, `playCount`, and the timestamps). A payload
/// carrying those has them stripped rather than honoured.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackCreateInput {
    /// Absolute path to the audio file on disk.
    pub file_path: String,
    /// Display title.
    pub title: String,
    /// Track artist.
    #[specta(optional)]
    pub artist: Option<String>,
    /// Album artist.
    #[specta(optional)]
    pub album_artist: Option<String>,
    /// Album name.
    #[specta(optional)]
    pub album: Option<String>,
    /// Duration in seconds.
    #[specta(optional)]
    pub duration: Option<f64>,
    /// Genre tag.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Release year.
    #[specta(optional)]
    pub year: Option<i32>,
    /// Position within the album.
    #[specta(optional)]
    pub track_number: Option<i32>,
    /// Disc number for multi-disc releases.
    #[specta(optional)]
    pub disc_number: Option<i32>,
    /// Cached cover URL.
    #[specta(optional)]
    pub album_art: Option<String>,
}

/// Patch payload for `db:tracks:update` / `db:tracks:update-many`.
///
/// TypeScript's `Partial<TrackCreateInput>`. Every nullable column is a
/// [`Patch`], because the v1 handler forwarded the payload to drizzle's
/// `.set()`, where an absent key and an explicit `null` mean different things.
/// `file_path` and `title` are `NOT NULL` columns, so they are merely optional.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackUpdateInput {
    /// Absolute path to the audio file on disk.
    #[specta(optional)]
    pub file_path: Option<String>,
    /// Display title.
    #[specta(optional)]
    pub title: Option<String>,
    /// Track artist.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub artist: Patch<String>,
    /// Album artist.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub album_artist: Patch<String>,
    /// Album name.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub album: Patch<String>,
    /// Duration in seconds.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub duration: Patch<f64>,
    /// Genre tag.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub genre: Patch<String>,
    /// Release year.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub year: Patch<i32>,
    /// Position within the album.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub track_number: Patch<i32>,
    /// Disc number for multi-disc releases.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub disc_number: Patch<i32>,
    /// Cached cover URL.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional)]
    pub album_art: Patch<String>,
}

/// Renderer-facing display shape derived from [`Track`].
///
/// The mapper boundary collapses the DB's nullable `artist`/`album`/`duration`
/// into non-null display values (`"Unknown Artist"`, `0`) and narrows the rest
/// to optional. This is intentionally **not** the DB-mirror shape — never
/// tighten [`Track`] to match it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DisplayTrack {
    /// Primary key.
    pub id: String,
    /// Display title.
    pub title: String,
    /// Display artist, already collapsed to [`crate::constants::UNKNOWN_ARTIST`].
    pub artist: String,
    /// Album artist, used to group albums. Falls back to `artist` when absent.
    #[specta(optional)]
    pub album_artist: Option<String>,
    /// Display album, already collapsed to [`crate::constants::UNKNOWN_ALBUM`].
    pub album: String,
    /// Duration in seconds; `0` when unknown.
    #[specta(type = Number)]
    pub duration: f64,
    /// Absolute path to the audio file on disk.
    pub file_path: String,
    /// Cached cover URL.
    #[specta(optional)]
    pub album_art: Option<String>,
    /// Genre tag.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Release year.
    #[specta(optional)]
    pub year: Option<i32>,
    /// Position within the album.
    #[specta(optional)]
    pub track_number: Option<i32>,
    /// Disc number for multi-disc releases.
    #[specta(optional)]
    pub disc_number: Option<i32>,
    /// Seed value from the DB. After an in-session toggle the live value lives
    /// in the renderer's track-overlay store, keyed by track id.
    #[specta(optional)]
    pub is_favorite: Option<bool>,
    /// Lifetime play count.
    #[specta(optional)]
    pub play_count: Option<i32>,
    /// Integrated loudness (LUFS) for loudness levelling.
    #[specta(optional)]
    pub loudness_lufs: Option<f64>,
    /// ISO-8601 creation timestamp.
    #[specta(optional)]
    pub created_at: Option<String>,
    /// ISO-8601 last-update timestamp.
    #[specta(optional)]
    pub updated_at: Option<String>,
}
