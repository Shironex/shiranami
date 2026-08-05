//! The real backend. Thin on purpose, and not covered by tests.
//!
//! This is the only module in the crate that touches an operating system, and
//! everything in it is either a field copy or a `match` arm — because none of it
//! can be run in CI. SMTC is acquired through `GetForWindow` and needs a live
//! window; `MPNowPlayingInfoCenter` needs a real app bundle and a running
//! run loop. So the rule is that a bug here should be visible by reading, and
//! anything with a decision in it belongs in [`crate::os`],
//! [`crate::command`] or [`crate::coalesce`], which are tested exhaustively.
//!
//! It is compiled on Windows and macOS only (see the crate manifest), which is
//! why Appendix B's CI table marks `rust-cross-check` on `macos-latest` and
//! `windows-latest` **required**: an ubuntu-only clippy never sees this file.
//!
//! # souvlaki 0.8.3, as it actually behaves
//!
//! Four things the reader should know, all verified against the published
//! source rather than the README:
//!
//! - **Windows needs an `HWND` and panics without one.** `MediaControls::new`
//!   ends in `config.hwnd.expect("Windows media controls require an HWND …")`.
//!   [`SouvlakiBackend::new`] checks first and returns
//!   [`MediaControlsError::MissingWindowHandle`], because a panic in the
//!   composition root takes the app down over a media-key feature.
//! - **`display_name` is ignored on Windows** (souvlaki #67). `PlatformConfig`'s
//!   Windows path reads only `hwnd`; the name on the SMTC flyout comes from the
//!   process' own identity. This is still an enormous improvement on v1, whose
//!   webview session showed *"Microsoft Edge WebView2"* — but it is not a string
//!   we can set from here.
//! - **Windows only writes the metadata fields you give it.** Every setter is
//!   behind `if let Some(…)`, so a `None` leaves the previous track's value on
//!   the flyout. [`crate::os::OsMetadata`] therefore uses empty strings rather
//!   than `None`, and this module passes every field as `Some`.
//! - **macOS state is global.** `MediaControls` is a unit struct;
//!   `attach`/`detach` add and remove targets on the process-wide
//!   `MPRemoteCommandCenter`, and metadata goes to the shared
//!   `MPNowPlayingInfoCenter`. Two live instances would fight, which is the
//!   mechanical reason §2.7's *"only one OS entry appears"* is checkable at all.
//!
//! Two known defects are being carried rather than worked around. souvlaki #77:
//! the macOS `changePlaybackPositionCommand` handler reads the event's position
//! with `get_ivar::<f64>("_positionTime")`, which panics under a **debug**
//! build's ivar type check — scrubbing the macOS Now Playing widget will crash
//! `pnpm tauri dev` and is fine in release. And souvlaki #70 covers the wider
//! gaps in the macOS metadata and event surface. Both are listed in §2.7's
//! budget.

#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::backend::{CommandSink, MediaControlsBackend};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::command::{MediaCommand, RemoteEvent, SeekDirection};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::error::{MediaControlsError, Result};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::os::{OsMetadata, OsPlayback};

/// What the backend needs from the shell to reach the OS.
///
/// Deliberately free of Tauri types: §2.1 has the composition root depending on
/// the crates and never the reverse, so the window handle arrives as the raw
/// integer `HWND` that `tauri::Window::hwnd()` yields rather than as a
/// `tauri::Window`.
#[derive(Debug, Clone)]
pub struct SouvlakiConfig {
    /// The name to show the user. Used on Linux only, per souvlaki #67; kept
    /// because `PlatformConfig` requires it and it costs nothing to be correct.
    pub display_name: String,
    /// The MPRIS bus name. Linux only, and unused while no Linux artifact ships.
    pub dbus_name: String,
    /// The main window's `HWND`, as an integer. Required on Windows, ignored
    /// everywhere else.
    pub window_handle: Option<isize>,
    /// Where the album-art cache lives, so a cover URL can be resolved to the
    /// file it is served from.
    ///
    /// macOS-critical rather than cosmetic: [`crate::cover::loadable_cover`]
    /// documents the abort this prevents. `None` means "resolve nothing", which
    /// costs the thumbnail and never the process.
    pub art_dir: Option<std::path::PathBuf>,
}

