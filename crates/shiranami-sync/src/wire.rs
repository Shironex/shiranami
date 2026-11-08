//! The phone-facing contract: every request and response body of `/v1/sync`.
//!
//! These types are emitted to `packages/contracts/src/generated/sync.ts` and
//! re-exported as `@shiranami/contracts/sync`, a subpath with no Tauri import,
//! so the Android client compiles against exactly what this crate serialises.
//! `shiranami_desktop_lib::bindings` does the writing, inside the same
//! `cargo test` the drift guard runs; this module declares the vocabulary
//! ([`types`]) and renders it ([`render`]).
//!
//! The vocabulary is self-contained on purpose: nothing here references a type
//! from `shiranami-core`, so the second generated file never carries a second
//! copy of a model `bindings.ts` already declares.
//!
//! Integers that can exceed 2^31 (byte sizes, epoch milliseconds) are `u64` or
//! `i64` in Rust and plain `number` on the wire; a JavaScript `number` holds
//! every value below 2^53 exactly, which is 8 PiB of audio.

use serde::{Deserialize, Serialize};
use specta::{Type, Types};
use specta_typescript::{Number, Typescript};

/// The protocol version this build speaks: the `v=` in the pairing link,
/// `protocolVersion` in the pair and hello bodies, and the mDNS TXT `v`.
///
/// 2 added the X25519 exchange to pairing. The route paths keep their `/v1/`
/// prefix: that versions the REST surface, which did not change.
pub const PROTOCOL_VERSION: u32 = 2;

/// The oldest protocol version this build still answers. Version 1 pairing
/// (device secret from the QR alone) never shipped and is not accepted.
pub const MIN_PROTOCOL_VERSION: u32 = 2;

/// What a desktop build can serve. A client checks for a capability rather
/// than comparing app versions, so a later build can add one without a
/// protocol bump.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SyncCapability {
    /// `GET /v1/sync/manifest`, paged.
    Manifest,
    /// `GET /v1/sync/playlists`.
    Playlists,
    /// `GET /v1/sync/favorites`.
    Favorites,
    /// `GET /v1/sync/history`, paged.
    History,
    /// `GET /v1/sync/art/{hash}`.
    Artwork,
    /// `GET /v1/sync/tracks/{id}/audio` with `Range` and `If-Range`.
    AudioRange,
}

/// `POST /v1/sync/pair` body. The only unsigned request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    /// The `t=` value from the pairing link.
    pub nonce: String,
    /// What the desktop shows in its Allow / Deny prompt ("Pixel 8").
    pub device_name: String,
    /// `android` or `ios`; free text, at most 32 characters.
    pub platform: String,
    /// The phone's ephemeral X25519 public key, 32 bytes base64url without
    /// padding. Generated for this pairing only.
    pub public_key: String,
    /// Base64url `HMAC-SHA256(k, "shiranami-sync/v2/pair\n" + nonce + "\n" +
    /// deviceName + "\n" + platform + "\n" + publicKey)`, `k` being the
    /// decoded `k=` value. Covering the public key stops a sniffer from
    /// swapping in its own.
    pub proof: String,
}

/// `POST /v1/sync/pair` success body.
///
/// The device secret is never sent. Both sides derive it from the X25519
/// shared secret of the two ephemeral keys:
/// `HMAC-SHA256(key = X25519(own private, other public),
/// "shiranami-sync/v2/device-secret\n" + deviceId + "\n" + k + "\n" +
/// phonePublicKey + "\n" + desktopPublicKey)`, `k` being the `k=` text of
/// the link and the keys their base64url text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    /// Desktop-minted id for this phone, the `dev=` of every signed request.
    pub device_id: String,
    /// The desktop's ephemeral X25519 public key for this pairing, 32 bytes
    /// base64url without padding.
    pub public_key: String,
    /// Stable id of this desktop install.
    pub desktop_id: String,
    /// The desktop's display name.
    pub desktop_name: String,
    /// Stable id of the library being served (a later cloud relay keys on it).
    pub library_id: String,
    /// The protocol version the desktop speaks.
    pub protocol_version: u32,
    /// Desktop clock, unix seconds. A phone whose clock is off by more than
    /// the signature window can correct with it.
    #[specta(type = Number)]
    pub server_time: i64,
}

/// `GET /v1/sync/hello`: who the desktop is and what it can do.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncHello {
    /// The protocol version the desktop speaks.
    pub protocol_version: u32,
    /// The oldest version it still answers.
    pub min_protocol_version: u32,
    /// Stable id of this desktop install.
    pub desktop_id: String,
    /// The desktop's display name.
    pub desktop_name: String,
    /// Stable id of the library being served.
    pub library_id: String,
    /// Desktop app version, informational only.
    pub app_version: String,
    /// Desktop clock, unix seconds.
    #[specta(type = Number)]
    pub server_time: i64,
    /// The device id the request was signed with, echoed.
    pub device_id: String,
    /// What this build serves.
    pub capabilities: Vec<SyncCapability>,
    /// How many tracks the library holds right now.
    #[specta(type = Number)]
    pub track_count: i64,
}

