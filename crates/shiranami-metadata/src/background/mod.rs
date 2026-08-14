//! The custom app background: import a user's image, freeze it, sweep orphans.
//!
//! A v2-born feature with no v1 counterpart, so nothing here is a compatibility
//! constraint — but it lives beside [`crate::art`] rather than in the desktop
//! shell for two reasons. It needs `image`, which only this crate carries; and
//! the shell is wiring-only by architecture §2.1, enforced by a 400-code-line
//! cap that an ingest pipeline would blow through on its own.
//!
//! # The shape of the trust boundary
//!
//! Everything here treats the user's file as untrusted input, because it is the
//! one place in the app where arbitrary bytes chosen outside the library arrive
//! and are then *served back over HTTP to our own webview*. Three consequences:
//!
//! 1. **The extension is a claim, not a fact.** [`ingest::import_background`]
//!    decodes the bytes and compares the sniffed format against the claimed
//!    extension, so a `.png` that is really something else is refused rather
//!    than stored under a name the serve route would happily hand out.
//! 2. **The stored name is ours, never theirs.** Files are content-addressed
//!    (`bg-<hash>.<ext>`), so no fragment of a user-controlled filename reaches
//!    the filesystem, the settings document, or a URL. It also makes
//!    `Cache-Control: immutable` on the serve route true rather than merely
//!    convenient, for the same reason it is true of album art.
//! 3. **Cost is bounded before it is paid.** The byte cap is checked against
//!    file metadata before the read, and the pixel cap against the image header
//!    before the decode — so neither a 2 GB file nor a decompression bomb gets
//!    to allocate first and be rejected after.
//!
//! # Why a poster still exists
//!
//! `ThemeBackground` in `apps/web` is retained under `lowPerformanceMode` and
//! `prefers-reduced-transparency` *specifically because* a theme image is "a
//! single static bitmap with no animation or blur" — its component doc says so.
//! An animated GIF or WebP breaks that premise. Rather than drop the background
//! under those settings (losing the user's chosen look) or keep decoding frames
//! (defeating the setting), [`ingest`] encodes frame 0 to a sibling `.still.jpg`
//! at import, and the renderer swaps the URL. The freeze then costs nothing at
//! runtime and needs no canvas, no `<video>`, and no second code path in the
//! paint layer.

pub mod ingest;
pub mod record;
pub mod sweep;

pub use ingest::import_background;
pub use record::{
    ALLOWED_EXTENSIONS, BACKGROUND_DIR_NAME, CustomBackground, MAX_DIMENSION, MAX_FILE_BYTES,
    background_dir, is_allowed_extension, still_name_for,
};
pub use sweep::{BackgroundReference, SweepReport, sweep_orphans};
