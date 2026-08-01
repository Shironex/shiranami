//! Reaching the two deferred pieces, and what it means when they are absent.
//!
//! Both the queue driver and the service bundle live in
//! [`crate::state::Deferred`] as an `Option`, because §2.8's boot ordering is
//! Phase 16's and this crate deliberately has no constructor that builds them.
//! Until that lands — and, permanently, under `SHIRANAMI_E2E=1`, which runs with
//! no external binaries at all — a command that needs one has to answer
//! something.
//!
//! It answers a **rejection carrying `INTERNAL`**, not a degraded success. The
//! renderer's downloads view distinguishes "the queue is empty" from "the queue
//! is unavailable" only by whether the call rejected; a `getQueue` that
//! answered an empty snapshot would render an empty list over a queue that may
//! well have items, which is the failure mode R13 names — a feature going dark
//! with nothing to see.

use shiranami_core::error::{ErrorPayload, codes};
use shiranami_downloader::queue::DownloadQueue;

use crate::downloads::DownloaderServices;
use crate::error::CommandResult;
use crate::state::AppState;

/// The message a command answers with before Phase 16 boots.
///
/// One constant so the six-word difference between two spellings of it cannot
/// become something a renderer switches on by accident.
const NOT_READY: &str = "the downloader is not available in this session";

/// The binary managers, search, extraction and the single-URL runner.
///
/// # Errors
///
/// `INTERNAL` when the services have not been built. See the module docs for
/// why this is not a degraded success.
pub(crate) fn services(state: &AppState) -> CommandResult<&DownloaderServices> {
    state
        .deferred()
        .downloader
        .as_deref()
        .ok_or_else(unavailable)
}

/// The download queue's async driver.
///
/// Returns the `Arc` rather than a reference because every mutating method on
/// `DownloadQueue` takes `self: &Arc<Self>` — the driver spawns tasks that
/// outlive the call, so it has to be able to keep itself alive.
///
/// # Errors
///
/// `INTERNAL` when the queue has not been built.
pub(crate) fn queue(state: &AppState) -> CommandResult<&std::sync::Arc<DownloadQueue>> {
    state.deferred().downloads.as_ref().ok_or_else(unavailable)
}

fn unavailable() -> ErrorPayload {
    ErrorPayload {
        code: codes::INTERNAL.to_owned(),
        message: NOT_READY.to_owned(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Both accessors reject rather than answering an empty value, and both
    /// reject the same way — a renderer that special-cased one and not the
    /// other would show an empty queue on one screen and an error on another
    /// for the identical underlying condition.
    #[tokio::test]
    async fn both_accessors_reject_with_internal_before_boot() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = crate::state::tests::state_over(dir.path()).await;

        // `expect_err` would need `Debug` on the success type, and neither a
        // service bundle nor a queue driver has one — both hold `Arc<dyn Trait>`
        // fields whose implementations are chosen at boot.
        let from_services = services(&state).err().expect("no services before boot");
        let from_queue = queue(&state).err().expect("no queue before boot");

        assert_eq!(from_services.code, codes::INTERNAL);
        assert_eq!(from_queue.code, codes::INTERNAL);
        assert_eq!(from_services.message, from_queue.message);
    }
}
