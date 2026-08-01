//! Compatibility of the peaks cache with the files v1 left on disk.
//!
//! Architecture §3.3 asks for exactly this: *"Pin the exact key-string
//! construction (separator, field order, mtime unit) with a test against a
//! v1-generated fixture filename."* The fixture under
//! `tests/fixtures/v1-peaks-cache/` was not written by hand — it was produced
//! by running v1's own `hashTrackKey` and `writeCachedPeaks`
//! (`apps/desktop/src/main/shared/waveform-cache.ts`) unmodified, so the
//! filename and the bytes inside it are v1's, not a reimplementation's.
//!
//! A drift here is not a failed test in the abstract: it silently invalidates
//! every waveform the user has ever had cached, and the first thing they would
//! notice is their whole library re-decoding one track at a time.

#[path = "support/synth.rs"]
mod synth;

use shiranami_audio::peaks::{cache_key, cache_path, read_cached_peaks, write_cached_peaks};

/// The identity v1 hashed to produce the committed fixture's filename.
const V1_PATH: &str = "/Users/shirone/Music/しらなみ/track 01.flac";
const V1_MTIME_MS: f64 = 1_750_000_000_123.5;
const V1_SIZE: u64 = 8_675_309;
const V1_KEY: &str = "30ef64cd9c768821efe43ead90e1413b";

/// The peaks inside the fixture, as `f32` — every one exactly representable.
const V1_PEAKS: [f32; 8] = [
    0.0,
    0.5,
    0.25,
    1.0,
    1.5,
    0.1,
    0.008_850_098,
    0.000_030_517_578,
];

/// The fixture's bytes, verbatim.
const V1_BYTES: &str =
    "{\"peaks\":[0,0.5,0.25,1,1.5,0.10000000149011612,0.00885009765625,0.000030517578125]}";

#[test]
fn the_key_matches_the_filename_v1_wrote() {
    assert_eq!(cache_key(V1_PATH, V1_MTIME_MS, V1_SIZE), V1_KEY);
}

#[test]
fn the_mtime_is_milliseconds_rounded_the_way_javascript_rounds() {
    // `Math.round` breaks halves toward positive infinity, so 123.5 ms becomes
    // 124 — not the 123 a truncation would give, and not the 124-vs--124 split
    // Rust's own `round` would produce on a negative input.
    assert_eq!(cache_key(V1_PATH, 1_750_000_000_123.5, V1_SIZE), V1_KEY);
    assert_eq!(cache_key(V1_PATH, 1_750_000_000_124.0, V1_SIZE), V1_KEY);
    assert_ne!(cache_key(V1_PATH, 1_750_000_000_123.0, V1_SIZE), V1_KEY);
    assert_eq!(cache_key("x", -0.5, 0), cache_key("x", 0.0, 0));
}

#[test]
fn every_field_of_the_identity_changes_the_key() {
    // Re-encoding a file in place changes its size and mtime, which is the
    // whole point: stale peaks must not survive an edit.
    let key = cache_key(V1_PATH, V1_MTIME_MS, V1_SIZE);

    assert_ne!(
        cache_key("/Users/shirone/Music/other.flac", V1_MTIME_MS, V1_SIZE),
        key
    );
    assert_ne!(cache_key(V1_PATH, V1_MTIME_MS + 1.0, V1_SIZE), key);
    assert_ne!(cache_key(V1_PATH, V1_MTIME_MS, V1_SIZE + 1), key);
}

#[test]
fn the_key_is_thirty_two_lowercase_hex_characters() {
    let key = cache_key(V1_PATH, V1_MTIME_MS, V1_SIZE);

    assert_eq!(key.len(), 32);
    assert!(
        key.chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
        "{key}"
    );
}

#[test]
fn a_file_v1_wrote_reads_back_as_the_peaks_v1_had() {
    let dir = synth::fixture("v1-peaks-cache");

    let peaks = read_cached_peaks(&dir, V1_KEY).expect("the committed v1 fixture reads");

    assert_eq!(peaks, V1_PEAKS);
}

