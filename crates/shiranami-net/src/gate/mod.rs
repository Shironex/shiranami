//! Per-host rate gates: the spacing table and the serialising gate itself.

pub mod hosts;
pub mod min_interval;

pub use hosts::{HOST_GATES, HostGates};
pub use min_interval::MinIntervalGate;
