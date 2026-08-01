//! `migrated_from_v1.json` — the file that makes first-run continuity run
//! exactly once.
//!
//! Architecture §3.1 step 1 skips the entire sequence when this file exists, and
//! step 6 writes it once the copy has completed. That ordering is the whole
//! safety property: the marker is written **last**, so a run interrupted at any
//! earlier point leaves no marker and the next launch redoes the copy from the
//! v1 tree, which is still intact because nothing ever moved.
//!
//! # It is also the "do not do this again" record for the cases we decline
//!
//! §3.1 assumes the only two states are "not migrated yet" and "migrated". A
//! third exists and is reachable: a v2 install that already has its own
//! database, on a machine where a v1 directory also exists — a user who ran v2
//! first and installed v1 afterwards, or who restored an old profile. Copying
//! then would overwrite live v2 data with an older library, which is the exact
//! loss R6 names, arriving from the other direction. Those runs record
//! [`SkipReason`] here so the check is not repeated on every launch.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::error::{MigrateError, Result};

/// Why a run declined to copy, when it did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SkipReason {
    /// The v2 directory already held a database of its own. Never overwritten;
    /// see the module docs.
    V2DataAlreadyPresent,
}

/// The contents of `migrated_from_v1.json`.
///
/// §3.1 step 6 froze the four fields; `skipped` is additive and absent on the
/// normal path, per §2.3's rule that persisted structs only ever grow optional
/// fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationMarker {
    /// The v1 directory the data came from.
    pub from: String,
    /// How many bytes were copied.
    pub copied_bytes: u64,
    /// When the migration completed, as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
    pub at: String,
    /// The v1 version, when `v2-handoff.json` named one.
    ///
    /// `None` for a user who never received the bridge release: v1 is the only
    /// process that knows its own version, and guessing it from a directory
    /// would put a wrong number in a record whose purpose is diagnosis.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v1_version: Option<String>,
    /// Present only when this run deliberately copied nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped: Option<SkipReason>,
}

impl MigrationMarker {
    /// A marker for a completed copy.
    pub fn completed(from: &Path, copied_bytes: u64, v1_version: Option<String>) -> Self {
        Self {
            from: from.display().to_string(),
            copied_bytes,
            at: crate::time::iso8601::now(),
            v1_version,
            skipped: None,
        }
    }

    /// A marker for a run that found a v1 tree but declined to copy it.
    pub fn skipped(from: &Path, reason: SkipReason) -> Self {
        Self {
            from: from.display().to_string(),
            copied_bytes: 0,
            at: crate::time::iso8601::now(),
            v1_version: None,
            skipped: Some(reason),
        }
    }

    /// Write the marker into `data_dir`.
    ///
    /// Goes through [`crate::store::write_atomic`] for the same reason the
    /// settings file does: a half-written marker is JSON that does not parse,
    /// and the next launch would treat "the marker is unreadable" as "the marker
    /// is there" — [`crate::paths::is_migrated`] only asks whether the file
    /// exists. Atomic means it is either absent or complete.
    ///
    /// # Errors
    ///
    /// [`MigrateError::Marker`] when the file cannot be written.
    pub fn write(&self, data_dir: &Path) -> Result<()> {
        let path = data_dir.join(crate::paths::MIGRATION_MARKER_FILE);
        // `to_vec_pretty` cannot fail for this struct — every field is a string,
        // a number or an enum — but the fallback keeps the launch honest rather
        // than unwrapping in a boot path.
        let bytes = serde_json::to_vec_pretty(self).map_err(|source| MigrateError::Marker {
            path: path.clone(),
            source: std::io::Error::other(source),
        })?;

        crate::store::write_atomic(&path, &bytes)
            .map_err(|source| MigrateError::Marker { path, source })
    }

    /// Read the marker back, if it is there and parses.
    ///
    /// Used for reporting rather than for gating — the gate is
    /// [`crate::paths::is_migrated`], which asks only whether the file exists,
    /// so a marker this version cannot parse still stops a re-copy.
    #[must_use]
    pub fn read(data_dir: &Path) -> Option<Self> {
        let bytes = std::fs::read(data_dir.join(crate::paths::MIGRATION_MARKER_FILE)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_completed_marker_round_trips_through_the_data_directory() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let marker =
            MigrationMarker::completed(Path::new("/v1/Shiranami"), 4_096, Some("1.0.0".to_owned()));
        marker.write(dir.path()).expect("write the marker");

        assert!(
            crate::paths::is_migrated(dir.path()),
            "the marker is what `is_migrated` looks for"
        );
        assert_eq!(MigrationMarker::read(dir.path()), Some(marker));
    }

    /// §3.1 step 6 names the four fields. Asserted on the JSON rather than on
    /// the struct, because the file is the contract — a support request quotes
    /// it, and a rename would be invisible to a round-trip test.
    #[test]
    fn the_json_carries_section_3_1s_four_fields() {
        let dir = tempfile::tempdir().expect("a temp dir");
        MigrationMarker::completed(Path::new("/v1"), 12, Some("0.24.0".to_owned()))
            .write(dir.path())
            .expect("write the marker");

        let raw = std::fs::read_to_string(dir.path().join(crate::paths::MIGRATION_MARKER_FILE))
            .expect("read it back");

        for field in ["\"from\"", "\"copiedBytes\"", "\"at\"", "\"v1Version\""] {
            assert!(raw.contains(field), "{field} missing from {raw}");
        }
    }

    /// A user who never got the bridge release has no version to record, and the
    /// field is absent rather than `null` — the same rule the bridge's own
    /// writer follows for an unset download location.
    #[test]
    fn an_unknown_v1_version_is_absent_rather_than_null() {
        let dir = tempfile::tempdir().expect("a temp dir");
        MigrationMarker::completed(Path::new("/v1"), 0, None)
            .write(dir.path())
            .expect("write the marker");

        let raw = std::fs::read_to_string(dir.path().join(crate::paths::MIGRATION_MARKER_FILE))
            .expect("read it back");

        assert!(!raw.contains("v1Version"), "{raw}");
        assert!(!raw.contains("skipped"), "{raw}");
    }

    #[test]
    fn a_skipped_run_records_why_and_copies_nothing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        MigrationMarker::skipped(Path::new("/v1"), SkipReason::V2DataAlreadyPresent)
            .write(dir.path())
            .expect("write the marker");

        let marker = MigrationMarker::read(dir.path()).expect("parse it back");
        assert_eq!(marker.copied_bytes, 0);
        assert_eq!(marker.skipped, Some(SkipReason::V2DataAlreadyPresent));

        let raw = std::fs::read_to_string(dir.path().join(crate::paths::MIGRATION_MARKER_FILE))
            .expect("read it back");
        assert!(raw.contains("v2-data-already-present"), "{raw}");
    }

    /// An unparsable marker still stops a re-copy, because the gate is the
    /// file's existence. The alternative — parsing to decide — would turn a
    /// corrupt marker into a second full copy over live v2 data.
    #[test]
    fn an_unreadable_marker_still_counts_as_migrated() {
        let dir = tempfile::tempdir().expect("a temp dir");
        std::fs::write(
            dir.path().join(crate::paths::MIGRATION_MARKER_FILE),
            b"{ not json",
        )
        .expect("write a corrupt marker");

        assert_eq!(MigrationMarker::read(dir.path()), None);
        assert!(
            crate::paths::is_migrated(dir.path()),
            "existence gates, not parseability"
        );
    }
}
