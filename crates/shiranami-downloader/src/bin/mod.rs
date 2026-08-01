//! The yt-dlp and ffmpeg binary managers (architecture §2.2 #19).
//!
//! [`layout`] decides where the binaries live and which asset each platform
//! downloads, [`fetch`] streams one to disk, [`archive`] unpacks it, [`install`]
//! puts it in place, and [`ytdlp`] and [`ffmpeg`] compose those into the two
//! managers. [`status`] is the pair of them together, for the settings panel
//! and the install-everything-missing run.

pub mod archive;
pub mod fetch;
pub mod ffmpeg;
mod ffmpeg_install;
pub mod install;
pub mod layout;
pub mod status;
pub mod ytdlp;

pub use fetch::ProgressSink;
pub use ffmpeg::FfmpegManager;
pub use layout::{Platform, bin_dir};
pub use status::{InstallProgressSink, Tools};
pub use ytdlp::YtDlpManager;
