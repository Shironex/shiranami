//! Where the managed binaries live, and what they are called there.
//!
//! v1 resolved this through Electron: `<userData>/bin` when packaged, and a
//! walk up from `app.getAppPath()` looking for the workspace `package.json`
//! when not. v2 keeps the *layout* — `<app data>/bin`, same file names — and
//! drops the walk-up entirely.
//!
//! The walk-up existed so a developer's `pnpm dev` run shared one downloaded
//! yt-dlp with the repo rather than with the installed app. Reproducing it here
//! would mean deriving a runtime path from the build tree, which architecture
//! §2.3 forbids outright: `CARGO_MANIFEST_DIR` names the machine that compiled
//! the binary, and a CI-built release once shipped broken over exactly that.
//! The directory is therefore a parameter. The composition root passes Tauri's
//! resolved app-data directory, and a developer who wants a shared `bin/`
//! points it there.
//!
//! # Platform is a value, not a `cfg`
//!
//! Which asset to download and what to call it are compile-time facts in a
//! shipped build and *test inputs* here. Threading [`Platform`] through as a
//! parameter is what lets the Windows asset URL be asserted on a macOS CI
//! runner — v1 could only test this by reassigning `process.platform`, and the
//! two `ffmpeg-manager` tests that did so left the property non-configurable
//! for whatever ran next.

use std::path::{Path, PathBuf};

/// The platforms the binary managers distinguish between.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Platform {
    /// macOS.
    MacOs,
    /// Windows.
    Windows,
    /// Everything else. yt-dlp has a Linux asset; ffmpeg has no automatic
    /// install, exactly as in v1.
    Other,
}

impl Platform {
    /// The platform this build runs on.
    pub const HOST: Self = if cfg!(target_os = "macos") {
        Self::MacOs
    } else if cfg!(target_os = "windows") {
        Self::Windows
    } else {
        Self::Other
    };

    /// Whether executables carry a `.exe` suffix.
    fn executable_suffix(self) -> &'static str {
        match self {
            Self::Windows => ".exe",
            Self::MacOs | Self::Other => "",
        }
    }

    /// The file name for `stem` on this platform.
    pub fn executable_name(self, stem: &str) -> String {
        format!("{stem}{}", self.executable_suffix())
    }
}

/// Where yt-dlp and ffmpeg are downloaded to, under the app data directory.
///
/// The name is v1's and is a compatibility constraint, not a preference: a user
/// upgrading in place already has binaries in `<app data>/bin`, and renaming
/// the directory would silently re-download both.
pub fn bin_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("bin")
}

/// The yt-dlp executable inside `bin_dir`.
pub fn yt_dlp_path(bin_dir: &Path, platform: Platform) -> PathBuf {
    bin_dir.join(platform.executable_name("yt-dlp"))
}

/// The ffmpeg executable inside `bin_dir`.
pub fn ffmpeg_path(bin_dir: &Path, platform: Platform) -> PathBuf {
    bin_dir.join(platform.executable_name("ffmpeg"))
}

/// The ffprobe executable inside `bin_dir`.
pub fn ffprobe_path(bin_dir: &Path, platform: Platform) -> PathBuf {
    bin_dir.join(platform.executable_name("ffprobe"))
}

/// Base URL for yt-dlp's latest release assets.
pub const YT_DLP_RELEASE_BASE: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

/// GitHub API endpoint naming yt-dlp's latest release.
pub const YT_DLP_RELEASE_API: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

/// The evermeet.cx ffmpeg archive, macOS.
pub const FFMPEG_MAC_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/zip";

/// The evermeet.cx ffprobe archive, macOS.
pub const FFPROBE_MAC_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip";

/// evermeet.cx's release metadata, macOS.
pub const FFMPEG_MAC_INFO_URL: &str = "https://evermeet.cx/ffmpeg/info/ffmpeg/release";

/// The gyan.dev essentials build, Windows.
pub const FFMPEG_WINDOWS_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

/// gyan.dev's plain-text version file, Windows.
pub const FFMPEG_WINDOWS_VERSION_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver";

/// The release asset to download for `platform`.
pub fn yt_dlp_asset_url(platform: Platform) -> String {
    let asset = match platform {
        Platform::MacOs => "yt-dlp_macos",
        Platform::Windows => "yt-dlp.exe",
        Platform::Other => "yt-dlp_linux",
    };
    format!("{YT_DLP_RELEASE_BASE}/{asset}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_yt_dlp_path_carries_exe_only_on_windows() {
        let bin = PathBuf::from("/data/bin");

        assert_eq!(
            yt_dlp_path(&bin, Platform::Windows),
            PathBuf::from("/data/bin/yt-dlp.exe")
        );
        assert_eq!(
            yt_dlp_path(&bin, Platform::MacOs),
            PathBuf::from("/data/bin/yt-dlp")
        );
        assert_eq!(
            yt_dlp_path(&bin, Platform::Other),
            PathBuf::from("/data/bin/yt-dlp")
        );
    }

    #[test]
    fn the_ffmpeg_and_ffprobe_paths_sit_beside_each_other() {
        let bin = PathBuf::from("/data/bin");

        assert_eq!(
            ffmpeg_path(&bin, Platform::Windows),
            PathBuf::from("/data/bin/ffmpeg.exe")
        );
        assert_eq!(
            ffprobe_path(&bin, Platform::Windows),
            PathBuf::from("/data/bin/ffprobe.exe")
        );
        assert_eq!(
            ffprobe_path(&bin, Platform::MacOs),
            PathBuf::from("/data/bin/ffprobe")
        );
    }

    #[test]
    fn the_bin_directory_is_the_one_v1_already_populated() {
        assert_eq!(
            bin_dir(Path::new("/Users/x/Library/Application Support/Shiranami")),
            PathBuf::from("/Users/x/Library/Application Support/Shiranami/bin"),
            "a user upgrading in place already has binaries here — renaming \
             the directory would silently re-download both tools"
        );
    }

    #[test]
    fn each_platform_downloads_its_own_yt_dlp_asset() {
        assert_eq!(
            yt_dlp_asset_url(Platform::MacOs),
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
        );
        assert_eq!(
            yt_dlp_asset_url(Platform::Windows),
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        );
        assert_eq!(
            yt_dlp_asset_url(Platform::Other),
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
        );
    }

    #[test]
    fn the_host_platform_is_one_of_the_three() {
        assert!(matches!(
            Platform::HOST,
            Platform::MacOs | Platform::Windows | Platform::Other
        ));
    }
}
