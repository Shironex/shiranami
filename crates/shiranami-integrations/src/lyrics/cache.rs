//! Session memoisation for the network source: an LRU plus in-flight dedup.
//!
//! Both are ported from `lyrics-service.ts`, and both cover **only** LRCLIB.
//! Local and embedded sources are deliberately re-read from disk on every
//! fetch, so a lyric file the user just dropped next to a track shows up
//! without restarting the app.
//!
//! # What is and is not cached
//!
//! A definitive miss is cached; a *failure* is not. That asymmetry is the whole
//! point (see [`crate::lyrics::error`]): caching a rate-limited lookup would
//! mark the track lyric-less for the rest of the session, which is the bug the
//! Phase 9 amendment names for the sibling iTunes lookup.

use std::collections::HashMap;
use std::future::Future;
use std::sync::Mutex;

use shiranami_core::sync::lock_or_recover;
use tokio::sync::watch;

use crate::lyrics::error::LookupFailure;
use crate::lyrics::lrclib::LrclibOutcome;

/// The outcome shared between a lookup's leader and its followers.
pub type SharedOutcome = Result<LrclibOutcome, LookupFailure>;

/// How many resolved tracks the session cache holds. v1's value.
pub const LYRICS_CACHE_MAX: usize = 200;

/// The cache key for a track: case-folded title and artist.
pub fn cache_key(title: &str, artist: &str) -> String {
    format!(
        "{}::{}",
        title.trim().to_lowercase(),
        artist.trim().to_lowercase()
    )
}

/// A bounded most-recently-used cache of resolved LRCLIB lookups.
///
/// Backed by a vector rather than an intrusive list: at 200 entries the linear
/// scan is far cheaper than the allocation a linked structure would need, and
/// insertion order *is* the recency order, which is exactly how the JavaScript
/// `Map` this replaces behaved.
#[derive(Debug, Default)]
pub struct LyricsCache {
    /// Oldest first, newest last.
    entries: Mutex<Vec<(String, LrclibOutcome)>>,
    capacity: usize,
}

impl LyricsCache {
    /// A cache holding [`LYRICS_CACHE_MAX`] entries.
    pub fn new() -> Self {
        Self::with_capacity(LYRICS_CACHE_MAX)
    }

    /// A cache holding `capacity` entries.
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            entries: Mutex::new(Vec::new()),
            capacity,
        }
    }

    /// Read `key`, promoting it to most-recently-used on a hit.
    pub fn get(&self, key: &str) -> Option<LrclibOutcome> {
        let mut entries = lock_or_recover(&self.entries);
        let at = entries.iter().position(|(stored, _)| stored == key)?;

        let entry = entries.remove(at);
        let value = entry.1.clone();
        entries.push(entry);
        Some(value)
    }

    /// Store `value`, evicting the least-recently-used entry when full.
    pub fn set(&self, key: &str, value: LrclibOutcome) {
        let mut entries = lock_or_recover(&self.entries);

        if let Some(at) = entries.iter().position(|(stored, _)| stored == key) {
            entries.remove(at);
        } else if entries.len() >= self.capacity {
            entries.remove(0);
        }

        entries.push((key.to_owned(), value));
    }

    /// How many entries are held.
    pub fn len(&self) -> usize {
        lock_or_recover(&self.entries).len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Concurrent lookups for one track, sharing a single request.
///
/// v1's `coalesce` helper stored the in-flight promise and handed it to every
/// later caller. A Rust future has no such shared handle, so the leader
/// broadcasts its outcome over a [`watch`] channel instead — which is why
/// [`LookupFailure`] is `Clone`: the followers need the same answer, including
/// the same failure, rather than each starting a request of their own.
#[derive(Debug, Default)]
pub struct InflightLookups {
    slots: Mutex<HashMap<String, watch::Receiver<Option<SharedOutcome>>>>,
}

/// Which side of a coalesced lookup this caller is on.
enum Role {
    /// First in: runs the lookup and broadcasts the outcome.
    Leader(watch::Sender<Option<SharedOutcome>>),
    /// Joined one already in flight: waits for the leader's outcome.
    Follower(watch::Receiver<Option<SharedOutcome>>),
}

/// Removes the in-flight slot when the leader finishes **or is dropped**.
///
/// Without this, a cancelled lookup — the panel unmounting mid-request is the
/// ordinary case — would leave its key in the map forever, and every later
/// caller would join a channel whose sender is already gone.
struct LeaderSlot<'a> {
    slots: &'a Mutex<HashMap<String, watch::Receiver<Option<SharedOutcome>>>>,
    key: String,
}

