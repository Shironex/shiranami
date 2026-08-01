//! Waveform peaks: the reducer and the file-level analysis.

pub mod analyze;
pub mod reduce;

pub use analyze::{PeakAccumulator, WAVEFORM_PEAK_COUNT, WaveformPeaks, peaks_from_file};
pub use reduce::{FrameEnvelope, reduce_peaks};
