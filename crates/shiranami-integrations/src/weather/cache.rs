//! The two response caches that stand in for a rate gate.
//!
//! `api.open-meteo.com` is deliberately absent from
//! [`shiranami_net::HOST_GATES`] — the comment there says it is "shielded by a
//! 15-minute response cache instead", and this is that cache. Open-Meteo's
//! fair-use terms are about request volume, so caching the answer is a more
//! direct compliance mechanism than spacing the requests.
//!
//! Two TTLs, both v1's: 15 minutes for a reading, 24 hours for a geocode. A
//! city does not move.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use shiranami_core::sync::lock_or_recover;

/// How long a current-conditions reading stays fresh.
pub const WEATHER_CACHE_TTL: Duration = Duration::from_secs(15 * 60);

/// How long a resolved place stays fresh.
pub const GEOCODE_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

/// How many resolved places are held. v1's bound.
pub const GEOCODE_CACHE_MAX: usize = 50;

/// How many readings are held.
///
/// **Deviation from v1, deliberately.** v1 bounded only the geocode cache, "to
/// avoid unbounded growth from arbitrary searches", and left the reading cache
/// unbounded on the reasoning that its key is a coordinate the user chose. But
/// the coordinate still arrives from the renderer, and a map keyed by
/// renderer-supplied values with no bound is a leak by construction rather than
/// by accident. The eviction policy was already written for the sibling cache;
/// reusing it costs nothing and closes the class. 50 tiles is far more than any
/// real user's set of places.
pub const WEATHER_CACHE_MAX: usize = 50;

/// A bounded, time-to-live keyed cache.
///
/// Most-recently-used eviction, like the lyrics cache: at these sizes a linear
/// scan is cheaper than anything with pointers, and insertion order is recency
/// order.
#[derive(Debug)]
pub struct TtlCache<V> {
    /// Oldest first, newest last.
    entries: Mutex<Vec<Entry<V>>>,
    ttl: Duration,
    capacity: usize,
}

#[derive(Debug)]
struct Entry<V> {
    key: String,
    value: V,
    expires_at: Instant,
}

impl<V: Clone> TtlCache<V> {
    /// A cache holding `capacity` entries for `ttl` each.
    pub fn new(ttl: Duration, capacity: usize) -> Self {
        Self {
            entries: Mutex::new(Vec::new()),
            ttl,
            capacity,
        }
    }

    /// Read `key`, or `None` when it is absent or stale.
    pub fn get(&self, key: &str) -> Option<V> {
        self.get_at(key, Instant::now())
    }

    /// Store `value` under `key`, expiring one [`Self::ttl`] from now.
    pub fn set(&self, key: &str, value: V) {
        self.set_at(key, value, Instant::now());
    }

    /// [`Self::get`] against an explicit clock, so expiry is testable without
    /// sleeping.
    pub fn get_at(&self, key: &str, now: Instant) -> Option<V> {
        let mut entries = lock_or_recover(&self.entries);
        let at = entries.iter().position(|entry| entry.key == key)?;

        // Dropped rather than merely ignored. v1 left stale entries in place,
        // which is invisible while the cache is bounded but means a key read
        // once after expiry never reclaims its slot.
        if entries[at].expires_at <= now {
            entries.remove(at);
            return None;
        }

        Some(entries[at].value.clone())
    }

    /// [`Self::set`] against an explicit clock.
    pub fn set_at(&self, key: &str, value: V, now: Instant) {
        let mut entries = lock_or_recover(&self.entries);

        if let Some(at) = entries.iter().position(|entry| entry.key == key) {
            entries.remove(at);
        } else if entries.len() >= self.capacity {
            entries.remove(0);
        }

        entries.push(Entry {
            key: key.to_owned(),
            value,
            expires_at: now + self.ttl,
        });
    }

