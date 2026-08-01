//! `system:*` — one channel, and it is an event.
//!
//! This namespace has **zero invoke commands**. `packages/contracts/src/ipc/channels.ts`
//! declares exactly one entry under `system`:
//!
//! ```ts
//! system: {
//!   // Main→renderer: structured notice for silent subsystem failures (Discord
//!   // RPC login, album-art prune, etc.) so they surface as a calm toast instead
//!   // of being swallowed in the logs.
//!   notice: 'system:notice',
//! },
//! ```
//!
//! and `SystemApi` in the preload is one listener and nothing else. A grep of
//! `packages/contracts/src`, `apps/desktop/src/main` and `apps/web/src` finds no
//! second `system:` string anywhere.
//!
//! The module exists anyway, and is listed in
//! [`crate::commands::registry::namespace_list!`] with a `commands!` macro that
//! contributes nothing, for two reasons. It puts "the system namespace has no
//! invoke channels" in the file somebody would look in, rather than leaving it
//! as an absence that reads like an unfinished lane. And it gives the delivery
//! half of the notice path a home next to the event it delivers.
//!
//! # The gate is core's; only the transport is here
//!
//! `shiranami_core::notice` owns the model and the 5-minute per-`source:code`
//! cooldown — the thing standing between a backing-off Discord reconnect loop
//! and a toast every five seconds. It cannot own the delivery: emitting a Tauri
//! event from a rank-0 crate would invert the layering, so it declares
//! [`NoticeSink`] and the composition root implements it. [`EventNoticeSink`] is
//! that implementation, and [`notices`] is the composed value Phase 16 puts
//! wherever the emitting subsystems can reach it.
//!
//! Two ported properties are worth restating because both look like bugs from
//! the outside and neither is:
//!
//! - **A notice with no window is dropped, not queued.** v1's `sendToRenderer`
//!   returned `false` and threw nothing. The gate records the timestamp *before*
//!   delivery and records it either way, so a burst arriving during startup
//!   consumes the cooldown rather than piling up to fire the instant a window
//!   appears.
//! - **`reset` exists and is not a test helper.** v1 cleared the Discord notice
//!   on a successful `ready` and on a deliberate disconnect, so a subsystem that
//!   recovers and then fails again surfaces immediately instead of waiting out a
//!   window it earned before the problem was fixed.

use shiranami_core::notice::{NoticeGate, NoticeSink};
use shiranami_core::{SystemNotice, SystemNoticeSource};
use tauri_specta::Event as _;

use crate::events::SystemNoticeEmitted;

/// Register this namespace's commands with [`crate::commands::registry`].
///
/// Appends nothing: v1's `system` namespace is one main→renderer event and no
/// invoke channels at all. The macro exists so the namespace can appear in the
/// shared list — which is what declares the module — without pretending to
/// contribute a command.
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*]
        }
    };
}
pub(crate) use commands;

/// Deliver a notice that passed the cooldown, as a `system:notice` event.
pub struct EventNoticeSink<R: tauri::Runtime = tauri::Wry> {
    app: tauri::AppHandle<R>,
}

