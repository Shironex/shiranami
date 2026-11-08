//! LAN sync v0: pair a phone by QR, then let it copy the library.
//!
//! A separate, opt-in HTTP listener on the machine's private LAN addresses,
//! advertised as `_shiranami._tcp` while it runs. It is never the loopback
//! server (`shiranami-serve`), whose security rests on binding `127.0.0.1`;
//! it borrows that crate's Range parser, extension allowlist and chunked file
//! streaming, and nothing else.
//!
//! v0 is one way, desktop to phone: the phone reads a manifest, playlists,
//! favourites and history, and downloads art and audio with resumable Range
//! requests. Every request after pairing is HMAC-signed with a per-device key
//! derived from the QR secret ([`auth`]). See `README.md` in this crate for the
//! protocol, and `docs/research/mobile-2026-11/lan-sync.md` for the design.

#![warn(missing_docs)]

pub mod auth;
pub mod devices;
pub mod error;
pub mod listen;
pub mod mdns;
pub mod net;
pub mod pairing;
pub mod rate;
mod routes;
pub mod server;
pub mod status;
mod streams;
pub mod wire;

pub use error::SyncError;
pub use pairing::{PAIRING_TTL, PairingLink};
pub use server::{
    BindPolicy, ChangeObserver, PoolSource, StartError, SyncConfig, SyncServer, identity, start,
};
pub use status::{SyncDevice, SyncPairingTicket, SyncPendingPair, SyncStatus, SyncTransfer};
