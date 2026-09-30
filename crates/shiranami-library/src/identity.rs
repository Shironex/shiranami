//! Content identity: the key that lets a track row follow its file across a
//! move or a rename.
//!
//! Until this module existed, a track's identity was its absolute path and
//! nothing else, so a moved file was an insert at the new path plus a hard
//! delete at the old one, and the delete cascaded away the play count, the
//! favourite flag, playlist membership, play history and every analysis value
//! keyed on the old id (see the crate docs, and `tests/reconciliation.rs`,
//! which used to pin that loss and now pins its absence).
//!
//! # What is hashed: the audio payload, sampled
//!
//! The in-app tag editor rewrites the files it edits, so hashing whole files
//! would make every retagged track a stranger to its own row. [`payload`]
//! finds the byte range that carries the audio (skipping ID3v2/ID3v1/APEv2 on
//! MPEG, FLAC metadata blocks, non-`data` RIFF chunks, and everything outside
//! `mdat` in MP4), and only that range is hashed.
//!
//! Reading the whole range would make a backfill of a large library read the
//! whole library: 5,000 tracks at 8 MB is 40 GB of I/O before the first move
//! can be matched. So the hash is **sampled**: the payload length plus
//! [`WINDOWS`] windows of [`WINDOW`] bytes each, spread evenly from the first
//! byte of the payload to the last (a payload no longer than the windows put
//! together is hashed whole). That is at most 320 KiB per file whatever its
//! size, and the measured cost is in the lane report and reproducible with
//! `cargo run -p shiranami-library --release --example identity_bench`.
//!
//! # Collision risk, and why it is acceptable here
//!
//! Two files collide only if their payloads have the same length to the byte
//! *and* agree on all five windows. Compressed audio does not do that by
//! accident: any change to the signal changes the encoded frames around it, so
//! two different recordings, two encodes of one recording, or two bitrates all
//! differ in every window. The residual case is two encodes that are identical
//! except for a region that falls entirely between windows, such as a clean and
//! an explicit edit whose only difference is a mid-song bleep, or two files of
//! digital silence.
//!
//! A collision can only do one thing: during a **rescan** (the one flow that
//! opts in to following moves), re-point a row whose file has moved away at a
//! new file that hashed the same. "Moved away" is [`moved_away`]: the file is
//! definitely not found (any stat error counts as "not moved"), its volume
//! and registered music folder definitely exist and list a real entry (OS
//! droppings such as `.DS_Store` do not count), and so does its nearest
//! existing ancestor directory. That rules out an unmounted drive, a share
//! answering with errors, and a leftover mount point (empty or holding only
//! droppings) whether at a volume root or nested inside a watched folder. It
//! also, by the same token, does not follow files moved out of a folder left
//! empty. What it cannot rule out, and accepts, is storage that answers "not
//! found" definitively for a file that still exists elsewhere under the same
//! path: Windows Offline Files, a different drive taking the same letter, two
//! FAT sticks with the same label. The module docs in `identity/gone.rs` list
//! these by name. Such a row is one the rescan's validate step deletes on its
//! next pass over that folder. Nothing
//! is deleted by a match and no file is touched, so the worst case of a
//! collision is history attributed to the sibling edit rather than destroyed.
//! Every other import (adding a folder, a download, a share) inserts plainly
//! and never re-points.
//!
//! # The stored value names its scheme
//!
//! A hash is stored as `"<scheme>:<hex sha256>"` ([`SCHEME`]). If the sampling
//! ever changes, a new scheme prefix makes old and new values unequal by
//! construction rather than silently comparable, and a backfill can re-hash the
//! rows still carrying the old prefix. Acoustic fingerprints (for cross-format
//! duplicate finding) are a different primitive with a fuzzy comparison and
//! belong in a column of their own, not in this one.

mod gone;
mod payload;

pub use gone::{
    Filesystem, MovedAway, Probe, is_os_dropping, moved_away, moved_away_all, volume_root,
};

use std::fs::File;
use std::io;
use std::path::Path;

use rayon::prelude::*;
use sha2::{Digest, Sha256};

/// The scheme prefix of every hash this build produces.
///
/// `a1`: audio-payload range ([`payload`]), payload length, five 64 KiB windows.
pub const SCHEME: &str = "a1";

/// Bytes per sampled window.
///
/// 64 KiB is about 1.6 s of a 320 kbps MP3 and about 0.4 s of CD-quality PCM:
/// long enough that the window is dominated by encoded signal rather than
/// frame headers, short enough that five of them are one small read each.
pub const WINDOW: u64 = 64 * 1024;

/// Windows per payload: first, last, and three evenly between.
pub const WINDOWS: u64 = 5;

/// A domain tag hashed ahead of everything else, so a content hash can never
/// equal a sha256 this app computes for any other purpose (art cache names,
/// peaks cache keys).
const DOMAIN: &[u8] = b"shiranami/content-identity\0";

/// The content identity of the file at `path`.
///
/// Fails only when the file cannot be opened or read. Unrecognised or
/// malformed containers are hashed over the whole file (see [`payload`]).
pub fn content_hash(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let range = payload::audio_range(&mut file, len)?;

    let mut hasher = Sha256::new();
    hasher.update(DOMAIN);
    hasher.update(SCHEME.as_bytes());
    let payload_len = range.end - range.start;
    hasher.update(payload_len.to_le_bytes());

    let mut buf = vec![0u8; usize::try_from(WINDOW).unwrap_or(usize::MAX)];
    if payload_len <= WINDOW * WINDOWS {
        let mut at = range.start;
        while at < range.end {
            let want = usize::try_from((range.end - at).min(WINDOW)).unwrap_or(buf.len());
            let got = payload::read_at(&mut file, at, &mut buf[..want])?;
            if got == 0 {
                break;
            }
            hasher.update(&buf[..got]);
            at += got as u64;
        }
    } else {
        let span = payload_len - WINDOW;
        for index in 0..WINDOWS {
            let at = range.start + span * index / (WINDOWS - 1);
            let got = payload::read_at(&mut file, at, &mut buf)?;
            hasher.update(&buf[..got]);
        }
    }

    Ok(format!("{SCHEME}:{:x}", hasher.finalize()))
}

/// [`content_hash`] for many paths, in input order, in parallel.
///
/// A file that cannot be read is `None` rather than an error: it simply cannot
/// be matched, which is the same outcome as a track that was never hashed.
/// Runs on rayon's global pool, the same arrangement as
/// [`crate::validate_files`]: a batch finishes in seconds, unlike a scan, so
/// it does not warrant a private pool.
pub fn content_hashes<P: AsRef<Path> + Sync>(paths: &[P]) -> Vec<Option<String>> {
    paths
        .par_iter()
        .map(|path| match content_hash(path.as_ref()) {
            Ok(hash) => Some(hash),
            Err(error) => {
                tracing::debug!(%error, path = %path.as_ref().display(), "could not hash a track");
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
