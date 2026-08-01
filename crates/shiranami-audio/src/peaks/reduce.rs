//! The bucket reducer, ported line-for-line from `core/peaks.cpp`.
//!
//! The v1 contract, which the renderer and the on-disk cache both depend on:
//! each output bucket is the **loudest absolute sample across all channels** in
//! that bucket's slice of frames. That is a max, not a downmix — no averaging,
//! no channel weighting, no normalisation. `packages/contracts/src/ipc/waveform.ts`
//! states the consequence outright: values are unnormalised and a hot float
//! source may exceed 1.0, and `WaveformSeekbar` divides by the per-track max
//! when it draws.
//!
//! Two details are load-bearing for producing the same numbers as the addon:
//!
//! * bucket boundaries are computed from a `f64` frames-per-bucket every time
//!   rather than by advancing an integer cursor, so rounding error cannot drift
//!   across hundreds of bars;
//! * the boundary cast truncates toward zero, matching C++'s
//!   `static_cast<std::size_t>(double)`.
//!
//! The one intentional difference is the shape of the input. `reducePeaks` took
//! a raw `const float*` plus a caller-supplied frame count, and its own unit
//! tests passed a *sample* count as that argument for a stereo buffer — reading
//! four floats past the end of the vector. Here the frame count is derived from
//! the slice, so the same call is simply safe.

/// The per-frame envelope a bucket reduction runs over.
///
/// Holds one `f32` per frame — the loudest absolute sample in that frame — so a
/// stereo track costs half of what the addon's full interleaved buffer did, and
/// a 7.1 track an eighth. That is not an approximation: the bucket peak is the
/// max over frames of the max over channels, so collapsing channels on arrival
/// is the same arithmetic in a different order.
#[derive(Debug, Default, Clone)]
pub struct FrameEnvelope {
    max_abs: Vec<f32>,
}

impl FrameEnvelope {
    /// An empty envelope.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// An empty envelope with room for `frames` frames.
    #[must_use]
    pub fn with_capacity(frames: usize) -> Self {
        Self {
            max_abs: Vec::with_capacity(frames),
        }
    }

    /// Fold one buffer of channel-interleaved frames into the envelope.
    ///
    /// A `channels` of zero contributes nothing, mirroring the addon's
    /// `channels == 0` guard.
    pub fn push_interleaved(&mut self, interleaved: &[f32], channels: u16) {
        if channels == 0 {
            return;
        }
        for frame in interleaved.chunks_exact(usize::from(channels)) {
            // `f32::max` returns the non-NaN operand, so a NaN sample is
            // ignored exactly as C++'s `if (a > peak)` ignored it.
            self.max_abs
                .push(frame.iter().fold(0.0_f32, |peak, s| peak.max(s.abs())));
        }
    }

    /// Frames folded in so far.
    #[must_use]
    pub fn frames(&self) -> usize {
        self.max_abs.len()
    }

    /// Reduce the envelope to `buckets` peak amplitudes.
    ///
    /// An empty envelope reduces to `buckets` zeros — a track that decoded to
    /// nothing draws a flat line rather than an absent waveform, which is what
    /// v1 did. `buckets == 0` reduces to an empty vector.
    #[must_use]
    pub fn reduce(&self, buckets: usize) -> Vec<f32> {
        if buckets == 0 {
            return Vec::new();
        }
        if self.max_abs.is_empty() {
            return vec![0.0; buckets];
        }

        let frames = self.max_abs.len();
        let frames_per_bucket = frames as f64 / buckets as f64;

        (0..buckets)
            .map(|bucket| {
                let start = (bucket as f64 * frames_per_bucket) as usize;
                let end = (((bucket + 1) as f64 * frames_per_bucket) as usize).min(frames);
                self.max_abs
                    .get(start..end)
                    .unwrap_or_default()
                    .iter()
                    .fold(0.0_f32, |peak, sample| peak.max(*sample))
            })
            .collect()
    }
}

/// Reduce channel-interleaved frames to `buckets` peak amplitudes in one call.
///
/// The direct analogue of the addon's `reducePeaks`, kept for callers that
/// already hold a whole buffer — typically tests. Streaming callers build a
/// [`FrameEnvelope`] instead and never materialise the samples.
#[must_use]
pub fn reduce_peaks(interleaved: &[f32], channels: u16, buckets: usize) -> Vec<f32> {
    let mut envelope = FrameEnvelope::with_capacity(match usize::from(channels) {
        0 => 0,
        channels => interleaved.len() / channels,
    });
    envelope.push_interleaved(interleaved, channels);
    envelope.reduce(buckets)
}
