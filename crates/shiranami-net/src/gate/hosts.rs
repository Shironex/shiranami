//! The per-host gate table and the registry that hands them out.
//!
//! Ported from `HTTP_HOST_GATES` and `gateFor` in
//! `apps/desktop/src/main/app/http.ts`.
//!
//! **Hosts absent from the table are ungated, deliberately.** That covers our
//! own share backend and every internal flow; adding a blanket default would
//! slow those down to protect nobody. The five listed hosts are third-party
//! APIs that have either published a rate limit or shown one in practice.
//!
//! v1 kept the live gates in a module-level `Map` and needed a
//! `__resetGatesForTests` export to clear it between tests. Architecture §2.3
//! forbids globals, so [`HostGates`] is an ordinary value the HTTP client owns —
//! a test constructs its own and there is nothing to reset.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use shiranami_core::sync::lock_or_recover;

use crate::gate::min_interval::MinIntervalGate;

/// Minimum spacing between requests to each rate-limited host.
///
/// The values are v1's, unchanged. Notably absent and staying absent:
/// `api.open-meteo.com` (shielded by a 15-minute response cache instead) and
/// `*.api.radio-browser.info` (called from the renderer, so it never passes
/// through this client at all).
pub const HOST_GATES: &[(&str, Duration)] = &[
    ("lrclib.net", Duration::from_millis(250)),
    ("i.ytimg.com", Duration::from_millis(100)),
    ("api.github.com", Duration::from_millis(1000)),
    ("itunes.apple.com", Duration::from_millis(500)),
    ("clients1.google.com", Duration::from_millis(250)),
];

/// Lazily-created gates, one per rate-limited host.
#[derive(Debug, Default)]
pub struct HostGates {
    live: Mutex<HashMap<&'static str, Arc<MinIntervalGate>>>,
}

impl HostGates {
    /// An empty registry. Gates appear the first time their host is asked for.
    pub fn new() -> Self {
        Self::default()
    }

    /// The gate for `hostname`, or `None` when the host is ungated.
    ///
    /// Returns an [`Arc`] so the caller can drop the registry lock before
    /// awaiting on the gate — holding a `std::sync::Mutex` across an await is
    /// the deadlock `clippy::await_holding_lock` exists to catch.
    pub fn for_host(&self, hostname: &str) -> Option<Arc<MinIntervalGate>> {
        // The key is the table's `&'static str`, not the caller's slice, so the
        // map never allocates a string per lookup.
        let (name, interval) = HOST_GATES
            .iter()
            .find(|(name, _)| *name == hostname)
            .copied()?;

        let mut live = lock_or_recover(&self.live);
        let gate = live
            .entry(name)
            .or_insert_with(|| Arc::new(MinIntervalGate::new(interval)));
        Some(Arc::clone(gate))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The table is the contract with five third-party APIs; a changed value is
    /// a changed agreement with them, not a tuning knob.
    #[test]
    fn the_table_matches_the_ported_intervals() {
        let expected: &[(&str, u64)] = &[
            ("lrclib.net", 250),
            ("i.ytimg.com", 100),
            ("api.github.com", 1000),
            ("itunes.apple.com", 500),
            ("clients1.google.com", 250),
        ];
        let actual: Vec<(&str, u64)> = HOST_GATES
            .iter()
            .map(|(host, interval)| (*host, interval.as_millis() as u64))
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn an_unlisted_host_is_ungated() {
        let gates = HostGates::new();
        assert!(gates.for_host("api.shiranami.app").is_none());
        assert!(gates.for_host("api.open-meteo.com").is_none());
        assert!(
            gates.for_host("ws.audioscrobbler.com").is_none(),
            "scrobbling is spaced by its own retry queue, not by this gate"
        );
    }

    /// Two requests to the same host must share one gate — a fresh gate per
    /// call would make the spacing a no-op while still looking correct.
    #[test]
    fn the_same_host_always_gets_the_same_gate() {
        let gates = HostGates::new();
        let first = gates.for_host("lrclib.net").expect("lrclib is gated");
        let second = gates.for_host("lrclib.net").expect("lrclib is gated");
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(first.min_interval(), Duration::from_millis(250));
    }

    #[test]
    fn different_hosts_get_different_gates() {
        let gates = HostGates::new();
        let lrclib = gates.for_host("lrclib.net").expect("lrclib is gated");
        let ytimg = gates.for_host("i.ytimg.com").expect("ytimg is gated");
        assert!(!Arc::ptr_eq(&lrclib, &ytimg));
        assert_eq!(ytimg.min_interval(), Duration::from_millis(100));
    }

    /// Hostname matching is exact. A subdomain of a gated host is a different
    /// origin with its own limits, and the table says nothing about it.
    #[test]
    fn host_matching_is_exact() {
        let gates = HostGates::new();
        assert!(gates.for_host("evil-lrclib.net").is_none());
        assert!(gates.for_host("lrclib.net.example.com").is_none());
        assert!(gates.for_host("sub.lrclib.net").is_none());
    }
}
