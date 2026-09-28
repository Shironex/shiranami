//! The identity hash against hand-built containers.
//!
//! Each container is assembled byte by byte so a test can vary exactly one
//! thing (the size of a tag block, whether a trailing tag exists, where the
//! `moov` box sits) and assert the hash does or does not move with it. The
//! real tag writer (`lofty`) is exercised against real encoded files in
//! `tests/identity_retag.rs`.

use std::path::{Path, PathBuf};

use super::{SCHEME, WINDOW, WINDOWS, content_hash, content_hashes};

/// Deterministic pseudo-random bytes standing in for encoded audio.
fn noise(len: usize, seed: u32) -> Vec<u8> {
    let mut state = seed.wrapping_mul(2_654_435_761).wrapping_add(1);
    (0..len)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state.to_le_bytes()[0]
        })
        .collect()
}

fn write(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, bytes).expect("the fixture writes");
    path
}

fn hash_of(dir: &Path, name: &str, bytes: &[u8]) -> String {
    content_hash(&write(dir, name, bytes)).expect("the fixture hashes")
}

/// An ID3v2.4 tag whose body is `body` bytes of padding.
fn id3v2(body: u32) -> Vec<u8> {
    let mut tag = b"ID3\x04\x00\x00".to_vec();
    tag.extend(
        (0..4)
            .rev()
            .map(|shift| ((body >> (7 * shift)) & 0x7f) as u8),
    );
    tag.resize(10 + body as usize, 0);
    tag
}

fn id3v1(title: &str) -> Vec<u8> {
    let mut tag = b"TAG".to_vec();
    tag.extend_from_slice(title.as_bytes());
    tag.resize(128, 0);
    tag
}

/// An APEv2 tag with a header, `items` bytes of item data, and a footer.
fn apev2(items: u32) -> Vec<u8> {
    let block = |flags: u32| {
        let mut bytes = b"APETAGEX".to_vec();
        bytes.extend_from_slice(&2000u32.to_le_bytes());
        bytes.extend_from_slice(&(items + 32).to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&flags.to_le_bytes());
        bytes.resize(32, 0);
        bytes
    };
    let mut tag = block(0xa000_0000);
    tag.resize(32 + items as usize, b'x');
    tag.extend(block(0x8000_0000));
    tag
}

fn mp3(frames: &[u8], leading: u32, trailing: &[Vec<u8>]) -> Vec<u8> {
    let mut file = id3v2(leading);
    file.extend_from_slice(frames);
    for tag in trailing {
        file.extend_from_slice(tag);
    }
    file
}

fn flac(frames: &[u8], comment: usize, padding: usize) -> Vec<u8> {
    let block = |kind: u8, last: bool, body: usize| {
        let mut bytes = vec![kind | if last { 0x80 } else { 0 }];
        bytes.extend_from_slice(&u32::try_from(body).expect("small").to_be_bytes()[1..]);
        bytes.resize(4 + body, kind);
        bytes
    };
    let mut file = b"fLaC".to_vec();
    file.extend(block(0, false, 34));
    file.extend(block(4, false, comment));
    file.extend(block(1, true, padding));
    file.extend_from_slice(frames);
    file
}

fn riff_chunk(id: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let mut chunk = id.to_vec();
    chunk.extend_from_slice(&u32::try_from(body.len()).expect("small").to_le_bytes());
    chunk.extend_from_slice(body);
    if body.len() % 2 == 1 {
        chunk.push(0);
    }
    chunk
}

fn wav(samples: &[u8], list: usize) -> Vec<u8> {
    let mut body = b"WAVE".to_vec();
    body.extend(riff_chunk(b"fmt ", &[1; 16]));
    if list > 0 {
        body.extend(riff_chunk(b"LIST", &vec![b'i'; list]));
    }
    body.extend(riff_chunk(b"data", samples));
    body.extend(riff_chunk(
        b"id3 ",
        &id3v2(u32::try_from(list).expect("small")),
    ));
    riff_chunk(b"RIFF", &body)
}