impl<R: tauri::Runtime> EventNoticeSink<R> {
    /// Deliver notices through this app handle.
    pub fn new(app: tauri::AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: tauri::Runtime> NoticeSink for EventNoticeSink<R> {
    fn deliver(&self, notice: &SystemNotice) {
        // Fire-and-forget, matching v1: `sendToRenderer` answered `false` for a
        // missing window and threw nothing. A notice is a courtesy toast about a
        // subsystem that already failed — failing *its* delivery loudly would be
        // the second failure telling the user about the first.
        if let Err(error) = SystemNoticeEmitted(notice.clone()).emit(&self.app) {
            tracing::warn!(
                %error,
                source = ?notice.source,
                code = %notice.code,
                "a system notice did not reach the webview"
            );
        }
    }
}

/// The composed notice path: core's cooldown in front of this crate's transport.
///
/// Phase 16 builds one of these in `setup()` and hands it to the subsystems that
/// raise notices. There is deliberately no global — §2.3 forbids one, and the
/// gate's whole state is its cooldown map, so a second gate would be a second,
/// silently un-deduplicated stream.
pub fn notices<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> NoticeGate<EventNoticeSink<R>> {
    NoticeGate::new(EventNoticeSink::new(app))
}

/// Forget the cooldown for one `source:code`, so the next failure surfaces at
/// once.
///
/// A named function rather than a bare `gate.reset(…)` at each call site because
/// v1 called its equivalent from three places for one code, and "which
/// subsystems reset which notice" is a question worth being able to grep.
pub fn recovered<S: NoticeSink>(gate: &NoticeGate<S>, source: SystemNoticeSource, code: &str) {
    gate.reset(source, code);
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::notice::codes;
    use shiranami_core::sync::lock_or_recover;
    use std::sync::{Arc, Mutex};

    /// Records the **serialized event payload**, not the notice.
    ///
    /// Deliberately different from the recorder in `shiranami_core::notice`,
    /// which records `SystemNotice` values: that suite asks whether the cooldown
    /// works, and this one asks what crosses the boundary. Recording the Rust
    /// value here would prove only that the model round-trips through itself.
    /// The `Arc` is *inside* the newtype rather than around it: `NoticeSink` is
    /// core's trait and `Arc` is the standard library's, so `impl NoticeSink for
    /// Arc<…>` is an orphan impl here in a way it is not inside core's own
    /// suite. Holding the handle internally makes the type local and keeps it
    /// cheap to clone, which is what lets the gate own one and the test keep one.
    #[derive(Clone, Default)]
    struct RecordingWebview(Arc<Mutex<Vec<serde_json::Value>>>);

    impl RecordingWebview {
        fn delivered(&self) -> Vec<serde_json::Value> {
            lock_or_recover(&self.0).clone()
        }
    }

    impl NoticeSink for RecordingWebview {
        fn deliver(&self, notice: &SystemNotice) {
            // The same construction `EventNoticeSink` emits, minus the app
            // handle: `#[serde(transparent)]` makes the event's bytes the
            // notice's bytes, which is the property under test.
            let payload = serde_json::to_value(SystemNoticeEmitted(notice.clone()))
                .expect("the event serializes");
            lock_or_recover(&self.0).push(payload);
        }
    }

    fn gate() -> (NoticeGate<RecordingWebview>, RecordingWebview) {
        let webview = RecordingWebview::default();
        (NoticeGate::new(webview.clone()), webview)
    }

    fn discord_failure() -> SystemNotice {
        SystemNotice::warn(SystemNoticeSource::Discord, codes::DISCORD_LOGIN_FAILED)
    }

    /// The event is `#[serde(transparent)]` over the notice, so what the
    /// renderer receives is the notice itself — four keys, exactly as v1's
    /// `sendToRenderer(IPC_CHANNELS.system.notice, notice)` sent it.
    ///
    /// `useSystemNotices` reads all four: `code` picks the i18n key, `meta`
    /// interpolates it, `level` picks the toast variant, and `source` + `code`
    /// compose the toast id so repeats replace rather than stack.
    #[test]
    fn the_event_carries_the_notice_itself_and_not_a_wrapper() {
        let (gate, webview) = gate();

        assert!(gate.emit(&discord_failure()));

        assert_eq!(
            webview.delivered(),
            vec![serde_json::json!({
                "source": "discord",
                "level": "warn",
                "code": "discordLoginFailed",
                "meta": null,
            })],
            "v1 sent the notice as the single argument of the send"
        );
    }

    /// A recorded deviation, not a defect, and the only one on this channel.
    ///
    /// v1 typed `meta?: Record<string, string | number>` and no emitter ever set
    /// it, so the key was **absent** from every notice v1 shipped. Core's model
    /// is `Option<BTreeMap<…>>` without `skip_serializing_if`, so v2 emits
    /// `"meta": null` instead. Three reasons that is left alone rather than
    /// tightened:
    ///
    /// - It is inside the type the generated bindings already declare —
    ///   `meta?: { … } | null` — so nothing is being sent that the contract
    ///   forbids.
    /// - The one renderer consumer spreads it: `i18n.t(key, { ns: 'toast',
    ///   ...notice.meta })`. Object spread of `null` and of `undefined` both
    ///   yield `{}`, so the interpolation is identical either way.
    /// - The model is `shiranami-core`'s and is shared by every lane. A
    ///   serialization change there for a difference no consumer can observe is
    ///   not this lane's to make.
    ///
    /// Pinned so that it stays a decision rather than becoming a discovery.
    #[test]
    fn an_absent_meta_crosses_as_null_where_v1_omitted_the_key() {
        let (gate, webview) = gate();
        gate.emit(&discord_failure());

        assert_eq!(
            webview.delivered()[0].get("meta"),
            Some(&serde_json::Value::Null)
        );
    }

    /// The property the gate exists for, asserted at the boundary: Discord's
    /// reconnect backoff starts at five seconds, so an ungated path is a toast
    /// every five seconds. Only the first one reaches the webview.
    #[test]
    fn a_repeat_inside_the_cooldown_never_reaches_the_webview() {
        let (gate, webview) = gate();

        for _ in 0..5 {
            gate.emit(&discord_failure());
        }

        assert_eq!(webview.delivered().len(), 1);
    }

    /// Different subsystems are different notices even under one code, because
    /// the toast id is built from `source` *and* `code`.
    #[test]
    fn two_sources_are_never_deduplicated_against_each_other() {
        let (gate, webview) = gate();

        gate.emit(&SystemNotice::warn(SystemNoticeSource::Discord, "x"));
        gate.emit(&SystemNotice::warn(SystemNoticeSource::AlbumArt, "x"));

        assert_eq!(webview.delivered().len(), 2);
    }

    /// v1 reset the Discord notice on `ready` and on a deliberate disconnect, so
    /// a subsystem that recovers does not have to wait out a window it earned
    /// before the problem was fixed.
    #[test]
    fn a_recovered_subsystem_can_report_its_next_failure_at_once() {
        let (gate, webview) = gate();
        gate.emit(&discord_failure());
        gate.emit(&discord_failure());

        recovered(
            &gate,
            SystemNoticeSource::Discord,
            codes::DISCORD_LOGIN_FAILED,
        );
        gate.emit(&discord_failure());

        assert_eq!(webview.delivered().len(), 2);
    }

    /// The channel, read off the derive rather than restated — the attribute is
    /// what decides where this lands, and without it the derive would kebab-case
    /// the struct name into `system-notice-emitted`, which nothing listens on.
    #[test]
    fn the_notice_goes_out_on_v1s_channel() {
        assert_eq!(
            <SystemNoticeEmitted as tauri_specta::Event>::NAME,
            "system:notice"
        );
    }

    /// The whole namespace, asserted rather than described: one channel, and it
    /// is an event. If a `system:*` invoke channel is ever found in v1, this is
    /// the test that has to change first.
    #[test]
    fn v1_declares_exactly_one_system_channel_and_it_is_an_event() {
        let mine: Vec<&str> = crate::events::ALL_EVENT_NAMES
            .iter()
            .copied()
            .filter(|name| name.starts_with("system:"))
            .collect();

        assert_eq!(mine, ["system:notice"]);
    }
}
