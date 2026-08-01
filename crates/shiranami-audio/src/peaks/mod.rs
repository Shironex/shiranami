//! Waveform peaks: the reducer, the file-level analysis, and the disk cache.

pub mod analyze;
pub mod cache;
pub mod reduce;

pub use analyze::{PeakAccumulator, WAVEFORM_PEAK_COUNT, WaveformPeaks, peaks_from_file};
pub use cache::{cache_key, cache_path, read_cached_peaks, write_cached_peaks};
pub use reduce::{FrameEnvelope, reduce_peaks};
