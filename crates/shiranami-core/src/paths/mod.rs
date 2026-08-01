//! Path handling: containment guards, the allowed-roots cache, and
//! application-directory resolution.

pub mod authority;
pub mod dirs;
pub mod folders_cache;
pub mod safety;

pub use authority::{PathAuthority, PathAuthorityError, PathAuthorityResult};
pub use dirs::{
    MIGRATION_MARKER_FILE, SETTINGS_FILE, V1_DIRECTORY_NAME, V2_DIRECTORY_NAME, app_data_root,
    data_dir, is_migrated, legacy_data_dir,
};
pub use folders_cache::FoldersCache;
pub use safety::{is_path_within, is_path_within_any, normalize_for_compare};
