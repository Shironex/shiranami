//! Disk usage for the watched library folders, grouped by physical volume.
//!
//! Ported from `apps/desktop/src/main/ipc/storage.ts`. Pure filesystem: the
//! folder paths arrive as an argument and no query is issued anywhere in here.
//!
//! [`volume`] decides which disk a folder sits on, [`walk`] measures what is on
//! it, [`usage`] joins the two into the per-volume shape the settings panel
//! draws, and [`model`] is the wire contract.

pub mod model;
pub mod usage;
pub mod volume;
pub mod walk;

pub use model::{DiskUsageResult, VolumeUsage};
pub use usage::compute_disk_usage;
pub use volume::{mount_label_for, volume_key_for};
pub use walk::{WALK_MAX_DEPTH, sum_directory_size};
