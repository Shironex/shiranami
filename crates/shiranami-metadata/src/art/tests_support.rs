//! Deterministic images for the unit tests in this module tree.
//!
//! Built in-process rather than committed, for the same reason
//! `shiranami-audio` synthesises most of its fixtures: the bytes are then
//! identical on every machine and CI needs nothing installed.

use std::io::Cursor;

/// A small deterministic PNG with real detail in it.
///
/// A flat fill would compress to almost nothing and could hide a resize bug
/// behind an encode that happened to match anyway.
pub(crate) fn sample_png() -> Vec<u8> {
    gradient_png(64, 64)
}

/// A gradient PNG of the requested size.
pub(crate) fn gradient_png(width: u32, height: u32) -> Vec<u8> {
    let mut buffer = image::RgbImage::new(width, height);
    for (x, y, pixel) in buffer.enumerate_pixels_mut() {
        *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8]);
    }

    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgb8(buffer)
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .expect("an in-memory PNG encodes");
    bytes
}
