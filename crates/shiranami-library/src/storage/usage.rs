//! `storage:get-usage` — bucket the watched folders by volume and measure each.
//!
//! Ported from `computeDiskUsage` (`apps/desktop/src/main/ipc/storage.ts:130-216`).
//!
//! **No SQL, on purpose.** The folder paths arrive as an argument, sourced by
//! the renderer from `useFoldersQuery`; v1's handler imports no database module
//! at all. Keeping it that way is what lets this crate compose `shiranami-db`
//! not at all — see the crate docs.
//!
//! There is no cache here either. TanStack Query *is* the cache
//! (`useDiskUsageQuery`, `staleTime: 30_000`, key derived from the sorted folder
//! paths), so the walk runs exactly when the renderer asks for it.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::iso8601;
use crate::storage::model::{DiskUsageResult, VolumeUsage};
use crate::storage::volume::{device_of, mount_label_for, volume_key_for};
use crate::storage::walk::sum_directory_size;

/// One physical volume, and the folders that landed on it.
struct Bucket {
    volume_key: String,
    mount_label: String,
    folder_paths: Vec<PathBuf>,
    /// The folder used to probe capacity. Any of them would do — they share a
    /// disk, which is what put them in one bucket.
    sample_path: PathBuf,
}

/// Measure disk usage for every watched folder, grouped by volume.
///
/// Failure is always local. A folder whose root cannot be read and a volume
/// whose capacity cannot be probed each become their own `unavailable` entry
/// with zeroed byte fields, so one removed drive costs the panel one bar rather
/// than all of them.
///
/// Ordering is v1's: volumes in the order their first folder was seen, with
/// capacity-probe failures still in that order, and root-stat failures appended
/// last.
pub fn compute_disk_usage(folder_paths: &[PathBuf]) -> DiskUsageResult {
    let (mut buckets, unreadable_roots) = bucket_by_volume(folder_paths);

    let mut volumes = Vec::with_capacity(buckets.len());
    for bucket in buckets.drain(..) {
        volumes.push(measure(bucket));
    }

    volumes.extend(unreadable_roots);

    DiskUsageResult {
        volumes,
        computed_at: iso8601::now(),
    }
}

/// Group the folders by the volume they sit on.
///
/// Returns the buckets in first-seen order, plus an `unavailable` entry for
/// every folder whose root could not be read at all.
fn bucket_by_volume(folder_paths: &[PathBuf]) -> (Vec<Bucket>, Vec<VolumeUsage>) {
    let mut buckets: Vec<Bucket> = Vec::new();
    let mut unreadable_roots = Vec::new();

    for folder_path in unique_paths(folder_paths) {
        let metadata = match std::fs::metadata(&folder_path) {
            Ok(metadata) => metadata,
            Err(error) => {
                tracing::warn!(
                    %error,
                    path = %folder_path.display(),
                    "folder root could not be read; reporting it unavailable"
                );
                unreadable_roots.push(VolumeUsage::unavailable(
                    format!("unavailable:{}", folder_path.display()),
                    mount_label_for(&folder_path),
                    vec![folder_path],
                ));
                continue;
            }
        };

        let volume_key = volume_key_for(&folder_path, device_of(&metadata));

        match buckets
            .iter_mut()
            .find(|bucket| bucket.volume_key == volume_key)
        {
            Some(bucket) => bucket.folder_paths.push(folder_path),
            None => buckets.push(Bucket {
                volume_key,
                mount_label: mount_label_for(&folder_path),
                sample_path: folder_path.clone(),
                folder_paths: vec![folder_path],
            }),
        }
    }

    (buckets, unreadable_roots)
}

/// Probe one volume's capacity and walk its folders.
fn measure(bucket: Bucket) -> VolumeUsage {
    let stats = match fs4::statvfs(&bucket.sample_path) {
        Ok(stats) => stats,
        Err(error) => {
            tracing::warn!(
                %error,
                path = %bucket.sample_path.display(),
                "volume capacity could not be read; reporting it unavailable"
            );
            return VolumeUsage::unavailable(
                bucket.volume_key,
                bucket.mount_label,
                bucket.folder_paths,
            );
        }
    };

    // v1 computed these from `blocks`, `bfree` and `bavail` times `bsize`;
    // `fs4` has already multiplied by the platform's block size, so the three
    // products are read back directly. The distinction v1 draws between the two
    // free-space figures is the part that matters and is preserved: `free` is
    // user-available (quota- and root-reservation-aware), while `used` is
    // measured against the *total* free count, which includes the reserved
    // blocks a non-privileged user cannot have.
    let total_bytes = stats.total_space();
    let free_bytes = stats.available_space();
    let used_bytes = total_bytes.saturating_sub(stats.free_space());

    let music_bytes = bucket
        .folder_paths
        .iter()
        .map(|folder| sum_directory_size(folder))
        .fold(0_u64, u64::saturating_add);

    VolumeUsage {
        volume_key: bucket.volume_key,
        mount_label: bucket.mount_label,
        folder_paths: bucket.folder_paths,
        music_bytes,
        total_bytes,
        free_bytes,
        used_bytes,
        unavailable: None,
    }
}

