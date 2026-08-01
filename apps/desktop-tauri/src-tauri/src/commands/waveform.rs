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
use specta_typescript::Number;
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
    ///
    /// `Number` rather than the default float mapping: specta emits every float
    /// as `number | null`, because `serde_json` writes a NaN as `null`. v1's
    /// contract is `peaks: number[]`, the reducer cannot produce a NaN, and the
    /// cache writer already rewrites a non-finite peak as `0` — so the union
    /// would be an uninhabited branch the shim has to narrow at every call site.
    /// The same treatment `shiranami_core::models::TrackMetadata` gives
    /// `duration`.
    #[specta(type = Vec<Number>)]
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
#[path = "tests/waveform.rs"]
mod tests;
