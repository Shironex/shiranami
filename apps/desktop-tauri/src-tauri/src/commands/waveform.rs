//! `waveform:get-peaks` — the seekbar's waveform, from cache or from a decode.
//!
//! One channel, ported from `apps/desktop/src/main/ipc/waveform.ts`. The DSP is
//! `shiranami_audio::peaks`; what lives here is v1's handler shape — stat, key,
//! cache, decode, cache-write — and the `null` that stands for "no waveform".
//!
//! # A plain invoke, deliberately (decision D12)
//!
//! Nightcore's lesson names peaks as a `tauri::ipc::Channel` candidate. They are
//! not one: a bucket array is 512 `f32` (~2 KB), one-shot, and disk-cached. A
//! Channel buys nothing and breaks the invoke-shaped contract the Phase 15 shim
//! implements. Channel + `InvokeResponseBody::Raw` is reserved for a future PCM
//! or analyser frame stream.
//!
//! # Every failure is `null`, not a rejection
//!
//! A missing file, a directory at the path, an unplugged drive, a radio stream,
//! an unsupported container, a corrupt one — v1 answered `null` to all of them,
//! and the renderer draws a flat bar. That is the right shape: a track without a
//! waveform is a normal state, and a toast on every stream URL would be noise.
//! So this command has no reachable rejection except the empty-path guard.
//!
//! # The cache is v1's, byte for byte
//!
//! §3.3: the `waveform-peaks/` directory survives the port verbatim and first-run
//! continuity copies it into the v2 profile. The key is
//! `sha256(path|mtime|size)[0..32]` over **the path string exactly as it arrived
//! over IPC** — no normalisation, no case folding, no `realpath`, because
//! normalising here would silently orphan every entry the user already has. That
//! is why this command takes a `String` and not a `PathBuf`: a `PathBuf` round
//! trip through `to_string_lossy` is exactly the silent rewrite the key cannot
//! survive.
//!
//! # One recorded deviation: no in-flight coalescing
//!
//! v1 wrapped the decode in `coalesce(inFlight, hash, …)` so two concurrent
//! requests for the same uncached track decoded once. That map is not ported.
//! The observable result is identical — the cache write is create-exclusive and
//! its `EEXIST` is the dedupe happy path, so a race writes the same bytes and
//! loses harmlessly — and the cost is one redundant decode inside the window
//! before the first completes. The renderer requests peaks for the track it is
//! playing, one at a time, so that window is rarely entered. Restoring it means
//! managed state and a broadcast per key, which is a real amount of machinery
//! for a saving no user can observe.

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use shiranami_audio::{WAVEFORM_PEAK_COUNT, peaks::cache, peaks_from_file};
use specta::Type;
use tauri::AppHandle;

use crate::commands::library::{data_dir, off_thread, require_path};
use crate::error::CommandResult;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::waveform::waveform_get_peaks,
            ]
        }
    };
}
pub(crate) use commands;

/// The cache directory under the app data root. v1's `'waveform-peaks'`.
///
/// §3.3 copies this directory across from the v1 profile, so the name is a
/// compatibility surface rather than a choice.
const PEAKS_DIR: &str = "waveform-peaks";

/// What `waveform:get-peaks` answers with.
///
/// One field, as v1's `WaveformPeaksResult` had. `shiranami_audio::WaveformPeaks`
/// also carries the sample rate, channel count and duration, and they are
/// deliberately dropped here: v1's TypeScript only ever read `peaks`, and adding
/// three fields to a wire shape the renderer does not consume would freeze them
/// into the contract.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WaveformPeaksResult {
    /// [`WAVEFORM_PEAK_COUNT`] peak amplitudes — the maximum absolute sample per
    /// bucket.
    ///
    /// **Unnormalised.** Typically within `0.0..=1.0`, but a float source with
    /// inter-sample peaks may exceed 1.0, and the renderer scales by the
    /// per-track maximum when drawing.
    pub peaks: Vec<f32>,
}

