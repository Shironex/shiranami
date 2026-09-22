//! The disk-usage wire types.
//!
//! Ported from `packages/contracts/src/ipc/storage.ts`. Folders are the *input*
//! granularity and volumes the *output* granularity: the renderer draws one
//! segmented bar per physical disk, and `folder_paths` records which watched
//! folders fed each bar.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// One physical volume that hosts one or more watched library folders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VolumeUsage {
    /// Stable bucket key: the POSIX device id as a string, or the uppercased
    /// Windows drive/UNC root.
    pub volume_key: String,
    /// Friendly label for the bar header.
    pub mount_label: String,
    /// The watched folders that live on this volume.
    pub folder_paths: Vec<PathBuf>,
    /// Sum of logical file sizes inside those folders.
    #[specta(type = Number)]
    pub music_bytes: u64,
    /// Whole-disk capacity.
    #[specta(type = Number)]
    pub total_bytes: u64,
    /// User-available free space — quota- and root-reservation-aware.
    #[specta(type = Number)]
    pub free_bytes: u64,
    /// Whole-disk used across all applications.
    ///
    /// Captions only. The renderer sizes its bar segments with a clamped
    /// formula, never a raw `used_bytes - music_bytes` subtraction, because the
    /// two are measured against different baselines.
    #[specta(type = Number)]
    pub used_bytes: u64,
    /// Set when the volume could not be probed — an unmounted or removed drive.
    #[specta(optional)]
    pub unavailable: Option<bool>,
}

impl VolumeUsage {
    /// The all-zero entry v1 emits for a volume it could not read.
    ///
    /// A failure here is reported, never raised: one removed USB drive must not
    /// blank the usage panel for the internal disk beside it.
    pub(crate) fn unavailable(
        volume_key: String,
        mount_label: String,
        folder_paths: Vec<PathBuf>,
    ) -> Self {
        Self {
            volume_key,
            mount_label,
            folder_paths,
            music_bytes: 0,
            total_bytes: 0,
            free_bytes: 0,
            used_bytes: 0,
            unavailable: Some(true),
        }
    }
}

/// Disk usage across every watched folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageResult {
    /// One entry per distinct volume. Readable volumes first, then every
    /// unreadable one — v1's `[...volumes, ...unavailableVolumes]`.
    pub volumes: Vec<VolumeUsage>,
    /// When the walk ran, as `new Date().toISOString()`, for the panel's
    /// "updated x ago" caption.
    pub computed_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_volume_serialises_with_the_keys_the_panel_reads() {
        let json = serde_json::to_string(&VolumeUsage {
            volume_key: "16777233".to_owned(),
            mount_label: "/".to_owned(),
            folder_paths: vec![PathBuf::from("/Users/x/Music")],
            music_bytes: 1,
            total_bytes: 2,
            free_bytes: 3,
            used_bytes: 4,
            unavailable: None,
        })
        .expect("serialises");

        for key in [
            "volumeKey",
            "mountLabel",
            "folderPaths",
            "musicBytes",
            "totalBytes",
            "freeBytes",
            "usedBytes",
        ] {
            assert!(
                json.contains(&format!("\"{key}\"")),
                "{key} missing: {json}"
            );
        }
    }

    #[test]
    fn an_unavailable_volume_zeroes_every_byte_field() {
        let volume = VolumeUsage::unavailable(
            "unavailable:/Volumes/Gone".to_owned(),
            "Gone".to_owned(),
            vec![PathBuf::from("/Volumes/Gone/Music")],
        );

        assert_eq!(volume.unavailable, Some(true));
        assert_eq!(
            (
                volume.music_bytes,
                volume.total_bytes,
                volume.free_bytes,
                volume.used_bytes
            ),
            (0, 0, 0, 0)
        );
    }
}
