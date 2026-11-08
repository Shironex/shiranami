//! Rate limits: a token bucket per key, and a fixed window per key.
//!
//! Both are in-memory and keyed by a small set (paired devices, LAN peers), so
//! a `HashMap` behind a `Mutex` is enough; neither lock is held across an
//! await. Keys that have gone quiet are swept on insert so the maps cannot
//! grow without bound from a scanner walking addresses.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use shiranami_core::sync::lock_or_recover;

/// How many keys a map may hold before idle ones are swept.
const SWEEP_AT: usize = 256;

/// A token bucket per key: `rate` tokens a second, at most `burst` saved.
#[derive(Debug)]
pub struct TokenBuckets<K> {
    rate: f64,
    burst: f64,
    buckets: Mutex<HashMap<K, (f64, Instant)>>,
}

impl<K: Eq + Hash + Clone> TokenBuckets<K> {
    /// A limiter refilling `rate` tokens a second up to `burst`.
    pub fn new(rate: f64, burst: f64) -> Self {
        Self {
            rate,
            burst,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Take one token for `key`. `false` when the bucket is empty.
    pub fn allow(&self, key: &K) -> bool {
        self.allow_at(key, Instant::now())
    }

    /// [`Self::allow`] at a given instant, for tests.
    pub fn allow_at(&self, key: &K, now: Instant) -> bool {
        let mut buckets = lock_or_recover(&self.buckets);
        if buckets.len() >= SWEEP_AT {
            let full_after = Duration::from_secs_f64(self.burst / self.rate);
            buckets.retain(|_, (_, last)| now.duration_since(*last) < full_after);
        }
        let (tokens, last) = buckets.entry(key.clone()).or_insert((self.burst, now));
        let refill = now.duration_since(*last).as_secs_f64() * self.rate;
        *tokens = (*tokens + refill).min(self.burst);
        *last = now;
        if *tokens >= 1.0 {
            *tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// At most `limit` events per `window` per key.
#[derive(Debug)]
pub struct WindowCounter<K> {
    limit: u32,
    window: Duration,
    counts: Mutex<HashMap<K, (u32, Instant)>>,
}

impl<K: Eq + Hash + Clone> WindowCounter<K> {
    /// A counter allowing `limit` events per `window`.
    pub fn new(limit: u32, window: Duration) -> Self {
        Self {
            limit,
            window,
            counts: Mutex::new(HashMap::new()),
        }
    }

    /// Count one event for `key`. `false` once the window's limit is reached.
    pub fn allow(&self, key: &K) -> bool {
        self.allow_at(key, Instant::now())
    }

    /// Whether `key` is over its limit, without counting anything.
    pub fn is_blocked(&self, key: &K) -> bool {
        let now = Instant::now();
        lock_or_recover(&self.counts)
            .get(key)
            .is_some_and(|(count, start)| {
                now.duration_since(*start) < self.window && *count >= self.limit
            })
    }

    /// [`Self::allow`] at a given instant, for tests.
    pub fn allow_at(&self, key: &K, now: Instant) -> bool {
        let mut counts = lock_or_recover(&self.counts);
        if counts.len() >= SWEEP_AT {
            let window = self.window;
            counts.retain(|_, (_, start)| now.duration_since(*start) < window);
        }
        let (count, start) = counts.entry(key.clone()).or_insert((0, now));
        if now.duration_since(*start) >= self.window {
            *count = 0;
            *start = now;
        }
        if *count >= self.limit {
            return false;
        }
        *count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bucket_drains_and_refills() {
        let limiter = TokenBuckets::new(10.0, 2.0);
        let start = Instant::now();
        assert!(limiter.allow_at(&"a", start));
        assert!(limiter.allow_at(&"a", start));
        assert!(!limiter.allow_at(&"a", start));
        assert!(limiter.allow_at(&"b", start), "keys are independent");
        assert!(limiter.allow_at(&"a", start + Duration::from_millis(150)));
    }

    #[test]
    fn a_window_resets() {
        let counter = WindowCounter::new(2, Duration::from_secs(60));
        let start = Instant::now();
        assert!(counter.allow_at(&1, start));
        assert!(counter.allow_at(&1, start));
        assert!(!counter.allow_at(&1, start + Duration::from_secs(1)));
        assert!(counter.allow_at(&1, start + Duration::from_secs(61)));
    }
}
