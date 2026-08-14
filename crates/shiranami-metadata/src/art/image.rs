//! Decode → downscale → JPEG-encode. The bytes this produces are what the
//! cache filename hashes, so every constant here is part of the cache key.
//!
//! Ported from v1's **two** implementations of the same contract:
//! `downscaleImage` in `apps/desktop/src/main/protocols/art-protocol.ts`
//! (Electron `nativeImage`, main process) and `downscaleAndHash` in
//! `apps/desktop/src/main/shared/album-art-image.ts` (`sharp`, scan utility).
//! They existed in parallel because `nativeImage` is unavailable inside an
//! Electron `utilityProcess`. v2 has no `utilityProcess`, so it has one
//! pipeline — this one.
//!
//! **Byte-parity with either v1 pipeline is abandoned, by decision D16.** The
//! geometry, the quality number and the hash construction are reproduced
//! exactly; the encoder is not, and cannot be. See the `art` module docs for
//! the evidence and the consequences.

use std::io::Cursor;

use fast_image_resize::images::Image as ResizeImage;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageReader};

use crate::error::{MetadataError, Result};

/// Longest-edge ceiling for a cached cover, in pixels.
///
/// v1: `MAX_DIMENSION = 512` in `art-protocol.ts` and
/// `ALBUM_ART_MAX_DIMENSION = 512` in `album-art-image.ts` — the same number
/// declared twice because the two pipelines never shared a constant.
pub const MAX_DIMENSION: u32 = 512;

/// JPEG quality for a cached cover.
///
/// v1: `toJPEG(85)` and `.jpeg({ quality: 85 })`. The number is reproduced
/// because it is the visual contract users already have; it is *not* what makes
/// the bytes reproducible, since quality 85 means something slightly different
/// to every encoder.
pub const JPEG_QUALITY: u8 = 85;

/// The result of running cover bytes through the pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessedArt {
    /// The encoded JPEG. These are the bytes the cache hashes and stores.
    pub bytes: Vec<u8>,
    /// Width after downscaling.
    pub width: u32,
    /// Height after downscaling.
    pub height: u32,
}

/// Decode arbitrary cover bytes, downscale to fit [`MAX_DIMENSION`], and
/// re-encode as JPEG at [`JPEG_QUALITY`].
///
/// Returns `Ok(None)` for empty input or bytes no decoder recognises. v1
/// returned `null` for both (`nativeImage`'s `isEmpty()` and `sharp`'s throw,
/// caught), and callers treat "no usable cover" as an ordinary outcome rather
/// than a fault — a library scan must not stop because one file carries a
/// truncated APIC frame.
///
/// The re-encode is unconditional. A 100×100 JPEG that needs no resizing is
/// still decoded and re-encoded, because v1 did (`toJPEG(85)` runs on the
/// no-resize branch too) and because it is what makes every cache entry a
/// uniform JPEG regardless of what the tag held.
pub fn process_cover(input: &[u8]) -> Result<Option<ProcessedArt>> {
    if input.is_empty() {
        return Ok(None);
    }

    let Some(decoded) = decode(input)? else {
        return Ok(None);
    };

    let (width, height) = (decoded.width(), decoded.height());
    if width == 0 || height == 0 {
        return Ok(None);
    }

    let (target_width, target_height) = fit_inside(width, height);
    let resized = if (target_width, target_height) == (width, height) {
        decoded
    } else {
        downscale(&decoded, target_width, target_height)?
    };

    let bytes = encode_jpeg(&resized)?;

    Ok(Some(ProcessedArt {
        bytes,
        width: target_width,
        height: target_height,
    }))
}

