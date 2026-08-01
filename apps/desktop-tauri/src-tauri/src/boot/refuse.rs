//! Refusing to start, visibly (§3.1 step 7).
//!
//! > On any failure: refuse to start with a clear, actionable error. Never
//! > "helpfully" continue into a fresh empty DB — that is the "where did my
//! > library go?" failure mode.
//!
//! The refusal half was already true after Phase 16: a [`BootError`] aborts
//! `setup()`, `build()` fails, and the process dies. What it was not is
//! *visible*. Tauri's failure surfaces as a panic on stderr, and a user who
//! double-clicked an icon has no stderr — the app would simply not appear, which
//! is indistinguishable from a crash and tells them nothing about the library
//! they are worried about.
//!
//! So the error gets a native dialog before the process exits. This is the one
//! moment in the app's life where a blocking modal is right: there is no window
//! to put a toast in, and nothing to go back to.
//!
//! # It says the data is safe, because that is the actionable part
//!
//! D13 means the v1 tree is still intact whatever went wrong here — the
//! migration only ever reads it. A user staring at "could not open your library"
//! is asking one question, and the message answers it before it names the cause.

use tauri_plugin_dialog::{DialogExt as _, MessageDialogKind};

use super::sequence::BootError;

/// The title bar of the refusal.
const TITLE: &str = "Shiranami could not start";

/// Render the failure into the text a user sees.
///
/// Separated from the presentation so the wording is testable without a
/// webview — the message is the deliverable here, not the dialog call.
#[must_use]
pub fn message(error: &BootError) -> String {
    let reassurance = match error {
        // Only the continuity and database paths concern the library, and both
        // leave the v1 tree untouched.
        BootError::Continuity(_) | BootError::Database(_) => {
            "\n\nYour music and your previous version's data have not been changed. \
             Shiranami stopped before touching anything rather than starting with an \
             empty library."
        }
        BootError::NoDataDirectory | BootError::Serve(_) => "",
    };

    format!("{error}{reassurance}")
}

/// Show the refusal and log it.
///
/// Called from `setup()`, which is where an `AppHandle` first exists and where
/// `tauri-plugin-dialog` is already registered. `blocking_show` is safe there
/// for the same reason `block_on` is: `setup` runs on the main thread before the
/// event loop starts, so nothing is waiting on it.
pub fn refuse_to_start(app: &tauri::AppHandle, error: &BootError) {
    let body = message(error);
    tracing::error!(%error, "refusing to start");

    app.dialog()
        .message(&body)
        .title(TITLE)
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The question a user actually has. Asserted on the two variants that can
    /// mean "your library" — a message that named a copy failure and said
    /// nothing about the data would send someone looking for backups they do not
    /// need.
    #[test]
    fn a_library_failure_says_the_data_is_untouched() {
        for error in [
            BootError::Continuity("no space left on device".to_owned()),
            BootError::Database(shiranami_db::DbError::Corrupt {
                report: "malformed database schema".to_owned(),
            }),
        ] {
            let body = message(&error);
            assert!(
                body.contains("have not been changed"),
                "the reassurance is the actionable half: {body}"
            );
            assert!(
                body.contains("empty library"),
                "and it has to name the thing that did *not* happen: {body}"
            );
        }
    }

    /// The underlying cause survives into the text. Without it the dialog is
    /// unactionable and a bug report says only "it did not start".
    #[test]
    fn the_underlying_reason_reaches_the_user() {
        let body = message(&BootError::Continuity(
            "could not copy /v1/shiranami.db to /v2/shiranami.db: no space left on device"
                .to_owned(),
        ));

        assert!(body.contains("no space left on device"), "{body}");
        assert!(body.contains("/v2/shiranami.db"), "{body}");
    }

    /// A failure with nothing to do with the library does not claim otherwise.
    #[test]
    fn a_server_failure_makes_no_promises_about_data() {
        let body = message(&BootError::Serve("address in use".to_owned()));

        assert!(body.contains("address in use"), "{body}");
        assert!(!body.contains("have not been changed"), "{body}");
    }
}
