//! What v2's album-art pipeline does and does not reproduce from v1.
//!
//! Runs against `fixtures/v1-art.json`, which
//! `scripts/verify-art-baseline.mjs` generates by executing v1's **real** code:
//! Electron `nativeImage` for pipeline A and `sharp` for pipeline B, over the
//! committed covers in `fixtures/covers/`. The fixture is read with
//! `include_str!`, so this test is hermetic and keeps working after
//! `apps/desktop` is deleted at cutover (Phase 20) — the same arrangement
//! `shiranami-db` uses for `v1-schema.json`.
//!
//! # The verdict this file records
//!
//! Architecture §3.3 (**D16**, risk **R14**) decided in advance not to attempt
//! byte-parity with v1's encoder. Porting turned up a stronger reason than
//! "different encoders differ", and it is measured here rather than argued:
//!
//! **v1 has no single canonical output to be compatible with.** It ships two
//! art pipelines writing into one content-addressed directory, and they produce
//! different bytes — hence different cache filenames — for *every* cover
//! tested. `pipeline_a_and_pipeline_b_already_disagree_inside_v1` is that
//! measurement. So "match v1's bytes" is not a hard target; it is an
//! ill-defined one.
//!
//! What v2 therefore does, and what these tests pin:
//!
//! - reproduce the **geometry** exactly — v1's two pipelines agree here, and so
//!   does v2 (`the_geometry_matches_both_v1_pipelines`);
//! - reproduce the **hash construction, filename and URL shape** exactly, so
//!   every row already in `tracks.album_art` still resolves
//!   (`the_hash_construction_matches_v1` and friends);
//! - **adopt, never rewrite**: an inherited cache entry keeps v1's bytes
//!   (`an_inherited_v1_entry_is_served_not_regenerated`);
//! - and produce v2's own bytes for newly extracted art, which is the accepted
//!   cost (`v2_bytes_differ_from_both_v1_pipelines`).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use shiranami_metadata::art;

/// The recorded output of v1's real pipelines.
fn fixture() -> Value {
    serde_json::from_str(include_str!("../fixtures/v1-art.json"))
        .expect("the committed v1 art fixture must be valid JSON")
}

fn cover_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join("covers")
        .join(name)
}

fn cover_bytes(name: &str) -> Vec<u8> {
    fs::read(cover_path(name)).expect("a committed cover fixture is readable")
}

/// Every cover the fixture records, in a stable order.
fn cover_names(fixture: &Value) -> Vec<String> {
    let mut names: Vec<String> = fixture["sharp"]["entries"]
        .as_object()
        .expect("the fixture records sharp entries")
        .keys()
        .cloned()
        .collect();
    names.sort();
    assert!(!names.is_empty(), "the fixture records no covers");
    names
}

fn as_u32(value: &Value) -> u32 {
    u32::try_from(value.as_u64().expect("a numeric fixture field")).expect("fits in u32")
}

#[test]
fn the_geometry_matches_both_v1_pipelines() {
    // The portable half of the contract. Both v1 pipelines implement
    // `fit: inside, withoutEnlargement` at 512 px, and v2 must land on the same
    // pixel dimensions for every input — including the no-resize case, where a
    // subtly different "is it already small enough" test would show up.
    let fixture = fixture();

    for name in cover_names(&fixture) {
        let processed = art::process_cover(&cover_bytes(&name))
            .expect("a committed cover processes")
            .expect("a committed cover is decodable");

        let sharp = &fixture["sharp"]["entries"][&name];
        let native = &fixture["nativeImage"]["entries"][&name];

        assert_eq!(
            (processed.width, processed.height),
            (as_u32(&sharp["width"]), as_u32(&sharp["height"])),
            "{name}: v2 disagrees with v1's sharp pipeline on geometry"
        );
        assert_eq!(
            (processed.width, processed.height),
            (as_u32(&native["width"]), as_u32(&native["height"])),
            "{name}: v2 disagrees with v1's nativeImage pipeline on geometry"
        );
    }
}

#[test]
fn pipeline_a_and_pipeline_b_already_disagree_inside_v1() {
    // The measurement that makes byte-parity an ill-defined goal, and the
    // single most load-bearing assertion in this file. If a future change ever
    // makes v1's two pipelines agree, this fails loudly and the D16 rationale
    // must be revisited rather than silently inherited.
    let fixture = fixture();
    let names = cover_names(&fixture);

    let mut disagreements = 0;
    for name in &names {
        let sharp = &fixture["sharp"]["entries"][name];
        let native = &fixture["nativeImage"]["entries"][name];

        assert_eq!(
            native["decoded"].as_bool(),
            Some(true),
            "{name}: nativeImage could not decode a committed fixture"
        );

        if sharp["hash"] != native["hash"] {
            disagreements += 1;
        }

        // They do agree here, which is what isolates the encoder as the sole
        // cause: same input, same dimensions, different bytes.
        assert_eq!(
            (as_u32(&sharp["width"]), as_u32(&sharp["height"])),
            (as_u32(&native["width"]), as_u32(&native["height"])),
            "{name}: v1's two pipelines disagree on geometry too"
        );
    }

    assert_eq!(
        disagreements,
        names.len(),
        "v1's two art pipelines now agree on some covers; D16's rationale needs re-reading"
    );
}

