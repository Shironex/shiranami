//! External binaries and everything that comes down through them.
//!
//! `shiranami-downloader` owns the yt-dlp and ffmpeg binary managers (download,
//! chmod, macOS quarantine removal, zip extraction), hardened child-process
//! spawning (`--ignore-config`, the `--` argument guard, failure
//! classification, `kill_on_drop(true)` on every child), the download queue
//! with its concurrency limit, pause/resume, batching and write-through
//! persistence to `download_queue`, and playlist extraction for YouTube and
//! Spotify including the track matcher and its fixture.
//!
//! Ported in Phase 11. An aborted download must delete both `<dest>` and
//! `<dest>.part`. See `docs/v2/architecture.md` §2.2 (#19–#21).
