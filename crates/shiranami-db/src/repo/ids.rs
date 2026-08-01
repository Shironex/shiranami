//! De-duplicating id lists without reordering them.
//!
//! Three channels take a caller-supplied list of ids and must not act on the
//! same one twice: `db:tracks:exists-many`, `db:playlists:add-tracks` and
//! `db:playlists:get-playlists-for-tracks`. v1 did it with a JavaScript `Set`,
//! which is both hash-backed and insertion-ordered.
//!
//! Both halves of that matter. The order is observable — `add-tracks` assigns
//! positions in input order, and `exists-many`'s result feeds a scan — and the
//! hashing is what keeps the work linear. The obvious `Vec::contains` version
//! is quadratic, which is invisible on the ten-element lists a test writes and
//! very visible on the fifty thousand paths a real folder scan produces.
//!
//! Shared by both Phase 7 lanes; neither owns it.

use std::collections::HashSet;

/// The ids in input order, with later repeats dropped.
pub(crate) fn unique<I>(ids: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let iterator = ids.into_iter();
    let mut seen = HashSet::with_capacity(iterator.size_hint().0);
    let mut unique = Vec::with_capacity(iterator.size_hint().0);

    for id in iterator {
        if seen.insert(id.clone()) {
            unique.push(id);
        }
    }

    unique
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_first_occurrence_and_the_input_order() {
        let deduplicated = unique(["c", "a", "b", "a", "c"].into_iter().map(str::to_owned));

        assert_eq!(deduplicated, vec!["c", "a", "b"]);
    }

    #[test]
    fn an_empty_list_stays_empty() {
        assert!(unique(Vec::new()).is_empty());
    }
}
