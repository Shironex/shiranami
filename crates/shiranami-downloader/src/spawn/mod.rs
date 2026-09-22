//! Everything about running yt-dlp, ffmpeg and `xattr` as child processes.
//!
//! [`args`] builds argv and refuses hostile URLs, [`runner`] defines the seam
//! the rest of the crate runs children through, [`tokio_runner`] implements it
//! against the real operating system, and [`classify`] and [`version`] read
//! meaning back out of what a child printed.

pub mod args;
pub mod classify;
pub mod runner;
pub mod tokio_runner;
pub mod version;

pub use args::{FfmpegAvailability, append_url_arg};
pub use classify::{classify_failure, tail_output};
pub use runner::{Capture, LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec};
pub use tokio_runner::TokioRunner;
pub use version::{has_update, version_segments};