/// The `fit: 'inside', withoutEnlargement: true` geometry, reproduced exactly.
///
/// v1's two pipelines agreed here and this is the half of the contract that
/// *is* portable, so it is pinned by its own tests rather than folded into the
/// encoder comparison. `nativeImage`'s form is the explicit one:
///
/// ```text
/// scale  = 512 / max(width, height)
/// target = max(1, round(dimension * scale))
/// ```
///
/// The `max(1, …)` floor is load-bearing for extreme aspect ratios: a 10000×1
/// cover scales to 512×0.0512, and a zero-height image is not encodable. v1 has
/// a test pinning exactly that case.
pub fn fit_inside(width: u32, height: u32) -> (u32, u32) {
    if width <= MAX_DIMENSION && height <= MAX_DIMENSION {
        return (width, height);
    }

    let longest = width.max(height);
    let scale = f64::from(MAX_DIMENSION) / f64::from(longest);

    // `round` and not `floor`: v1 used `Math.round`, and the two disagree on
    // roughly half of all inputs.
    let scaled = |dimension: u32| -> u32 {
        let value = (f64::from(dimension) * scale).round();
        // `value` is bounded by MAX_DIMENSION, so the cast cannot truncate.
        (value as u32).max(1)
    };

    (scaled(width), scaled(height))
}

/// Decode, guessing the format from content rather than trusting a MIME string.
///
/// v1 ignored the MIME it was handed — `saveAlbumArt(data, _mimeType)` names the
/// parameter with a leading underscore and never reads it — because an APIC
/// frame's declared type is frequently wrong. Sniffing reproduces that, and
/// costs nothing.
fn decode(input: &[u8]) -> Result<Option<DynamicImage>> {
    let reader = match ImageReader::new(Cursor::new(input)).with_guessed_format() {
        Ok(reader) => reader,
        // An I/O error against an in-memory cursor is not reachable in
        // practice, but it is not a corrupt-image signal either, so it is
        // reported rather than flattened into `None`.
        Err(source) => {
            return Err(MetadataError::Io {
                operation: "read the cover bytes of",
                path: std::path::PathBuf::from("<embedded cover>"),
                source,
            });
        }
    };

    if reader.format().is_none() {
        return Ok(None);
    }

    match reader.decode() {
        Ok(image) => Ok(Some(image)),
        // A recognised container that will not decode is a damaged cover, which
        // is v1's `isEmpty()` / caught-throw case: no cover, not a failure.
        Err(error) => {
            tracing::debug!(%error, "cover image did not decode; treating it as absent");
            Ok(None)
        }
    }
}

/// Lanczos3 downscale through `fast_image_resize`.
///
/// The filter choice is the closest available analogue to what v1 asked for on
/// both sides — `nativeImage`'s `quality: 'best'` and sharp's default reducer
/// are both windowed-sinc — but it is chosen for output quality, not for
/// matching them, which D16 already gives up on.
fn downscale(source: &DynamicImage, width: u32, height: u32) -> Result<DynamicImage> {
    // RGB8 and not RGBA8: the destination is JPEG, which has no alpha channel.
    // Flattening here rather than at encode time means a transparent PNG cover
    // composites against `image`'s default (black) exactly once.
    let source_rgb = source.to_rgb8();

    let src = ResizeImage::from_vec_u8(
        source_rgb.width(),
        source_rgb.height(),
        source_rgb.into_raw(),
        PixelType::U8x3,
    )
    .map_err(MetadataError::image)?;

    let mut dst = ResizeImage::new(width, height, PixelType::U8x3);

    Resizer::new()
        .resize(
            &src,
            &mut dst,
            &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3)),
        )
        .map_err(MetadataError::image)?;

    let buffer = image::RgbImage::from_raw(width, height, dst.into_vec())
        .ok_or_else(|| MetadataError::image("the resized buffer was the wrong length"))?;

    Ok(DynamicImage::ImageRgb8(buffer))
}

