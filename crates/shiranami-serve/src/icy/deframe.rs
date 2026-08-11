//! Pulling the metadata frames back out of an ICY stream.
//!
//! Asking a station for metadata (`Icy-MetaData: 1`) changes the body: it stops
//! being audio and becomes audio *interleaved with* metadata blocks, on a fixed
//! period the station reports in `icy-metaint`. Every `metaint` bytes of audio
//! are followed by one length byte; a length of `n` means `n * 16` bytes of
//! metadata follow, and `n == 0` — by far the common case, because a song lasts
//! for hundreds of periods — means the block is omitted entirely.
//!
//! ```text
//!   ├── metaint bytes of audio ──┤ 0 ├── metaint bytes of audio ──┤ 2 │ 32 bytes │ …
//! ```
//!
//! # The one invariant
//!
//! **The audio bytes out are the audio bytes in.** v1 declined metadata
//! precisely because a proxy that asks for it and does not de-frame it splices
//! length bytes and `StreamTitle='…'` text into the decoder's input, roughly
//! once a second, forever. That is not a subtle failure — but it is a silent
//! one at the point of the mistake, and it surfaces as clicks and glitches a
//! long way from here. So this module's job is to be exactly a filter: remove
//! the frames, pass everything else through untouched.
//!
//! # Why the chunking cannot be assumed
//!
//! A TCP read boundary has nothing to do with a `metaint` boundary. Every one
//! of these happens in the first minute of a real stream: a chunk that ends
//! mid-audio, one that ends exactly on the length byte, one that contains the
//! length byte and half the block, and one that contains several complete
//! periods. The state therefore lives in the struct rather than in the loop,
//! and the tests below feed the same stream at a dozen different chunk sizes to
//! prove the output does not depend on how it arrived.

use bytes::{Bytes, BytesMut};

use super::title;

/// Metadata lengths are counted in sixteen-byte units.
const BLOCK_UNIT: usize = 16;

/// What one chunk of upstream body yielded.
pub struct Frame {
    /// The audio, with every metadata frame removed. May be empty when the
    /// chunk was nothing but a block, which is legal and happens.
    pub audio: Bytes,
    /// Titles that completed in this chunk, in arrival order. Usually empty.
    pub titles: Vec<String>,
}

/// Where in the interleave pattern the next byte falls.
enum State {
    /// Audio, with this many bytes to go before the next length byte.
    Audio(usize),
    /// The length byte itself.
    Length,
    /// Inside a block: how much is still to come, and what has arrived.
    Metadata { remaining: usize, block: Vec<u8> },
}

/// The de-framer for one connection.
///
/// Not `Clone` and not shareable on purpose: it is a position in a byte stream,
/// and two holders would each advance it past the other's bytes.
pub struct Deframer {
    metaint: usize,
    state: State,
    /// The last title emitted, so a station that repeats itself every period
    /// does not wake the renderer every period. Stations do this constantly —
    /// the block is re-sent on a timer, not on a change.
    last: Option<String>,
}

impl Deframer {
    /// Start de-framing a stream whose station reported `metaint`.
    ///
    /// `metaint` must be non-zero; [`crate::upstream::UpstreamHead::metaint`]
    /// is what establishes that, and a stream without one is never de-framed.
    #[must_use]
    pub fn new(metaint: usize) -> Self {
        debug_assert!(metaint > 0, "a zero metaint has no period to count");
        Self {
            metaint,
            state: State::Audio(metaint),
            last: None,
        }
    }

    /// Feed one chunk of upstream body; take the audio and any new titles.
    #[must_use]
    pub fn push(&mut self, chunk: Bytes) -> Frame {
        // The overwhelmingly common chunk: entirely audio, no boundary in it.
        // Returned as the same `Bytes` it arrived as, so the ordinary path
        // copies nothing and cannot alter a byte it does not touch.
        if let State::Audio(left) = self.state
            && left >= chunk.len()
        {
            self.state = State::Audio(left - chunk.len());
            return Frame {
                audio: chunk,
                titles: Vec::new(),
            };
        }

        self.split(&chunk)
    }

    /// The general case: walk the chunk, moving through the state machine.
    fn split(&mut self, chunk: &[u8]) -> Frame {
        let mut audio = BytesMut::with_capacity(chunk.len());
        let mut titles = Vec::new();
        let mut cursor = 0;

        while cursor < chunk.len() {
            cursor += self.step(&chunk[cursor..], &mut audio, &mut titles);
        }

        Frame {
            audio: audio.freeze(),
            titles,
        }
    }

