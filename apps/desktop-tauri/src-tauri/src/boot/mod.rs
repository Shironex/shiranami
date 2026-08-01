//! The boot sequence §2.8 orders, and the instruments that watch it.
//!
//! [`timer`] stamps each stage; [`services`] constructs everything
//! `crate::state::Deferred` names; [`sequence`] runs them in the documented
//! order and is the only caller of the other two.

pub mod sequence;
pub mod services;
pub mod timer;
