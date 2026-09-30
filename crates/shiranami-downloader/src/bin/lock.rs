//! One install at a time, per tool.
//!
//! A manual "Update yt-dlp" click and an automatic update used to be able to run
//! at once. Both staged into the same file and both promoted and rolled back the
//! same final path, so a manual download could replace a file the automatic
//! path had already verified, and two overlapping swaps could end with no
//! binary at all.
//!
//! Every install now holds its tool's [`InstallLock`] while it stages and
//! promotes. An automatic update holds it across its wait for the download
//! queue too, so a click during that wait queues behind it instead of racing
//! it.
//!
//! # What is enforced, and how
//!
//! - **By the compiler:** the staging and promotion methods take an
//!   [`InstallGuard`], so they cannot be called without *some* guard in hand,
//!   and a staged handle borrows the guard it was staged under, so it cannot
//!   be promoted after that guard is dropped.
//! - **At run time:** a guard records the lock it came from, and each manager
//!   refuses a guard that is not from its own lock ([`InstallGuard::check`]).
//!   The compiler cannot see *which* lock a guard came from, because
//!   [`InstallLock`] is an ordinary public type anyone can construct; the
//!   pointer comparison is what turns "some guard" into "this tool's guard".

use tokio::sync::{Mutex, MutexGuard};

use crate::error::{DownloaderError, Result};

/// What a manager answers when handed a guard from some other lock.
pub const FOREIGN_GUARD: &str =
    "This install was started without the tool's own install lock, so it was refused";

/// Serialises one tool's installs.
#[derive(Debug, Default)]
pub struct InstallLock(Mutex<()>);

/// Proof that the holder is the only install in progress under one
/// [`InstallLock`], and which one.
#[derive(Debug)]
pub struct InstallGuard<'a> {
    lock: &'a InstallLock,
    /// Held, never read: dropping the guard is what ends the install.
    _held: MutexGuard<'a, ()>,
}

impl InstallLock {
    /// Wait for any install in progress, then start this one.
    pub async fn lock(&self) -> InstallGuard<'_> {
        InstallGuard {
            lock: self,
            _held: self.0.lock().await,
        }
    }

    /// Start an install only if none is in progress.
    pub fn try_lock(&self) -> Option<InstallGuard<'_>> {
        self.0.try_lock().ok().map(|held| InstallGuard {
            lock: self,
            _held: held,
        })
    }

    /// Whether an install is in progress. For the settings panel, which
    /// disables its update button meanwhile; racy by nature, never a gate.
    pub fn is_held(&self) -> bool {
        self.0.try_lock().is_err()
    }
}

impl InstallGuard<'_> {
    /// Refuse this guard unless it came from `lock`.
    ///
    /// # Errors
    ///
    /// `InstallFailed` carrying [`FOREIGN_GUARD`] for a guard from any other
    /// lock: another tool's, or a freshly constructed one.
    pub fn check(&self, lock: &InstallLock) -> Result<()> {
        if std::ptr::eq(self.lock, lock) {
            return Ok(());
        }
        tracing::error!("an install was attempted with another lock's guard");
        Err(DownloaderError::InstallFailed {
            message: FOREIGN_GUARD.to_owned(),
        })
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

    #[tokio::test]
    async fn a_guard_answers_only_for_its_own_lock() {
        let mine = InstallLock::default();
        let other = InstallLock::default();

        let guard = mine.lock().await;
        assert!(guard.check(&mine).is_ok());

        let error = guard.check(&other).expect_err("another lock's guard");
        assert_eq!(error.to_string(), FOREIGN_GUARD);
    }
}
