//! Batched metadata enrichment.
//!
//! Ported from `services/metadata-enrich-batch.ts` and the handler state in
//! `ipc/metadata-enrich.ts`: the field-selection rules ([`fields`]), the
//! one-run-at-a-time slot ([`slot`]), and the four-wide run itself ([`batch`]).

pub mod batch;
pub mod fields;
pub mod model;
pub mod slot;

pub use batch::{ENRICH_CONCURRENCY, EnrichContext, enrich_tracks};
pub use fields::{compute_updated_fields, needs_cover};
pub use model::{
    EnrichMode, EnrichOptions, EnrichProgress, EnrichStatus, EnrichTrackInput, EnrichTrackResult,
    EnrichUpdatedFields,
};
pub use slot::{EnrichGuard, EnrichSlot};
