//! The desktop-facing shapes: what the "Sync with phone" settings section
//! reads. These cross the Tauri IPC boundary (they land in `bindings.ts`
//! through the `sync_*` commands), never the network, so they live apart from
//! [`crate::wire`].

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// A pairing window, as the desktop shows it: the QR payload and its expiry.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPairingTicket {
    /// The `shiranami://pair?...` link the QR code encodes. Carries the
    /// one-time pairing secret.
    pub deep_link: String,
    /// The addresses the link lists, for the "listening on" line.
    pub hosts: Vec<String>,
    /// The listener port.
    pub port: u16,
    /// When the window closes, epoch milliseconds.
    #[specta(type = Number)]
    pub expires_at: i64,
}

impl std::fmt::Debug for SyncPairingTicket {
    /// Redacted: the link holds the pairing secret.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SyncPairingTicket")
            .field("deep_link", &"<redacted>")
            .field("hosts", &self.hosts)
            .field("port", &self.port)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

/// A phone that has proven it scanned the QR and now waits for Allow / Deny.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPendingPair {
    /// Pass back to `sync_respond_pairing`.
    pub request_id: String,
    /// What the phone called itself.
    pub device_name: String,
    /// The phone's platform string.
    pub platform: String,
}

/// An audio file currently streaming to a phone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncTransfer {
    /// The receiving device.
    pub device_id: String,
    /// Its name.
    pub device_name: String,
    /// The track being sent.
    pub track_id: String,
    /// Its title.
    pub title: String,
}

/// The whole sync state the settings section renders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    /// Whether the LAN listener is up.
    pub running: bool,
    /// `ip:port` for each bound interface.
    pub addresses: Vec<String>,
    /// Whether `_shiranami._tcp` is being advertised.
    pub advertising: bool,
    /// The open pairing window, if any.
    pub pairing: Option<SyncPairingTicket>,
    /// Phones waiting for Allow / Deny.
    pub pending_pairs: Vec<SyncPendingPair>,
    /// Audio files streaming right now.
    pub transfers: Vec<SyncTransfer>,
}

impl SyncStatus {
    /// The state while sync is off.
    pub fn stopped() -> Self {
        Self {
            running: false,
            addresses: Vec::new(),
            advertising: false,
            pairing: None,
            pending_pairs: Vec::new(),
            transfers: Vec::new(),
        }
    }
}

/// A paired phone, without its secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncDevice {
    /// Desktop-minted id.
    pub device_id: String,
    /// What the phone called itself.
    pub name: String,
    /// The phone's platform string.
    pub platform: String,
    /// When pairing was allowed, ISO-8601.
    pub created_at: String,
    /// Last authenticated request, ISO-8601.
    pub last_seen_at: Option<String>,
}

impl From<shiranami_db::repo::sync::SyncPeer> for SyncDevice {
    fn from(peer: shiranami_db::repo::sync::SyncPeer) -> Self {
        Self {
            device_id: peer.device_id,
            name: peer.name,
            platform: peer.platform,
            created_at: peer.created_at,
            last_seen_at: peer.last_seen_at,
        }
    }
}
