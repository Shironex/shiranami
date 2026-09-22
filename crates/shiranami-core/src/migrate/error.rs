//! What can go wrong during first-run continuity, and why every variant is
//! fatal.
//!
//! Architecture §3.1 step 7 is the whole design brief for this type:
//!
//! > On any failure: refuse to start with a clear, actionable error. Never
//! > "helpfully" continue into a fresh empty DB — that is the "where did my
//! > library go?" failure mode.
//!
//! So there is no `Warn` variant and no partial success. Every value of this
//! enum aborts the launch, and every message names the path it failed on,
//! because the only person who can act on a full disk or a permissions problem
//! is the user looking at the dialog.
//!
//! The one deliberate exception lives in [`super::backup`], which follows v1's
//! own policy of never blocking a launch on a failed backup — see its module
//! docs for why that is not a hole in this rule.

use std::path::PathBuf;

/// A first-run continuity failure. Every variant refuses the launch.
#[derive(Debug, thiserror::Error)]
pub enum MigrateError {
    /// A file or directory could not be copied out of the v1 tree.
    ///
    /// Carries both ends, because "could not copy" without the destination
    /// leaves a user unable to tell a permissions problem from a full disk.
    #[error("could not copy {} to {}: {source}", from.display(), to.display())]
    Copy {
        /// The v1 path being read.
        from: PathBuf,
        /// The v2 path being written.
        to: PathBuf,
        /// The underlying I/O failure.
        #[source]
        source: std::io::Error,
    },

    /// A directory that has to exist could not be created.
    #[error("could not create {}: {source}", path.display())]
    CreateDirectory {
        /// The directory that could not be created.
        path: PathBuf,
        /// The underlying I/O failure.
        #[source]
        source: std::io::Error,
    },

    /// The staged copy could not be promoted into the data directory.
    ///
    /// Distinct from [`MigrateError::Copy`] because it is the one step that is
    /// not restartable from scratch: a failure here means some entries are live
    /// and some are still staged. The marker is not written, so the next launch
    /// redoes the whole copy — but the user is told, because a promote that
    /// fails halfway is the closest this sequence comes to a half-migrated
    /// state.
    #[error("could not move the copied data into place at {}: {source}", to.display())]
    Promote {
        /// The destination entry.
        to: PathBuf,
        /// The underlying I/O failure.
        #[source]
        source: std::io::Error,
    },

    /// The completion marker could not be written.
    ///
    /// Fatal rather than ignorable: without the marker the next launch would
    /// copy the v1 tree over the one just migrated, and any change the user made
    /// in between would be overwritten by the older v1 copy.
    #[error("could not record that the migration completed at {}: {source}", path.display())]
    Marker {
        /// The marker path.
        path: PathBuf,
        /// The underlying I/O failure.
        #[source]
        source: std::io::Error,
    },
}

/// Result alias for the migration.
pub type Result<T, E = MigrateError> = std::result::Result<T, E>;

#[cfg(test)]
mod tests {
    use super::*;

    fn io() -> std::io::Error {
        std::io::Error::new(std::io::ErrorKind::PermissionDenied, "permission denied")
    }

    /// Every message names a path and the underlying reason. These strings are
    /// what a refusing launch shows the user, so "something went wrong" is not
    /// an acceptable rendering of any of them.
    #[test]
    fn every_failure_names_a_path_and_a_reason() {
        let cases = [
            MigrateError::Copy {
                from: PathBuf::from("/v1/shiranami.db"),
                to: PathBuf::from("/v2/shiranami.db"),
                source: io(),
            },
            MigrateError::CreateDirectory {
                path: PathBuf::from("/v2/album-art"),
                source: io(),
            },
            MigrateError::Promote {
                to: PathBuf::from("/v2/album-art"),
                source: io(),
            },
            MigrateError::Marker {
                path: PathBuf::from("/v2/migrated_from_v1.json"),
                source: io(),
            },
        ];

        for case in cases {
            let rendered = case.to_string();
            assert!(
                rendered.contains("/v2/"),
                "a destination path has to survive into the message: {rendered}"
            );
            assert!(
                rendered.contains("permission denied"),
                "the underlying reason has to survive: {rendered}"
            );
        }
    }

    /// The copy variant carries *both* ends. Asserted separately because it is
    /// the one a user is most likely to be shown, and the source path is what
    /// tells them which of the two directories to look at.
    #[test]
    fn a_failed_copy_names_the_source_as_well_as_the_destination() {
        let rendered = MigrateError::Copy {
            from: PathBuf::from("/v1/album-art/a.jpg"),
            to: PathBuf::from("/v2/album-art/a.jpg"),
            source: io(),
        }
        .to_string();

        assert!(rendered.contains("/v1/album-art/a.jpg"), "{rendered}");
        assert!(rendered.contains("/v2/album-art/a.jpg"), "{rendered}");
    }
}