/// Encode as baseline JPEG at [`JPEG_QUALITY`].
///
/// Reachable from [`crate::background`], which needs the encoder without the
/// 512 px downscale in front of it: a wallpaper's poster still has to keep the
/// wallpaper's dimensions.
pub(crate) fn encode_jpeg(source: &DynamicImage) -> Result<Vec<u8>> {
    let rgb = source.to_rgb8();
    let mut bytes = Vec::new();

    JpegEncoder::new_with_quality(&mut Cursor::new(&mut bytes), JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(MetadataError::image)?;

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A deterministic PNG, built in-process so no fixture file is involved.
    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut buffer = image::RgbImage::new(width, height);
        for (x, y, pixel) in buffer.enumerate_pixels_mut() {
            // A gradient rather than a flat fill: a flat image compresses to
            // near-nothing and would hide a resize bug behind an identical
            // encode.
            *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
        }

        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(buffer)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .expect("an in-memory PNG encodes");
        bytes
    }

    #[test]
    fn empty_input_is_not_a_cover() {
        assert_eq!(
            process_cover(&[]).expect("empty input is not an error"),
            None
        );
    }

    #[test]
    fn undecodable_bytes_are_not_a_cover() {
        let garbage = b"this is definitely not an image";
        assert_eq!(
            process_cover(garbage).expect("garbage is not an error"),
            None
        );
    }

    #[test]
    fn a_small_cover_keeps_its_dimensions_but_is_still_re_encoded() {
        let processed = process_cover(&png(100, 80))
            .expect("a valid PNG processes")
            .expect("a valid PNG is a cover");

        assert_eq!((processed.width, processed.height), (100, 80));
        // v1 pins "no upscaling" and "always JPEG" as separate properties.
        assert_eq!(
            &processed.bytes[..3],
            &[0xFF, 0xD8, 0xFF],
            "the cache stores JPEG regardless of the source format"
        );
    }

    #[test]
    fn a_wide_cover_is_downscaled_on_its_longest_edge() {
        let processed = process_cover(&png(2000, 1000))
            .expect("a valid PNG processes")
            .expect("a valid PNG is a cover");

        // v1's test asserts exactly these numbers for exactly this input.
        assert_eq!((processed.width, processed.height), (512, 256));
    }

    #[test]
    fn the_geometry_matches_v1s_pinned_cases() {
        // Every case here is lifted from a v1 test in `art-protocol.test.ts`
        // or `album-art-image.test.ts`.
        assert_eq!(fit_inside(256, 256), (256, 256), "already inside");
        assert_eq!(fit_inside(1024, 512), (512, 256), "landscape");
        assert_eq!(fit_inside(400, 800), (256, 512), "portrait");
        assert_eq!(fit_inside(1000, 1000), (512, 512), "square");
        assert_eq!(fit_inside(100, 80), (100, 80), "no enlargement");
        assert_eq!(fit_inside(2000, 1000), (512, 256), "the sharp test case");
    }

    #[test]
    fn an_extreme_aspect_ratio_keeps_a_one_pixel_floor() {
        // 10000×1 scales the short edge to 0.0512. Rounding that to zero would
        // produce an unencodable image; v1 has this exact test.
        assert_eq!(fit_inside(10_000, 1), (512, 1));
        assert_eq!(fit_inside(1, 10_000), (1, 512));
    }

    #[test]
    fn the_scale_rounds_rather_than_truncates() {
        // 3000×1001 → 512×170.8. Truncation gives 170, rounding gives 171.
        // v1 used `Math.round`, so this is a compatibility assertion, not a
        // taste one.
        assert_eq!(fit_inside(3000, 1001), (512, 171));
    }

    #[test]
    fn the_same_input_encodes_to_the_same_bytes_twice() {
        // The cache is content-addressed, so a non-deterministic encoder would
        // fill the disk with duplicates of every cover. v1 pins this too.
        let source = png(700, 700);
        let first = process_cover(&source).expect("processes").expect("a cover");
        let second = process_cover(&source).expect("processes").expect("a cover");

        assert_eq!(first.bytes, second.bytes);
    }

    #[test]
    fn different_covers_encode_to_different_bytes() {
        let first = process_cover(&png(64, 64))
            .expect("processes")
            .expect("a cover");
        let second = process_cover(&png(64, 65))
            .expect("processes")
            .expect("a cover");

        assert_ne!(first.bytes, second.bytes);
    }
}