/// v1's `Array.from(new Set(folderPaths.filter(p => p.length > 0)))`.
///
/// One deliberate divergence: v1's `Set` holds raw strings, so `/music` and
/// `/music/` survive as two entries and their bytes are counted twice into one
/// bar. Comparing as paths collapses them. That is a fix rather than a port, and
/// it is taken because the behaviour it replaces is a double-count with no
/// defensible reading — `folders.path` is `UNIQUE` on the raw string, so a user
/// really can register both spellings.
fn unique_paths(folder_paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut seen = HashSet::new();

    folder_paths
        .iter()
        .filter(|path| !path.as_os_str().is_empty())
        .filter(|path| seen.insert(Path::to_path_buf(path)))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_paths_are_dropped_and_duplicates_collapse() {
        let paths = vec![
            PathBuf::from("/music"),
            PathBuf::new(),
            PathBuf::from("/music"),
            PathBuf::from("/other"),
        ];

        assert_eq!(
            unique_paths(&paths),
            vec![PathBuf::from("/music"), PathBuf::from("/other")]
        );
    }

    #[test]
    fn a_trailing_separator_is_the_same_folder() {
        let paths = vec![PathBuf::from("/music"), PathBuf::from("/music/")];
        assert_eq!(unique_paths(&paths), vec![PathBuf::from("/music")]);
    }

    #[test]
    fn no_folders_means_no_volumes_but_still_a_timestamp() {
        let result = compute_disk_usage(&[]);

        assert!(result.volumes.is_empty());
        assert_eq!(result.computed_at.len(), 24, "{}", result.computed_at);
    }

    #[test]
    fn an_unreadable_root_becomes_its_own_unavailable_entry() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let missing = dir.path().join("removed-drive");

        let result = compute_disk_usage(std::slice::from_ref(&missing));

        assert_eq!(result.volumes.len(), 1);
        let volume = &result.volumes[0];
        assert_eq!(volume.unavailable, Some(true));
        assert_eq!(volume.folder_paths, vec![missing.clone()]);
        assert!(
            volume.volume_key.starts_with("unavailable:"),
            "{}",
            volume.volume_key
        );
    }

    #[test]
    fn a_readable_folder_reports_its_bytes_and_its_volume_capacity() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(dir.path().join("a.mp3"), vec![b'x'; 512]).expect("the fixture writes");

        let result = compute_disk_usage(&[dir.path().to_path_buf()]);

        assert_eq!(result.volumes.len(), 1);
        let volume = &result.volumes[0];
        assert_eq!(volume.unavailable, None);
        assert_eq!(volume.music_bytes, 512);
        assert!(volume.total_bytes > 0, "a mounted volume has capacity");
        assert!(volume.free_bytes <= volume.total_bytes);
        assert!(volume.used_bytes <= volume.total_bytes);
    }

    #[test]
    fn two_folders_on_one_volume_share_one_bar() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let first = dir.path().join("one");
        let second = dir.path().join("two");
        std::fs::create_dir_all(&first).expect("the fixture writes");
        std::fs::create_dir_all(&second).expect("the fixture writes");
        std::fs::write(first.join("a.mp3"), vec![b'x'; 100]).expect("the fixture writes");
        std::fs::write(second.join("b.mp3"), vec![b'x'; 200]).expect("the fixture writes");

        let result = compute_disk_usage(&[first.clone(), second.clone()]);

        assert_eq!(result.volumes.len(), 1, "one temp dir, one volume");
        assert_eq!(result.volumes[0].folder_paths, vec![first, second]);
        assert_eq!(result.volumes[0].music_bytes, 300);
    }

    #[test]
    fn unreadable_roots_are_appended_after_the_measured_volumes() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let missing = dir.path().join("gone");

        let result = compute_disk_usage(&[missing, dir.path().to_path_buf()]);

        assert_eq!(result.volumes.len(), 2);
        assert_eq!(
            result.volumes[0].unavailable, None,
            "the measured volume comes first even though its folder was second"
        );
        assert_eq!(result.volumes[1].unavailable, Some(true));
    }
}