#[test]
fn v2_bytes_differ_from_both_v1_pipelines() {
    // The accepted cost of D16, asserted rather than left to be discovered: a
    // cover re-extracted under v2 lands under a new filename. Nothing breaks,
    // because existing rows keep pointing at the files copied in by first-run
    // continuity — see `an_inherited_v1_entry_is_served_not_regenerated`.
    let fixture = fixture();

    for name in cover_names(&fixture) {
        let processed = art::process_cover(&cover_bytes(&name))
            .expect("a committed cover processes")
            .expect("a committed cover is decodable");
        let hash = art::hash_bytes(&processed.bytes);

        assert_ne!(
            Some(hash.as_str()),
            fixture["sharp"]["entries"][&name]["hash"].as_str(),
            "{name}: v2 reproduced sharp's bytes, which D16 says is not a goal — \
             if this is now genuinely achievable, D16 should be revisited"
        );
        assert_ne!(
            Some(hash.as_str()),
            fixture["nativeImage"]["entries"][&name]["hash"].as_str(),
            "{name}: v2 reproduced nativeImage's bytes"
        );
    }
}

#[test]
fn the_hash_construction_matches_v1() {
    // Not the bytes — the *construction*. Every filename on every user's disk
    // has this shape, and the serve layer resolves `tracks.album_art` through
    // it, so a change here breaks existing libraries even though a change in
    // the encoder does not.
    let fixture = fixture();

    assert_eq!(
        as_u32(&fixture["maxDimension"]),
        art::MAX_DIMENSION,
        "the 512 px ceiling is v1's"
    );
    assert_eq!(
        u8::try_from(fixture["jpegQuality"].as_u64().expect("numeric")).expect("fits"),
        art::JPEG_QUALITY,
        "quality 85 is v1's"
    );
    assert_eq!(
        usize::try_from(fixture["hashLength"].as_u64().expect("numeric")).expect("fits"),
        art::HASH_LENGTH,
        "the 32-hex truncation names every existing cache file"
    );
    assert_eq!(
        fixture["albumArtUrlPrefix"].as_str(),
        Some(art::ART_URL_PREFIX),
        "every existing `tracks.album_art` row starts with this"
    );

    // And the shape v1 recorded really is what v2 builds.
    for name in cover_names(&fixture) {
        let recorded = fixture["sharp"]["entries"][&name]["hash"]
            .as_str()
            .expect("a recorded hash");

        assert_eq!(recorded.len(), art::HASH_LENGTH);
        assert_eq!(
            art::file_name_for(recorded),
            fixture["sharp"]["entries"][&name]["fileName"]
                .as_str()
                .expect("a recorded filename"),
            "{name}: v2 builds a different filename from the same hash"
        );
        assert_eq!(
            art::art_url_for(&art::file_name_for(recorded)),
            fixture["sharp"]["entries"][&name]["albumArtUrl"]
                .as_str()
                .expect("a recorded URL"),
            "{name}: v2 builds a different `tracks.album_art` value from the same hash"
        );
    }
}

#[test]
fn a_v1_stored_url_still_resolves_to_its_cache_file() {
    // The read direction: given a row v1 wrote, v2 must find the file. This is
    // what "existing files keep serving" means in §3.3, and it is the reason
    // abandoning byte-parity is survivable at all.
    let fixture = fixture();

    for name in cover_names(&fixture) {
        let entry = &fixture["sharp"]["entries"][&name];
        let url = entry["albumArtUrl"].as_str().expect("a recorded URL");

        assert_eq!(
            art::file_name_from_url(Some(url)).as_deref(),
            entry["fileName"].as_str(),
            "{name}: a v1-written URL no longer resolves to its filename"
        );
    }
}

#[test]
fn an_inherited_v1_entry_is_served_not_regenerated() {
    // D16 end to end. A user's `album-art/` directory is copied across by
    // first-run continuity; the files in it carry v1's bytes under v1's
    // hashes. v2 must leave them exactly as they are, even when it processes
    // the very same cover and would have produced something different.
    let fixture = fixture();
    let name = "cover-square.png";
    let entry = &fixture["sharp"]["entries"][name];

    let directory = tempfile::tempdir().expect("a temp dir");
    let data_dir = directory.path();

    // Stand in for the inherited cache: v1's filename, holding bytes v2 would
    // never produce.
    let inherited_name = entry["fileName"].as_str().expect("a recorded filename");
    let inherited_bytes = b"these are v1's JPEG bytes, byte-for-byte";
    fs::create_dir_all(art::art_dir(data_dir)).expect("the art dir is creatable");
    let inherited_path = art::art_dir(data_dir).join(inherited_name);
    fs::write(&inherited_path, inherited_bytes).expect("the inherited entry writes");

    // v2 now extracts the same cover from a file.
    let produced = art::save_cover(data_dir, &cover_bytes(name))
        .expect("the cover saves")
        .expect("the cover is decodable");

    assert_eq!(
        fs::read(&inherited_path).expect("the inherited entry is readable"),
        inherited_bytes,
        "an adopted cache entry was rewritten — this is exactly what D16 forbids"
    );
    assert_ne!(
        art::file_name_from_url(Some(&produced)).as_deref(),
        Some(inherited_name),
        "v2 should have written a second file, not reused v1's name"
    );

    // The accepted cost, made concrete: two files, one cover.
    let count = fs::read_dir(art::art_dir(data_dir))
        .expect("the art dir exists")
        .count();
    assert_eq!(count, 2, "the duplicate is expected and bounded at one extra");
}

#[test]
fn the_fixture_covers_every_committed_image() {
    // A cover added to `fixtures/covers/` without regenerating the baseline
    // would silently narrow every test above.
    let fixture = fixture();
    let recorded = cover_names(&fixture);

    let mut on_disk: Vec<String> = fs::read_dir(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("covers"),
    )
    .expect("the covers directory exists")
    .filter_map(std::result::Result::ok)
    .map(|entry| entry.file_name().to_string_lossy().into_owned())
    .filter(|name| name.ends_with(".png"))
    .collect();
    on_disk.sort();

    assert_eq!(
        recorded, on_disk,
        "regenerate with `pnpm verify:art-baseline --write --with-electron`"
    );
}
