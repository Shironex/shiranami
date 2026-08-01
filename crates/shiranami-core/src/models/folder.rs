//! Watched library folders, ported from `packages/contracts/src/domain/folder.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A folder the library watches for audio files.
///
/// Mirrors the drizzle `folders` row exactly — the `db:folders:*` handlers
/// return the raw row, so the nullability here matches the columns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolder {
    /// Primary key (UUID v4).
    pub id: String,
    /// Absolute path to the watched directory.
    pub path: String,
    /// ISO-8601 timestamp of the last completed scan; `None` until the first.
    pub last_scanned: Option<String>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
}