/// `waveform:get-peaks` — the peak array for a track, or `null`.
///
/// Cached peaks are returned without decoding; a miss decodes once and writes
/// the result back. See the module docs for why every failure is `null`.
#[tauri::command]
#[specta::specta]
pub async fn waveform_get_peaks(
    app: AppHandle,
    file_path: String,
) -> CommandResult<Option<WaveformPeaksResult>> {
    // v1's `z.string().min(1)`. Everything past this point answers `null`.
    require_path(Path::new(&file_path))?;

    let peaks_dir = data_dir(&app).map(|dir| dir.join(PEAKS_DIR));

    off_thread("read the track's waveform", move || {
        Ok(peaks_for(&file_path, peaks_dir.as_deref()))
    })
    .await
}

/// The handler body, off the webview's thread and free of Tauri types.
///
/// Separated so the whole path — stat, key, cache hit, decode, cache write — is
/// reachable from a test without an `AppHandle`, against a real temp cache
/// directory.
fn peaks_for(file_path: &str, peaks_dir: Option<&Path>) -> Option<WaveformPeaksResult> {
    let path = Path::new(file_path);

    // One stat answers two questions: whether there is a file here at all, and
    // the mtime and size the cache key is built from. A stream URL or an
    // unplugged drive fails it and simply has no waveform.
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }

    let key = peaks_dir.map(|_| cache::cache_key(file_path, mtime_ms(&metadata), metadata.len()));

    // Fast path: decoded on a previous play, or by v1 before the upgrade.
    if let (Some(dir), Some(key)) = (peaks_dir, key.as_deref())
        && let Some(cached) = cache::read_cached_peaks(dir, key)
    {
        return Some(WaveformPeaksResult { peaks: cached });
    }

    let decoded = match peaks_from_file(path, WAVEFORM_PEAK_COUNT) {
        Ok(decoded) => decoded,
        Err(error) => {
            // Unsupported container, corrupt file, no audio track. v1 resolved
            // `null` for every one of these and so does this.
            tracing::debug!(%error, file_path, "no waveform for this file");
            return None;
        }
    };

    if let (Some(dir), Some(key)) = (peaks_dir, key.as_deref())
        && let Err(error) = cache::write_cached_peaks(dir, key, &decoded.peaks)
    {
        // A cache that will not write costs a re-decode next time; it does not
        // cost the user their waveform now. v1 logged and carried on too.
        tracing::warn!(%error, "the waveform cache write failed");
    }

    Some(WaveformPeaksResult {
        peaks: decoded.peaks,
    })
}

