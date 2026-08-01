//! Tags and cover art: everything read from or written back to a media file.
//!
//! `shiranami-metadata` owns `lofty`-based tag reading and writing across
//! ID3/Vorbis/MP4 — replacing music-metadata, node-id3, flac-tagger and the
//! ffmpeg re-mux path in one dependency — plus the album-art pipeline:
//! extract, resize to 512 px longest edge, encode JPEG q85, content-address by
//! hash, cache, and prune orphans. v2 has exactly one art pipeline, unlike
//! v1's split between the main process and the scan utility. It also owns the
//! iTunes lookup, title cleaning and the batched enrich flow.
//!
//! Ported in Phase 9. Byte-parity with v1's encoder is explicitly abandoned:
//! existing files are served by the hash already stored in `tracks.album_art`
//! and regenerated only when missing. See `docs/v2/architecture.md` §3.3 and
//! the [`art`] module docs, which carry the measured evidence.
//!
//! # Deliberate deviations from v1
//!
//! Four, each recorded at its call site and summarised here because a reviewer
//! comparing this crate to `apps/desktop/src/main` will notice them:
//!
//! 1. **Every tag write is atomic.** v1 wrote mp3 and flac tags by reading the
//!    whole file into memory and overwriting the original path in place, with
//!    no temp file and no backup — a crash or a full disk mid-write left a
//!    truncated audio file. Only the ffmpeg branch used temp-and-rename. v2
//!    routes every format through [`write::write_tags`], which copies to a
//!    sibling temp, tags the copy, and renames.
//! 2. **`.wav` is writable.** v1 read WAV but silently dropped writes to it
//!    while still answering `success: true` and committing the database row, so
//!    the file and the library disagreed permanently. `lofty` writes ID3v2 into
//!    RIFF, so the divergence is simply fixed.
//! 3. **Foreign tags survive a write.** v1's FLAC path rebuilt the Vorbis
//!    comment block from the fields it knew, erasing `REPLAYGAIN_*`,
//!    `MUSICBRAINZ_*`, `COMPOSER` and every custom key. `lofty` read-modify-
//!    writes, so they are preserved.
//! 4. **Failures are reported.** v1 swallowed every per-format write failure
//!    and logged it. This crate returns `Result`; the command layer decides
//!    what the renderer sees. See [`error`].
//!
//! Deviations 1–3 are strictly safer than what they replace and cannot damage
//! existing data. Deviation 4 changes an observable contract, so the Phase 14
//! command for `metadata:write-tags` is what has to preserve v1's
//! "`success: true` means the request was processed" wire shape, not this crate.

// Every item here is either renderer-visible contract or a ported guard. An
// undocumented one is a contract nobody can read, so the crate gates on it.
#![warn(missing_docs)]

pub mod art;
pub mod enrich;
pub mod error;
pub mod lookup;
pub mod read;
pub mod write;

pub use error::{ENRICH_BUSY_CODE, MetadataError, Result};
pub use read::{read_metadata, read_metadata_or_placeholder};
// re-exports restored once write lands
