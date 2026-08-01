//! Building fixture directory trees to scan.
//!
//! `#[path]`-included rather than reached through a `tests/support/mod.rs`,
//! because `mod.rs` is a manifest in this workspace and this file is anything
//! but. Same arrangement as `shiranami-metadata`'s `audio.rs` and
//! `shiranami-audio`'s `synth.rs`.
//!
//! Everything is **synthesised**, not committed. `shiranami-audio` and
//! `shiranami-metadata` each carry a copy of the same four `sine.*` containers,
//! and a third copy would be 60 KB of bytes this crate does not actually test —
//! Phase 10 cares about which files are *found* and in what order, not about
//! decoding them. A tagged WAV written by `lofty` exercises the whole read path
//! this crate depends on and costs nothing to keep in the repository.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::fs;
use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::{Accessor, ItemKey};
use lofty::probe::Probe;
use lofty::tag::{Tag, TagType};

/// A 1×1 transparent PNG, for the embedded-cover handoff test.
///
/// Committing 70 bytes rather than a JPEG fixture keeps this file the only
/// binary this crate carries, and the art pipeline's own encoding is
/// `shiranami-metadata`'s tested contract, not this crate's.
pub(crate) const ONE_PIXEL_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4,
    133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

/// Create `path`'s parent directories, then return `path`.
fn prepared(path: PathBuf) -> PathBuf {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the fixture writes");
    }
    path
}

/// Write a minimal but valid PCM WAV at `root/relative`.
///
/// Synthesised rather than committed: the contents are irrelevant here, only
/// that `lofty` reads the container and reports a duration.
pub(crate) fn wav(root: &Path, relative: &str) -> PathBuf {
    const SAMPLE_RATE: u32 = 44_100;
    const CHANNELS: u16 = 1;
    const BITS: u16 = 16;
    const FRAMES: u32 = SAMPLE_RATE / 20;

    let data_len = FRAMES * u32::from(CHANNELS) * u32::from(BITS / 8);
    let byte_rate = SAMPLE_RATE * u32::from(CHANNELS) * u32::from(BITS / 8);
    let block_align = CHANNELS * (BITS / 8);

    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&CHANNELS.to_le_bytes());
    bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    bytes.extend_from_slice(&byte_rate.to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&BITS.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, 0);

    let path = prepared(root.join(relative));
    fs::write(&path, &bytes).expect("the synthesised WAV writes");
    path
}

/// A file with arbitrary bytes — used both for non-audio entries and for
/// unparseable ones with an audio extension.
pub(crate) fn raw(root: &Path, relative: &str, contents: &[u8]) -> PathBuf {
    let path = prepared(root.join(relative));
    fs::write(&path, contents).expect("the fixture writes");
    path
}

/// An empty directory.
pub(crate) fn dir(root: &Path, relative: &str) -> PathBuf {
    let path = root.join(relative);
    fs::create_dir_all(&path).expect("the fixture writes");
    path
}

/// Write title/artist/album tags into an existing file.
pub(crate) fn tag(path: &Path, title: &str, artist: &str, album: &str) {
    let mut file = Probe::open(path)
        .expect("the fixture opens")
        .read()
        .expect("the fixture parses");

    let mut written = Tag::new(TagType::Id3v2);
    written.set_title(title.to_owned());
    written.set_artist(artist.to_owned());
    written.set_album(album.to_owned());
    written.insert_text(ItemKey::AlbumArtist, artist.to_owned());

    file.insert_tag(written);
    file.save_to_path(path, WriteOptions::default())
        .expect("the fixture tags");
}

/// Embed [`ONE_PIXEL_PNG`] as the file's first picture.
pub(crate) fn tag_with_cover(path: &Path, title: &str) {
    let mut file = Probe::open(path)
        .expect("the fixture opens")
        .read()
        .expect("the fixture parses");

    let mut written = Tag::new(TagType::Id3v2);
    written.set_title(title.to_owned());
    written.push_picture(
        Picture::unchecked(ONE_PIXEL_PNG.to_vec())
            .pic_type(PictureType::CoverFront)
            .mime_type(MimeType::Png)
            .build(),
    );

    file.insert_tag(written);
    file.save_to_path(path, WriteOptions::default())
        .expect("the fixture tags");
}

/// Sorted file names of a scan result, for order-insensitive assertions.
pub(crate) fn names(paths: &[PathBuf]) -> Vec<String> {
    let mut names: Vec<String> = paths
        .iter()
        .map(|path| {
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    names.sort();
    names
}
