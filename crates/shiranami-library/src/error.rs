//! The crate's typed error enum and how it projects onto the wire shape.
//!
//! One variant, and that is the finding rather than an omission. v1's scan is
//! built to not fail: an unreadable directory is logged and contributes nothing
//! (`library.ts:46-48`), an unreadable *root* likewise (`library.ts:81-83`), an
//! undecodable tag becomes a filename-derived placeholder row, and a cover that
//! will not write is dropped while the track survives. `validate-files` maps
//! every `fs.access` rejection onto "missing" rather than raising, and
//! `computeDiskUsage` turns a failed `stat`/`statfs` into an `unavailable: true`
//! entry. All of that is reproduced, so none of it appears here.
//!
//! What is left is the one error v1 genuinely propagated — cancellation — which
//! it re-threw specifically so an aborted scan could not hand the renderer fifty
//! thousand placeholder tracks (`library.ts:118-120`).
//!
//! No new renderer-visible code is minted. The variant lands on
//! [`codes::INTERNAL`], which the frozen registry in `shiranami-core` already
//! declares, so `apps/web`'s four code registries need no change for this crate.

use std::borrow::Cow;

use shiranami_core::error::WireError;
use shiranami_core::error::codes;

/// Convenience alias for fallible library operations.
pub type Result<T, E = LibraryError> = std::result::Result<T, E>;

/// Failures raised by `shiranami-library`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LibraryError {
    /// The scan was cancelled before it finished.
    ///
    /// v1's `ScanCancelledError`.
    ///
    /// **Phase 14 owns the wire contract for this.** v1's two scan handlers
    /// caught it and resolved with an empty array (`library.ts:338-341`,
    /// `:464-467`), so `library:scan-folder` and `library:scan-folder-grouped`
    /// must keep resolving empty rather than rejecting — `apps/web` reads
    /// `results.length === 0` as "nothing to persist" and would otherwise raise
    /// a failure toast for something the user asked for.
    /// [`crate::scan::empty_on_cancel`] is that mapping, kept here so the
    /// command layer does not have to reimplement it.
    #[error("the library scan was cancelled")]
    Cancelled,
}

impl WireError for LibraryError {
    fn code(&self) -> Cow<'static, str> {
        // Diagnostics, not contract. v1 gave the renderer no scan-specific code
        // to match on and `apps/web` has no registry entry for one, so minting a
        // code here would create a literal nothing reads.
        Cow::Borrowed(codes::INTERNAL)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::ErrorPayload;

    #[test]
    fn cancellation_lands_on_the_frozen_internal_code() {
        let payload = ErrorPayload::of(&LibraryError::Cancelled);

        assert_eq!(payload.code, "INTERNAL");
        assert_eq!(payload.message, "the library scan was cancelled");
        assert_eq!(payload.details, None);
    }
}
