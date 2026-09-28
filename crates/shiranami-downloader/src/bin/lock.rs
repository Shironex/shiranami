//! One install at a time, per tool.
//!
//! A manual "Update yt-dlp" click and an automatic update used to be able to run
//! at once. Both staged into the same file and both promoted and rolled back the
//! same final path, so a manual download could replace a file the automatic
//! path had already verified, and two overlapping swaps could end with no
//! binary at all.
//!
//! Every install now holds its tool's [`InstallLock`] from the first byte
//! downloaded to the last rename. An automatic update holds it across its wait
//! for the download queue too, so a click during that wait queues behind it
//! instead of racing it. The staging and promotion methods take an
//! [`InstallGuard`] by reference, which makes calling them without the lock a
//! type error rather than a review comment.

use tokio::sync::{Mutex, MutexGuard};

/// Serialises one tool's installs.
#[derive(Debug, Default)]
pub struct InstallLock(Mutex<()>);

/// Proof that the holder is the only install of this tool in progress.
#[derive(Debug)]
pub struct InstallGuard<'a> {
    /// Held, never read: dropping the guard is what ends the install.
    _held: MutexGuard<'a, ()>,
}

impl InstallLock {
    /// Wait for any install in progress, then start this one.
    pub async fn lock(&self) -> InstallGuard<'_> {
        InstallGuard {
            _held: self.0.lock().await,
        }
    }

    /// Start an install only if none is in progress.
    pub fn try_lock(&self) -> Option<InstallGuard<'_>> {
        self.0
            .try_lock()
            .ok()
            .map(|held| InstallGuard { _held: held })
    }

    /// Whether an install is in progress. For the settings panel, which
    /// disables its update button meanwhile; racy by nature, never a gate.
    pub fn is_held(&self) -> bool {
        self.0.try_lock().is_err()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_second_install_waits_for_the_first() {
        let lock = InstallLock::default();
        assert!(!lock.is_held());

        let first = lock.lock().await;
        assert!(lock.is_held());
        assert!(lock.try_lock().is_none());

        drop(first);
        assert!(!lock.is_held());
        assert!(lock.try_lock().is_some());
    }
}