impl Default for SouvlakiConfig {
    fn default() -> Self {
        Self {
            display_name: "Shiranami".to_owned(),
            dbus_name: "shiranami".to_owned(),
            window_handle: None,
            art_dir: None,
        }
    }
}

/// souvlaki-backed OS media controls.
///
/// Must be created and used on the thread that owns the window handle: Windows'
/// `SystemMediaTransportControls` belongs to it. That is the same reason
/// [`crate::backend::MediaControlsBackend`] carries no `Send` bound.
#[cfg(any(target_os = "windows", target_os = "macos"))]
#[derive(Debug)]
pub struct SouvlakiBackend {
    controls: souvlaki::MediaControls,
    /// Carried from [`SouvlakiConfig`] for [`crate::cover::loadable_cover`], which
    /// every `set_metadata` runs the cover through on macOS.
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    art_dir: Option<std::path::PathBuf>,
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
impl SouvlakiBackend {
    /// Acquire the OS media surface.
    pub fn new(config: &SouvlakiConfig) -> Result<Self> {
        if cfg!(target_os = "windows") && config.window_handle.is_none() {
            return Err(MediaControlsError::MissingWindowHandle);
        }

        let platform = souvlaki::PlatformConfig {
            display_name: &config.display_name,
            dbus_name: &config.dbus_name,
            hwnd: config
                .window_handle
                .map(|handle| handle as *mut std::ffi::c_void),
        };

        let controls = souvlaki::MediaControls::new(platform).map_err(backend_error)?;

        Ok(Self {
            controls,
            art_dir: config.art_dir.clone(),
        })
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
impl MediaControlsBackend for SouvlakiBackend {
    fn attach(&mut self, sink: CommandSink) -> Result<()> {
        self.controls
            .attach(move |event| {
                // A declined event is one the two shipped backends never raise
                // (see `MediaCommand::from_remote`); logging it would be noise
                // in a hot callback the OS is blocked on.
                if let Some(command) = MediaCommand::from_remote(to_remote(event)) {
                    sink.send(command);
                }
            })
            .map_err(backend_error)
    }

    fn detach(&mut self) -> Result<()> {
        self.controls.detach().map_err(backend_error)
    }

    fn set_metadata(&mut self, metadata: &OsMetadata) -> Result<()> {
        let cover = self.cover_url(metadata);

        // Every field is `Some`, including the empty ones: on Windows a `None`
        // is skipped rather than cleared.
        self.controls
            .set_metadata(souvlaki::MediaMetadata {
                title: Some(&metadata.title),
                artist: Some(&metadata.artist),
                album: Some(&metadata.album),
                cover_url: cover.as_deref(),
                duration: metadata.duration,
            })
            .map_err(backend_error)
    }

    fn set_playback(&mut self, playback: &OsPlayback) -> Result<()> {
        let playback = match playback {
            OsPlayback::Stopped => souvlaki::MediaPlayback::Stopped,
            OsPlayback::Paused { progress } => souvlaki::MediaPlayback::Paused {
                progress: progress.map(souvlaki::MediaPosition),
            },
            OsPlayback::Playing { progress } => souvlaki::MediaPlayback::Playing {
                progress: progress.map(souvlaki::MediaPosition),
            },
        };

        self.controls.set_playback(playback).map_err(backend_error)
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
impl SouvlakiBackend {
    /// The cover this backend will admit, which is not the same question on
    /// both platforms.
    ///
    /// macOS resolves the renderer's loopback URL to the art file it is served
    /// from and refuses anything it cannot verify, because souvlaki's macOS
    /// artwork loader **aborts the process** on a cover it fails to load —
    /// [`crate::cover::loadable_cover`] has the whole story.
    ///
    /// Windows passes the URL through untouched. Its loader is
    /// `RandomAccessStreamReference::CreateFromUri`, which answers with an
    /// `Err` that `set_metadata` already turns into a warning; there is no
    /// abort to prevent, so narrowing the accepted covers there would cost
    /// remote thumbnails to fix a bug that platform does not have.
    #[cfg(target_os = "macos")]
    fn cover_url(&self, metadata: &OsMetadata) -> Option<String> {
        crate::cover::loadable_cover(metadata.cover_url.as_deref(), self.art_dir.as_deref())
    }

    #[cfg(target_os = "windows")]
    fn cover_url(&self, metadata: &OsMetadata) -> Option<String> {
        metadata.cover_url.clone()
    }
}

/// souvlaki's per-platform error, flattened to a string.
///
/// The type differs by target — a `windows::core::Error` newtype on Windows, a
/// fieldless struct whose `Display` is the literal `"Error"` on macOS — so
/// carrying it would make [`MediaControlsError`] `cfg`-shaped and every match on
/// it too.
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn backend_error(error: souvlaki::Error) -> MediaControlsError {
    MediaControlsError::Backend(error.to_string())
}

/// souvlaki's event enum, as this crate's.
///
/// Exhaustive rather than a catch-all `_` arm, so that adding a variant
/// upstream is a compile error here instead of a silently ignored button.
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn to_remote(event: souvlaki::MediaControlEvent) -> RemoteEvent {
    match event {
        souvlaki::MediaControlEvent::Play => RemoteEvent::Play,
        souvlaki::MediaControlEvent::Pause => RemoteEvent::Pause,
        souvlaki::MediaControlEvent::Toggle => RemoteEvent::Toggle,
        souvlaki::MediaControlEvent::Next => RemoteEvent::Next,
        souvlaki::MediaControlEvent::Previous => RemoteEvent::Previous,
        souvlaki::MediaControlEvent::Stop => RemoteEvent::Stop,
        souvlaki::MediaControlEvent::Seek(direction) => {
            RemoteEvent::Seek(to_seek_direction(direction))
        }
        souvlaki::MediaControlEvent::SeekBy(direction, amount) => {
            RemoteEvent::SeekBy(to_seek_direction(direction), amount)
        }
        souvlaki::MediaControlEvent::SetPosition(position) => RemoteEvent::SetPosition(position.0),
        souvlaki::MediaControlEvent::SetVolume(volume) => RemoteEvent::SetVolume(volume),
        souvlaki::MediaControlEvent::OpenUri(uri) => RemoteEvent::OpenUri(uri),
        souvlaki::MediaControlEvent::Raise => RemoteEvent::Raise,
        souvlaki::MediaControlEvent::Quit => RemoteEvent::Quit,
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn to_seek_direction(direction: souvlaki::SeekDirection) -> SeekDirection {
    match direction {
        souvlaki::SeekDirection::Forward => SeekDirection::Forward,
        souvlaki::SeekDirection::Backward => SeekDirection::Backward,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_config_names_the_app() {
        let config = SouvlakiConfig::default();

        assert_eq!(config.display_name, "Shiranami");
        assert_eq!(config.dbus_name, "shiranami");
        assert_eq!(
            config.window_handle, None,
            "the shell supplies it once the window exists"
        );
    }

    /// The panic souvlaki would raise instead: `config.hwnd.expect(…)` in
    /// `MediaControls::new`.
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_without_a_handle_is_an_error_rather_than_a_panic() {
        let result = SouvlakiBackend::new(&SouvlakiConfig::default());

        assert!(matches!(
            result,
            Err(MediaControlsError::MissingWindowHandle)
        ));
    }
}
