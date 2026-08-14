//! Import one user-chosen image: refuse, verify, store, freeze.
//!
//! The order of the four checks is the design. Cheap refusals come first and
//! each one bounds the cost of the next: the extension check costs a string
//! compare, the byte cap costs a `stat`, the pixel cap costs an image header,
//! and only then does anything decode. Reordering this — checking dimensions
//! after a decode, say — turns a refusal into the very allocation it exists to
//! refuse.

use std::io::Cursor;
use std::path::Path;

use image::{AnimationDecoder, DynamicImage, ImageDecoder as _, ImageFormat, ImageReader, Limits};
use shiranami_core::store::atomic::write_atomic;

use crate::art::cache::hash_bytes;
use crate::background::record::{
    CustomBackground, MAX_DIMENSION, MAX_FILE_BYTES, MAX_PIXELS, background_dir, extension_of,
    still_name_for,
};
use crate::error::{MetadataError, Result};

/// Import `source` into the app's background directory.
///
/// Returns the record to persist. It does **not** persist anything and does not
/// remove a previous background: the caller writes the record first and then
/// runs [`crate::background::sweep_orphans`], so a crash between the two leaves
/// an unreferenced file that the next sweep collects, rather than a live record
/// pointing at a file that is already gone.
///
/// # Errors
///
/// [`MetadataError::BackgroundUnsupportedFormat`] for an extension outside the
/// allowlist, [`MetadataError::BackgroundTooLarge`] past the byte cap,
/// [`MetadataError::BackgroundDimensionsTooLarge`] past the pixel cap, and
/// [`MetadataError::BackgroundNotAnImage`] when the bytes are not the image the
/// extension claimed. Anything else is an ordinary I/O failure.
pub fn import_background(data_dir: &Path, source: &Path) -> Result<CustomBackground> {
    let claimed = claimed_format(source)?;

    let size = std::fs::metadata(source)
        .map_err(|error| MetadataError::io("read the size of", source, error))?
        .len();
    if size > MAX_FILE_BYTES {
        return Err(MetadataError::BackgroundTooLarge {
            size,
            max: MAX_FILE_BYTES,
        });
    }

    let bytes = std::fs::read(source).map_err(|error| MetadataError::io("read", source, error))?;

    let format = sniff(&bytes)?;
    // The extension is a claim about the bytes, and this is where the claim is
    // tested. Storing a mislabelled file would put a name the serve route trusts
    // on content it never inspected.
    if format != claimed {
        return Err(MetadataError::BackgroundNotAnImage);
    }

    // Two caps, not one. The edge cap refuses an absurdly long image; the pixel
    // cap refuses an absurdly *large* one, which the edge cap alone lets through
    // — 8192x8192 is inside every edge limit and is still 67 megapixels, a
    // quarter-gigabyte of RGBA before anything has decoded it.
    let (width, height) = dimensions(&bytes)?;
    if width.max(height) > MAX_DIMENSION || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err(MetadataError::BackgroundDimensionsTooLarge {
            width,
            height,
            max: MAX_DIMENSION,
        });
    }

    let animated = is_animated(format, &bytes)?;

    // Content-addressed, so nothing the user typed reaches the filesystem and
    // re-importing the same wallpaper converges on one file. The extension comes
    // from the sniffed format rather than the source path, so the stored name
    // describes the bytes even when the original was misnamed in a harmless way
    // (`.jpeg` for a JPEG).
    let file_name = format!("bg-{}.{}", hash_bytes(&bytes), canonical_extension(format));
    let directory = background_dir(data_dir);
    std::fs::create_dir_all(&directory)
        .map_err(|error| MetadataError::io("create the background directory", &directory, error))?;

    // `write_atomic` creates owner-only. That is wrong for a sidecar written
    // beside a user's music — which is why `lyrics::writeback` deliberately does
    // not use it — and right here: this file lives in app data and is read back
    // only by this process.
    let path = directory.join(&file_name);
    write_atomic(&path, &bytes)
        .map_err(|error| MetadataError::io("write the background", &path, error))?;

    let still_file_name = if animated {
        Some(write_still(&directory, &file_name, &bytes)?)
    } else {
        None
    };

    Ok(CustomBackground {
        file_name,
        still_file_name,
        width,
        height,
        animated,
    })
}

