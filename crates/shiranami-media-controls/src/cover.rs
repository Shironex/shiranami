//! Turning a cover URL into something the OS can actually load.
//!
//! Split out of [`crate::os`]: the mapping there is pure and testable anywhere,
//! while everything here touches the filesystem and exists for one reason —
//! souvlaki 0.8.3's macOS artwork loader aborts the process on a cover it
//! cannot load. [`loadable_cover`] carries the full account.

use std::path::{Path, PathBuf};

/// The route segment the loopback server serves album art under, as
/// `shiranami-serve`'s `routes::art` spells it: `{origin}/{token}/art/{name}`.
const ART_SEGMENT: &str = "/art/";

/// Characters that end the *path* in a URL. `NSURL URLWithString:` reads what
/// follows as a query or a fragment, so a path containing either produces a URL
/// pointing at a file that does not exist — which on macOS is fatal (see
/// [`loadable_cover`]). Verified against the real API rather than assumed:
/// `file:///…/音楽/cover.jpg` loads and `file:///…/音楽#a/cover.jpg` does not.
const PATH_ENDING_CHARACTERS: [char; 2] = ['?', '#'];

/// The magic bytes of every format the art cache can hold.
///
/// Cheaper and narrower than decoding: this rejects an empty, truncated-to-zero
/// or plain-wrong file, which is the corruption that actually happens, without
/// pulling an image decoder into a crate that otherwise has no use for one.
const IMAGE_MAGIC: [&[u8]; 5] = [
    &[0xFF, 0xD8, 0xFF],  // JPEG
    b"\x89PNG\r\n\x1a\n", // PNG
    b"GIF8",              // GIF
    b"RIFF",              // WebP (the `WEBP` tag is checked below)
    b"BM",                // BMP
];

/// A cover the OS can load **without a network round-trip**, or `None`.
///
/// # Why a scheme check is not enough, and why this exists
///
/// souvlaki 0.8.3's macOS artwork loader is
/// `platform/macos/mod.rs::load_image_from_url`:
///
/// ```text
/// let url = ns_url(url);                                       // 321
/// let image: id = msg_send!(class!(NSImage), alloc);            // 322
/// let image: id = msg_send!(image, initWithContentsOfURL: url); // 323
/// let size: CGSize = msg_send!(image, size);                    // 324
/// ```
///
/// `initWithContentsOfURL:` answers **nil** whenever the load fails, and line
/// 324 sends `size` to it anyway. `objc`'s `msg_send!` expands its receiver as
/// `&*$obj`, so a nil receiver is a reference built from a null pointer — which
/// under `debug-assertions` trips the standard library's null check and
/// **aborts the process**:
///
/// ```text
/// panicked at souvlaki-0.8.3/src/platform/macos/mod.rs:324:24:
/// null pointer dereference occurred
/// note: thread caused non-unwinding panic. aborting.
/// ```
///
/// It is a *non-unwinding* panic, so there is no catching it, and the iOS
/// branch of the same function nil-checks twice while the macOS branch checks
/// not at all — an upstream oversight with no fix published (0.8.3 is the newest
/// release). The load runs on a global dispatch queue, which is why the thread
/// in that report is unnamed.
///
/// The consequence is that **any** failure to load the cover kills the app, and
/// an `http://` URL has failure modes no string check can rule out. Measured
/// against the real API, every one of these returns nil: a 404, a body that is
/// not an image, an empty body, and a refused connection. So the loopback URL
/// the renderer sends — `http://127.0.0.1:{port}/{token}/art/{name}` — is a
/// live grenade even though its scheme is impeccable and the server is ours.
///
/// This turns it back into the file it was always served from. `{name}` is the
/// content-addressed art file `shiranami-serve` reads out of `art_dir`, so the
/// mapping is exact, the network leaves the path entirely, and what remains is
/// a local read that is checked here before souvlaki is allowed to try it.
///
/// # What is dropped, and why that is the right trade
///
/// A cover that is not in the art cache — a radio station's `favicon`, which
/// `radioUtils` puts straight into `albumArt` — cannot be resolved to a local
/// file and becomes **no artwork** rather than a fetch souvlaki might abort on.
/// The now-playing entry keeps its title, artist, album and scrubber; only the
/// thumbnail is missing. Losing a station logo is not comparable to losing the
/// process.
///
/// The path is emitted **unencoded** after `file://`, which both backends want:
/// souvlaki's Windows branch does `url.trim_start_matches("file://")` and hands
/// the remainder to `GetFileFromPathAsync` as a literal path, and macOS'
/// `URLWithString:` accepts spaces and non-ASCII in a file path (verified).
/// Only `?` and `#` genuinely break it, and a path containing either is
/// refused above.
pub fn loadable_cover(cover_url: Option<&str>, art_dir: Option<&Path>) -> Option<String> {
    let path = cover_path(cover_url?, art_dir)?;

    // A path that cannot survive `URLWithString:` would resolve to a URL
    // pointing at nothing, which is the nil this whole function exists to
    // prevent.
    let rendered = path.to_str()?;
    if rendered.contains(PATH_ENDING_CHARACTERS) {
        return None;
    }

    if !is_readable_image(&path) {
        return None;
    }

    Some(format!("file://{rendered}"))
}

