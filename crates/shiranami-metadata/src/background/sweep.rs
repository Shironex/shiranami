//! Delete background files the current record does not name.
//!
//! Two callers, one mechanism. Importing a replacement leaves the previous
//! wallpaper unreferenced, and so does a crash between writing a file and
//! persisting the record that names it — the sweep collects both, so there is no
//! separate "delete the predecessor" path that could run in the wrong order and
//! remove a file the live record still points at.
//!
//! # The fail-safe, in the type
//!
//! [`crate::art::prune_orphans`] learned the hard way that "the reference lookup
//! failed" and "nothing is referenced" are indistinguishable at the deletion
//! site, and that one of them means destroying the user's data. That module
//! defends itself by classifying every value. Here the reference set is a single
//! settings entry, so the defence is cheaper and stronger: [`BackgroundReference`]
//! has no variant that a failed read can be squeezed into. A caller that cannot
//! read the record has nothing to pass but [`BackgroundReference::Unreadable`],
//! and that variant deletes nothing.

use std::fs;
use std::path::Path;

use crate::background::record::{ALLOWED_EXTENSIONS, CustomBackground, background_dir};

/// What the caller was able to learn about the current background.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackgroundReference {
    /// The settings entry was read. `None` means no background is set, which is
    /// a real answer: every file in the directory is then an orphan.
    Known(Option<CustomBackground>),
    /// The settings entry could not be read or did not parse. Not evidence that
    /// nothing is referenced, and never treated as such.
    Unreadable,
}

/// What one sweep did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SweepReport {
    /// Directory entries examined.
    pub scanned: usize,
    /// Files deleted.
    pub deleted: usize,
    /// File names the current record refers to.
    pub referenced: usize,
}

/// Delete every background file the record does not own.
///
/// Never returns an error: a sweep is unattended boot-time housekeeping, and a
/// failure to tidy is not a failure worth failing a launch over.
pub fn sweep_orphans(data_dir: &Path, reference: &BackgroundReference) -> SweepReport {
    let BackgroundReference::Known(current) = reference else {
        tracing::warn!("background sweep: the record is unreadable, deleting nothing");
        return SweepReport::default();
    };

    let referenced: Vec<&str> = current
        .as_ref()
        .map(CustomBackground::owned_file_names)
        .unwrap_or_default();

    let directory = background_dir(data_dir);
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(error) => {
            // The normal state of an install that has never imported one.
            tracing::debug!(%error, "background sweep: directory unreadable");
            return SweepReport::default();
        }
    };

    let mut report = SweepReport {
        referenced: referenced.len(),
        ..SweepReport::default()
    };

    for entry in entries.filter_map(std::result::Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        report.scanned += 1;

        // An extension check as well as a name check, for the same reason the
        // art prune has one: an unattended pass that deletes whatever it finds
        // would take a half-written `.tmp` with it, and a `.tmp` surviving
        // forever is the safe direction of that trade.
        if referenced.contains(&name.as_str()) || !is_sweepable(&name) {
            continue;
        }

        match fs::remove_file(entry.path()) {
            Ok(()) => report.deleted += 1,
            Err(error) => tracing::warn!(%error, entry = %name, "background sweep: delete failed"),
        }
    }

    report
}

/// Whether a directory entry is one the sweep may delete.
fn is_sweepable(name: &str) -> bool {
    let Some((_, extension)) = name.rsplit_once('.') else {
        return false;
    };

    ALLOWED_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(file_name: &str, still: Option<&str>) -> CustomBackground {
        CustomBackground {
            file_name: file_name.to_owned(),
            still_file_name: still.map(str::to_owned),
            width: 100,
            height: 100,
            animated: still.is_some(),
        }
    }

    fn seed(names: &[&str]) -> tempfile::TempDir {
        let directory = tempfile::tempdir().expect("a temp dir");
        let backgrounds = background_dir(directory.path());
        fs::create_dir_all(&backgrounds).expect("the background dir is creatable");
        for name in names {
            fs::write(backgrounds.join(name), b"bytes").expect("a fixture entry writes");
        }
        directory
    }

    fn entries(directory: &tempfile::TempDir) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(background_dir(directory.path()))
            .expect("the background dir exists")
            .filter_map(std::result::Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn the_predecessor_is_collected_and_the_current_file_survives() {
        let directory = seed(&["bg-old.png", "bg-new.png"]);

        let report = sweep_orphans(
            directory.path(),
            &BackgroundReference::Known(Some(record("bg-new.png", None))),
        );

        assert_eq!(report.deleted, 1);
        assert_eq!(entries(&directory), vec!["bg-new.png"]);
    }

    #[test]
    fn a_still_is_referenced_by_the_record_that_owns_it() {
        // Sweeping the still would leave an animated background with nothing to
        // freeze to under reduced motion.
        let directory = seed(&["bg-a.gif", "bg-a.still.jpg", "bg-old.png"]);

        sweep_orphans(
            directory.path(),
            &BackgroundReference::Known(Some(record("bg-a.gif", Some("bg-a.still.jpg")))),
        );

        assert_eq!(entries(&directory), vec!["bg-a.gif", "bg-a.still.jpg"]);
    }

    /// The most important behaviour in the module: an unreadable record is not
    /// evidence that nothing is referenced.
    #[test]
    fn an_unreadable_record_deletes_nothing() {
        let directory = seed(&["bg-a.png", "bg-b.gif"]);

        let report = sweep_orphans(directory.path(), &BackgroundReference::Unreadable);

        assert_eq!(report, SweepReport::default());
        assert_eq!(entries(&directory), vec!["bg-a.png", "bg-b.gif"]);
    }

    #[test]
    fn no_background_set_means_every_file_is_an_orphan() {
        // Distinct from Unreadable: this *is* a real answer, so the leftovers of
        // a removed background get collected.
        let directory = seed(&["bg-a.png", "bg-a.still.jpg"]);

        let report = sweep_orphans(directory.path(), &BackgroundReference::Known(None));

        assert_eq!(report.deleted, 2);
        assert!(entries(&directory).is_empty());
    }

    #[test]
    fn a_file_the_sweep_does_not_recognise_survives() {
        let directory = seed(&["bg-a.png", "notes.txt", ".bg-a.png.1234.tmp"]);

        let report = sweep_orphans(directory.path(), &BackgroundReference::Known(None));

        assert_eq!(report.scanned, 3);
        assert_eq!(report.deleted, 1);
        assert_eq!(entries(&directory), vec![".bg-a.png.1234.tmp", "notes.txt"]);
    }

    #[test]
    fn a_missing_directory_is_a_no_op() {
        let directory = tempfile::tempdir().expect("a temp dir");

        assert_eq!(
            sweep_orphans(directory.path(), &BackgroundReference::Known(None)),
            SweepReport::default()
        );
    }
}