    /// Consume as much of `rest` as the current state wants; return how much.
    ///
    /// Always returns at least 1 for a non-empty `rest`, which is what stops
    /// [`Self::split`]'s loop from spinning.
    fn step(&mut self, rest: &[u8], audio: &mut BytesMut, titles: &mut Vec<String>) -> usize {
        match &mut self.state {
            State::Audio(left) => {
                let taken = (*left).min(rest.len());
                audio.extend_from_slice(&rest[..taken]);
                *left -= taken;
                if *left == 0 {
                    self.state = State::Length;
                }
                taken
            }
            State::Length => {
                self.state = after_length(self.metaint, rest[0]);
                1
            }
            State::Metadata { remaining, block } => {
                let taken = (*remaining).min(rest.len());
                block.extend_from_slice(&rest[..taken]);
                *remaining -= taken;
                if *remaining == 0 {
                    let block = std::mem::take(block);
                    self.state = State::Audio(self.metaint);
                    if let Some(title) = self.fresh_title(&block) {
                        titles.push(title);
                    }
                }
                taken
            }
        }
    }

    /// Parse a completed block, applying the repeat debounce.
    ///
    /// `None` covers both "the block named no title" and "it named the one
    /// already showing" — from the caller's side those are the same thing:
    /// nothing to tell the renderer.
    fn fresh_title(&mut self, block: &[u8]) -> Option<String> {
        let title = title::stream_title(block)?;
        if self.last.as_deref() == Some(title.as_str()) {
            return None;
        }
        self.last = Some(title.clone());
        Some(title)
    }
}