/// The file a cover URL names on this machine, or `None`.
fn cover_path(cover_url: &str, art_dir: Option<&Path>) -> Option<PathBuf> {
    let candidate = cover_url.trim();

    if let Some(rest) = candidate.strip_prefix("file://") {
        return (!rest.is_empty()).then(|| PathBuf::from(rest));
    }

    // Anything else has to be the loopback art route, whose last `/art/`
    // segment is the file name. `rfind` rather than `find` because the token
    // ahead of it is opaque; it cannot contain a separator, but reading the
    // *last* segment is correct either way.
    let name = candidate
        .rfind(ART_SEGMENT)
        .map(|at| &candidate[at + ART_SEGMENT.len()..])?;

    // `shiranami-serve`'s `safe_name` refuses rather than sanitises, and so does
    // this: a name that is not a bare file name is not a name this route ever
    // served, and joining it onto the art directory could reach outside it.
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return None;
    }

    Some(art_dir?.join(name))
}

/// Whether `path` is a file whose first bytes are an image's.
fn is_readable_image(path: &Path) -> bool {
    use std::io::Read;

    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() || metadata.len() == 0 {
        return false;
    }

    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut head = [0_u8; 12];
    let Ok(read) = file.read(&mut head) else {
        return false;
    };
    let head = &head[..read];

    // WebP is `RIFF....WEBP`, so the four-byte prefix alone would admit any
    // RIFF container — a WAV file would pass and then fail to decode.
    if head.starts_with(b"RIFF") {
        return head.len() >= 12 && &head[8..12] == b"WEBP";
    }

    IMAGE_MAGIC.iter().any(|magic| head.starts_with(magic))
}

#[cfg(test)]
/// The guard that keeps souvlaki 0.8.3's macOS artwork loader from being
/// handed a cover it cannot load — which is not a missing thumbnail but a
/// **process abort**, at `macos/mod.rs:324:24`. See [`loadable_cover`].
mod tests {
    use std::io::Write;
    use std::path::Path;

    use super::*;

    /// A one-pixel JPEG's first bytes. Only the magic is read.
    const JPEG: &[u8] = &[
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1,
    ];

    fn art_file(dir: &Path, name: &str, bytes: &[u8]) -> String {
        let path = dir.join(name);
        let mut file = std::fs::File::create(&path).expect("the art file is writable");
        file.write_all(bytes).expect("the art file is writable");
        path.to_str().expect("a UTF-8 temp path").to_owned()
    }

    /// The URL the renderer actually sends: `stream-urls.ts` rewrites the
    /// stored `shiranami-art://art/{name}` onto `{origin}/{token}/art/{name}`.
    fn loopback(name: &str) -> String {
        format!("http://127.0.0.1:52341/2f6c9b8a4d1e7c05/art/{name}")
    }

    #[test]
    fn a_loopback_art_url_becomes_the_file_it_is_served_from() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = art_file(dir.path(), "abcdef.jpg", JPEG);

