//! Where a file's audio payload starts and ends, with every tag block skipped.
//!
//! The identity hash has to survive the in-app tag editor, which rewrites the
//! file it edits. What a tag writer touches is the metadata *around* the audio:
//! it grows or shrinks an ID3v2 block (usually by eating or adding padding),
//! rewrites the trailing ID3v1/APEv2 blocks, replaces FLAC metadata blocks,
//! rewrites RIFF `LIST`/`id3 ` chunks, or rewrites an MP4 `moov` box. None of
//! them re-encodes the audio, so the byte range that carries it is stable, and
//! that range is what this module finds.
//!
//! Detection is by content, never by extension, so a mislabelled file is still
//! read the way its bytes say. Every walk is bounded by the file length and a
//! step cap, and every malformed or unrecognised shape degrades to the whole
//! file rather than an error: a whole-file range is still a usable identity,
//! just one that a tag edit can change.
//!
//! # Formats
//!
//! | Leading bytes          | Payload                                         |
//! | ---------------------- | ----------------------------------------------- |
//! | `ID3` (any number)     | skipped, then the rest is classified again      |
//! | `fLaC`                 | after the last metadata block, to the end       |
//! | `RIFF….WAVE`           | the body of the `data` chunk                    |
//! | `….ftyp` (MP4, M4A)    | first `mdat` body to the end of the last `mdat`  |
//! | `OggS`                 | the whole file (see below)                      |
//! | anything else (MPEG)   | trailing ID3v1, APEv2, Lyrics3v2 and appended ID3v2 trimmed |
//!
//! Ogg (Vorbis, Opus) keeps its comments in the second logical packet, inside
//! the page stream the audio shares, and a rewrite renumbers every page's
//! checksum after it. Skipping them would mean parsing pages; the brief this
//! was built to accepted a whole-file fallback for such formats, and the only
//! cost is that an Ogg file which is retagged *and* moved between two rescans
//! is not recognised. WMA and WebM take the same fallback.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::ops::Range;

/// Upper bound on chunks, boxes, blocks or tags walked in any one file.
///
/// Real files carry a handful. The cap exists so that a corrupt length field
/// that points back into the file cannot turn a scan into a spin.
const MAX_STEPS: usize = 1024;

/// Upper bound on top-level MP4 boxes walked.
///
/// Higher than [`MAX_STEPS`] because a fragmented file carries two boxes per
/// fragment, and an hour-long mix cut into two-second fragments is 3,600 of
/// them. Each step is one 8-byte read.
const MP4_MAX_BOXES: usize = 16_384;

/// ID3v2 header and footer length.
const ID3V2_HEADER: u64 = 10;
/// ID3v1 block length (the classic `TAG` block).
const ID3V1_LEN: u64 = 128;
/// APEv2 header and footer length.
const APE_FOOTER: u64 = 32;
/// The Lyrics3v2 end marker plus its six-digit size field.
const LYRICS3_TRAILER: u64 = 15;

/// The byte range of the audio payload in `file`, which is `len` bytes long.
///
/// Never fails on content: anything it cannot classify is `0..len`. It only
/// fails when the file cannot be read.
pub(crate) fn audio_range(file: &mut File, len: u64) -> io::Result<Range<u64>> {
    let mut start = 0;

    // Any number of leading ID3v2 tags, which some writers put in front of
    // FLAC and AAC files as well as MP3s.
    for _ in 0..MAX_STEPS {
        match id3v2_len_at(file, start, len)? {
            Some(tag_len) => start += tag_len,
            None => break,
        }
    }
    if start >= len {
        return Ok(0..len);
    }

    let mut head = [0u8; 12];
    let got = read_at(file, start, &mut head)?;
    let head = &head[..got];

    let range = if head.starts_with(b"fLaC") {
        flac(file, start, len)?
    } else if head.len() == 12 && &head[..4] == b"RIFF" && &head[8..12] == b"WAVE" {
        riff_data(file, start, len)?
    } else if head.len() >= 8 && &head[4..8] == b"ftyp" {
        mp4_mdat(file, start, len)?
    } else if head.starts_with(b"OggS") {
        None
    } else {
        Some(start..trim_trailing_tags(file, start, len)?)
    };

    Ok(match range {
        Some(range) if range.start < range.end && range.end <= len => range,
        _ => 0..len,
    })
}

