//! The Discord IPC socket, behind a trait.
//!
//! `discord-rich-presence` (Appendix B) speaks to Discord over a Unix domain
//! socket on macOS and a named pipe on Windows, and every one of its calls
//! **blocks**. Two consequences shape this module:
//!
//! 1. the service runs each call inside `spawn_blocking`, never on a runtime
//!    worker — a blocking connect against a Discord that is starting up would
//!    otherwise stall unrelated tasks;
//! 2. the trait exists so the reconnect state machine can be tested with no
//!    Discord running. Every failure this code exists to handle — Discord
//!    absent, the socket dropping mid-session, a handshake refused — is
//!    impossible to produce on demand against the real thing.
//!
//! # The one behavioural difference from v1
//!
//! v1's `@xhayper/discord-rpc` client emitted a `disconnected` event, and v1
//! scheduled its reconnect from that event. `discord-rich-presence` has no
//! event surface at all: a dropped socket is discovered when the next write
//! fails. So a drop is detected on the next presence update rather than
//! immediately — which, for a presence card, is the same thing to a user, since
//! there is nothing to show between updates anyway.

use std::fmt;

use discord_rich_presence::{DiscordIpc, DiscordIpcClient, activity};

use crate::discord::payload::PresencePayload;

/// A connection to Discord that can carry a presence card.
///
/// Blocking by nature; the service wraps every call in `spawn_blocking`.
pub trait PresenceSocket: Send + 'static {
    /// Open the socket and complete the handshake.
    ///
    /// # Errors
    ///
    /// Returns a description of the failure. "Discord is not running" and a
    /// refused handshake are both errors here and are deliberately not
    /// distinguished: v1 could not tell them apart either, which is why it
    /// logged the error rather than classifying it.
    fn connect(&mut self) -> Result<(), SocketError>;

    /// Show `payload` on the user's profile.
    ///
    /// # Errors
    ///
    /// Returns a description of the failure. A write failure is how a dropped
    /// socket is discovered.
    fn set_activity(&mut self, payload: &PresencePayload) -> Result<(), SocketError>;

    /// Take the presence card down, leaving the socket open.
    ///
    /// # Errors
    ///
    /// Returns a description of the failure.
    fn clear_activity(&mut self) -> Result<(), SocketError>;

    /// Close the socket.
    ///
    /// # Errors
    ///
    /// Returns a description of the failure.
    fn close(&mut self) -> Result<(), SocketError>;
}

/// Something went wrong on the socket.
///
/// A message rather than a taxonomy, because nothing branches on it: v1 logged
/// the error and backed off, whatever it was.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct SocketError(pub String);

impl SocketError {
    /// Wrap any error as a socket failure.
    pub fn from_source(source: &dyn fmt::Display) -> Self {
        Self(source.to_string())
    }
}

/// The real socket, over `discord-rich-presence`.
pub struct DiscordIpcSocket {
    client: DiscordIpcClient,
}

impl DiscordIpcSocket {
    /// A socket for the given Discord application.
    pub fn new(client_id: &str) -> Self {
        Self {
            client: DiscordIpcClient::new(client_id),
        }
    }
}

impl PresenceSocket for DiscordIpcSocket {
    fn connect(&mut self) -> Result<(), SocketError> {
        self.client
            .connect()
            .map_err(|source| SocketError::from_source(&source))
    }

    fn set_activity(&mut self, payload: &PresencePayload) -> Result<(), SocketError> {
        let buttons: Vec<activity::Button<'_>> = payload
            .buttons
            .iter()
            .map(|button| activity::Button::new(button.label.as_str(), button.url.as_str()))
            .collect();

        let mut card = activity::Activity::new();
        if let Some(details) = payload.details.as_deref() {
            card = card.details(details);
        }
        if let Some(state) = payload.state.as_deref() {
            card = card.state(state);
        }
        if let Some(key) = payload.large_image_key.as_deref() {
            let mut assets = activity::Assets::new().large_image(key);
            if let Some(text) = payload.large_image_text.as_deref() {
                assets = assets.large_text(text);
            }
            card = card.assets(assets);
        }
        if let Some(end) = payload.end_timestamp_ms {
            // Milliseconds, as the crate's `Timestamps` documents and as v1's
            // client sent after calling `getTime()` on a `Date`.
            card = card.timestamps(activity::Timestamps::new().end(end));
        }
        if !buttons.is_empty() {
            card = card.buttons(buttons);
        }

        self.client
            .set_activity(card)
            .map_err(|source| SocketError::from_source(&source))
    }

    fn clear_activity(&mut self) -> Result<(), SocketError> {
        self.client
            .clear_activity()
            .map_err(|source| SocketError::from_source(&source))
    }

    fn close(&mut self) -> Result<(), SocketError> {
        self.client
            .close()
            .map_err(|source| SocketError::from_source(&source))
    }
}
