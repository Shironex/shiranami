//! The harness the integration tests share.
//!
//! A manifest: the server fixture lives in [`harness`], the canned DNS and
//! network in [`fakes`]. Both are re-exported so a test writes `common::Harness`
//! rather than naming the split.

// A shared test module is compiled into each test binary separately, so every
// binary sees the parts it does not use as dead, every `pub` here as
// unreachable, and the re-exports it happens not to need as unused. All three
// are artefacts of `mod common;`, not of the code.
#![allow(dead_code, unreachable_pub, unused_imports)]

pub mod fakes;
pub mod harness;

pub use fakes::{FakeUpstream, Reply, ReplyBody, TestResolver};
pub use harness::{Harness, encode, pattern};
