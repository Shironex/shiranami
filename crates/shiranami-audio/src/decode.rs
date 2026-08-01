//! Decoding, the half of the C++ addon that `symphonia` replaces outright.
//!
//! v1's `core/audio_decoder.cpp` picked a decoder from the file *extension* —
//! `wav`/`wave`, `flac`, `mp3`, and nothing else — then read the entire track
//! into one malloc'd interleaved `float*` buffer that `DecodedAudio` freed by
//! RAII. Everything the extension switch did not name (`.m4a`, `.ogg`, `.aac`,
//! `.opus`, `.wma`, `.weba`, `.webm` — all of which the library scanner
//! accepts) fell through as undecodable: no waveform at all, and a 120-second
//! ffmpeg subprocess for the loudness value.
//!
//! Here the format is *probed* from the bytes with the extension as a hint
//! only, so a mislabelled file still decodes, and frames are pushed at a
//! [`PcmSink`] as they leave the decoder instead of accumulating.
//!
//! # Format coverage
//!
//! Against the extensions `AUDIO_EXTENSIONS` accepts in v1
//! (`apps/desktop/src/main/shared/media-types.ts`):
//!
//! | extension        | v1 native | v2                          |
//! | ---------------- | --------- | --------------------------- |
//! | `.wav`           | yes       | yes                         |
//! | `.flac`          | yes       | yes                         |
//! | `.mp3`           | yes       | yes                         |
//! | `.m4a` / `.aac`  | no        | yes (AAC and ALAC)          |
//! | `.ogg`           | no        | yes (Vorbis)                |
//! | `.weba`/`.webm`  | no        | container yes, Opus **no**  |
//! | `.opus`          | no        | **no** — symphonia has no Opus decoder |
//! | `.wma`           | no        | **no** — symphonia has no WMA decoder  |
//!
//! Opus and WMA are the residual gap, and they are a gap against v1's *ffmpeg
//! fallback*, never against its native path. They surface as
//! [`AudioError::UnsupportedCodec`] so a caller can tell "we cannot do this
//! one" from "this file is broken".

use std::ffi::OsStr;
use std::fs::File;
use std::path::Path;

use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

use crate::error::{AudioError, Result};
use crate::sink::{PcmSink, PcmSpec};

/// What a completed decode measured about the stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecodeSummary {
    /// The stream format, as announced to the sink.
    pub spec: PcmSpec,
    /// Total frames pushed at the sink.
    pub frames: u64,
}

impl DecodeSummary {
    /// Track length in seconds.
    ///
    /// Derived from the frames actually decoded rather than a container
    /// duration field, which is what the addon reported too
    /// (`frameCount / sampleRate` in `waveform.cpp`) — a truncated file then
    /// reads as its real length instead of its advertised one.
    #[must_use]
    pub fn duration_secs(&self) -> f64 {
        if self.spec.sample_rate == 0 {
            return 0.0;
        }
        self.frames as f64 / f64::from(self.spec.sample_rate)
    }
}

/// Decode every audio frame of `path` into `sink`.
///
/// Packets that fail to decode are skipped rather than aborting the file: a
/// single damaged frame in the middle of an otherwise readable track should
/// cost that track a few milliseconds of waveform, not its whole analysis.
/// A failure to *probe* the file, or an error the decoder cannot recover from,
/// is returned.
///
/// # Errors
///
/// [`AudioError::Io`] if the file cannot be opened, [`AudioError::Decode`] if
/// the container is unreadable, [`AudioError::NoAudioTrack`] if it holds no
/// audio, [`AudioError::UnsupportedCodec`] if the codec is outside this build's
/// coverage, or whatever the sink itself returns.
pub fn decode_file(path: &Path, sink: &mut dyn PcmSink) -> Result<DecodeSummary> {
    let file = File::open(path).map_err(|source| AudioError::io("open", path, source))?;
    let stream = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());

    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(OsStr::to_str) {
        hint.with_extension(extension);
    }

    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| AudioError::decode(path, error))?;

    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| AudioError::NoAudioTrack {
            path: path.to_path_buf(),
        })?;
    let track_id = track.id;
    let parameters = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or_else(|| AudioError::NoAudioTrack {
            path: path.to_path_buf(),
        })?;

    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(parameters, &AudioDecoderOptions::default())
        .map_err(|error| AudioError::UnsupportedCodec {
            path: path.to_path_buf(),
            reason: error.to_string(),
        })?;

    let mut state = DecodeState::default();
    let mut interleaved: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            // A truncated file ends mid-packet. v1's dr_libs simply stopped at
            // the last whole frame it could read, so ending the decode here
            // keeps a half-downloaded track analysable instead of failing it.
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(AudioError::decode(path, error)),
        };

        if packet.track_id != track_id {
            continue;
        }

        let audio = match decoder.decode(&packet) {
            Ok(audio) => audio,
            Err(SymphoniaError::DecodeError(_) | SymphoniaError::IoError(_)) => continue,
            Err(error) => return Err(AudioError::decode(path, error)),
        };

        let spec = PcmSpec {
            channels: u16::try_from(audio.spec().channels().count()).unwrap_or(u16::MAX),
            sample_rate: audio.spec().rate(),
        };
        state.observe(path, spec, sink)?;

        let samples = audio.samples_interleaved();
        if samples == 0 {
            continue;
        }
        interleaved.resize(samples, 0.0);
        audio.copy_to_slice_interleaved(&mut interleaved[..]);

        sink.accept(&interleaved[..samples])?;
        state.frames += audio.frames() as u64;
    }

    Ok(DecodeSummary {
        spec: state.spec.ok_or_else(|| AudioError::Decode {
            path: path.to_path_buf(),
            reason: "the file decoded to no audio frames".to_owned(),
        })?,
        frames: state.frames,
    })
}

/// Tracks the one-format-per-file invariant and the running frame count.
#[derive(Default)]
struct DecodeState {
    spec: Option<PcmSpec>,
    frames: u64,
}

impl DecodeState {
    /// Announce the spec to the sink on the first buffer, and reject a stream
    /// that changes format afterwards.
    fn observe(&mut self, path: &Path, spec: PcmSpec, sink: &mut dyn PcmSink) -> Result<()> {
        match self.spec {
            None => {
                sink.begin(spec)?;
                self.spec = Some(spec);
                Ok(())
            }
            Some(first) if first == spec => Ok(()),
            Some(first) => Err(AudioError::Decode {
                path: path.to_path_buf(),
                reason: format!(
                    "the stream changes format mid-file ({} ch @ {} Hz then {} ch @ {} Hz)",
                    first.channels, first.sample_rate, spec.channels, spec.sample_rate
                ),
            }),
        }
    }
}