/// Encode frame 0 beside the source and return its name.
///
/// Frame 0 is what a plain decode yields for both animated formats we accept —
/// `GifDecoder` hands back the first frame through `ImageDecoder`, and the WebP
/// decoder seeks the first `ANMF` chunk — so this needs no frame iteration.
fn write_still(directory: &Path, file_name: &str, bytes: &[u8]) -> Result<String> {
    let frame = decode(bytes)?;
    let encoded = crate::art::image::encode_jpeg(&frame)?;

    let still_name = still_name_for(file_name);
    let path = directory.join(&still_name);
    write_atomic(&path, &encoded)
        .map_err(|error| MetadataError::io("write the background still", &path, error))?;

    Ok(still_name)
}

/// The format the file's extension claims, refusing anything unlisted.
fn claimed_format(source: &Path) -> Result<ImageFormat> {
    let extension = extension_of(source).ok_or(MetadataError::BackgroundUnsupportedFormat {
        extension: String::new(),
    })?;

    if !crate::background::record::is_allowed_extension(source) {
        return Err(MetadataError::BackgroundUnsupportedFormat { extension });
    }

    ImageFormat::from_extension(&extension)
        .ok_or(MetadataError::BackgroundUnsupportedFormat { extension })
}

/// The format the bytes actually are, by content.
fn sniff(bytes: &[u8]) -> Result<ImageFormat> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| MetadataError::BackgroundNotAnImage)?
        .format()
        .ok_or(MetadataError::BackgroundNotAnImage)
}

/// Dimensions from the header, without decoding the pixels.
fn dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| MetadataError::BackgroundNotAnImage)?
        .into_dimensions()
        .map_err(|_| MetadataError::BackgroundNotAnImage)
}

/// Decode frame 0.
fn decode(bytes: &[u8]) -> Result<DynamicImage> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| MetadataError::BackgroundNotAnImage)?
        .decode()
        .map_err(|_| MetadataError::BackgroundNotAnImage)
}

/// Whether the source carries more than one frame.
///
/// Three of the four accepted formats can animate: GIF, WebP, and PNG by way of
/// APNG, which Chromium plays. Missing the PNG case would be the quiet kind of
/// wrong — an APNG would import as static, get no poster still, and keep
/// animating under `prefers-reduced-motion`, which is the exact promise the
/// freeze design exists to keep.
///
/// The GIF answer costs two frames rather than a whole animation: `take(2)` is
/// what stops a long GIF being fully decoded just to learn that it moves. The
/// decoder is constructed directly rather than through `ImageReader`, which
/// means it starts at `Limits::no_limits()` — so the default ceiling is put
/// back explicitly. Without it, a two-frame GIF declaring a huge logical screen
/// allocates its whole canvas here with nothing to stop it.
fn is_animated(format: ImageFormat, bytes: &[u8]) -> Result<bool> {
    match format {
        ImageFormat::Gif => {
            let mut decoder = image::codecs::gif::GifDecoder::new(Cursor::new(bytes))
                .map_err(|_| MetadataError::BackgroundNotAnImage)?;
            decoder
                .set_limits(Limits::default())
                .map_err(|_| MetadataError::BackgroundNotAnImage)?;
            // `take(2)` before the filter, not after: it bounds the work to two
            // frame decodes whatever the file claims. The filter is what makes
            // the count mean "frames that decoded" — `Frames` yields
            // `Result`s, and counting those raw treats a corrupt second frame
            // as evidence of animation, which is the opposite of what a failure
            // to decode it says.
            Ok(decoder.into_frames().take(2).filter(Result::is_ok).count() > 1)
        }
        ImageFormat::WebP => {
            let decoder = image::codecs::webp::WebPDecoder::new(Cursor::new(bytes))
                .map_err(|_| MetadataError::BackgroundNotAnImage)?;
            Ok(decoder.has_animation())
        }
        ImageFormat::Png => {
            let decoder = image::codecs::png::PngDecoder::new(Cursor::new(bytes))
                .map_err(|_| MetadataError::BackgroundNotAnImage)?;
            Ok(decoder
                .is_apng()
                .map_err(|_| MetadataError::BackgroundNotAnImage)?)
        }
        _ => Ok(false),
    }
}

