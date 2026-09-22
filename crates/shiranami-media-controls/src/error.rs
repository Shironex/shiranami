//! Why an OS surface could not be written to.
//!
//! Every one of these is non-fatal by construction. v1 wrapped tray creation,
//! media-key registration and login-item writes in individual `try`/`catch`
//! blocks that only logged a warning — the app is a music player, and a
//! menu-bar icon that failed to appear is not a reason to refuse to boot. The
//! same contract holds here: the shell logs and carries on, so these variants
//! exist to be *described*, not recovered from.

/// A failure while talking to an OS media surface.
#[derive(Debug, thiserror::Error)]
pub enum MediaControlsError {
    /// The running platform has no backend compiled in.
    ///
    /// Not an error the user caused or can fix: it is what Linux returns,
    /// because `souvlaki`'s MPRIS backend is deliberately not compiled (see the
    /// crate manifest) and shiranami ships no Linux artifact.
    #[error("OS media controls are not available on this platform")]
    Unsupported,

    /// Windows' SMTC was asked for without a window handle.
    ///
    /// `SystemMediaTransportControls` is acquired through
    /// `ISystemMediaTransportControlsInterop::GetForWindow`, so the handle is
    /// not optional there. souvlaki 0.8 answers a missing one with
    /// `.expect(…)`, i.e. a panic; this crate checks first and returns instead,
    /// because a boot-time panic in the composition root takes the whole app
    /// down over a media-key feature.
    #[error("Windows media controls require a window handle")]
    MissingWindowHandle,

    /// The platform backend refused.
    ///
    /// The cause is stringified rather than carried: souvlaki's `Error` is a
    /// different type per platform (a `windows::core::Error` newtype on
    /// Windows, a fieldless struct on macOS), and a `cfg`-shaped public error
    /// enum would make every caller `cfg`-shaped too.
    #[error("OS media controls rejected the update: {0}")]
    Backend(String),
}

/// Result alias for the OS-facing operations in this crate.
pub type Result<T> = std::result::Result<T, MediaControlsError>;

#[cfg(test)]
mod tests {
    use super::*;

    /// The messages reach a log line and, on the settings screen, a notice —
    /// so they read as sentences and never name an internal type.
    #[test]
    fn the_messages_are_readable() {
        assert_eq!(
            MediaControlsError::Unsupported.to_string(),
            "OS media controls are not available on this platform"
        );
        assert_eq!(
            MediaControlsError::MissingWindowHandle.to_string(),
            "Windows media controls require a window handle"
        );
        assert_eq!(
            MediaControlsError::Backend("hresult 0x80070005".to_owned()).to_string(),
            "OS media controls rejected the update: hresult 0x80070005"
        );
    }
}
