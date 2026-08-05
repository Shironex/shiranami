//! The renderer's playback state, as the OS wants to hear it.
//!
//! These two types mirror `souvlaki::MediaMetadata` and
//! `souvlaki::MediaPlayback` exactly, and exist so the mapping — which is where
//! all the ported decisions live — is a pure function testable on a machine with
//! no media session at all. [`crate::souvlaki_backend`] converts them at the
//! last possible moment.
//!
//! # What v1 did, and what changed
//!
//! v1 built a `MediaMetadata` for `navigator.mediaSession` with an `artwork`
//! array of `{ src, sizes: '512x512' }` entries, and separately called
//! `setPositionState({ duration, position, playbackRate: 1 })`. The OS APIs
//! underneath take a *single* cover URL and fold position into the playback
//! status, so the artwork array collapses to [`OsMetadata::cover_url`] and the
//! position rides on [`OsPlayback`]. The guards survive the collapse verbatim:
//! v1 skipped `setPositionState` entirely unless `duration` was truthy and
//! finite, and clamped `position` to `Math.min(currentTime, duration)`.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::state::{MediaState, NowPlaying};

/// A cover URL the OS can actually load.
///
/// Both shipped backends resolve the string themselves —
/// `RandomAccessStreamReference::CreateFromUri` on Windows (with a `file://`
/// special case that reads the path off disk) and `NSURL URLWithString:` on
/// macOS — so the scheme has to be one they understand.
const LOADABLE_COVER_SCHEMES: [&str; 3] = ["http://", "https://", "file://"];

/// Metadata for the OS now-playing surface.
///
/// The three text fields are `String`, not `Option<String>`, and are empty
/// rather than absent when there is nothing to show. That is deliberate:
/// souvlaki's Windows backend writes a field only when it is `Some`, so a
/// `None` leaves the *previous* track's title on the SMTC flyout forever. An
/// empty string overwrites it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OsMetadata {
    /// Display title, empty when cleared.
    pub title: String,
    /// Display artist, empty when cleared.
    pub artist: String,
    /// Display album, empty when cleared.
    pub album: String,
    /// Cover URL, when the renderer supplied one the OS can load.
    pub cover_url: Option<String>,
    /// Track length, when it is known.
    pub duration: Option<Duration>,
}

/// Playback status for the OS now-playing surface.
///
/// `Stopped` is v1's `playbackState = 'none'`; it carries no progress because
/// neither OS shows a scrubber for a stopped item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OsPlayback {
    /// Nothing is loaded.
    Stopped,
    /// Loaded and paused.
    Paused {
        /// Playhead, when it is meaningful.
        progress: Option<Duration>,
    },
    /// Loaded and playing.
    Playing {
        /// Playhead, when it is meaningful.
        progress: Option<Duration>,
    },
}

impl OsMetadata {
    /// Map a playback state onto the OS metadata fields.
    pub fn from_state(state: &MediaState) -> Self {
        match state.track() {
            None => Self::default(),
            Some(track) => Self {
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                cover_url: cover_url(track.album_art.as_deref()),
                duration: known_duration(track.duration),
            },
        }
    }
}

impl OsPlayback {
    /// Map a playback state onto the OS playback status.
    pub fn from_state(state: &MediaState) -> Self {
        match state.track() {
            None => Self::Stopped,
            Some(track) => {
                let progress = progress(track);
                if track.is_playing {
                    Self::Playing { progress }
                } else {
                    Self::Paused { progress }
                }
            }
        }
    }

    /// The playhead this status carries, if any.
    pub fn progress(&self) -> Option<Duration> {
        match self {
            Self::Stopped => None,
            Self::Paused { progress } | Self::Playing { progress } => *progress,
        }
    }
}

/// A duration the OS can use, or `None`.
///
/// v1's guard was `if (!duration || !isFinite(duration)) return;`, which
/// rejects `0`, `NaN` and `±Infinity`. It let a *negative* duration through,
/// which here would reach `Duration::from_secs_f64` and panic, so the
/// comparison is `> 0.0` rather than `!= 0.0` — a strictly narrower gate that
/// admits nothing v1 admitted and could act on.
fn known_duration(seconds: f64) -> Option<Duration> {
    (seconds.is_finite() && seconds > 0.0).then(|| Duration::from_secs_f64(seconds))
}

/// The playhead, clamped into the track the way v1 clamped it.
///
/// Returns `None` whenever the duration is unknown, mirroring v1 skipping
/// `setPositionState` outright in that case: a position without a length makes
/// a scrubber that cannot be reasoned about.
fn progress(track: &NowPlaying) -> Option<Duration> {
    let duration = known_duration(track.duration)?;
    let seconds = track.current_time;

    if !seconds.is_finite() || seconds <= 0.0 {
        return Some(Duration::ZERO);
    }

    Some(Duration::from_secs_f64(seconds).min(duration))
}

/// A cover URL both backends can resolve, or `None`.
///
/// v1 accepted `http`, `data:` and `blob:` directly and `fetch`-ed anything else
/// (in practice the `shiranami-art://` custom scheme) into an object URL,
/// because `MediaImage.src` had to be a web URL. §2.4 deletes the custom scheme
/// — art is served from the loopback server as `http://127.0.0.1:<port>/…` — so
/// the fetch-and-revoke dance has nothing left to convert and is dropped.
///
/// `data:` and `blob:` are rejected rather than forwarded: a blob URL belongs to
/// a webview that the OS process cannot read, and neither
/// `CreateFromUri` nor `NSURL` will load a data URI of cover-art size.
fn cover_url(album_art: Option<&str>) -> Option<String> {
    let candidate = album_art?.trim();

    if candidate.is_empty() {
        return None;
    }

    LOADABLE_COVER_SCHEMES
        .iter()
        .any(|scheme| candidate.len() > scheme.len() && candidate.starts_with(scheme))
        .then(|| candidate.to_owned())
}

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
mod tests {
    use super::*;
    use crate::fake::{playing, track};

