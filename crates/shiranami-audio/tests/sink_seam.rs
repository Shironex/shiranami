//! The decode/consume seam — the contract rung three plugs into.
//!
//! BPM ships post-v2 as another [`PcmSink`]. These tests pin what such a sink
//! can rely on before that code exists, so the rung is a matter of writing a
//! detector rather than of first reshaping the decoder.

#[path = "support/synth.rs"]
mod synth;

use shiranami_audio::error::AudioError;
use shiranami_audio::loudness::{IntegratedLoudness, LoudnessAnalyzer};
use shiranami_audio::peaks::PeakAccumulator;
use shiranami_audio::{PcmSink, PcmSpec, decode_file};

/// A sink that records what it was told, and forwards to two real analysers.
///
/// Doubles as the worked example of the thing the seam exists for: one decode
/// feeding several measurements, which the addon could not do — it decoded the
/// file once for the waveform and again for the loudness.
#[derive(Default)]
struct Recorder {
    spec: Option<PcmSpec>,
    buffers: usize,
    samples: usize,
    peaks: PeakAccumulator,
    loudness: LoudnessAnalyzer,
}

impl PcmSink for Recorder {
    fn begin(&mut self, spec: PcmSpec) -> Result<(), AudioError> {
        assert!(self.spec.is_none(), "begin must be called exactly once");
        assert_eq!(self.buffers, 0, "begin must precede every accept");
        self.spec = Some(spec);
        self.peaks.begin(spec)?;
        self.loudness.begin(spec)
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<(), AudioError> {
        let spec = self.spec.expect("accept must follow begin");
        assert_eq!(
            interleaved.len() % usize::from(spec.channels),
            0,
            "a buffer must hold whole frames"
        );
        self.buffers += 1;
        self.samples += interleaved.len();
        self.peaks.accept(interleaved)?;
        self.loudness.accept(interleaved)
    }
}

#[test]
fn one_decode_can_feed_several_analysers() {
    let mut recorder = Recorder::default();

    let summary = decode_file(&synth::fixture("sine.wav"), &mut recorder).expect("decode sine.wav");

    assert_eq!(
        summary.spec,
        PcmSpec {
            channels: 2,
            sample_rate: 48_000
        }
    );
    assert_eq!(summary.frames, 48_000);
    assert!((summary.duration_secs() - 1.0).abs() < f64::EPSILON);

    // The seam held: both analysers saw the same stream, and the numbers match
    // what measuring each on its own produces.
    assert_eq!(recorder.samples, 96_000);
    assert_eq!(recorder.peaks.envelope().frames(), 48_000);
    assert!(matches!(
        recorder.loudness.finish(),
        Ok(IntegratedLoudness::Measured(_))
    ));
}

#[test]
fn frames_arrive_in_several_buffers_rather_than_all_at_once() {
    // The property that lets an analyser stay O(1) in memory. If the decoder
    // ever started handing over the whole track, a sink written to stream would
    // still be correct — but the reason it was written that way would be gone.
    let mut recorder = Recorder::default();

    decode_file(&synth::fixture("sine.wav"), &mut recorder).expect("decode");

    assert!(
        recorder.buffers > 1,
        "one buffer for a whole second of audio"
    );
}

#[test]
fn a_sink_error_aborts_the_decode() {
    struct Refuses;
    impl PcmSink for Refuses {
        fn begin(&mut self, _: PcmSpec) -> Result<(), AudioError> {
            Err(AudioError::BadRequest("no".to_owned()))
        }
        fn accept(&mut self, _: &[f32]) -> Result<(), AudioError> {
            unreachable!("begin already refused")
        }
    }

    let error = decode_file(&synth::fixture("sine.wav"), &mut Refuses)
        .expect_err("the sink refused the stream");

    assert!(matches!(error, AudioError::BadRequest(_)), "{error:?}");
}

#[test]
fn an_analyser_that_saw_no_frames_reports_an_error_rather_than_a_number() {
    // Not `Silent`: silence is a measurement of audio that was there. Having
    // measured nothing at all is a fault, and persisting a loudness for it
    // would mislead volume leveling.
    let error = LoudnessAnalyzer::new()
        .finish()
        .expect_err("nothing was analysed");

    assert!(matches!(error, AudioError::Analysis { .. }), "{error:?}");
}

#[test]
fn a_silent_measurement_carries_no_lufs_to_store() {
    assert_eq!(IntegratedLoudness::Silent.lufs(), None);
    assert_eq!(IntegratedLoudness::Measured(-14.5).lufs(), Some(-14.5));
}

#[test]
fn duration_comes_from_the_frames_actually_decoded() {
    let mut accumulator = PeakAccumulator::new();

    let summary =
        decode_file(&synth::fixture("sine.flac"), &mut accumulator).expect("decode sine.flac");

    assert_eq!(summary.frames, 48_000);
    assert!((summary.duration_secs() - 1.0).abs() < f64::EPSILON);
}
