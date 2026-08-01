//! The album-art cache: extract, resize, encode, content-address, store, prune.
//!
//! # The one compatibility decision that matters here
//!
//! v1 content-addresses processed cover art: the cache filename is
//! `sha256(encoded_jpeg_bytes)[0..32] + '.jpg'`, and `tracks.album_art` stores
//! the URL built from it. Any encoder that is not the exact encoder v1 used
//! produces different bytes for the same source, hence a different hash, hence
//! a filename that no existing database row points at.
//!
//! Architecture §3.3 (decision **D16**, risk **R14**) decides this outright, and
//! this crate implements that decision rather than re-litigating it:
//!
//! > do **not** attempt byte-parity with sharp/nativeImage, and do **not**
//! > rehash the cache. Copy `album-art/` as-is; existing files keep serving
//! > because the serve layer looks up by the hash already stored in
//! > `tracks.album_art`. Regeneration happens **only when the file is missing**.
//!
//! ## Why parity was never available, even in principle
//!
//! Porting the read of v1 turned up something stronger than "a different
//! encoder produces different bytes". **v1 has no single canonical output to be
//! byte-compatible with.** It ships *two* art pipelines that hash their own
//! results into the same directory:
//!
//! | | Where | Encoder |
//! |---|---|---|
//! | A | `art-protocol.ts` `downscaleImage`, main process | Electron `nativeImage` → Chromium/Skia JPEG |
//! | B | `album-art-image.ts` `downscaleAndHash`, scan utility | `sharp` → libvips/libjpeg-turbo |
//!
//! They agree on geometry (512 px longest edge), on nominal quality (85), on
//! the hash construction and on the URL shape — every part of the contract this
//! module reproduces exactly. They cannot agree on bytes, because Skia and
//! libjpeg-turbo are different encoders. B exists only because `nativeImage` is
//! unavailable inside an Electron `utilityProcess`.
//!
//! So in v1 today, the same cover already lands under two different hashes
//! depending on whether the track arrived through a library scan or through a
//! metadata write. "Match v1's bytes" has no well-defined target. The evidence
//! is measured rather than asserted: `scripts/verify-art-baseline.mjs` runs
//! v1's real sharp pipeline over committed source images and records the hashes
//! into `fixtures/v1-art.json`, and `tests/art_v1_compat.rs` proves against
//! that fixture that the scheme matches and the bytes do not.
//!
//! ## What that costs, precisely
//!
//! One thing: a cover already cached under v1 and *re-extracted* under v2 lands
//! in a second file. A few duplicated kilobytes, invisible to the user, and the
//! orphan prune reclaims the old entry once nothing points at it. Nothing
//! breaks, because:
//!
//! - existing rows keep their existing URLs and the files they name are copied
//!   across untouched by first-run continuity (§3.1 step 3);
//! - [`cache::save_cover`] writes create-exclusively, so an adopted entry is
//!   never rewritten;
//! - nothing in v2 rehashes, re-encodes or migrates the inherited directory.
//!
//! And a golden test (`tests/art_golden.rs`) pins `resize → encode → hash`
//! against a committed fixture, so the hash function can never drift *within*
//! v2 — which is the failure that would actually break users.

pub mod cache;
pub mod image;
pub mod prune;

#[cfg(test)]
pub(crate) mod tests_support;

pub use cache::{
    ART_DIR_NAME, ART_URL_PREFIX, HASH_LENGTH, art_dir, art_url_for, cache_path, file_name_for,
    file_name_from_url, hash_bytes, save_cover,
};
pub use image::{JPEG_QUALITY, MAX_DIMENSION, ProcessedArt, fit_inside, process_cover};
pub use prune::{
    ArtReferences, ArtReferencesError, ArtReferencesResult, PruneReport, prune_orphans,
};
