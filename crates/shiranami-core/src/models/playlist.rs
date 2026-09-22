//! User playlists, ported from `packages/contracts/src/domain/playlist.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A user playlist row as returned by the `db:playlists:*` read handlers.
///
/// `description` and `cover_art` are optional rather than nullable: the columns
/// are nullable in SQLite, but every consumer treats them as "present or not",
/// and the write payloads below only accept strings. Keeping the read and write
/// shapes aligned is what lets the renderer pass a partial straight into an
/// update.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    /// Primary key (UUID v4).
    pub id: String,
    /// Display name.
    pub name: String,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// Cover-art URL.
    #[specta(optional)]
    pub cover_art: Option<String>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
    /// ISO-8601 last-update timestamp.
    pub updated_at: String,
}

/// Payload for `db:playlists:create`. The id and timestamps are DB-generated.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCreateInput {
    /// Display name.
    pub name: String,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// Cover-art URL.
    #[specta(optional)]
    pub cover_art: Option<String>,
}

/// Payload for `db:playlists:create-with-tracks` (create plus seed membership).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCreateWithTracksInput {
    /// Display name.
    pub name: String,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// Track ids to seed the playlist with, in order.
    pub track_ids: Vec<String>,
}

/// Patch payload for `db:playlists:update`. Omitted fields are left untouched.
///
/// Unlike [`crate::models::TrackUpdateInput`] these fields are never nullable on
/// the wire, so a plain `Option` carries the full contract: `None` means "leave
/// it alone" and there is no "clear it" state to lose.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistUpdateInput {
    /// Display name.
    #[specta(optional)]
    pub name: Option<String>,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// Cover-art URL.
    #[specta(optional)]
    pub cover_art: Option<String>,
}
