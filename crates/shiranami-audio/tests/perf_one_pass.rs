//! The measured claim behind the one-pass engine.
//!
//! Ignored by default: it measures rather than asserts, and its numbers belong
//! in a release note, not a CI gate. Run it in release mode with output:
//!
//! ```text
//! cargo test -p shiranami-audio --release --test perf_one_pass -- --ignored --nocapture
//! ```
//!
//! Three timings over the same synthesised library:
//!
//! 1. **separate paths, sequential** — one decode per measurement, four per
//!    track: the shape the codebase had before `analysis::analyze_file`;
//! 2. **one-pass, sequential** — one decode per track through the fan-out;
//! 3. **one-pass, parallel** — the same, across `available_parallelism`
//!    threads, which is the shape the desktop batch command runs.
//!
//! WAV understates the one-pass win: its decode is nearly free, so most of the
//! saving here is the shared downmix and traversal. On flac/mp3/m4a — the bulk
//! of a real library — the decode dominates and the per-track saving grows.

#[path = "support/synth.rs"]
mod synth;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use shiranami_audio::{
    AnalyzeRequest, analyze_file, bpm_from_file, key_from_file,
    loudness::measure_integrated_loudness, peaks::peaks_from_file,
};

const TRACKS: usize = 16;
const SECONDS: usize = 30;
const BUCKETS: usize = 512;

/// A stereo track with a beat and a tonal centre so every analyser works.
fn synthesise_track(path: &Path, index: usize) {
    let rate = synth::SAMPLE_RATE;
    let total = rate as usize * SECONDS;
    let period = rate as usize * 60 / (90 + 5 * (index % 8)); // 90–125 BPM
    let burst = rate as usize / 20;
    let base = 200.0 + 20.0 * index as f64;

    let mut samples = Vec::with_capacity(total * 2);
    for n in 0..total {
        let t = n as f64 / f64::from(rate);
        let tone: f64 = [base, base * 1.25, base * 1.5]
            .iter()
            .map(|f| (std::f64::consts::TAU * f * t).sin())
            .sum::<f64>()
            / 3.0;
        let click = if n % period < burst { 0.5 } else { 0.0 };
        let value = ((tone * 0.3 + click) * 24_000.0).clamp(-32_768.0, 32_767.0) as i16;
        samples.push(value);
        samples.push(value);
    }
    synth::write_wav_i16(path, rate, 2, &samples);
}

fn build_library(dir: &Path) -> Vec<PathBuf> {
    (0..TRACKS)
        .map(|index| {
            let path = dir.join(format!("track-{index:02}.wav"));
            synthesise_track(&path, index);
            path
        })
        .collect()
}

fn analyse_one_pass(path: &Path) {
    analyze_file(path, AnalyzeRequest::everything(BUCKETS)).expect("one-pass analysis");
}

fn analyse_separately(path: &Path) {
    peaks_from_file(path, BUCKETS).expect("peaks");
    measure_integrated_loudness(path).expect("loudness");
    bpm_from_file(path).expect("bpm");
    key_from_file(path).expect("key");
}

#[test]
#[ignore = "perf measurement, not an assertion; run with --release --nocapture"]
fn measure_the_one_pass_and_parallel_story() {
    let dir = tempfile::tempdir().expect("temp dir");
    let library = build_library(dir.path());
    let threads = std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(1);

    // 1. Separate paths, sequential — four decodes per track.
    let start = Instant::now();
    for path in &library {
        analyse_separately(path);
    }
    let separate_sequential = start.elapsed();

    // 2. One pass, sequential — one decode per track.
    let start = Instant::now();
    for path in &library {
        analyse_one_pass(path);
    }
    let one_pass_sequential = start.elapsed();

    // 3. One pass, parallel — a shared claim counter, one worker per core,
    //    which is the shape the desktop batch runs (rayon there, plain
    //    threads here to keep this crate dependency-free).
    let start = Instant::now();
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(path) = library.get(index) else {
                        break;
                    };
                    analyse_one_pass(path);
                }
            });
        }
    });
    let one_pass_parallel = start.elapsed();

    let per_track = |elapsed: std::time::Duration| elapsed.as_secs_f64() / TRACKS as f64 * 1000.0;
    println!(
        "\none-pass perf over {TRACKS} tracks × {SECONDS} s stereo 48 kHz wav\n\
          1. separate paths, sequential: {separate_sequential:>8.2?}  ({:>7.1} ms/track)\n\
         2. one pass,       sequential: {one_pass_sequential:>8.2?}  ({:>7.1} ms/track)\n\
         3. one pass, {threads:>2} threads:       {one_pass_parallel:>8.2?}  ({:>7.1} ms/track)\n\
         one-pass speedup: {:.2}×; parallel speedup over sequential one-pass: {:.2}×; end to end: {:.2}×",
        per_track(separate_sequential),
        per_track(one_pass_sequential),
        per_track(one_pass_parallel),
        separate_sequential.as_secs_f64() / one_pass_sequential.as_secs_f64(),
        one_pass_sequential.as_secs_f64() / one_pass_parallel.as_secs_f64(),
        separate_sequential.as_secs_f64() / one_pass_parallel.as_secs_f64(),
    );
}
