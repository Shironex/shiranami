//! Scrobbling to Last.fm and ListenBrainz.
//!
//! Opt-in, main-process only. On the local play event — computed in the
//! renderer at ~30 s or 50 % and recorded through `db:history:record-play` —
//! the history handler calls [`Scrobbler::submit_play`], which submits a
//! now-playing ping and a scrobble to each connected backend. Nothing here is
//! ever awaited on the playback path and every failure is caught: a submission
//! that fails is parked in the retry queue and replayed later with exponential
//! backoff.
//!
//! The secrets — the Last.fm session key and the ListenBrainz token — live in
//! the main-only `scrobble.settings` store key and never round-trip to the
//! renderer, which reads back only a `ScrobbleStatus` of booleans, a display
//! name and a pending count.
//!
//! # What changed from v1
//!
//! One thing, and it is the point of the phase: **the retry queue is
//! persisted**. v1 held it in a process-memory array, so quitting the app threw
//! away every play that had not landed — precisely the plays a user cares about
//! after a spell offline. The state machine over it is unchanged and lives in
//! `shiranami_db::repo::scrobble_queue`; see that module for the transitions
//! and the one latent duplicate-submission bug the primary key closes.
//!
//! Two smaller shape changes, both forced by the layer this crate sits at:
//! opening the browser for Last.fm's desktop auth is the composition root's job
//! now (see [`lastfm::LastfmAuthStarted`]), and the flush timer belongs to the
//! composition root too, so nothing here holds a runtime handle.

pub mod error;
pub mod lastfm;
pub mod listenbrainz;
pub mod play;
pub mod service;
pub mod settings;
pub mod sign;

pub use crate::clock::now_ms;
pub use error::{Result, ScrobbleError};
pub use lastfm::{LastfmAuthStarted, LastfmClient, LastfmCredentials};
pub use listenbrainz::{ListenBrainzClient, ListenType, listen_body};
pub use play::{ScrobblePlay, play_start_timestamp};
pub use service::{FLUSH_INTERVAL_SECS, Scrobbler, park};
pub use settings::{active_targets, status};
