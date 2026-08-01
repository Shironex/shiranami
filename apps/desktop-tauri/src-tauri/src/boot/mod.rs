//! The boot sequence §2.8 orders, and the instruments that watch it.
//!
//! [`timer`] stamps each stage; [`services`] constructs everything
//! `crate::state::Deferred` names; [`sequence`] runs them in the documented
//! order; [`reconcile`] starts the work step 6 puts *off* the setup hook.

pub mod reconcile;
pub mod sequence;
pub mod services;
pub mod timer;
