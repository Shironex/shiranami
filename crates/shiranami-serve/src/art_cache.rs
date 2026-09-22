//! The album-art LRU, ported from `apps/desktop/src/main/protocols/art-protocol.ts`.
//!
//! Bounded by **bytes, not entries**, which is the only bound that means
//! anything when the entries are images: a thousand-entry cache of 4 KB
//! thumbnails and a thousand-entry cache of 2 MB covers are the same cache by
//! one measure and two gigabytes apart by the other.
//!
//! A grid of album cards asks for the same few dozen covers on every scroll, so
//! the hit rate is what keeps the art route off the disk. Entries larger than
//! the whole budget are skipped rather than admitted-then-evicted: admitting one
//! would flush everything else to hold a single file that the next request
//! evicts again.

use std::collections::HashMap;
use std::sync::Mutex;

use bytes::Bytes;
use shiranami_core::sync::lock_or_recover;

/// The byte budget, ported verbatim from v1's `ART_LRU_MAX_BYTES`.
pub const DEFAULT_MAX_BYTES: usize = 5 * 1024 * 1024;

#[derive(Default)]
struct CacheState {
    entries: HashMap<String, Entry>,
    bytes: usize,
    /// Monotonic recency counter. Wrapping is not a correctness problem — the
    /// worst case is one suboptimal eviction after 2^64 reads.
    tick: u64,
}

struct Entry {
    bytes: Bytes,
    used_at: u64,
}

/// A bytes-bounded LRU of album-art file contents, keyed by file name.
pub struct ArtCache {
    max_bytes: usize,
    state: Mutex<CacheState>,
}

impl ArtCache {
    /// A cache holding at most `max_bytes` of image data.
    pub fn with_capacity(max_bytes: usize) -> Self {
        Self {
            max_bytes,
            state: Mutex::new(CacheState::default()),
        }
    }

    /// Look `name` up, marking it as most recently used on a hit.
    pub fn get(&self, name: &str) -> Option<Bytes> {
        let mut state = lock_or_recover(&self.state);
        state.tick = state.tick.wrapping_add(1);
        let tick = state.tick;
        let entry = state.entries.get_mut(name)?;
        entry.used_at = tick;
        Some(entry.bytes.clone())
    }

    /// Store `bytes` under `name`, evicting until the budget is met.
    pub fn insert(&self, name: String, bytes: Bytes) {
        // Bigger than the whole cache: caching it would evict everything else
        // to hold one file, so it stays uncached and is read from disk.
        if bytes.len() > self.max_bytes {
            return;
        }

        let mut state = lock_or_recover(&self.state);
        state.tick = state.tick.wrapping_add(1);
        let used_at = state.tick;

        if let Some(previous) = state.entries.remove(&name) {
            state.bytes -= previous.bytes.len();
        }

        state.bytes += bytes.len();
        state.entries.insert(name, Entry { bytes, used_at });

        while state.bytes > self.max_bytes {
            let Some(oldest) = state
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.used_at)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            if let Some(evicted) = state.entries.remove(&oldest) {
                state.bytes -= evicted.bytes.len();
            }
        }
    }

    /// Drop `name`, if it is held. Called when a file is pruned off disk, so a
    /// deleted cover cannot keep serving from memory.
    pub fn remove(&self, name: &str) {
        let mut state = lock_or_recover(&self.state);
        if let Some(evicted) = state.entries.remove(name) {
            state.bytes -= evicted.bytes.len();
        }
    }

    /// How many bytes are currently held.
    pub fn bytes_held(&self) -> usize {
        lock_or_recover(&self.state).bytes
    }

    /// How many entries are currently held.
    pub fn entry_count(&self) -> usize {
        lock_or_recover(&self.state).entries.len()
    }
}

impl Default for ArtCache {
    fn default() -> Self {
        Self::with_capacity(DEFAULT_MAX_BYTES)
    }
}

impl std::fmt::Debug for ArtCache {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ArtCache")
            .field("max_bytes", &self.max_bytes)
            .field("bytes_held", &self.bytes_held())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image(size: usize) -> Bytes {
        Bytes::from(vec![0xab_u8; size])
    }