/// The total length of an ID3v2 tag at `at`, header and footer included.
fn id3v2_len_at(file: &mut File, at: u64, len: u64) -> io::Result<Option<u64>> {
    let mut header = [0u8; ID3V2_HEADER as usize];
    if read_at(file, at, &mut header)? < header.len() || &header[..3] != b"ID3" {
        return Ok(None);
    }
    let Some(body) = syncsafe(&header[6..10]) else {
        return Ok(None);
    };
    // Flag bit 4 announces a footer, a second 10-byte block after the body.
    let footer = if header[5] & 0x10 != 0 {
        ID3V2_HEADER
    } else {
        0
    };
    let total = ID3V2_HEADER + body + footer;
    Ok((at + total <= len).then_some(total))
}

/// A 28-bit ID3v2 "syncsafe" integer: four bytes with the top bit of each clear.
fn syncsafe(bytes: &[u8]) -> Option<u64> {
    if bytes.iter().any(|byte| byte & 0x80 != 0) {
        return None;
    }
    Some(
        bytes
            .iter()
            .fold(0u64, |acc, &byte| (acc << 7) | u64::from(byte)),
    )
}

/// FLAC: the frames start after the metadata block flagged "last".
fn flac(file: &mut File, start: u64, len: u64) -> io::Result<Option<Range<u64>>> {
    let mut at = start + 4;
    for _ in 0..MAX_STEPS {
        let mut header = [0u8; 4];
        if read_at(file, at, &mut header)? < header.len() {
            return Ok(None);
        }
        let body = u64::from(u32::from_be_bytes([0, header[1], header[2], header[3]]));
        at += 4 + body;
        if at > len {
            return Ok(None);
        }
        if header[0] & 0x80 != 0 {
            return Ok(Some(at..len));
        }
    }
    Ok(None)
}

/// WAV: the body of the `data` chunk. Every other chunk (`LIST`, `id3 `,
/// `bext`, …) is metadata a tag writer may rewrite.
fn riff_data(file: &mut File, start: u64, len: u64) -> io::Result<Option<Range<u64>>> {
    let mut at = start + 12;
    for _ in 0..MAX_STEPS {
        let mut header = [0u8; 8];
        if read_at(file, at, &mut header)? < header.len() {
            return Ok(None);
        }
        let body = u64::from(u32::from_le_bytes([
            header[4], header[5], header[6], header[7],
        ]));
        let body_start = at + 8;
        if &header[..4] == b"data" {
            // A streaming writer may leave the size unpatched; clamp to the file.
            return Ok(Some(body_start..(body_start + body).min(len)));
        }
        // Chunks are word-aligned: an odd body carries one pad byte.
        at = body_start + body + (body & 1);
        if at >= len {
            return Ok(None);
        }
    }
    Ok(None)
}

/// MP4/M4A: from the first `mdat` body to the end of the last `mdat`.
///
/// Tags live in `moov/udta` (or a top-level `meta`), and a writer that grows
/// `moov` in front of `mdat` rewrites the chunk offsets in `moov`, not the
/// samples. A plain file has one `mdat`, so the span is exactly its body. A
/// **fragmented** file (DASH, as YouTube serves m4a) carries a `moof`/`mdat`
/// pair per few seconds of audio after its `moov`; hashing only the first
/// `mdat` would identify a song by its intro, so the span runs to the end of
/// the last one. The `moof` boxes inside the span describe fragments and are
/// not written by tag editors, and a trailing `mfra` index is left outside.
fn mp4_mdat(file: &mut File, start: u64, len: u64) -> io::Result<Option<Range<u64>>> {
    let mut at = start;
    let mut span: Option<Range<u64>> = None;
    for _ in 0..MP4_MAX_BOXES {
        if at >= len {
            return Ok(span);
        }
        let mut header = [0u8; 8];
        if read_at(file, at, &mut header)? < header.len() {
            return Ok(None);
        }
        let size32 = u64::from(u32::from_be_bytes([
            header[0], header[1], header[2], header[3],
        ]));
        let (header_len, size) = match size32 {
            // Size 0 means "to the end of the file".
            0 => (8, len - at),
            // Size 1 means a 64-bit size follows the type.
            1 => {
                let mut large = [0u8; 8];
                if read_at(file, at + 8, &mut large)? < large.len() {
                    return Ok(None);
                }
                (16, u64::from_be_bytes(large))
            }
            size => (8, size),
        };
        // A hostile or corrupt size must read as malformed, never overflow.
        let Some(next) = at.checked_add(size) else {
            return Ok(None);
        };
        if size < header_len {
            return Ok(None);
        }
        if &header[4..8] == b"mdat" {
            let end = next.min(len);
            span = Some(match span {
                Some(open) => open.start..end,
                None => at + header_len..end,
            });
        }
        at = next;
    }
    // More boxes than any real file carries: treat as malformed.
    Ok(None)
}