fn mp4_box(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let mut bytes = u32::try_from(8 + body.len())
        .expect("small")
        .to_be_bytes()
        .to_vec();
    bytes.extend_from_slice(kind);
    bytes.extend_from_slice(body);
    bytes
}

fn m4a(samples: &[u8], moov: usize, moov_first: bool) -> Vec<u8> {
    let mut file = mp4_box(b"ftyp", b"M4A \0\0\0\0isom");
    let moov = mp4_box(b"moov", &vec![b'm'; moov]);
    let mdat = mp4_box(b"mdat", samples);
    if moov_first {
        file.extend(moov);
        file.extend(mdat);
    } else {
        file.extend(mdat);
        file.extend(moov);
    }
    file
}

#[test]
fn a_hash_names_its_scheme() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let hash = hash_of(dir.path(), "a.mp3", &noise(4096, 1));

    assert!(hash.starts_with(&format!("{SCHEME}:")));
    assert_eq!(hash.len(), SCHEME.len() + 1 + 64, "a full sha256 in hex");
}

#[test]
fn an_mp3_keeps_its_hash_across_every_tag_block_a_writer_touches() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let frames = noise(900_000, 2);

    let bare = hash_of(dir.path(), "bare.mp3", &mp3(&frames, 0, &[]));
    let variants = [
        mp3(&frames, 4096, &[]),
        mp3(&frames, 37, &[id3v1("Old Title")]),
        mp3(&frames, 1_000, &[apev2(300), id3v1("New Title")]),
        mp3(&frames, 20_000, &[apev2(5)]),
    ];

    for (index, bytes) in variants.iter().enumerate() {
        assert_eq!(
            hash_of(dir.path(), &format!("v{index}.mp3"), bytes),
            bare,
            "variant {index} differs only in its tags"
        );
    }
}

#[test]
fn different_audio_hashes_differently() {
    let dir = tempfile::tempdir().expect("a temp dir");

    let one = hash_of(dir.path(), "one.mp3", &mp3(&noise(900_000, 3), 0, &[]));
    let two = hash_of(dir.path(), "two.mp3", &mp3(&noise(900_000, 4), 0, &[]));

    assert_ne!(one, two);
}

#[test]
fn a_change_inside_a_window_changes_the_hash() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let frames = noise(900_000, 5);
    let mut edited = frames.clone();
    // The middle window starts at span / 2 and is WINDOW long.
    let middle = usize::try_from((900_000 - WINDOW) / 2).expect("small") + 10;
    edited[middle] ^= 0xff;

    assert_ne!(
        hash_of(dir.path(), "a.mp3", &mp3(&frames, 0, &[])),
        hash_of(dir.path(), "b.mp3", &mp3(&edited, 0, &[]))
    );
}

/// The documented limit of sampling, pinned so nobody mistakes it for a bug:
/// a change that falls entirely between windows, with the length unchanged,
/// is not seen. See the module docs for why that is an acceptable risk.
#[test]
fn a_change_between_windows_is_not_seen() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let frames = noise(900_000, 6);
    let mut edited = frames.clone();
    let between = usize::try_from(WINDOW).expect("small") + 1_000;
    edited[between] ^= 0xff;

    assert_eq!(
        hash_of(dir.path(), "a.mp3", &mp3(&frames, 0, &[])),
        hash_of(dir.path(), "b.mp3", &mp3(&edited, 0, &[]))
    );
}

#[test]
fn a_payload_one_byte_longer_is_a_different_file() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let frames = noise(900_001, 7);

    assert_ne!(
        hash_of(dir.path(), "a.mp3", &mp3(&frames[..900_000], 0, &[])),
        hash_of(dir.path(), "b.mp3", &mp3(&frames, 0, &[]))
    );
}

