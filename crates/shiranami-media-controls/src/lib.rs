//! Native OS media integration, because the webview's cannot be used.
//!
//! `shiranami-media-controls` owns `souvlaki`-backed SMTC on Windows and
//! `MPNowPlayingInfoCenter` on macOS, plus the remote-command handlers that
//! make hardware media keys work. `navigator.mediaSession` is not an option:
//! an embedded WKWebView never bridges it to macOS at all, and on Windows it
//! renders the app as "Microsoft Edge WebView2" (WebView2Feedback#2236,
//! unresolved since 2022). The webview session is therefore suppressed and
//! this crate is the only publisher of now-playing state to the OS.
//!
//! Ported in Phase 13; exactly one OS entry must appear. See
//! `docs/v2/architecture.md` §2.7.
//!
//! # Shape
//!
//! Everything that can be tested without a desktop is, and the part that cannot
//! is one trait wide:
//!
//! | Module | What it owns |
//! | ------ | ------------ |
//! | [`state`] | v1's `MediaPlaybackState`, and what "nothing is playing" means |
//! | [`os`] | that state as the OS wants it — the ported `setPositionState` guards live here |
//! | [`command`] | OS events in, v1's `media:command` vocabulary out |
//! | [`backend`] | **the seam** — `MediaControlsBackend`, and the null implementation |

// Every item here is either a ported guard or a contract the shell wires to. An
// undocumented one is a contract nobody can read, so this crate gates on
// documentation the way `shiranami-core` and `shiranami-serve` do.
#![warn(missing_docs)]

pub mod backend;
pub mod command;
pub mod error;
pub mod os;
pub mod state;

#[cfg(test)]
mod fake;

pub use backend::{CommandSink, MediaControlsBackend, NullBackend};
pub use command::{MediaCommand, RemoteEvent, SeekDirection};
pub use error::{MediaControlsError, Result};
pub use os::{OsMetadata, OsPlayback};
pub use state::{MediaState, NowPlaying};