#[test]
fn rewriting_a_v1_file_reproduces_its_bytes() {
    // The strongest form of the claim: given the peaks v1 stored, this writer
    // emits the file v1 emitted, byte for byte — same document shape, same
    // number formatting, no version field, no trailing newline.
    let dir = tempfile::tempdir().expect("temp dir");

    write_cached_peaks(dir.path(), V1_KEY, &V1_PEAKS).expect("write");

    let written = std::fs::read_to_string(cache_path(dir.path(), V1_KEY)).expect("read back");
    assert_eq!(written, V1_BYTES);
    assert_eq!(
        written,
        std::fs::read_to_string(synth::fixture("v1-peaks-cache").join(format!("{V1_KEY}.json")))
            .expect("read the fixture")
    );
}

#[test]
fn a_round_trip_preserves_every_bit() {
    let dir = tempfile::tempdir().expect("temp dir");
    let peaks: Vec<f32> = (0..512).map(|i| i as f32 / 511.0).collect();

    write_cached_peaks(dir.path(), "roundtrip", &peaks).expect("write");

    assert_eq!(read_cached_peaks(dir.path(), "roundtrip"), Some(peaks));
}

#[test]
fn a_miss_is_none_rather_than_an_error() {
    let dir = tempfile::tempdir().expect("temp dir");

    assert_eq!(read_cached_peaks(dir.path(), "absent"), None);
    assert_eq!(
        read_cached_peaks(std::path::Path::new("/no/such/dir"), "absent"),
        None
    );
}

#[test]
fn a_malformed_file_is_a_miss_rather_than_an_error() {
    let dir = tempfile::tempdir().expect("temp dir");
    let write = |key: &str, body: &str| {
        std::fs::write(cache_path(dir.path(), key), body).expect("stage");
    };

    write("truncated", "{\"peaks\":[0.1,");
    write("wrong-shape", "{\"peaks\":{}}");
    write("wrong-key", "{\"values\":[0.1]}");
    // v1 guarded this case explicitly: `Array.isArray` alone would let a string
    // array through as `number[]` and break the canvas.
    write("string-elements", "{\"peaks\":[\"0.1\",\"0.2\"]}");
    write("empty", "");

    for key in [
        "truncated",
        "wrong-shape",
        "wrong-key",
        "string-elements",
        "empty",
    ] {
        assert_eq!(read_cached_peaks(dir.path(), key), None, "{key}");
    }
}

#[test]
fn an_existing_file_is_left_alone() {
    // The name is content-addressed, so a second writer is writing the same
    // bytes. Losing that race must be a no-op, never a torn file.
    let dir = tempfile::tempdir().expect("temp dir");

    write_cached_peaks(dir.path(), "raced", &[0.25]).expect("first write");
    write_cached_peaks(dir.path(), "raced", &[0.75]).expect("second write");

    assert_eq!(read_cached_peaks(dir.path(), "raced"), Some(vec![0.25]));
}

#[test]
fn the_cache_directory_is_created_on_demand() {
    let dir = tempfile::tempdir().expect("temp dir");
    let nested = dir.path().join("waveform-peaks");

    write_cached_peaks(&nested, "fresh", &[0.5]).expect("write into a missing directory");

    assert_eq!(read_cached_peaks(&nested, "fresh"), Some(vec![0.5]));
}

#[test]
fn a_non_finite_peak_is_written_as_zero_rather_than_as_invalid_json() {
    // JSON has no spelling for an infinity. `JSON.stringify` wrote `null`,
    // which v1's own element-type check then rejected on every later read —
    // a permanent miss. Zero at least reads back.
    let dir = tempfile::tempdir().expect("temp dir");

    write_cached_peaks(dir.path(), "hostile", &[f32::INFINITY, f32::NAN, 0.5]).expect("write");

    assert_eq!(
        read_cached_peaks(dir.path(), "hostile"),
        Some(vec![0.0, 0.0, 0.5])
    );
}