/// MPEG and friends: peel trailing tag blocks off the end, in any order.
///
/// Writers stack them (APEv2 then ID3v1 is common from foobar2000-era tools),
/// so the loop keeps peeling until a pass removes nothing.
fn trim_trailing_tags(file: &mut File, start: u64, len: u64) -> io::Result<u64> {
    let mut end = len;
    for _ in 0..MAX_STEPS {
        let peeled = peel_one(file, start, end)?;
        if peeled == 0 {
            break;
        }
        end -= peeled;
    }
    Ok(end)
}

/// The length of one trailing tag block ending at `end`, or 0.
fn peel_one(file: &mut File, start: u64, end: u64) -> io::Result<u64> {
    let room = end - start;

    if room >= ID3V1_LEN {
        let mut marker = [0u8; 3];
        read_at(file, end - ID3V1_LEN, &mut marker)?;
        if &marker == b"TAG" {
            return Ok(ID3V1_LEN);
        }
    }

    if room >= APE_FOOTER {
        let mut footer = [0u8; APE_FOOTER as usize];
        read_at(file, end - APE_FOOTER, &mut footer)?;
        if &footer[..8] == b"APETAGEX" {
            // The size covers the items and the footer, not the optional header.
            let size = u64::from(u32::from_le_bytes([
                footer[12], footer[13], footer[14], footer[15],
            ]));
            let flags = u32::from_le_bytes([footer[20], footer[21], footer[22], footer[23]]);
            let header = if flags & 0x8000_0000 != 0 {
                APE_FOOTER
            } else {
                0
            };
            let total = size + header;
            if total >= APE_FOOTER && total <= room {
                return Ok(total);
            }
        }
    }

    if room >= LYRICS3_TRAILER {
        let mut trailer = [0u8; LYRICS3_TRAILER as usize];
        read_at(file, end - LYRICS3_TRAILER, &mut trailer)?;
        if &trailer[6..] == b"LYRICS200"
            && let Some(size) = ascii_decimal(&trailer[..6])
        {
            let total = size + LYRICS3_TRAILER;
            if total <= room {
                return Ok(total);
            }
        }
    }

    if room >= ID3V2_HEADER {
        // An appended ID3v2 tag announces itself with a `3DI` footer.
        let mut footer = [0u8; ID3V2_HEADER as usize];
        read_at(file, end - ID3V2_HEADER, &mut footer)?;
        if &footer[..3] == b"3DI"
            && let Some(body) = syncsafe(&footer[6..10])
        {
            let total = 2 * ID3V2_HEADER + body;
            if total <= room {
                return Ok(total);
            }
        }
    }

    Ok(0)
}

/// A fixed-width ASCII decimal, as Lyrics3v2 writes its size.
fn ascii_decimal(bytes: &[u8]) -> Option<u64> {
    bytes.iter().try_fold(0u64, |acc, &byte| {
        byte.is_ascii_digit()
            .then(|| acc * 10 + u64::from(byte - b'0'))
    })
}

/// Fill as much of `buf` as the file holds from `at`, returning how much that was.
pub(crate) fn read_at(file: &mut File, at: u64, buf: &mut [u8]) -> io::Result<usize> {
    file.seek(SeekFrom::Start(at))?;
    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
    Ok(filled)
}
