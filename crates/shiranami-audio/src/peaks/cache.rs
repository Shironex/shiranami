//! The on-disk waveform cache, in v1's format because v1's files are kept.
//!
//! Architecture §3.3: *"The waveform peaks cache survives verbatim. Its key is
//! `sha256(path|mtime|size)[0..32]` — encoder-independent. Copy
//! `waveform-peaks/` and reuse it."* First-run continuity copies the directory
//! into the v2 profile, so every function here is pinned by what
//! `apps/desktop/src/main/shared/waveform-cache.ts` wrote, not by what would be
//! natural in Rust:
//!
//! * one file per track, named `<key>.json`;
//! * UTF-8 JSON, `{"peaks":[…]}` — no magic bytes, no header, no version field,
//!   no endianness to get wrong;
//! * created with "fail if exists", because the name is content-addressed: a
//!   second writer racing on the same key is writing the same bytes, and losing
//!   that race is a no-op rather than a torn file;
//! * unreadable or malformed is a cache **miss**, never an error — a corrupt
//!   file costs one re-decode, and v1's reader was equally forgiving.
//!
//! # Number formatting
//!
//! v1 wrote the JSON from JavaScript, where the `Float32Array` the addon
//! returned had already widened to `f64`. Writing `f64::from(peak)` with Rust's
//! `Display` reproduces `JSON.stringify`'s output byte for byte across the
//! entire realistic range — both emit the shortest decimal that round-trips,
//! both print an integral value without a trailing `.0`. They diverge only for
//! magnitudes below `1e-6`, where JavaScript switches to exponent notation
//! (`1e-7`) and Rust does not (`0.0000001`). Both parse back to the identical
//! `f32`, and a peak that small is 145 dB below full scale.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::error::{AudioError, Result};

/// Hex characters of the SHA-256 digest that name a cache file.
///
/// v1's `.digest('hex').slice(0, 32)` — 128 bits. Truncation is deliberate and
/// matches the album-art cache convention; this is a cache key, not a security
/// boundary.
const KEY_HEX_LEN: usize = 32;

/// The cache key for a track, byte-compatible with v1's `hashTrackKey`.
///
/// `path` must be the path **exactly as the caller received it** — v1 hashed
/// the string that arrived over IPC with no normalisation, no case folding and
/// no `realpath`, so normalising here would silently orphan every existing
/// entry. `mtime_ms` is the modification time in **milliseconds**, rounded the
/// way JavaScript's `Math.round` rounds (half toward positive infinity), and
/// `size` is the file size in bytes.
///
/// Identity is `path + mtime + size` rather than content, so re-encoding a file
/// in place produces a different key and a fresh waveform; stale peaks never
/// survive an edit.
#[must_use]
pub fn cache_key(path: &str, mtime_ms: f64, size: u64) -> String {
    let mtime = js_round(mtime_ms);
    let mut hasher = Sha256::new();
    hasher.update(format!("{path}|{mtime}|{size}").as_bytes());

    let digest = hasher.finalize();
    let mut key = String::with_capacity(KEY_HEX_LEN);
    for byte in digest.iter().take(KEY_HEX_LEN / 2) {
        key.push_str(&format!("{byte:02x}"));
    }
    key
}

/// `Math.round` semantics: halves go toward positive infinity.
///
/// Rust's `f64::round` breaks halves *away from zero*, so `-0.5` would round to
/// `-1` here and to `0` in v1. Modification times are not negative, but the key
/// is a compatibility surface and a surprise in it costs the user their whole
/// waveform cache.
fn js_round(value: f64) -> i64 {
    (value + 0.5).floor() as i64
}

/// Absolute path of the cache file for `key` under `dir`.
#[must_use]
pub fn cache_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{key}.json"))
}

/// Read cached peaks, or `None` on a miss, an unreadable file or a malformed one.
///
/// The element-type check is not paranoia carried over for its own sake: v1's
/// reader guarded against a tampered file whose `peaks` array held strings,
/// which `Array.isArray` alone would have let through and broken the canvas.
#[must_use]
pub fn read_cached_peaks(dir: &Path, key: &str) -> Option<Vec<f32>> {
    let raw = fs::read_to_string(cache_path(dir, key)).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;

    parsed
        .get("peaks")?
        .as_array()?
        .iter()
        .map(|value| value.as_f64().map(|peak| peak as f32))
        .collect()
}

/// Write peaks for `key`, creating the cache directory if it is missing.
///
/// A file already at that name is left alone and reported as success: the key
/// is content-addressed, so whatever is there was written from the same input.
///
/// # Errors
///
/// [`AudioError::Io`] if the directory cannot be created or the file cannot be
/// written for any reason other than already existing.
pub fn write_cached_peaks(dir: &Path, key: &str, peaks: &[f32]) -> Result<()> {
    fs::create_dir_all(dir)
        .map_err(|source| AudioError::io("create the waveform cache directory", dir, source))?;

    let path = cache_path(dir, key);
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(mut file) => {
            use std::io::Write as _;
            file.write_all(encode_peaks(peaks).as_bytes())
                .map_err(|source| AudioError::io("write the waveform cache file", &path, source))
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(source) => Err(AudioError::io(
            "create the waveform cache file",
            &path,
            source,
        )),
    }
}

/// Serialise peaks into v1's exact document shape.
///
/// Hand-rolled rather than `serde_json`, for one reason: `serde_json` formats an
/// `f32` with `ryu`'s shortest-`f32` form (`0.1`), while v1 wrote the widened
/// `f64` (`0.10000000149011612`). Both parse back to the same `f32`, but only
/// one of them makes "the bytes match v1" a testable claim.
///
/// Non-finite peaks are written as `0`. They cannot come out of the reducer,
/// but a corrupt float source could carry an infinity into it, and JSON has no
/// spelling for one — v1 would have written `null` and then failed its own
/// element-type check on every subsequent read, permanently missing the cache.
fn encode_peaks(peaks: &[f32]) -> String {
    let mut out = String::with_capacity(peaks.len() * 8 + 12);
    out.push_str("{\"peaks\":[");
    for (index, peak) in peaks.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        let value = if peak.is_finite() {
            f64::from(*peak)
        } else {
            0.0
        };
        out.push_str(&format!("{value}"));
    }
    out.push_str("]}");
    out
}
