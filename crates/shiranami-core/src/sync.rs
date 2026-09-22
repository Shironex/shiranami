//! Poison-recovering lock helpers.
//!
//! Ported from nightcore's `src/sync.rs` (architecture §2.3: "`sync::lock_or_recover`
//! instead of `.expect("poisoned")` — 3 lines, removes a crash class; every mutex
//! guards plain data").
//!
//! Every `Mutex` in this workspace guards plain in-memory data — a roots cache, a
//! dedup map, a subscriber list — never a half-mutated invariant a panicking
//! thread could leave inconsistent. A poisoned lock is therefore not a reason to
//! abort: recovering the guard yields exactly the data the panicking thread last
//! left. `.lock().expect(…)` would instead turn one panicking thread into a
//! whole-process crash, because every subsequent lock on that mutex re-panics.

use std::sync::{Mutex, MutexGuard};

/// Lock `mutex`, recovering the guard when a prior panic poisoned it.
///
/// The data behind these locks is plain state, so the poison flag carries no
/// correctness signal and recovery is the correct behaviour rather than a crash.
pub fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn locks_an_unpoisoned_mutex() {
        let mutex = Mutex::new(7);
        assert_eq!(*lock_or_recover(&mutex), 7);
    }

    /// The crash class this exists to remove: after one thread panics holding the
    /// guard, `.lock()` returns `Err` forever and `.expect(…)` would cascade the
    /// panic into every later caller. Recovery returns the last-written state.
    #[test]
    fn recovers_the_guard_after_a_poisoning_panic() {
        let mutex = Arc::new(Mutex::new(vec![1, 2, 3]));
        let poisoner = Arc::clone(&mutex);
        let _ = std::thread::spawn(move || {
            let mut guard = lock_or_recover(&poisoner);
            guard.push(4);
            panic!("poison the mutex while holding the guard");
        })
        .join();

        assert!(
            mutex.is_poisoned(),
            "the panicked thread must have poisoned the mutex"
        );
        assert_eq!(*lock_or_recover(&mutex), vec![1, 2, 3, 4]);
    }
}
