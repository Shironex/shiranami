//! System notices: the wire types and the 5-minute per-`source:code` gate.

pub mod gate;
pub mod types;

pub use gate::{DEFAULT_COOLDOWN, NoticeGate, NoticeSink};
pub use types::{NoticeMetaValue, SystemNotice, SystemNoticeLevel, SystemNoticeSource, codes};