/// The state a length byte of `length` puts a stream of `metaint` into.
fn after_length(metaint: usize, length: u8) -> State {
    let bytes = usize::from(length) * BLOCK_UNIT;
    if bytes == 0 {
        // The common case by a wide margin: nothing changed this period.
        State::Audio(metaint)
    } else {
        State::Metadata {
            remaining: bytes,
            block: Vec::with_capacity(bytes),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const METAINT: usize = 64;

    /// A block as a station sends it: the length byte, then the padded text.
    fn framed(body: &str) -> Vec<u8> {
        let mut bytes = body.as_bytes().to_vec();
        while !bytes.len().is_multiple_of(BLOCK_UNIT) {
            bytes.push(0);
        }
        let mut framed = vec![u8::try_from(bytes.len() / BLOCK_UNIT).expect("a short block")];
        framed.extend_from_slice(&bytes);
        framed
    }

    /// `n` bytes of recognisable pseudo-audio.
    fn audio(n: usize, seed: u8) -> Vec<u8> {
        (0..n)
            .map(|i| u8::try_from(i % 251).expect("under 251").wrapping_add(seed))
            .collect()
    }

    /// Feed `stream` to a fresh de-framer in chunks of `size`, and collect
    /// everything that came out.
    fn run(stream: &[u8], size: usize) -> (Vec<u8>, Vec<String>) {
        let mut deframer = Deframer::new(METAINT);
        let mut out = Vec::new();
        let mut titles = Vec::new();
        for piece in stream.chunks(size) {
            let frame = deframer.push(Bytes::copy_from_slice(piece));
            out.extend_from_slice(&frame.audio);
            titles.extend(frame.titles);
        }
        (out, titles)
    }

    #[test]
    fn audio_with_no_blocks_passes_through_unchanged() {
        let stream = audio(METAINT, 0);
        let (out, titles) = run(&stream, METAINT);
        assert_eq!(out, stream);
        assert!(titles.is_empty());
    }

    /// The fast path must hand back the very same buffer, not a copy of it —
    /// that is what makes "byte-identical" true by construction rather than by
    /// a test that compares two copies.
    #[test]
    fn a_chunk_entirely_of_audio_is_not_copied() {
        let mut deframer = Deframer::new(METAINT);
        let chunk = Bytes::from_static(b"0123456789");
        let frame = deframer.push(chunk.clone());
        assert_eq!(frame.audio.as_ptr(), chunk.as_ptr());
    }

    #[test]
    fn a_zero_length_block_costs_one_byte_and_no_title() {
        let mut stream = audio(METAINT, 0);
        stream.push(0);
        stream.extend_from_slice(&audio(METAINT, 7));

        let (out, titles) = run(&stream, 4096);
        assert_eq!(out.len(), METAINT * 2);
        assert_eq!(out[..METAINT], audio(METAINT, 0));
        assert_eq!(out[METAINT..], audio(METAINT, 7));
        assert!(titles.is_empty());
    }

    #[test]
    fn a_block_is_stripped_and_its_title_surfaces() {
        let mut stream = audio(METAINT, 0);
        stream.extend_from_slice(&framed("StreamTitle='Cornelius - Drop';"));
        stream.extend_from_slice(&audio(METAINT, 7));

        let (out, titles) = run(&stream, 4096);
        assert_eq!(
            out.len(),
            METAINT * 2,
            "not one metadata byte reached the audio"
        );
        assert_eq!(out[..METAINT], audio(METAINT, 0));
        assert_eq!(out[METAINT..], audio(METAINT, 7));
        assert_eq!(titles, vec!["Cornelius - Drop".to_owned()]);
    }

    /// The whole reason the state lives in the struct. Every chunk size is a
    /// different set of split points — through the length byte, through the
    /// block, through both — and all of them must produce the same bytes.
    #[test]
    fn the_output_does_not_depend_on_how_the_stream_was_chunked() {
        let mut stream = audio(METAINT, 0);
        stream.extend_from_slice(&framed("StreamTitle='One';"));
        stream.extend_from_slice(&audio(METAINT, 7));
        stream.push(0);
        stream.extend_from_slice(&audio(METAINT, 13));
        stream.extend_from_slice(&framed("StreamTitle='Two';"));
        stream.extend_from_slice(&audio(METAINT, 29));

        let mut expected = audio(METAINT, 0);
        expected.extend_from_slice(&audio(METAINT, 7));
        expected.extend_from_slice(&audio(METAINT, 13));
        expected.extend_from_slice(&audio(METAINT, 29));

        for size in [1, 2, 3, 7, 16, 17, 31, 63, 64, 65, 127, 4096] {
            let (out, titles) = run(&stream, size);
            assert_eq!(out, expected, "audio differed at chunk size {size}");
            assert_eq!(
                titles,
                vec!["One".to_owned(), "Two".to_owned()],
                "at size {size}"
            );
        }
    }

    /// The specific split the task calls out: a block cut in half by a read
    /// boundary. Asserted on its own as well as inside the sweep above, because
    /// it is the failure that would corrupt audio rather than merely lose a
    /// title.
    #[test]
    fn a_block_split_across_two_reads_is_reassembled() {
        let mut stream = audio(METAINT, 0);
        let block = framed("StreamTitle='Split - Across';");
        stream.extend_from_slice(&block);
        stream.extend_from_slice(&audio(METAINT, 7));

        // Cut inside the block: after the length byte and part of the text.
        let cut = METAINT + 1 + BLOCK_UNIT;
        let mut deframer = Deframer::new(METAINT);
        let first = deframer.push(Bytes::copy_from_slice(&stream[..cut]));
        let second = deframer.push(Bytes::copy_from_slice(&stream[cut..]));

        assert!(first.titles.is_empty(), "the block was not complete yet");
        assert_eq!(second.titles, vec!["Split - Across".to_owned()]);

        let mut out = first.audio.to_vec();
        out.extend_from_slice(&second.audio);
        assert_eq!(out.len(), METAINT * 2);
    }

    /// Stations re-send the block on a timer, not on a change, so the same
    /// title arrives every period for the length of the song.
    #[test]
    fn a_repeated_title_is_emitted_once() {
        let mut stream = Vec::new();
        for seed in 0..4 {
            stream.extend_from_slice(&audio(METAINT, seed));
            stream.extend_from_slice(&framed("StreamTitle='Same';"));
        }

        let (_, titles) = run(&stream, 4096);
        assert_eq!(titles, vec!["Same".to_owned()]);
    }

    /// The debounce is on the *previous* title only: A, B, A is three songs
    /// (or a two-song rotation), and collapsing it would strand the display.
    #[test]
    fn a_title_that_comes_back_after_another_is_emitted_again() {
        let mut stream = Vec::new();
        for name in ["A", "B", "A"] {
            stream.extend_from_slice(&audio(METAINT, 0));
            stream.extend_from_slice(&framed(&format!("StreamTitle='{name}';")));
        }

        let (_, titles) = run(&stream, 4096);
        assert_eq!(titles, vec!["A".to_owned(), "B".to_owned(), "A".to_owned()]);
    }

    /// A block whose text yields nothing must still be removed from the audio.
    /// Losing a title is fine; leaving its bytes in the stream is not.
    #[test]
    fn an_unparseable_block_is_still_stripped() {
        let mut stream = audio(METAINT, 0);
        stream.extend_from_slice(&framed("StreamUrl='http://example.com';"));
        stream.extend_from_slice(&audio(METAINT, 7));

        let (out, titles) = run(&stream, 4096);
        assert_eq!(out.len(), METAINT * 2);
        assert!(titles.is_empty());
    }

    /// A block that is still open when the station hangs up leaves the
    /// de-framer mid-state. Nothing must be flushed as audio from it.
    #[test]
    fn a_truncated_final_block_yields_no_stray_audio() {
        let mut stream = audio(METAINT, 0);
        let block = framed("StreamTitle='Never finished';");
        stream.extend_from_slice(&block[..block.len() - 4]);

        let (out, titles) = run(&stream, 4096);
        assert_eq!(out, audio(METAINT, 0));
        assert!(titles.is_empty());
    }

    /// The maximum a length byte can describe. Bounded by the format at 4080
    /// bytes, which is why the block buffer needs no cap of its own.
    #[test]
    fn the_largest_possible_block_is_handled() {
        let mut body = "StreamTitle='".to_owned();
        body.push_str(&"x".repeat(4000));
        body.push_str("';");

        let mut stream = audio(METAINT, 0);
        stream.extend_from_slice(&framed(&body));
        stream.extend_from_slice(&audio(METAINT, 7));

        let (out, titles) = run(&stream, 512);
        assert_eq!(out.len(), METAINT * 2);
        assert_eq!(titles.len(), 1);
        assert_eq!(titles[0].len(), 4000);
    }
}
