//! ICY (SHOUTcast/Icecast) stream metadata: asking for it, and getting it back
//! out of the audio.
//!
//! v1 declined metadata outright — `icy-metadata: 0`, with a comment saying so
//! — because a proxy that asks for it and then forwards the body verbatim
//! splices frame bytes into the decoder's input. That was the right call for a
//! proxy that had nothing to do with a title; it is the wrong one for an app
//! that wants to show what is playing. This module is the missing half.
//!
//! Three pieces, in the order the bytes meet them:
//!
//! - [`deframe`] — the state machine that separates audio from metadata blocks.
//!   Owns the invariant that matters: the audio out is byte-for-byte the audio
//!   in.
//! - [`title`] — turning one block's bytes into a `StreamTitle`, leniently
//!   enough that no real-world station can make it fail.
//! - [`sink`] — where a parsed title goes, without this crate knowing what a
//!   renderer is.
//!
//! The period itself comes off the response head:
//! [`crate::upstream::UpstreamHead::metaint`] reads `icy-metaint`, and a
//! response without one is not de-framed at all.

pub mod deframe;
pub mod sink;
pub mod title;

pub use deframe::{Deframer, Frame};
pub use sink::NowPlayingSink;