impl Drop for LeaderSlot<'_> {
    fn drop(&mut self) {
        lock_or_recover(self.slots).remove(&self.key);
    }
}

impl InflightLookups {
    /// An empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Run `lookup` for `key`, or join the run already in flight for it.
    ///
    /// `lookup` is `Fn` rather than `FnOnce` because a follower whose leader was
    /// cancelled falls back to doing the work itself. That is strictly better
    /// than waiting on a sender that will never send.
    pub async fn run<F, Fut>(&self, key: &str, lookup: F) -> SharedOutcome
    where
        F: Fn() -> Fut,
        Fut: Future<Output = SharedOutcome>,
    {
        // The role is decided in a block of its own so the registry guard is
        // provably dropped before any await below. Holding a std mutex across
        // one is the deadlock `clippy::await_holding_lock` exists to catch —
        // and it also makes the whole future `!Send`, which a command handler
        // would then refuse to spawn.
        let role = {
            let mut slots = lock_or_recover(&self.slots);
            match slots.get(key) {
                Some(receiver) => Role::Follower(receiver.clone()),
                None => {
                    let (sender, receiver) = watch::channel(None);
                    slots.insert(key.to_owned(), receiver);
                    Role::Leader(sender)
                }
            }
        };

        let leader = match role {
            Role::Follower(mut receiver) => return follow(&mut receiver, lookup).await,
            Role::Leader(sender) => sender,
        };

        let slot = LeaderSlot {
            slots: &self.slots,
            key: key.to_owned(),
        };

        let outcome = lookup().await;

        // Retire the slot before broadcasting, so a caller arriving after this
        // point starts a fresh lookup rather than joining a finished one.
        drop(slot);
        let _ = leader.send(Some(outcome.clone()));
        outcome
    }

    /// How many lookups are in flight.
    pub fn len(&self) -> usize {
        lock_or_recover(&self.slots).len()
    }