        assert_eq!(
            loadable_cover(Some(&loopback("abcdef.jpg")), Some(dir.path())),
            Some(format!("file://{path}")),
            "the network has no business in a path that aborts on failure"
        );
    }

    /// **The regression.** A cover the server would answer 404 for is
    /// exactly the nil `initWithContentsOfURL:` returns, and exactly the
    /// receiver `msg_send!(image, size)` dereferences one line later.
    #[test]
    fn a_cover_that_is_not_on_disk_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");

        assert_eq!(
            loadable_cover(Some(&loopback("never-written.jpg")), Some(dir.path())),
            None,
            "souvlaki would abort the process rather than skip the artwork"
        );
    }

    #[test]
    fn an_empty_or_unreadable_art_file_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");
        art_file(dir.path(), "empty.jpg", b"");
        art_file(dir.path(), "garbage.jpg", b"not an image at all");

        for name in ["empty.jpg", "garbage.jpg"] {
            assert_eq!(
                loadable_cover(Some(&loopback(name)), Some(dir.path())),
                None,
                "{name} decodes to nil, and nil is fatal"
            );
        }
    }

    /// A radio station's `favicon` reaches `album_art` verbatim
    /// (`radioUtils.ts`), and nothing local corresponds to it. The station
    /// keeps its title and scrubber and loses its logo.
    #[test]
    fn a_remote_cover_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");

        for url in [
            "https://cdn.example.test/favicon.png",
            "http://example.test/logo.jpg",
        ] {
            assert_eq!(
                loadable_cover(Some(url), Some(dir.path())),
                None,
                "{url} is a fetch souvlaki could abort on"
            );
        }
    }

    #[test]
    fn a_webview_only_cover_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");

        for url in [
            "blob:http://localhost/8b1c-4f",
            "data:image/png;base64,iVBORw0K",
            "shiranami-art://art/abcdef.jpg",
            "",
            "   ",
        ] {
            assert_eq!(loadable_cover(Some(url), Some(dir.path())), None, "{url}");
        }
    }

    /// `shiranami-art://art/abcdef.jpg` contains `/art/` too. It is refused
    /// by the line above rather than by the name check — this pins that a
    /// name which *is* a path never gets joined onto the art directory.
    #[test]
    fn a_name_that_is_a_path_is_refused_rather_than_sanitised() {
        let dir = tempfile::tempdir().expect("a temp dir");

        for name in [
            "../secrets.jpg",
            "..",
            ".",
            "sub/dir.jpg",
            "back\\slash.jpg",
        ] {
            assert_eq!(
                loadable_cover(Some(&loopback(name)), Some(dir.path())),
                None,
                "{name} is not a bare file name"
            );
        }
    }

    #[test]
    fn a_file_url_is_verified_rather_than_trusted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = art_file(dir.path(), "cover.jpg", JPEG);

        assert_eq!(
            loadable_cover(Some(&format!("file://{path}")), None),
            Some(format!("file://{path}")),
            "an already-local cover needs no art directory"
        );
        assert_eq!(
            loadable_cover(Some("file:///nowhere/at/all.jpg"), None),
            None,
            "a file:// URL is checked like any other"
        );
    }

    /// `?` and `#` end the path in `URLWithString:`, so a cover under a
    /// directory containing one resolves to a URL naming nothing — the same
    /// nil by a different route. Verified against the real API.
    #[test]
    fn a_path_that_would_break_url_parsing_is_refused() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let awkward = dir.path().join("Ke$ha #1");
        std::fs::create_dir(&awkward).expect("the dir is creatable");
        let path = art_file(&awkward, "cover.jpg", JPEG);

        assert_eq!(loadable_cover(Some(&format!("file://{path}")), None), None);
    }

    #[test]
    fn every_format_the_art_cache_can_hold_is_admitted() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let cases: [(&str, &[u8]); 5] = [
            ("j.jpg", JPEG),
            ("p.png", b"\x89PNG\r\n\x1a\n\0\0\0\r"),
            ("g.gif", b"GIF89a\0\0\0\0\0\0"),
            ("w.webp", b"RIFF\x24\0\0\0WEBP"),
            ("b.bmp", b"BM\x8a\0\0\0\0\0\0\0\0\0"),
        ];

        for (name, bytes) in cases {
            art_file(dir.path(), name, bytes);
            assert!(
                loadable_cover(Some(&loopback(name)), Some(dir.path())).is_some(),
                "{name} is an image the OS can decode"
            );
        }
    }

    /// `RIFF` alone is a container tag, not an image one.
    #[test]
    fn a_riff_container_that_is_not_a_webp_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");
        art_file(dir.path(), "sound.webp", b"RIFF\x24\0\0\0WAVEfmt ");

        assert_eq!(
            loadable_cover(Some(&loopback("sound.webp")), Some(dir.path())),
            None
        );
    }

    #[test]
    fn without_an_art_directory_a_loopback_url_resolves_to_nothing() {
        assert_eq!(loadable_cover(Some(&loopback("abcdef.jpg")), None), None);
    }

    #[test]
    fn no_cover_is_no_cover() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert_eq!(loadable_cover(None, Some(dir.path())), None);
    }
}