    fn loaded(track: NowPlaying) -> MediaState {
        MediaState::Loaded(track)
    }

    #[test]
    fn a_loaded_track_maps_field_for_field() {
        let metadata = OsMetadata::from_state(&loaded(track()));

        assert_eq!(metadata.title, "Sakura Nights");
        assert_eq!(metadata.artist, "Yumemi");
        assert_eq!(metadata.album, "Hazy Tapes");
        assert_eq!(metadata.duration, Some(Duration::from_secs_f64(214.0)));
        assert_eq!(
            metadata.cover_url.as_deref(),
            Some("http://127.0.0.1:52341/tok/art/abcdef.jpg")
        );
    }

    /// The reason the text fields are not `Option`: souvlaki's Windows backend
    /// skips a `None`, so anything but an empty string leaves the last track on
    /// the flyout after the user stops playback.
    #[test]
    fn clearing_blanks_every_text_field_rather_than_omitting_it() {
        let metadata = OsMetadata::from_state(&MediaState::Cleared);

        assert_eq!(metadata.title, "");
        assert_eq!(metadata.artist, "");
        assert_eq!(metadata.album, "");
        assert_eq!(metadata.cover_url, None);
        assert_eq!(metadata.duration, None);
    }

    #[test]
    fn clearing_stops_playback() {
        assert_eq!(
            OsPlayback::from_state(&MediaState::Cleared),
            OsPlayback::Stopped
        );
    }

    #[test]
    fn playing_and_paused_carry_the_playhead() {
        assert_eq!(
            OsPlayback::from_state(&loaded(playing(30.5))),
            OsPlayback::Playing {
                progress: Some(Duration::from_secs_f64(30.5))
            }
        );

        let mut paused = playing(30.5);
        paused.is_playing = false;
        assert_eq!(
            OsPlayback::from_state(&loaded(paused)),
            OsPlayback::Paused {
                progress: Some(Duration::from_secs_f64(30.5))
            }
        );
    }

    /// v1: `position: Math.min(currentTime, duration)`.
    #[test]
    fn a_playhead_past_the_end_is_clamped_to_the_end() {
        let progress = OsPlayback::from_state(&loaded(playing(9_999.0))).progress();
        assert_eq!(progress, Some(Duration::from_secs_f64(214.0)));
    }

    #[test]
    fn a_negative_or_nan_playhead_becomes_zero() {
        for value in [-4.0, f64::NAN, f64::NEG_INFINITY] {
            assert_eq!(
                OsPlayback::from_state(&loaded(playing(value))).progress(),
                Some(Duration::ZERO),
                "a {value} playhead must not reach Duration::from_secs_f64"
            );
        }
    }

    /// v1's `if (!duration || !isFinite(duration)) return;` — the same four
    /// values, and the negative one v1 would have passed through.
    #[test]
    fn an_unusable_duration_is_unknown_and_suppresses_the_playhead() {
        for value in [0.0, f64::NAN, f64::INFINITY, -1.0] {
            let mut unusable = playing(12.0);
            unusable.duration = value;

            let metadata = OsMetadata::from_state(&loaded(unusable.clone()));
            assert_eq!(metadata.duration, None, "duration {value} is not usable");

            assert_eq!(
                OsPlayback::from_state(&loaded(unusable)).progress(),
                None,
                "v1 skipped setPositionState outright for duration {value}"
            );
        }
    }

    #[test]
    fn loadable_cover_schemes_pass_through_untouched() {
        for url in [
            "http://127.0.0.1:52341/tok/art/abcdef.jpg",
            "https://cdn.example.test/cover.png",
            "file:///Users/me/Music/cover.jpg",
        ] {
            let mut with_art = playing(0.0);
            with_art.album_art = Some(url.to_owned());
            assert_eq!(
                OsMetadata::from_state(&loaded(with_art))
                    .cover_url
                    .as_deref(),
                Some(url)
            );
        }
    }

    /// A blob URL is scoped to the webview and a data URI is not something
    /// either OS surface will fetch, so both become "no cover" rather than a
    /// broken one.
    #[test]
    fn webview_only_cover_urls_are_dropped() {
        for url in [
            "blob:http://localhost/8b1c-4f",
            "data:image/png;base64,iVBORw0K",
            "shiranami-art://art/abcdef.jpg",
            "/Users/me/Music/cover.jpg",
            "",
            "   ",
            "http://",
        ] {
            let mut with_art = playing(0.0);
            with_art.album_art = Some(url.to_owned());
            assert_eq!(
                OsMetadata::from_state(&loaded(with_art)).cover_url,
                None,
                "{url} is not loadable by SMTC or MPMediaItemArtwork"
            );
        }
    }

    #[test]
    fn an_absent_cover_is_absent() {
        let mut without_art = playing(0.0);
        without_art.album_art = None;
        assert_eq!(OsMetadata::from_state(&loaded(without_art)).cover_url, None);
    }

    #[test]
    fn a_stopped_status_carries_no_playhead() {
        assert_eq!(OsPlayback::Stopped.progress(), None);
    }

    /// The guard that keeps souvlaki 0.8.3's macOS artwork loader from being
    /// handed a cover it cannot load — which is not a missing thumbnail but a
    /// **process abort**, at `macos/mod.rs:324:24`. See [`loadable_cover`].
    mod loadable_cover {
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
}
