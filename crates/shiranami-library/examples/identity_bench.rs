//! What the identity hash costs, on a synthetic library.
//!
//! ```text
//! cargo run -p shiranami-library --release --example identity_bench -- [files] [MiB per file]
//! ```
//!
//! Writes `files` MP3-shaped files (an ID3v2 tag in front of pseudo-random
//! "frames", an ID3v1 tag behind) into a temp dir, then times three passes over
//! them: the sampled hash in parallel (what the import and the backfill run),
//! the sampled hash on one thread, and a full-payload sha256 for comparison
//! (what hashing without sampling would cost). The files were just written, so
//! the page cache is warm; a cold disk adds one seek per window, five per file.

use std::io::Write as _;
use std::path::PathBuf;
use std::time::Instant;

use sha2::{Digest, Sha256};

fn main() {
    let mut args = std::env::args().skip(1);
    let files: usize = args.next().and_then(|a| a.parse().ok()).unwrap_or(400);
    let mib: usize = args.next().and_then(|a| a.parse().ok()).unwrap_or(4);

    let dir = tempfile::tempdir().expect("a temp dir");
    let mut state: u64 = 0x9e37_79b9_7f4a_7c15;
    let paths: Vec<PathBuf> = (0..files)
        .map(|index| {
            let path = dir.path().join(format!("{index:05}.mp3"));
            let mut file = std::fs::File::create(&path).expect("the fixture writes");
            let mut id3 = b"ID3\x04\x00\x00\x00\x00\x08\x00".to_vec();
            id3.resize(10 + 1024, 0);
            file.write_all(&id3).expect("the fixture writes");
            let mut frames = vec![0u8; mib * 1024 * 1024];
            for chunk in frames.chunks_mut(8) {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                chunk.copy_from_slice(&state.to_le_bytes()[..chunk.len()]);
            }
            file.write_all(&frames).expect("the fixture writes");
            let mut tag = b"TAG".to_vec();
            tag.resize(128, 0);
            file.write_all(&tag).expect("the fixture writes");
            path
        })
        .collect();

    let total_mib = (files * mib) as f64;
    println!("{files} files x {mib} MiB = {total_mib} MiB");

    let started = Instant::now();
    let hashes = shiranami_library::content_hashes(&paths);
    report("sampled, parallel", started, files);
    assert!(hashes.iter().all(Option::is_some));

    let started = Instant::now();
    for path in &paths {
        shiranami_library::content_hash(path).expect("the file hashes");
    }
    report("sampled, one thread", started, files);

    let started = Instant::now();
    for path in &paths {
        let bytes = std::fs::read(path).expect("the file reads");
        let _ = Sha256::digest(&bytes[1034..bytes.len() - 128]);
    }
    report("full payload, one thread", started, files);
}

fn report(label: &str, started: Instant, files: usize) {
    let elapsed = started.elapsed();
    println!(
        "{label:>26}: {:>8.1} ms total, {:>7.3} ms/file",
        elapsed.as_secs_f64() * 1e3,
        elapsed.as_secs_f64() * 1e3 / files as f64
    );
}
