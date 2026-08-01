//! The settings change-notification bus.
//!
//! Architecture §3.4 names this as the third reason `tauri-plugin-store` was
//! rejected (D17): *"`store.onDidChange`-as-event-bus (telemetry consent →
//! Sentry, `system.launchAtStartup` → OS login item) needs a Rust-side watcher
//! we control."*
//!
//! v1 had exactly two subscribers and both are load-bearing. `app.telemetryEnabled`
//! gates Sentry — turning consent off must call `Sentry::close`, and turning it
//! on must not retroactively initialise a client that missed the boot ordering
//! (§2.8 step 3). `system.launchAtStartup` writes the OS login item. Both fire
//! only on an actual change, never on a write of the same value.

use std::sync::Mutex;

use serde_json::Value;

use crate::sync::lock_or_recover;

/// Handle returned by [`ChangeBus::subscribe`], used to unsubscribe.
///
/// Deliberately not an RAII guard: the two real subscribers live for the whole
/// process, and a guard would have to be parked somewhere to avoid
/// unsubscribing the instant it was dropped — a footgun with no upside here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SubscriptionId(u64);

/// What changed, as handed to a listener.
#[derive(Debug, Clone, PartialEq)]
pub struct ChangeEvent {
    /// The dot path that changed.
    pub path: String,
    /// The previous value; `None` when the key was absent.
    pub previous: Option<Value>,
    /// The new value; `None` when the key was deleted.
    pub current: Option<Value>,
}

impl ChangeEvent {
    /// Whether the new value is exactly JSON `true`.
    ///
    /// Both v1 subscribers were written as `value === true`, which treats an
    /// absent, null or non-boolean value as off. Encoding that here keeps every
    /// consumer from re-deriving it slightly differently.
    pub fn is_enabled(&self) -> bool {
        self.current == Some(Value::Bool(true))
    }
}

/// Reference-counted so [`ChangeBus::publish`] can lift the matching listeners
/// out of the guard and drop it before calling any of them.
type Listener = std::sync::Arc<dyn Fn(&ChangeEvent) + Send + Sync>;

struct Entry {
    id: SubscriptionId,
    path: String,
    listener: Listener,
}

/// Per-path fan-out for settings changes.
#[derive(Default)]
pub struct ChangeBus {
    entries: Mutex<Vec<Entry>>,
    next_id: Mutex<u64>,
}

impl ChangeBus {
    /// Create an empty bus.
    pub fn new() -> Self {
        Self::default()
    }

    /// Call `listener` whenever the value at `path` changes.
    ///
    /// Multiple listeners may share a path; each gets its own
    /// [`SubscriptionId`], and removing one leaves the others attached.
    pub fn subscribe<F>(&self, path: &str, listener: F) -> SubscriptionId
    where
        F: Fn(&ChangeEvent) + Send + Sync + 'static,
    {
        let id = {
            let mut next = lock_or_recover(&self.next_id);
            *next = next.wrapping_add(1);
            SubscriptionId(*next)
        };
        lock_or_recover(&self.entries).push(Entry {
            id,
            path: path.to_owned(),
            listener: std::sync::Arc::new(listener),
        });
        id
    }

    /// Detach one listener. Returns whether it was still attached.
    ///
    /// Idempotent: unsubscribing twice is not an error. React's `StrictMode`
    /// double-invokes effect cleanups, and the Phase 15 shim's unlisten has the
    /// same requirement for the same reason.
    pub fn unsubscribe(&self, id: SubscriptionId) -> bool {
        let mut entries = lock_or_recover(&self.entries);
        let before = entries.len();
        entries.retain(|entry| entry.id != id);
        entries.len() != before
    }

    /// Notify every listener attached to `event.path`.
    ///
    /// Listeners are collected under the lock and invoked after it is released,
    /// so a listener that writes back to the store — the launch-at-startup
    /// handler is one write away from doing exactly that — cannot deadlock, and
    /// a panicking listener cannot poison the bus mid-iteration.
    pub fn publish(&self, event: &ChangeEvent) {
        let matched: Vec<Listener> = {
            let entries = lock_or_recover(&self.entries);
            entries
                .iter()
                .filter(|entry| entry.path == event.path)
                .map(|entry| std::sync::Arc::clone(&entry.listener))
                .collect()
        };
        for listener in matched {
            listener(event);
        }
    }

    /// How many listeners are attached. Exists for tests and diagnostics.
    pub fn len(&self) -> usize {
        lock_or_recover(&self.entries).len()
    }

    /// Whether no listeners are attached.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn event(path: &str, current: Option<Value>) -> ChangeEvent {
        ChangeEvent {
            path: path.to_owned(),
            previous: None,
            current,
        }
    }

    #[test]
    fn delivers_only_to_listeners_on_the_matching_path() {
        let bus = ChangeBus::new();
        let telemetry = Arc::new(AtomicUsize::new(0));
        let startup = Arc::new(AtomicUsize::new(0));

        let seen = Arc::clone(&telemetry);
        bus.subscribe("app.telemetryEnabled", move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        let seen = Arc::clone(&startup);
        bus.subscribe("system.launchAtStartup", move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });

        bus.publish(&event("app.telemetryEnabled", Some(Value::Bool(true))));

        assert_eq!(telemetry.load(Ordering::SeqCst), 1);
        assert_eq!(startup.load(Ordering::SeqCst), 0);
    }

    /// Removing one listener must leave the others on that path attached — the
    /// same precision the Phase 15 event shim needs.
    #[test]
    fn unsubscribing_removes_exactly_one_listener() {
        let bus = ChangeBus::new();
        let first = Arc::new(AtomicUsize::new(0));
        let second = Arc::new(AtomicUsize::new(0));

        let seen = Arc::clone(&first);
        let first_id = bus.subscribe("theme", move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        let seen = Arc::clone(&second);
        bus.subscribe("theme", move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });

        assert!(bus.unsubscribe(first_id));
        bus.publish(&event("theme", Some(Value::String("dark".into()))));

        assert_eq!(first.load(Ordering::SeqCst), 0);
        assert_eq!(second.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn unsubscribing_twice_is_not_an_error() {
        let bus = ChangeBus::new();
        let id = bus.subscribe("theme", |_| {});
        assert!(bus.unsubscribe(id));
        assert!(!bus.unsubscribe(id), "the second removal is a quiet no-op");
        assert!(bus.is_empty());
    }

    /// Both v1 subscribers were `value === true`, so absent, null and a
    /// non-boolean all mean off.
    #[test]
    fn is_enabled_is_true_only_for_the_json_literal_true() {
        assert!(event("k", Some(Value::Bool(true))).is_enabled());
        assert!(!event("k", Some(Value::Bool(false))).is_enabled());
        assert!(!event("k", Some(Value::Null)).is_enabled());
        assert!(!event("k", Some(Value::String("true".into()))).is_enabled());
        assert!(!event("k", None).is_enabled());
    }

    /// A listener that writes back to the store must not deadlock against the
    /// bus lock, so listeners run with the lock released.
    #[test]
    fn a_listener_may_touch_the_bus_while_being_notified() {
        let bus = Arc::new(ChangeBus::new());
        let reentrant = Arc::clone(&bus);
        bus.subscribe("theme", move |_| {
            // Re-entering the bus from inside delivery must not hang.
            let _ = reentrant.len();
        });
        bus.publish(&event("theme", Some(Value::String("dark".into()))));
    }
}