/// One track in the manifest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ManifestTrack {
    /// Desktop track UUID. The sync id; the phone stores it verbatim.
    pub id: String,
    /// Title tag.
    pub title: String,
    /// Artist tag.
    pub artist: Option<String>,
    /// Album artist tag.
    pub album_artist: Option<String>,
    /// Album tag.
    pub album: Option<String>,
    /// Genre tag.
    pub genre: Option<String>,
    /// Year tag.
    pub year: Option<i32>,
    /// Track number tag.
    pub track_number: Option<i32>,
    /// Disc number tag.
    pub disc_number: Option<i32>,
    /// Length in seconds.
    pub duration: Option<f64>,
    /// `"<scheme>:<sha256>"` over the audio payload, stable across tag edits.
    /// `null` until the desktop has hashed the file. Use it to match a track
    /// the phone already has.
    pub content_hash: Option<String>,
    /// Name for `GET /v1/sync/art/{hash}`, or `null` without cover art.
    pub artwork_hash: Option<String>,
    /// File size in bytes, `null` when the file is missing on the desktop.
    #[specta(type = Option<Number>)]
    pub size_bytes: Option<u64>,
    /// The audio route's `ETag` value without quotes (`<size>-<mtime>`), so a
    /// phone can tell a changed file from an unchanged one without a request.
    pub file_version: Option<String>,
    /// Lowercase file extension without the dot (`flac`, `mp3`).
    pub format: Option<String>,
    /// Whether the track is a favourite.
    pub is_favorite: bool,
    /// Desktop play count.
    pub play_count: i32,
    /// As stored on the desktop.
    pub created_at: String,
    /// As stored on the desktop.
    pub updated_at: String,
}

/// `GET /v1/sync/manifest?cursor=&limit=` body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryManifestPage {
    /// Stable id of the library being served.
    pub library_id: String,
    /// How many tracks the library holds right now.
    #[specta(type = Number)]
    pub track_count: i64,
    /// This page, in a stable order.
    pub tracks: Vec<ManifestTrack>,
    /// Opaque; pass back as `cursor` for the next page. `null` on the last.
    pub next_cursor: Option<String>,
    /// Whether another page follows.
    pub has_more: bool,
}

/// One playlist with its tracks in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlaylist {
    /// Playlist UUID.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// Name for `GET /v1/sync/art/{hash}`, or `null`.
    pub artwork_hash: Option<String>,
    /// As stored on the desktop.
    pub created_at: String,
    /// As stored on the desktop.
    pub updated_at: String,
    /// Track ids in playlist order.
    pub track_ids: Vec<String>,
}

/// `GET /v1/sync/playlists` body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistsSnapshot {
    /// Every manual playlist, newest first. Smart playlists are not synced in
    /// v0.
    pub playlists: Vec<SyncPlaylist>,
}

/// `GET /v1/sync/favorites` body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoritesSnapshot {
    /// Ids of every favourite track.
    pub track_ids: Vec<String>,
}

/// One play.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    /// Row UUID; history is an append-only union by this id.
    pub id: String,
    /// The track played.
    pub track_id: String,
    /// ISO-8601 timestamp, as stored.
    pub played_at: String,
    /// Seconds actually heard.
    pub played_seconds: f64,
    /// Fraction of the track heard, 0 to 1.
    pub completion_ratio: f64,
    /// Whether the play counted as complete.
    pub completed: bool,
    /// Where playback started (`library`, `playlist`, ...).
    pub source: String,
}

/// `GET /v1/sync/history?cursor=&limit=` body, oldest play first.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    /// This page.
    pub entries: Vec<HistoryEntry>,
    /// Opaque; pass back as `cursor`. `null` on the last page.
    pub next_cursor: Option<String>,
    /// Whether another page follows.
    pub has_more: bool,
}

/// Machine-readable error codes. A 404 with an empty body is deliberately not
/// in this list: an unknown device, a bad signature, a stale timestamp and a
/// reused nonce all answer 404 with no body, so a prober learns nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SyncErrorCode {
    /// The request was malformed.
    BadRequest,
    /// No pairing window is open, or it expired or was closed.
    PairingClosed,
    /// Another phone is waiting for the desktop user's answer.
    PairingBusy,
    /// The desktop user pressed Deny.
    PairingDenied,
    /// Nobody answered the desktop prompt in time.
    PairingTimeout,
    /// Too many requests; honour `Retry-After`.
    RateLimited,
    /// Too many audio downloads at once for this device.
    TooManyStreams,
    /// The `Range` cannot be satisfied for this file.
    RangeNotSatisfiable,
    /// Something failed on the desktop.
    Internal,
}

/// Body of every non-404 error response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncErrorBody {
    /// What went wrong, for the client to branch on.
    pub error: SyncErrorCode,
    /// English detail for logs, never for display.
    pub message: String,
}

/// Every phone-facing type, in the order the generated file declares them.
pub fn types() -> Types {
    Types::default()
        .register::<SyncCapability>()
        .register::<PairRequest>()
        .register::<PairResponse>()
        .register::<SyncHello>()
        .register::<ManifestTrack>()
        .register::<LibraryManifestPage>()
        .register::<SyncPlaylist>()
        .register::<PlaylistsSnapshot>()
        .register::<FavoritesSnapshot>()
        .register::<HistoryEntry>()
        .register::<HistoryPage>()
        .register::<SyncErrorCode>()
        .register::<SyncErrorBody>()
}

/// Render [`types`] to TypeScript with `header` on top.
///
/// # Errors
///
/// The exporter's error when a type cannot be represented.
pub fn render(header: &str) -> Result<String, specta_typescript::Error> {
    Typescript::default()
        .header(header.to_owned())
        .export(&types(), specta_serde::Format)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendering_is_deterministic() {
        assert_eq!(render("").expect("render"), render("").expect("render"));
    }

    #[test]
    fn the_contract_is_camel_case_and_tauri_free() {
        let ts = render("").expect("render");
        assert!(ts.contains("deviceName: string"), "{ts}");
        assert!(ts.contains("nextCursor: string | null"));
        assert!(ts.contains("sizeBytes: number | null"));
        assert!(ts.contains(r#""audio-range""#));
        assert!(ts.contains(r#""pairing_denied""#));
        assert!(
            !ts.contains("@tauri-apps"),
            "the phone contract must not import Tauri"
        );
    }
}