/// The extension a stored file gets for a sniffed format.
fn canonical_extension(format: ImageFormat) -> &'static str {
    format.extensions_str().first().copied().unwrap_or("bin")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::background::record::background_dir;

    fn write(directory: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = directory.join(name);
        std::fs::write(&path, bytes).expect("the fixture writes");
        path
    }

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut buffer = image::RgbImage::new(width, height);
        for (x, y, pixel) in buffer.enumerate_pixels_mut() {
            *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 200]);
        }
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(buffer)
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .expect("an in-memory PNG encodes");
        bytes
    }

    /// A two-frame GIF, so the animation branch is exercised by a real
    /// animation rather than by a mocked flag.
    fn animated_gif() -> Vec<u8> {
        use image::codecs::gif::GifEncoder;
        use image::{Delay, Frame, RgbaImage};

        let mut bytes = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut bytes);
            for shade in [40_u8, 200_u8] {
                let buffer = RgbaImage::from_pixel(8, 8, image::Rgba([shade, shade, shade, 255]));
                encoder
                    .encode_frame(Frame::from_parts(
                        buffer,
                        0,
                        0,
                        Delay::from_numer_denom_ms(100, 1),
                    ))
                    .expect("a frame encodes");
            }
        }
        bytes
    }

    fn still_gif() -> Vec<u8> {
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(image::RgbImage::from_pixel(8, 8, image::Rgb([10, 20, 30])))
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Gif)
            .expect("a one-frame GIF encodes");
        bytes
    }

    #[test]
    fn an_unlisted_extension_is_refused_before_anything_is_read() {
        let temp = tempfile::tempdir().expect("a temp dir");
        // The bytes are a perfectly good PNG; only the extension is wrong. The
        // refusal must not depend on the content being bad.
        let source = write(temp.path(), "wallpaper.bmp", &png(10, 10));

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundUnsupportedFormat { .. })
        ));
    }

    /// I5: the extension is a claim, and a claim that does not match the bytes
    /// is refused rather than stored.
    #[test]
    fn bytes_that_are_not_the_claimed_format_are_refused() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let source = write(temp.path(), "wallpaper.png", b"this is not a PNG at all");

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundNotAnImage)
        ));
    }

    #[test]
    fn a_real_image_under_the_wrong_image_extension_is_refused() {
        let temp = tempfile::tempdir().expect("a temp dir");
        // A genuine PNG named `.gif`. Both are allowed extensions, so only the
        // sniff-versus-claim comparison catches this.
        let source = write(temp.path(), "wallpaper.gif", &png(10, 10));

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundNotAnImage)
        ));
    }

    /// The edge cap alone would accept this: 7000x7000 is inside 8192 on both
    /// sides and is still 49 megapixels. A flat image of that size compresses to
    /// far under the byte cap, which is exactly the shape both caps together are
    /// for — cheap on disk, expensive the moment it decodes.
    #[test]
    fn an_image_inside_the_edge_cap_but_past_the_pixel_cap_is_refused() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            7000,
            7000,
            image::Rgb([0, 0, 0]),
        ))
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("a large flat PNG encodes");
        assert!(
            (bytes.len() as u64) < MAX_FILE_BYTES,
            "the fixture must pass the byte cap, or it tests the wrong refusal"
        );
        let source = write(temp.path(), "wallpaper.png", &bytes);

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundDimensionsTooLarge { .. })
        ));
    }

    /// The PNG animation probe must not answer yes for an ordinary PNG — every
    /// static wallpaper would otherwise get a pointless poster still and be
    /// reported as animated.
    #[test]
    fn an_ordinary_png_is_not_reported_as_animated() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let data_dir = tempfile::tempdir().expect("a data dir");
        let source = write(temp.path(), "wallpaper.png", &png(32, 32));

        let record = import_background(data_dir.path(), &source).expect("a PNG imports");

        assert!(!record.animated);
        assert_eq!(record.still_file_name, None);
    }

    #[test]
    fn a_file_past_the_byte_cap_is_refused() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let source = write(
            temp.path(),
            "wallpaper.png",
            &vec![0_u8; (MAX_FILE_BYTES + 1) as usize],
        );

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundTooLarge { .. })
        ));
    }

    #[test]
    fn an_image_past_the_pixel_cap_is_refused() {
        let temp = tempfile::tempdir().expect("a temp dir");
        // A flat image compresses to far under the byte cap, which is exactly
        // the shape the pixel cap exists to catch.
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            MAX_DIMENSION + 1,
            4,
            image::Rgb([0, 0, 0]),
        ))
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("a wide PNG encodes");
        let source = write(temp.path(), "wallpaper.png", &bytes);

        assert!(matches!(
            import_background(temp.path(), &source),
            Err(MetadataError::BackgroundDimensionsTooLarge { .. })
        ));
    }

    #[test]
    fn a_static_image_is_stored_with_no_still() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let data_dir = tempfile::tempdir().expect("a data dir");
        let source = write(temp.path(), "wallpaper.png", &png(64, 32));

        let record = import_background(data_dir.path(), &source).expect("a PNG imports");

        assert_eq!((record.width, record.height), (64, 32));
        assert!(!record.animated);
        assert_eq!(record.still_file_name, None);
        assert!(record.file_name.starts_with("bg-"));
        assert!(record.file_name.ends_with(".png"));
        assert!(
            background_dir(data_dir.path())
                .join(&record.file_name)
                .exists()
        );
    }

    /// I2's backend half: an animated source produces the frozen frame the
    /// renderer swaps to. Without this file there is nothing to freeze *to*.
    #[test]
    fn an_animated_gif_gets_a_poster_still() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let data_dir = tempfile::tempdir().expect("a data dir");
        let source = write(temp.path(), "wallpaper.gif", &animated_gif());

        let record = import_background(data_dir.path(), &source).expect("a GIF imports");

        assert!(record.animated);
        let still = record
            .still_file_name
            .expect("an animated import has a still");
        assert_eq!(still, still_name_for(&record.file_name));

        let still_bytes = std::fs::read(background_dir(data_dir.path()).join(&still))
            .expect("the still exists on disk");
        assert_eq!(
            &still_bytes[..3],
            &[0xFF, 0xD8, 0xFF],
            "the frozen frame is a JPEG"
        );
    }

    /// A frame that does not decode is not evidence of animation.
    ///
    /// `Frames` yields `Result`s, so counting them raw makes a truncated GIF —
    /// one good frame, then garbage — report two frames and import as animated.
    /// The still would be right and the flag wrong, which is the quiet kind of
    /// wrong: nothing looks broken and the record says something untrue.
    #[test]
    fn a_frame_that_fails_to_decode_does_not_count_as_animation() {
        let full = animated_gif();
        // Cut inside the second frame's data: frame 0 still decodes, frame 1
        // cannot. Sized off the one-frame GIF so the truncation lands after the
        // first frame however the encoder laid the file out.
        let cut = still_gif().len() + 8;
        assert!(cut < full.len(), "the fixture must actually be truncated");

        let format = sniff(&full[..cut]).expect("a truncated GIF still sniffs as a GIF");
        assert_eq!(format, ImageFormat::Gif);

        assert!(
            !is_animated(format, &full[..cut]).expect("a truncated GIF is not an error here"),
            "a frame that failed to decode was counted as animation"
        );
    }

    #[test]
    fn a_single_frame_gif_is_not_treated_as_animated() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let data_dir = tempfile::tempdir().expect("a data dir");
        let source = write(temp.path(), "wallpaper.gif", &still_gif());

        let record = import_background(data_dir.path(), &source).expect("a GIF imports");

        assert!(!record.animated);
        assert_eq!(record.still_file_name, None, "a still image needs no still");
    }

    #[test]
    fn the_stored_name_is_derived_from_the_bytes_not_the_source_name() {
        let temp = tempfile::tempdir().expect("a temp dir");
        let data_dir = tempfile::tempdir().expect("a data dir");
        let bytes = png(20, 20);
        let first = write(temp.path(), "..%2F..%2Fetc%2Fpasswd.png", &bytes);
        let second = write(temp.path(), "innocuous.png", &bytes);

        let one = import_background(data_dir.path(), &first).expect("imports");
        let two = import_background(data_dir.path(), &second).expect("imports");

        assert_eq!(
            one.file_name, two.file_name,
            "the same bytes converge on one name"
        );
        assert!(
            !one.file_name.contains("passwd") && !one.file_name.contains(['/', '\\']),
            "no fragment of the source name survives into the stored name"
        );
    }
}