    #[test]
    fn the_default_budget_is_v1s_five_megabytes() {
        assert_eq!(DEFAULT_MAX_BYTES, 5 * 1024 * 1024);
        assert_eq!(ArtCache::default().bytes_held(), 0);
    }

    #[test]
    fn a_stored_cover_comes_back() {
        let cache = ArtCache::with_capacity(1_000);
        cache.insert("a.jpg".to_owned(), image(100));

        assert_eq!(cache.get("a.jpg"), Some(image(100)));
        assert_eq!(cache.bytes_held(), 100);
        assert_eq!(cache.get("missing.jpg"), None);
    }

    #[test]
    fn the_budget_is_counted_in_bytes_not_entries() {
        let cache = ArtCache::with_capacity(250);
        cache.insert("a.jpg".to_owned(), image(100));
        cache.insert("b.jpg".to_owned(), image(100));
        assert_eq!(cache.bytes_held(), 200);
        assert_eq!(cache.entry_count(), 2);

        cache.insert("c.jpg".to_owned(), image(100));
        assert!(cache.bytes_held() <= 250);
        assert_eq!(
            cache.entry_count(),
            2,
            "one entry made room for the newcomer"
        );
    }

    /// The property the whole structure exists for: a cover being scrolled past
    /// repeatedly must outlive one that is not.
    #[test]
    fn the_least_recently_used_entry_is_the_one_evicted() {
        let cache = ArtCache::with_capacity(250);
        cache.insert("old.jpg".to_owned(), image(100));
        cache.insert("hot.jpg".to_owned(), image(100));

        // Touching `old` makes it the *most* recent, so `hot` becomes the victim.
        assert!(cache.get("old.jpg").is_some());
        cache.insert("new.jpg".to_owned(), image(100));

        assert!(cache.get("old.jpg").is_some(), "the touched entry survived");
        assert!(cache.get("new.jpg").is_some());
        assert!(
            cache.get("hot.jpg").is_none(),
            "the untouched entry was evicted"
        );
    }

    /// v1 skipped these outright, and so does this: admitting one would flush
    /// every useful entry to hold a file the next request evicts again.
    #[test]
    fn an_entry_larger_than_the_budget_is_never_admitted() {
        let cache = ArtCache::with_capacity(1_000);
        cache.insert("keep.jpg".to_owned(), image(500));
        cache.insert("huge.jpg".to_owned(), image(2_000));

        assert!(cache.get("huge.jpg").is_none());
        assert!(
            cache.get("keep.jpg").is_some(),
            "the huge entry flushed nothing"
        );
        assert_eq!(cache.bytes_held(), 500);
    }

    #[test]
    fn reinserting_a_name_replaces_rather_than_double_counts() {
        let cache = ArtCache::with_capacity(1_000);
        cache.insert("a.jpg".to_owned(), image(100));
        cache.insert("a.jpg".to_owned(), image(300));

        assert_eq!(cache.bytes_held(), 300);
        assert_eq!(cache.entry_count(), 1);
        assert_eq!(cache.get("a.jpg").map(|bytes| bytes.len()), Some(300));
    }

    #[test]
    fn a_pruned_file_is_dropped_from_memory() {
        let cache = ArtCache::with_capacity(1_000);
        cache.insert("gone.jpg".to_owned(), image(100));
        cache.remove("gone.jpg");

        assert!(cache.get("gone.jpg").is_none());
        assert_eq!(cache.bytes_held(), 0);
        cache.remove("never-there.jpg");
        assert_eq!(cache.bytes_held(), 0);
    }

    /// The accounting must survive a long run, not just the happy path: if
    /// `bytes` drifted from the sum of the entries the cache would either leak
    /// or evict everything.
    #[test]
    fn the_byte_count_stays_exact_across_many_evictions() {
        let cache = ArtCache::with_capacity(1_000);
        for index in 0..200 {
            cache.insert(format!("cover-{index}.jpg"), image(150));
            assert!(cache.bytes_held() <= 1_000);
        }
        assert_eq!(cache.bytes_held(), cache.entry_count() * 150);
    }
}