#[test]
fn a_short_payload_is_hashed_whole() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let len = usize::try_from(WINDOW * WINDOWS).expect("small");
    let frames = noise(len, 8);
    let mut edited = frames.clone();
    // Between where the windows would sit if this payload were sampled.
    edited[usize::try_from(WINDOW).expect("small") + 1_000] ^= 0xff;

    assert_ne!(
        hash_of(dir.path(), "a.mp3", &mp3(&frames, 0, &[])),
        hash_of(dir.path(), "b.mp3", &mp3(&edited, 0, &[]))
    );
}

#[test]
fn a_flac_keeps_its_hash_when_its_metadata_blocks_change() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let frames = noise(700_000, 9);

    let before = hash_of(dir.path(), "a.flac", &flac(&frames, 40, 8_192));
    let after = hash_of(dir.path(), "b.flac", &flac(&frames, 9_000, 0));
    let id3_prefixed = {
        let mut bytes = id3v2(512);
        bytes.extend(flac(&frames, 1, 1));
        hash_of(dir.path(), "c.flac", &bytes)
    };

    assert_eq!(before, after);
    assert_eq!(before, id3_prefixed, "a stray leading ID3v2 is skipped too");
}

#[test]
fn a_wav_hashes_only_its_data_chunk() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let samples = noise(500_001, 10);

    assert_eq!(
        hash_of(dir.path(), "a.wav", &wav(&samples, 0)),
        hash_of(dir.path(), "b.wav", &wav(&samples, 3_333))
    );
}

#[test]
fn an_m4a_hashes_only_its_mdat_wherever_moov_sits() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let samples = noise(600_000, 11);

    let front = hash_of(dir.path(), "a.m4a", &m4a(&samples, 100, true));
    assert_eq!(
        front,
        hash_of(dir.path(), "b.m4a", &m4a(&samples, 12_000, true))
    );
    assert_eq!(
        front,
        hash_of(dir.path(), "c.m4a", &m4a(&samples, 7, false))
    );
}

#[test]
fn the_same_bytes_in_two_containers_hash_alike() {
    // Not a feature, a boundary: the payload range is what is hashed, so the
    // same bytes carried by an MP3 and by a WAV `data` chunk hash alike. Real
    // encoded audio never coincides across containers, which is why the
    // scheme carries no container tag.
    let dir = tempfile::tempdir().expect("a temp dir");
    let bytes = noise(400_000, 12);

    assert_eq!(
        hash_of(dir.path(), "a.mp3", &mp3(&bytes, 0, &[])),
        hash_of(dir.path(), "a.wav", &wav(&bytes, 0))
    );
}

#[test]
fn a_corrupt_length_field_falls_back_to_the_whole_file() {
    let dir = tempfile::tempdir().expect("a temp dir");
    // A FLAC whose first block claims 16 MiB in a 2 KiB file.
    let mut bytes = b"fLaC\x00\xff\xff\xff".to_vec();
    bytes.extend(noise(2_048, 13));
    let mut other = bytes.clone();
    other[100] ^= 1;

    let one = hash_of(dir.path(), "a.flac", &bytes);
    let two = hash_of(dir.path(), "b.flac", &other);

    assert_ne!(one, two, "the whole (short) file was hashed");
}

#[test]
fn an_unreadable_path_is_an_error_and_a_batch_answers_none_for_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let present = write(dir.path(), "here.mp3", &noise(1_000, 14));
    let missing = dir.path().join("gone.mp3");

    assert!(content_hash(&missing).is_err());

    let hashes = content_hashes(&[present.clone(), missing, present]);
    assert!(hashes[0].is_some());
    assert!(hashes[1].is_none());
    assert_eq!(hashes[0], hashes[2], "input order is kept");
}

#[test]
fn an_empty_file_still_has_an_identity() {
    let dir = tempfile::tempdir().expect("a temp dir");

    assert!(hash_of(dir.path(), "empty.mp3", &[]).starts_with(SCHEME));
}