    /// How many entries are held, stale ones included.
    pub fn len(&self) -> usize {
        lock_or_recover(&self.entries).len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Drop every entry. Exists for the settings-change path, where a user
    /// switching units must not be shown a cached reading in the old one.
    pub fn clear(&self) {
        lock_or_recover(&self.entries).clear();
    }
}

/// The cache key for a coordinate pair, at roughly 110 m granularity.
///
/// Truncating is what makes the cache useful at all: a reading is a property of
/// a place, not of six decimal places, and without it every pixel of map drag
/// would be a fresh request.
pub fn coordinate_key(lat: f64, lon: f64) -> String {
    // `+ 0.0` normalises `-0.0` to `0.0`, so a coordinate that lands exactly on
    // the equator or the prime meridian cannot occupy two buckets.
    format!("{:.3}:{:.3}", lat + 0.0, lon + 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cache() -> TtlCache<String> {
        TtlCache::new(Duration::from_secs(60), 3)
    }

    #[test]
    fn stores_and_reads_back() {
        let cache = cache();
        cache.set("a", "one".to_owned());
        assert_eq!(cache.get("a"), Some("one".to_owned()));
        assert_eq!(cache.get("b"), None);
    }

    #[test]
    fn an_entry_expires_after_its_ttl() {
        let cache = cache();
        let start = Instant::now();
        cache.set_at("a", "one".to_owned(), start);

        assert_eq!(
            cache.get_at("a", start + Duration::from_secs(59)),
            Some("one".to_owned())
        );
        assert_eq!(cache.get_at("a", start + Duration::from_secs(60)), None);
    }

    /// Expiry reclaims the slot rather than leaving a corpse behind.
    #[test]
    fn a_stale_entry_is_dropped_on_read() {
        let cache = cache();
        let start = Instant::now();
        cache.set_at("a", "one".to_owned(), start);

        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get_at("a", start + Duration::from_secs(120)), None);
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn evicts_the_oldest_entry_when_full() {
        let cache = cache();
        for key in ["a", "b", "c", "d"] {
            cache.set(key, key.to_owned());
        }

        assert_eq!(cache.len(), 3);
        assert_eq!(cache.get("a"), None);
        assert_eq!(cache.get("d"), Some("d".to_owned()));
    }

    #[test]
    fn overwriting_a_key_refreshes_it_without_growing_the_cache() {
        let cache = cache();
        let start = Instant::now();
        cache.set_at("a", "one".to_owned(), start);
        cache.set_at("a", "two".to_owned(), start + Duration::from_secs(30));

        assert_eq!(cache.len(), 1);
        assert_eq!(
            cache.get_at("a", start + Duration::from_secs(80)),
            Some("two".to_owned()),
            "the second write restarted the TTL"
        );
    }

    #[test]
    fn clearing_drops_everything() {
        let cache = cache();
        cache.set("a", "one".to_owned());
        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn coordinates_are_bucketed_to_three_decimals() {
        assert_eq!(coordinate_key(52.2297, 21.0122), "52.230:21.012");
        assert_eq!(
            coordinate_key(52.229712, 21.012234),
            coordinate_key(52.229698, 21.012301),
            "coordinates within one tile share a bucket"
        );
    }

    /// Distinct places must not collide, or a user in Warsaw sees Kraków's
    /// weather.
    #[test]
    fn distant_coordinates_do_not_share_a_bucket() {
        assert_ne!(
            coordinate_key(52.2297, 21.0122),
            coordinate_key(50.06, 19.94)
        );
    }

    /// Latitude and longitude are separated, so (1.0, 23.0) and (1.02, 3.0)
    /// cannot fold into one key.
    #[test]
    fn the_key_separates_latitude_from_longitude() {
        assert_ne!(coordinate_key(1.0, 23.0), coordinate_key(1.02, 3.0));
    }

    #[test]
    fn negative_zero_shares_a_bucket_with_zero() {
        assert_eq!(coordinate_key(-0.0, -0.0), coordinate_key(0.0, 0.0));
    }

    #[test]
    fn negative_coordinates_survive_bucketing() {
        assert_eq!(coordinate_key(-33.8688, -151.2093), "-33.869:-151.209");
    }
}