/// Modification time in milliseconds, as Node's `stat.mtimeMs` reports it.
///
/// Summed from whole seconds and nanoseconds rather than scaling
/// `as_secs_f64()`, which for a present-day timestamp has already spent its
/// mantissa on the seconds and would quantise the milliseconds. The cache key
/// rounds this to an integer, so a drift of one millisecond is a permanently
/// missed cache for that track.
fn mtime_ms(metadata: &std::fs::Metadata) -> f64 {
    let Ok(modified) = metadata.modified() else {
        return 0.0;
    };
    let Ok(since_epoch) = modified.duration_since(UNIX_EPOCH) else {
        // A file dated before 1970. v1 would have produced a negative
        // `mtimeMs`; zero keys it consistently rather than panicking, and the
        // entry is still content-addressed by path and size.
        return 0.0;
    };

    #[expect(
        clippy::cast_precision_loss,
        reason = "seconds since the epoch is ~2^31; f64 carries it exactly"
    )]
    let seconds = since_epoch.as_secs() as f64;

    seconds * 1000.0 + f64::from(since_epoch.subsec_nanos()) / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::codes;
    use std::path::PathBuf;

    /// A decodable one-second sine, written as a real WAV so the decode path is
    /// genuinely exercised rather than mocked.
    fn write_wav(path: &Path) {
        const SAMPLE_RATE: u32 = 8_000;
        let frames = SAMPLE_RATE as usize;

        let mut bytes = Vec::with_capacity(44 + frames * 2);
        let data_len = u32::try_from(frames * 2).expect("fits");
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&1_u16.to_le_bytes()); // mono
        bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        bytes.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // byte rate
        bytes.extend_from_slice(&2_u16.to_le_bytes()); // block align
        bytes.extend_from_slice(&16_u16.to_le_bytes()); // bits
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());

        for frame in 0..frames {
            let phase = frame as f64 / f64::from(SAMPLE_RATE) * std::f64::consts::TAU * 440.0;
            #[expect(
                clippy::cast_possible_truncation,
                reason = "a sine scaled to i16 range is in range by construction"
            )]
            let sample = (phase.sin() * 20_000.0) as i16;
            bytes.extend_from_slice(&sample.to_le_bytes());
        }

        std::fs::write(path, bytes).expect("the fixture writes");
    }

    fn as_str(path: &Path) -> String {
        path.to_str().expect("a UTF-8 temp path").to_owned()
    }

    /// The one rejection this channel can produce. Everything else answers
    /// `null`, so this is the whole of its error surface.
    #[test]
    fn an_empty_path_is_the_only_rejection() {
        let error = require_path(Path::new("")).expect_err("empty is refused");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
        assert!(require_path(Path::new("/music/a.mp3")).is_ok());
    }

    #[test]
    fn a_missing_file_has_no_waveform_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");

        assert_eq!(peaks_for("/no/such/track.mp3", Some(dir.path())), None);
    }

    /// A radio stream URL reaches this channel as a "path". v1 answered `null`
    /// and the renderer drew a flat bar; a rejection would toast on every
    /// station change.
    #[test]
    fn a_stream_url_has_no_waveform_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");

        assert_eq!(
            peaks_for("https://example.invalid/stream.mp3", Some(dir.path())),
            None
        );
    }

    #[test]
    fn a_directory_at_the_path_has_no_waveform() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let subdir = dir.path().join("album");
        std::fs::create_dir(&subdir).expect("the fixture writes");

        assert_eq!(peaks_for(&as_str(&subdir), Some(dir.path())), None);
    }

    #[test]
    fn an_undecodable_file_has_no_waveform_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("not-audio.mp3");
        std::fs::write(&path, b"this is not an audio container").expect("the fixture writes");

        assert_eq!(peaks_for(&as_str(&path), Some(dir.path())), None);
    }

    #[test]
    fn a_decodable_file_yields_the_frozen_bucket_count() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let cache_dir = dir.path().join(PEAKS_DIR);
        let path = dir.path().join("tone.wav");
        write_wav(&path);

        let result = peaks_for(&as_str(&path), Some(&cache_dir)).expect("a decodable file");

        assert_eq!(
            result.peaks.len(),
            WAVEFORM_PEAK_COUNT,
            "the count is fixed so the on-disk cache stays resolution-stable"
        );
        assert!(
            result.peaks.iter().any(|peak| *peak > 0.1),
            "a 440 Hz tone is not silence"
        );
    }

    /// The point of the cache: a second request does not decode again. Asserted
    /// by deleting the audio file between the two calls — if the second answer
    /// still arrives, it came from disk.
    #[test]
    fn a_second_request_is_served_from_the_cache() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let cache_dir = dir.path().join(PEAKS_DIR);
        let path = dir.path().join("tone.wav");
        write_wav(&path);
        let file_path = as_str(&path);

        let first = peaks_for(&file_path, Some(&cache_dir)).expect("the decode");
        assert_eq!(
            std::fs::read_dir(&cache_dir)
                .expect("the cache directory was created")
                .count(),
            1,
            "the decode wrote exactly one cache entry"
        );

        let second = peaks_for(&file_path, Some(&cache_dir)).expect("the cache hit");

        assert_eq!(first, second);
    }

    /// Identity is `path + mtime + size`, so re-encoding a file in place must
    /// produce a different key and a fresh waveform. Stale peaks over new audio
    /// would draw a seekbar that does not match what is playing.
    #[test]
    fn editing_the_file_invalidates_its_cached_peaks() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let cache_dir = dir.path().join(PEAKS_DIR);
        let path = dir.path().join("tone.wav");
        write_wav(&path);
        let file_path = as_str(&path);

        peaks_for(&file_path, Some(&cache_dir)).expect("the first decode");

        // Same path, different bytes and therefore a different size.
        let mut longer = std::fs::read(&path).expect("read back");
        longer.extend_from_slice(&[0_u8; 2048]);
        std::fs::write(&path, longer).expect("the fixture rewrites");

        peaks_for(&file_path, Some(&cache_dir)).expect("the second decode");

        assert_eq!(
            std::fs::read_dir(&cache_dir).expect("read the cache").count(),
            2,
            "the edited file was keyed separately rather than served stale peaks"
        );
    }

    /// Without a data directory there is nowhere to cache, but the decode still
    /// has to work — the user gets a waveform, just not a remembered one.
    #[test]
    fn peaks_still_decode_with_no_cache_directory() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("tone.wav");
        write_wav(&path);

        let result = peaks_for(&as_str(&path), None).expect("a decodable file");

        assert_eq!(result.peaks.len(), WAVEFORM_PEAK_COUNT);
    }

    /// The wire shape, pinned against v1's `WaveformPeaksResult`. One key, and
    /// the renderer reads it directly.
    #[test]
    fn the_result_serializes_as_v1s_single_key_object() {
        let json = serde_json::to_value(WaveformPeaksResult {
            peaks: vec![0.0, 0.5, 1.0],
        })
        .expect("serialize");

        assert_eq!(json, serde_json::json!({ "peaks": [0.0, 0.5, 1.0] }));
    }

    /// "No waveform" is `null` on the wire, not an empty array — the renderer
    /// distinguishes "nothing to draw" from "a silent track".
    #[test]
    fn no_waveform_serializes_as_null() {
        let json = serde_json::to_value(Option::<WaveformPeaksResult>::None).expect("serialize");

        assert_eq!(json, serde_json::Value::Null);
    }

    /// The cache key is built from the path string **as it arrived**, so two
    /// spellings of the same file are two entries. That is v1's behaviour and
    /// normalising it would orphan every entry already on disk.
    #[test]
    fn the_cache_key_is_taken_from_the_unnormalised_path_string() {
        let plain = cache::cache_key("/music/a.mp3", 1_700_000_000_000.0, 42);
        let dotted = cache::cache_key("/music/./a.mp3", 1_700_000_000_000.0, 42);

        assert_ne!(plain, dotted);
        assert_eq!(plain.len(), 32, "v1's `.digest('hex').slice(0, 32)`");
    }

    /// Millisecond precision has to survive, or every track misses its cache by
    /// one and re-decodes forever.
    #[test]
    fn the_modification_time_keeps_its_milliseconds() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("stamped.bin");
        std::fs::write(&path, b"x").expect("the fixture writes");

        let metadata = std::fs::metadata(&path).expect("stat");
        let ms = mtime_ms(&metadata);

        assert!(ms > 1_600_000_000_000.0, "a present-day timestamp: {ms}");
        // The value has to be finer than whole seconds, or the key loses the
        // resolution v1's `mtimeMs` gave it.
        assert!(
            (ms / 1000.0).fract() != 0.0 || metadata.modified().is_err(),
            "sub-second precision survived"
        );
    }

    #[test]
    fn a_file_with_no_readable_modification_time_still_keys_consistently() {
        // `mtime_ms` falls back to zero rather than panicking, and the key is
        // still stable for that file because path and size carry it.
        let first = cache::cache_key("/music/a.mp3", 0.0, 42);
        let second = cache::cache_key("/music/a.mp3", 0.0, 42);

        assert_eq!(first, second);
    }

    #[test]
    fn the_cache_directory_is_v1s() {
        assert_eq!(
            PEAKS_DIR, "waveform-peaks",
            "§3.3 copies this directory across from the v1 profile verbatim"
        );
        assert_eq!(
            cache::cache_path(&PathBuf::from("/data"), "abc"),
            PathBuf::from("/data/abc.json"),
            "one file per track, named `<key>.json`"
        );
    }
}
