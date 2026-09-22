//! The login item, and the rule about when not to write it.
//!
//! Ported from `applyLaunchAtStartup` and `initializeSystemBehavior` in
//! `apps/desktop/src/main/app/system-behavior.ts`. The OS write itself needs the
//! Tauri app handle (`tauri-plugin-autostart`, §2.2 row 7), so it lives behind
//! [`AutostartBackend`] and Phase 16 supplies it. What lives here is the part
//! with a decision in it.
//!
//! # The decision
//!
//! v1 read the persisted value and applied it only when it was *actually a
//! boolean*:
//!
//! ```js
//! const persisted = store.get('system.launchAtStartup');
//! if (typeof persisted === 'boolean') applyLaunchAtStartup(persisted);
//! ```
//!
//! with the comment *"never write OS state on a fresh install"*. The distinction
//! is between "the user turned this off" and "the user has never been asked",
//! and only the first is a mandate to touch the login-item registry. Collapsing
//! them — treating absent as `false` and writing it — would have shiranami
//! deregister a login item it never registered, on every first launch.
//!
//! Subsequent changes go through `store.onDidChange`, which in v2 is
//! [`shiranami_core::store::ChangeBus`]. Those are compared as `value === true`,
//! which [`shiranami_core::store::ChangeEvent::is_enabled`] already encodes.

use serde_json::Value;
use shiranami_core::store::ChangeEvent;

use crate::error::Result;

/// Writes the OS login item.
pub trait AutostartBackend {
    /// Register or deregister the app to start at login.
    fn set_enabled(&self, enabled: bool) -> Result<()>;
}

/// A backend that does nothing, successfully.
///
/// What Linux gets. v1's `applyLaunchAtStartup` returned early on anything that
/// was not `win32` or `darwin`, because `setLoginItemSettings` is not a concept
/// there.
#[derive(Debug, Default)]
pub struct NoopAutostart;

impl AutostartBackend for NoopAutostart {
    fn set_enabled(&self, _enabled: bool) -> Result<()> {
        Ok(())
    }
}

/// Whether this platform has a login item to write.
///
/// v1's `process.platform !== 'win32' && process.platform !== 'darwin'` guard.
/// Note that macOS additionally ignores the write for an unpackaged build,
/// whose bundle path is not registered — a dev-build behaviour v1 documented and
/// did not try to work around.
pub const fn is_supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

/// Why a login-item write did not happen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    /// The setting has never been written, so the user has never expressed a
    /// preference. v1's "never write OS state on a fresh install".
    NeverPersisted,
    /// The platform has no login item.
    Unsupported,
}

/// What a call to [`Autostart`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutostartOutcome {
    /// The login item was written with this value.
    Wrote(bool),
    /// Nothing was written.
    Skipped(SkipReason),
}

/// Applies `system.launchAtStartup` to the OS.
#[derive(Debug, Default)]
pub struct Autostart<B> {
    backend: B,
}

impl<B: AutostartBackend> Autostart<B> {
    /// Wrap a backend.
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    /// Apply the value found in the settings file at boot.
    ///
    /// `stored` is the raw JSON at `system.launchAtStartup`: `None` when the key
    /// is absent, and possibly a non-boolean if the file was hand-edited. Only a
    /// real boolean is acted on.
    pub fn apply_persisted(&self, stored: Option<&Value>) -> Result<AutostartOutcome> {
        let Some(Value::Bool(enabled)) = stored else {
            return Ok(AutostartOutcome::Skipped(SkipReason::NeverPersisted));
        };

        self.write(*enabled)
    }

    /// Apply a change published on the settings bus.
    ///
    /// Unlike the boot path this always writes, because a change event *is* the
    /// user expressing a preference. Deleting the key counts as turning it off,
    /// which is what `value === true` meant in v1.
    pub fn apply_change(&self, event: &ChangeEvent) -> Result<AutostartOutcome> {
        self.write(event.is_enabled())
    }

