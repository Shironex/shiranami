//! What an imported background *is*: the caps it had to pass, where it lives,
//! and the record the settings document holds.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Directory holding imported backgrounds, relative to the app data directory.
pub const BACKGROUND_DIR_NAME: &str = "backgrounds";

/// The largest file the importer will accept, in bytes.
///
/// Checked against file metadata *before* the read, so an oversized file costs
/// a `stat` rather than its own size in memory. Twenty megabytes is generous
/// for a wallpaper and small enough that the whole-file read behind it is not a
/// memory event worth streaming around.
pub const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;

/// The largest longest-edge the importer will accept, in pixels.
///
/// Checked against the image *header* before the decode, which is the point:
/// the failure this prevents is a decompression bomb — a few kilobytes of
/// deflate that expand to tens of gigabytes of pixels. Refusing after decoding
/// would mean the allocation already happened.
pub const MAX_DIMENSION: u32 = 8192;

/// The largest total pixel count the importer will accept.
///
/// The edge cap alone is not a bound on cost: 8192x8192 satisfies it and is
/// still 67 megapixels — a quarter of a gigabyte of RGBA before a single frame
/// has been encoded. This is 8K-wide-by-8K-tall's *area* budget, generous
/// enough for any real wallpaper (an 8K monitor is 33 megapixels) and small
/// enough that the decode behind it is bounded.
pub const MAX_PIXELS: u64 = 40_000_000;

/// Accepted extensions, lowercase and without the dot.
///
/// A deliberate subset of what `image` can decode. Every entry here is a format
/// the webview also renders natively, because the file is served straight to
/// `background-image` — a format we can decode but Chromium cannot would import
/// cleanly and then paint nothing.
pub const ALLOWED_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

/// Resolve the background directory beneath an app data directory.
pub fn background_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKGROUND_DIR_NAME)
}

/// Whether a path's extension is one this importer accepts.
///
/// Case-insensitive, because `.JPG` off a camera is the same file as `.jpg`,
/// and a case-sensitive refusal here would read to the user as "this JPEG is
/// not a JPEG".
pub fn is_allowed_extension(path: &Path) -> bool {
    extension_of(path).is_some_and(|extension| ALLOWED_EXTENSIONS.contains(&extension.as_str()))
}

/// A path's extension, lowercased and without the dot.
pub(crate) fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

/// The poster-still name that belongs to a background file name.
///
/// Derived rather than stored so the two can never disagree, and so the sweep
/// can decide whether a file is referenced without parsing the record twice.
pub fn still_name_for(file_name: &str) -> String {
    let stem = file_name
        .rsplit_once('.')
        .map_or(file_name, |(stem, _extension)| stem);
    format!("{stem}.still.jpg")
}

/// The settings record describing the currently imported background.
///
/// Persisted under `MainStoreKey::AppearanceCustomBackground` and returned to
/// the renderer verbatim. Per architecture §2.3 this is a persisted *and* wire
/// struct, so it may only ever grow, and every added field must be `Option` or
/// `#[serde(default)]` — a record written by an older build has to keep
/// parsing. `still_file_name` and `animated` already carry that treatment, and
/// a test pins that a record missing both still loads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CustomBackground {
    /// The stored file name, `bg-<hash>.<ext>`. Never user-supplied.
    pub file_name: String,
    /// The frozen frame-0 sibling, present only for an animated source.
    #[serde(default)]
    pub still_file_name: Option<String>,
    /// Width in pixels, as imported.
    pub width: u32,
    /// Height in pixels, as imported.
    pub height: u32,
    /// Whether the source carries more than one frame.
    #[serde(default)]
    pub animated: bool,
}

impl CustomBackground {
    /// Every file name this record owns on disk.
    ///
    /// The sweep asks the record what it references rather than reconstructing
    /// the naming scheme itself, so adding a future sibling (a thumbnail, a
    /// blurred variant) cannot leave *this* build's sweep deleting it as an
    /// orphan. It is not a cross-version guarantee: an older build parses a
    /// newer record (no `deny_unknown_fields`), reports fewer owned names, and
    /// its sweep would collect the sibling it cannot see. A future field naming
    /// a file therefore has to assume a downgrade can delete it.
    pub fn owned_file_names(&self) -> Vec<&str> {
        let mut names = vec![self.file_name.as_str()];
        if let Some(still) = self.still_file_name.as_deref() {
            names.push(still);
        }
        names
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_accepted_extensions_are_case_insensitive() {
        assert!(is_allowed_extension(Path::new("wallpaper.JPG")));
        assert!(is_allowed_extension(Path::new("wallpaper.gif")));
        assert!(is_allowed_extension(Path::new("wallpaper.WebP")));
    }

    #[test]
    fn formats_the_webview_cannot_paint_are_not_accepted() {
        // `image` decodes all of these. The webview does not paint them, so
        // importing one would succeed and then show nothing.
        for name in ["art.bmp", "art.tiff", "art.tga", "art.avif", "art.ico"] {
            assert!(!is_allowed_extension(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn a_file_with_no_extension_is_not_accepted() {
        assert!(!is_allowed_extension(Path::new("wallpaper")));
    }

    #[test]
    fn the_still_name_replaces_the_extension_rather_than_appending() {
        assert_eq!(still_name_for("bg-abc123.gif"), "bg-abc123.still.jpg");
        assert_eq!(still_name_for("bg-abc123.webp"), "bg-abc123.still.jpg");
    }

    /// The strictly-additive rule from §2.3, as a test rather than a promise: a
    /// record written before the still and animation fields existed must still
    /// parse, or an update would silently drop the user's background.
    #[test]
    fn a_record_missing_the_optional_fields_still_parses() {
        let record: CustomBackground =
            serde_json::from_str(r#"{"fileName":"bg-abc.png","width":1920,"height":1080}"#)
                .expect("a record without the optional fields parses");

        assert_eq!(record.file_name, "bg-abc.png");
        assert_eq!(record.still_file_name, None);
        assert!(!record.animated);
    }

    #[test]
    fn a_static_record_owns_only_its_own_file() {
        let record = CustomBackground {
            file_name: "bg-abc.png".to_owned(),
            still_file_name: None,
            width: 100,
            height: 100,
            animated: false,
        };

        assert_eq!(record.owned_file_names(), vec!["bg-abc.png"]);
    }

    #[test]
    fn an_animated_record_owns_its_still_as_well() {
        let record = CustomBackground {
            file_name: "bg-abc.gif".to_owned(),
            still_file_name: Some("bg-abc.still.jpg".to_owned()),
            width: 100,
            height: 100,
            animated: true,
        };

        assert_eq!(
            record.owned_file_names(),
            vec!["bg-abc.gif", "bg-abc.still.jpg"]
        );
    }
}
