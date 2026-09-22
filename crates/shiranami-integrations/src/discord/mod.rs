//! Discord Rich Presence.
//!
//! Shows what the user is listening to on their Discord profile. Opt-in,
//! main-process only, and entirely off the playback path: the renderer's
//! now-playing updates land in memory and the socket work happens on a pump the
//! composition root drives.
//!
//! Ported in Phase 12 from `apps/desktop/src/main/integrations/discord-rpc.ts`
//! and its presence builder. Architecture §2.2 row 9 names the real work
//! correctly — *"the throttle/backoff state machine"* — which is why that part
//! is a type of its own with its own tests rather than the six file-scope
//! mutable bindings v1 threaded through as many functions.
//!
//! # The three things that will bite a reader comparing this to v1
//!
//! 1. **There is no `disconnected` event.** `@xhayper/discord-rpc` had one;
//!    `discord-rich-presence` (the crate Appendix B pins) has no event surface,
//!    so a dropped socket is discovered when the next write fails. See
//!    [`socket`].
//! 2. **There are no timers.** v1's reconnect and throttle `setTimeout`s become
//!    one `await` inside [`service::DiscordPresence::pump`]; the loop belongs to
//!    the composition root, so this crate never needs a runtime handle. See
//!    [`service`].
//! 3. **The socket is behind a trait.** Every failure worth testing — Discord
//!    absent, a mid-session drop, a refused handshake — is impossible to produce
//!    on demand against the real thing.

pub mod payload;
pub mod reconnect;
pub mod service;
pub mod settings;
pub mod socket;

pub use payload::{PresenceButton, PresencePayload, build_presence, resolve_activity_type};
pub use reconnect::{
    ConnectFailure, MIN_UPDATE_INTERVAL, RECONNECT_BASE, RECONNECT_MAX, ReconnectState,
    UpdateTiming,
};
pub use service::{DiscordPresence, Pump};
pub use socket::{DiscordIpcSocket, PresenceSocket, SocketError};