    fn write(&self, enabled: bool) -> Result<AutostartOutcome> {
        if !is_supported() {
            return Ok(AutostartOutcome::Skipped(SkipReason::Unsupported));
        }

        self.backend.set_enabled(enabled)?;
        tracing::info!(enabled, "launch at startup applied");
        Ok(AutostartOutcome::Wrote(enabled))
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;
    use crate::error::MediaControlsError;

    #[derive(Debug, Default)]
    struct RecordingAutostart {
        writes: RefCell<Vec<bool>>,
        fail: bool,
    }

    impl RecordingAutostart {
        fn writes(&self) -> Vec<bool> {
            self.writes.borrow().clone()
        }
    }

    impl AutostartBackend for RecordingAutostart {
        fn set_enabled(&self, enabled: bool) -> Result<()> {
            if self.fail {
                return Err(MediaControlsError::Backend("login item locked".to_owned()));
            }
            self.writes.borrow_mut().push(enabled);
            Ok(())
        }
    }

    fn autostart() -> Autostart<RecordingAutostart> {
        Autostart::new(RecordingAutostart::default())
    }

    /// Only meaningful where there is a login item; elsewhere every write is
    /// skipped and the assertions below would be about nothing.
    fn expect_written(outcome: AutostartOutcome, enabled: bool) {
        if is_supported() {
            assert_eq!(outcome, AutostartOutcome::Wrote(enabled));
        } else {
            assert_eq!(
                outcome,
                AutostartOutcome::Skipped(SkipReason::Unsupported),
                "v1 returned early on anything that was not win32 or darwin"
            );
        }
    }

    fn expect_writes(backend: &RecordingAutostart, values: &[bool]) {
        if is_supported() {
            assert_eq!(backend.writes(), values);
        } else {
            assert!(backend.writes().is_empty());
        }
    }

    /// The rule, and the reason the setting is not simply defaulted to `false`:
    /// a fresh install must not deregister a login item nobody registered.
    #[test]
    fn an_absent_setting_leaves_the_os_alone() {
        let autostart = autostart();

        assert_eq!(
            autostart.apply_persisted(None).expect("skipping succeeds"),
            AutostartOutcome::Skipped(SkipReason::NeverPersisted)
        );
        assert!(autostart.backend.writes().is_empty());
    }

    #[test]
    fn a_persisted_false_is_written_because_it_is_a_choice() {
        let autostart = autostart();

        expect_written(
            autostart
                .apply_persisted(Some(&Value::Bool(false)))
                .expect("the write succeeds"),
            false,
        );
        expect_writes(&autostart.backend, &[false]);
    }

    #[test]
    fn a_persisted_true_is_written() {
        let autostart = autostart();

        expect_written(
            autostart
                .apply_persisted(Some(&Value::Bool(true)))
                .expect("the write succeeds"),
            true,
        );
        expect_writes(&autostart.backend, &[true]);
    }

    /// v1's guard was `typeof persisted === 'boolean'`, so a settings file
    /// carrying a string or a null is treated as never having been written
    /// rather than as truthy.
    #[test]
    fn a_non_boolean_setting_is_treated_as_never_persisted() {
        let autostart = autostart();

        for value in [
            Value::Null,
            Value::String("true".to_owned()),
            Value::from(1),
            Value::Array(Vec::new()),
        ] {
            assert_eq!(
                autostart
                    .apply_persisted(Some(&value))
                    .expect("skipping succeeds"),
                AutostartOutcome::Skipped(SkipReason::NeverPersisted),
                "{value} is not a preference"
            );
        }

        assert!(autostart.backend.writes().is_empty());
    }

    #[test]
    fn a_change_to_true_registers_the_login_item() {
        let autostart = autostart();
        let event = ChangeEvent {
            path: "system.launchAtStartup".to_owned(),
            previous: None,
            current: Some(Value::Bool(true)),
        };

        expect_written(
            autostart.apply_change(&event).expect("the write succeeds"),
            true,
        );
    }

    /// `value === true` in v1: everything that is not exactly `true` turns it
    /// off, including a deleted key.
    #[test]
    fn every_other_change_deregisters_it() {
        for current in [
            None,
            Some(Value::Bool(false)),
            Some(Value::Null),
            Some(Value::String("true".to_owned())),
        ] {
            let autostart = autostart();
            let event = ChangeEvent {
                path: "system.launchAtStartup".to_owned(),
                previous: Some(Value::Bool(true)),
                current: current.clone(),
            };

            expect_written(
                autostart.apply_change(&event).expect("the write succeeds"),
                false,
            );
        }
    }

    #[test]
    fn a_refused_write_is_reported_rather_than_swallowed() {
        let autostart = Autostart::new(RecordingAutostart {
            fail: true,
            ..RecordingAutostart::default()
        });

        let result = autostart.apply_persisted(Some(&Value::Bool(true)));

        if is_supported() {
            assert!(result.is_err(), "the shell logs it, v1 logged it too");
        } else {
            assert!(result.is_ok());
        }
    }

    #[test]
    fn the_noop_backend_accepts_both_values() {
        assert!(NoopAutostart.set_enabled(true).is_ok());
        assert!(NoopAutostart.set_enabled(false).is_ok());
    }

    #[test]
    fn support_follows_the_platform() {
        assert_eq!(
            is_supported(),
            cfg!(any(target_os = "windows", target_os = "macos"))
        );
    }
}
