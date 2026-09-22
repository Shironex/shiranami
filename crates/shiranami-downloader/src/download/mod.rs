//! Running one yt-dlp download and reading what it says while it runs.
//!
//! [`output`] reads yt-dlp's stdout line by line; [`runner`] composes that with
//! the spawn seam into the [`runner::DownloadRunner`] the queue drives.

pub mod output;
pub mod runner;

pub use runner::{
    DownloadFailure, DownloadProgressSink, DownloadRequest, DownloadRunner, YtDlpDownloader,
};
