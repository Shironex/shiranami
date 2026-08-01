//! Writing tags back to a media file.
//!
//! Ported from `apps/desktop/src/main/services/metadata-writer.ts`, which
//! needed node-id3, flac-tagger and an ffmpeg subprocess to cover the formats.
//! `lofty` covers all of them, which is what lets the write path become one
//! implementation with one safety story — see [`atomic`] for why that matters —
//! and [`tags`] for the per-format field mapping.

pub mod atomic;
pub mod options;
pub(crate) mod tags;

pub use atomic::write_tags;
pub use options::{FieldEdit, WriteOutcome, WriteTagsOptions};
