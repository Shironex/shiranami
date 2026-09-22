//! Pins v2's own `resize → encode → hash` against the committed covers.
//!
//! Architecture §3.3 asks for exactly this: *"a golden test pins `resize →
//! encode → hash` against a committed fixture so the hash function can never
//! drift **within** v2"*.
//!
//! This is the drift that would actually hurt users. Differing from v1 costs a
//! few duplicated kilobytes (see `art_v1_compat.rs`); differing from *last
//! week's v2* would orphan every cover written since the previous release and
//! leave `tracks.album_art` rows pointing at files that no longer exist. An
//! `image`-crate bump that changes JPEG output, a filter-type edit, or a
//! stray colour-space change would all do it silently. They cannot now.
//!
//! **These constants must not be edited to make a test pass.** A failure here
//! means v2's cover cache is about to become unreproducible, and the fix is to
//! restore the pipeline, not the expectation. If a change is genuinely
//! intended, regenerate with:
//!
//! ```text
//! cargo test -p shiranami-metadata --test art_golden -- --ignored emit_golden_hashes
//! ```
//!
//! and say in the commit message why every user's newly written covers are
//! moving to new filenames.

use std::fs;
use std::path::{Path, PathBuf};

use shiranami_metadata::art;

/// Cover fixture, expected hash, expected pixel dimensions.
///
/// Captured on `image` 0.25.10 + `fast_image_resize` 6.1.0.
const GOLDEN: &[(&str, &str, u32, u32)] = &[
    (
        "cover-small.png",
        "a7adf3ad16679b1ff829defab3a330e7",
        100,
        80,
    ),
    (
        "cover-square.png",
        "cc89c527d35c945f74ae8ceab47f6e95",
        512,
        512,
    ),
    (
        "cover-tall.png",
        "fc4e87c0dfbce43bf6e584e82342d14b",
        228,
        512,
    ),
    (
        "cover-wide.png",
        "e3a90b3613258a60f387ea6ad39c6dcc",
        512,
        256,
    ),
];

fn covers_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join("covers")
}

fn processed(name: &str) -> art::ProcessedArt {
    let bytes = fs::read(covers_dir().join(name)).expect("a committed cover fixture is readable");
    art::process_cover(&bytes)
        .expect("a committed cover processes")
        .expect("a committed cover is decodable")
}

#[test]
fn the_pipeline_still_produces_the_pinned_hashes() {
    for (name, expected_hash, width, height) in GOLDEN {
        let art = processed(name);

        assert_eq!(
            (art.width, art.height),
            (*width, *height),
            "{name}: the downscale geometry changed"
        );
        assert_eq!(
            art::hash_bytes(&art.bytes),
            *expected_hash,
            "{name}: v2's cover encoding changed, so every cover written from now on \
             lands under a new filename. Do not edit this constant to make the test \
             pass — see the module docs."
        );
    }
}

#[test]
fn the_golden_set_covers_every_committed_image() {
    let mut pinned: Vec<&str> = GOLDEN.iter().map(|(name, ..)| *name).collect();
    pinned.sort_unstable();

    let mut on_disk: Vec<String> = fs::read_dir(covers_dir())
        .expect("the covers directory exists")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".png"))
        .collect();
    on_disk.sort();

    assert_eq!(
        pinned,
        on_disk.iter().map(String::as_str).collect::<Vec<_>>(),
        "a cover fixture was added without pinning it"
    );
}

#[test]
fn the_stored_url_is_derived_from_the_pinned_hash() {
    // The whole chain in one assertion: bytes → hash → filename → the string
    // that lands in `tracks.album_art`.
    let directory = tempfile::tempdir().expect("a temp dir");
    let (name, hash, ..) = GOLDEN[0];

    let bytes = fs::read(covers_dir().join(name)).expect("readable");
    let url = art::save_cover(directory.path(), &bytes)
        .expect("the cover saves")
        .expect("the cover is decodable");

    assert_eq!(url, format!("shiranami-art://art/{hash}.jpg"));
    assert!(art::cache_path(directory.path(), hash).is_file());
}

/// Re-emits the [`GOLDEN`] table. Not an assertion — see the module docs.
#[test]
#[ignore = "fixture emitter, not an assertion"]
fn emit_golden_hashes() {
    let mut names: Vec<String> = fs::read_dir(covers_dir())
        .expect("the covers directory exists")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".png"))
        .collect();
    names.sort();

    println!("const GOLDEN: &[(&str, &str, u32, u32)] = &[");
    for name in names {
        let art = processed(&name);
        println!(
            "    (\"{name}\", \"{}\", {}, {}),",
            art::hash_bytes(&art.bytes),
            art.width,
            art.height
        );
    }
    println!("];");
}