    /// Whether nothing is in flight.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Wait for the leader's outcome, or do the work if the leader disappeared.
async fn follow<F, Fut>(
    receiver: &mut watch::Receiver<Option<SharedOutcome>>,
    lookup: F,
) -> SharedOutcome
where
    F: Fn() -> Fut,
    Fut: Future<Output = SharedOutcome>,
{
    loop {
        // Cloned out of the guard so nothing is held across the await below.
        let current = receiver.borrow_and_update().clone();
        if let Some(outcome) = current {
            return outcome;
        }
        if receiver.changed().await.is_err() {
            // The leader was cancelled before it could answer.
            return lookup().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn found(text: &str) -> LrclibOutcome {
        LrclibOutcome::Found(crate::lyrics::lrclib::LrclibLyrics {
            result: shiranami_core::models::lyrics::LyricsResult {
                synced: None,
                plain: Some(text.to_owned()),
                source: Some(shiranami_core::models::lyrics::LyricsSource::Lrclib),
            },
            synced_lrc: None,
        })
    }

    #[test]
    fn the_key_folds_case_and_trims() {
        assert_eq!(cache_key("  Song ", "ARTIST"), "song::artist");
        assert_eq!(cache_key("Song", "Artist"), cache_key("song", "artist"));
    }

    /// Title and artist are separated, so "ab"/"c" and "a"/"bc" are different
    /// tracks rather than one cache entry.
    #[test]
    fn the_key_separates_title_from_artist() {
        assert_ne!(cache_key("ab", "c"), cache_key("a", "bc"));
    }

    #[test]
    fn stores_and_reads_back() {
        let cache = LyricsCache::new();
        cache.set("a", found("one"));
        assert_eq!(cache.get("a"), Some(found("one")));
        assert_eq!(cache.get("missing"), None);
    }

    #[test]
    fn overwriting_a_key_does_not_grow_the_cache() {
        let cache = LyricsCache::new();
        cache.set("a", found("one"));
        cache.set("a", found("two"));

        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get("a"), Some(found("two")));
    }

    #[test]
    fn evicts_the_least_recently_used_entry_when_full() {
        let cache = LyricsCache::with_capacity(2);
        cache.set("a", found("one"));
        cache.set("b", found("two"));
        cache.set("c", found("three"));

        assert_eq!(cache.len(), 2);
        assert_eq!(cache.get("a"), None, "the oldest entry was evicted");
        assert_eq!(cache.get("b"), Some(found("two")));
        assert_eq!(cache.get("c"), Some(found("three")));
    }

    /// A read is what makes an entry recent. Without the promotion, the entry a
    /// user is actively scrubbing through would be the next one evicted.
    #[test]
    fn reading_an_entry_promotes_it_past_the_next_eviction() {
        let cache = LyricsCache::with_capacity(2);
        cache.set("a", found("one"));
        cache.set("b", found("two"));

        assert_eq!(cache.get("a"), Some(found("one")));
        cache.set("c", found("three"));

        assert_eq!(cache.get("a"), Some(found("one")), "promoted, so it stayed");
        assert_eq!(cache.get("b"), None, "unread, so it went");
    }

    #[tokio::test]
    async fn concurrent_callers_for_one_key_share_a_single_lookup() {
        let inflight = Arc::new(InflightLookups::new());
        let calls = Arc::new(AtomicUsize::new(0));
        let gate = Arc::new(tokio::sync::Notify::new());

        let spawn = || {
            let inflight = Arc::clone(&inflight);
            let calls = Arc::clone(&calls);
            let gate = Arc::clone(&gate);
            tokio::spawn(async move {
                inflight
                    .run("key", || {
                        let calls = Arc::clone(&calls);
                        let gate = Arc::clone(&gate);
                        async move {
                            calls.fetch_add(1, Ordering::SeqCst);
                            gate.notified().await;
                            Ok(found("shared"))
                        }
                    })
                    .await
            })
        };

        let first = spawn();
        // Let the leader register its slot before the followers arrive.
        tokio::task::yield_now().await;
        let second = spawn();
        let third = spawn();
        tokio::task::yield_now().await;

        gate.notify_waiters();

        for handle in [first, second, third] {
            let outcome = handle.await.expect("the task joined").expect("an outcome");
            assert_eq!(outcome, found("shared"));
        }
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "one request, three callers"
        );
        assert!(inflight.is_empty(), "the slot was retired");
    }

    /// Followers must receive the failure too, rather than each retrying and
    /// turning one rate-limited lookup into a burst of them.
    #[tokio::test]
    async fn a_failure_is_shared_with_the_followers() {
        let inflight = Arc::new(InflightLookups::new());
        let calls = Arc::new(AtomicUsize::new(0));
        let gate = Arc::new(tokio::sync::Notify::new());

        let spawn = || {
            let inflight = Arc::clone(&inflight);
            let calls = Arc::clone(&calls);
            let gate = Arc::clone(&gate);
            tokio::spawn(async move {
                inflight
                    .run("key", || {
                        let calls = Arc::clone(&calls);
                        let gate = Arc::clone(&gate);
                        async move {
                            calls.fetch_add(1, Ordering::SeqCst);
                            gate.notified().await;
                            Err(failure())
                        }
                    })
                    .await
            })
        };

        let first = spawn();
        tokio::task::yield_now().await;
        let second = spawn();
        tokio::task::yield_now().await;
        gate.notify_waiters();

        for handle in [first, second] {
            assert!(handle.await.expect("the task joined").is_err());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    /// A settled lookup must not be joinable — the next caller gets a fresh
    /// request, which is what makes a transient failure retryable.
    #[tokio::test]
    async fn a_later_caller_starts_a_new_lookup() {
        let inflight = InflightLookups::new();
        let calls = AtomicUsize::new(0);

        for _ in 0..2 {
            let outcome = inflight
                .run("key", || async {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(found("one"))
                })
                .await;
            assert!(outcome.is_ok());
        }

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn different_keys_do_not_share_a_lookup() {
        let inflight = InflightLookups::new();
        let calls = AtomicUsize::new(0);

        let run = |key: &'static str| {
            inflight.run(key, || async {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(found(key))
            })
        };

        let (first, second) = tokio::join!(run("a"), run("b"));
        assert_eq!(first, Ok(found("a")));
        assert_eq!(second, Ok(found("b")));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    fn failure() -> LookupFailure {
        LookupFailure::of(&shiranami_net::HttpError::Timeout {
            url: "https://lrclib.net/api/get".to_owned(),
            timeout: std::time::Duration::from_secs(30),
        })
    }
}
