//! Process-wide infrastructure the composition root installs before anything
//! else can use it.
//!
//! Three modules, in the order §2.8 runs them: [`platform`] hydrates the login
//! `PATH` while the process is still single-threaded, [`logging`] installs the
//! subscriber every crate has been writing to since Phase 2, and [`sentry`]
//! decides whether crash reporting exists at all.
//!
//! None of this is reachable from a command. A crate that wanted to configure
//! logging or read a consent flag would be reaching past the layer that owns
//! boot, which is what `rust-layer-rank` exists to stop.

pub mod logging;
pub mod platform;
pub mod sentry;
