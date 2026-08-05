//! The write guard that keeps `album_art` / `cover_art` canonical.
//!
//! §2.4 rewrites a stored `shiranami-art://art/<hash>.jpg` onto the loopback
//! media server for display, and the rewrite is one-directional by contract.
//! It was not enforced anywhere, and the renderer round-trips art values by
//! design: the enrich apply path reads `updatedFields.albumArt` off a command
//! result and posts it straight back through `db:tracks:update-many`, and the
//! scan-and-persist path does the same with `metadata.albumArt` through
//! `db:tracks:add-many`. Both wrote a URL naming a port and a session token
//! that die with the process, so every cover 404'd on the next launch and the
//! art prune — which recognises only the `shiranami-art://` form — read a full
//! cache as unreferenced and deleted it.
//!
//! The renderer boundary is sealed in `apps/web/src/lib/bridge/stream-urls.ts`,
//! which is where the rewrite happens and therefore where its inverse belongs.
//! This module is the second half: the repository is the last code a value
//! passes through before it is durable, so "only a canonical value is ever
//! persisted" is checkable here regardless of which client sent it — the e2e
//! harness and a future client included.
//!
//! It is deliberately a *normaliser*, not a validator. Refusing the write would
//! turn a cosmetic renderer bug into a failed metadata save; rewriting it to
//! the form that was meant costs one allocation on a value that was wrong.

use shiranami_core::art::canonical_art_url;
use shiranami_core::models::Patch;

/// The canonical form of an optional art value, for an `INSERT` bind.
pub(crate) fn canonical(value: Option<&str>) -> Option<String> {
    value.map(|value| canonical_art_url(value).into_owned())
}

/// The canonical form of a patched art value, preserving all three
/// [`Patch`] states — absent stays absent, an explicit clear stays a clear.
pub(crate) fn canonical_patch(patch: &Patch<String>) -> Patch<String> {
    patch.as_ref().map(|value| canonical(value.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOOPBACK: &str = "http://127.0.0.1:60241/9f8e7d/art/abc123.jpg";
    const CANONICAL: &str = "shiranami-art://art/abc123.jpg";

    #[test]
    fn a_loopback_url_is_repaired_on_its_way_into_a_column() {
        assert_eq!(canonical(Some(LOOPBACK)).as_deref(), Some(CANONICAL));
    }

    #[test]
    fn a_canonical_or_remote_value_is_bound_as_it_arrived() {
        for value in [
            CANONICAL,
            "https://example.com/cover.jpg",
            "data:image/png;base64,AA",
        ] {
            assert_eq!(canonical(Some(value)).as_deref(), Some(value));
        }
        assert_eq!(canonical(None), None);
    }

    /// The distinction the whole patch type exists for: an absent field must not
    /// become an explicit `NULL` by passing through the guard.
    #[test]
    fn the_three_patch_states_survive_normalisation() {
        assert_eq!(canonical_patch(&None), None, "absent stays absent");
        assert_eq!(
            canonical_patch(&Some(None)),
            Some(None),
            "an explicit clear stays a clear"
        );
        assert_eq!(
            canonical_patch(&Some(Some(LOOPBACK.to_owned()))),
            Some(Some(CANONICAL.to_owned()))
        );
    }
}
