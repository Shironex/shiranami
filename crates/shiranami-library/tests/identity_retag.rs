//! The identity hash across a real tag rewrite, by the real tag writer.
//!
//! The in-app tag editor writes through `lofty`, so that is the writer used
//! here, on real encoded files: `shiranami-metadata`'s `sine.*` fixtures,
//! read in place rather than committed a third time (see `support/tree.rs`).
//! Each file is copied, hashed, retagged twice (once small, once with enough
//! text to outgrow any padding the encoder left), and hashed again.

#[path = "support/tree.rs"]
mod tree;

use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::{Accessor, ItemKey};
use lofty::probe::Probe;
use lofty::tag::Tag;
use shiranami_library::content_hash;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../shiranami-metadata/tests/fixtures")
        .join(name)
}

/// Replace the file's primary tag with one carrying `title` and `comment`.
fn retag(path: &Path, title: &str, comment: &str) {
    let mut file = Probe::open(path)
        .expect("the fixture opens")
        .read()
        .expect("the fixture parses");

    let mut tag = Tag::new(file.primary_tag_type());
    tag.set_title(title.to_owned());
    tag.set_artist("Someone Else".to_owned());
    tag.insert_text(ItemKey::Comment, comment.to_owned());

    file.insert_tag(tag);
    file.save_to_path(path, WriteOptions::default())
        .expect("the fixture retags");
}

/// Hash, retag small, hash, retag large, hash. Returns the three hashes and
/// the three file sizes.
fn through_two_retags(path: &Path) -> ([String; 3], [u64; 3]) {
    let size = || std::fs::metadata(path).expect("the file exists").len();
    let hash = || content_hash(path).expect("the file hashes");

    let before = (hash(), size());
    retag(path, "Retitled", "short");
    let small = (hash(), size());
    retag(path, "Retitled Again", &"a long liner note ".repeat(2_000));
    let large = (hash(), size());

    ([before.0, small.0, large.0], [before.1, small.1, large.1])
}

fn copied(dir: &Path, name: &str) -> PathBuf {
    let path = dir.join(name);
    std::fs::copy(fixture(name), &path).expect("the fixture copies");
    path
}

#[test]
fn every_container_with_a_located_payload_survives_a_retag() {
    let dir = tempfile::tempdir().expect("a temp dir");

    for name in ["sine.mp3", "sine.flac", "sine.m4a"] {
        let path = copied(dir.path(), name);
        let (hashes, sizes) = through_two_retags(&path);

        assert_ne!(
            sizes[0], sizes[2],
            "{name}: the retag really rewrote the file"
        );
        assert_eq!(
            hashes[0], hashes[1],
            "{name}: a small retag keeps the identity"
        );
        assert_eq!(
            hashes[0], hashes[2],
            "{name}: a retag that grows the tags too"
        );
    }
}

#[test]
fn a_wav_survives_a_retag() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = tree::wav(dir.path(), "tone.wav");
    tree::tag(&path, "First", "Artist", "Album");

    let (hashes, sizes) = through_two_retags(&path);

    assert_ne!(sizes[0], sizes[2]);
    assert_eq!(hashes[0], hashes[2]);
}

/// The documented fallback, pinned: Ogg is hashed whole (see `payload`), so a
/// retag changes its identity. A retagged Ogg that is also moved before the
/// next rescan is therefore not followed, which is today's behaviour for every
/// format.
#[test]
fn an_ogg_is_hashed_whole_so_a_retag_changes_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = copied(dir.path(), "sine.ogg");

    let (hashes, _) = through_two_retags(&path);

    assert_ne!(hashes[0], hashes[2]);
}

#[test]
fn two_different_recordings_never_share_an_identity() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let names = ["sine.mp3", "sine.flac", "sine.m4a", "sine.ogg"];

    let hashes: Vec<String> = names
        .iter()
        .map(|name| content_hash(&copied(dir.path(), name)).expect("hashes"))
        .collect();

    for (i, a) in hashes.iter().enumerate() {
        for b in &hashes[i + 1..] {
            assert_ne!(a, b);
        }
    }
}
