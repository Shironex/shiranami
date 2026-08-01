//! The spawn seam against a real yt-dlp, when one is installed.
//!
//! Everything else in this crate's suite runs against a mocked
//! [`shiranami_downloader::spawn::ProcessRunner`], which is what keeps it fast
//! and hermetic. That leaves one question unanswered: does the argv this crate
//! builds actually work on the tool it builds it for?
//!
//! These tests answer it, and **skip** when no managed yt-dlp is present. CI
//! never installs one, so CI never runs them; a developer's machine that has
//! downloaded yt-dlp through the app runs them on every `cargo test`.
//!
//! They deliberately make **no network requests**. A search or an extraction
//! would be testing YouTube's availability rather than this crate, and would
//! fail on a train. What is left — that the binary starts, accepts
//! `--ignore-config`, and prints a version this crate can parse — is exactly
//! the part a mock cannot vouch for.

use std::path::PathBuf;

use shiranami_downloader::bin::layout::{self, Platform};
use shiranami_downloader::spawn::{
    ProcessRunner, ProcessSpec, TokioRunner, args, version_segments,
};
use tokio_util::sync::CancellationToken;

/// Points these tests at a specific binary, overriding discovery.
///
/// A test that skips is a test that can rot unnoticed — nightcore's drift guard
/// passed vacuously for its entire life (R17). This escape hatch is how the
/// skip is *proven* to be a skip rather than a silent pass: pointing it at a
/// program that is not yt-dlp must make these tests fail, and does.
const OVERRIDE: &str = "SHIRANAMI_YTDLP_PATH";

/// The managed yt-dlp, if this machine has one.
///
/// Both data directories are checked: v2's own, and v1's — which is where a
/// developer running the shipped Electron app already has one, and is the
/// directory the brief for this phase names.
fn installed_yt_dlp() -> Option<PathBuf> {
    if let Ok(path) = std::env::var(OVERRIDE) {
        return Some(PathBuf::from(path));
    }

    let candidates = [
        shiranami_core::paths::dirs::data_dir(),
        shiranami_core::paths::dirs::legacy_data_dir(),
    ];

    candidates
        .into_iter()
        .flatten()
        .map(|data_dir| layout::yt_dlp_path(&layout::bin_dir(&data_dir), Platform::HOST))
        .find(|path| path.is_file())
}

/// Resolve the binary, or explain the skip and return.
macro_rules! yt_dlp_or_skip {
    () => {
        match installed_yt_dlp() {
            Some(path) => path,
            None => {
                eprintln!(
                    "skipping: no managed yt-dlp installed. Install one through the app, \
                     or ignore — CI is expected to skip these."
                );
                return;
            }
        }
    };
}

#[tokio::test]
async fn the_real_binary_prints_a_version_this_crate_can_parse() {
    let yt_dlp = yt_dlp_or_skip!();

    let output = TokioRunner::new()
        .run(
            ProcessSpec::capturing(yt_dlp, args::version())
                .with_timeout(std::time::Duration::from_secs(30)),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect("the real yt-dlp runs");

    assert_eq!(output.code, 0, "stderr: {}", output.stderr);

    let version = output.stdout.trim();
    assert!(
        !version_segments(Some(version)).is_empty(),
        "the version parser found no numeric segments in {version:?} — yt-dlp \
         has changed the format its own `--version` prints"
    );
}

#[tokio::test]
async fn the_real_binary_accepts_the_ignore_config_flag_this_crate_always_sends() {
    let yt_dlp = yt_dlp_or_skip!();

    // `--ignore-config` leads every argv this crate builds. If a yt-dlp release
    // ever renamed it, every download would fail at once — and the mocked
    // suite would still be green.
    let mut argv = vec![args::IGNORE_CONFIG.to_owned()];
    argv.extend(args::version());

    let output = TokioRunner::new()
        .run(
            ProcessSpec::capturing(yt_dlp, argv).with_timeout(std::time::Duration::from_secs(30)),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect("the real yt-dlp runs");

    assert_eq!(
        output.code, 0,
        "yt-dlp rejected `--ignore-config`: {}",
        output.stderr
    );
}

#[tokio::test]
async fn the_real_binary_refuses_an_unknown_option_which_is_what_the_dash_guard_prevents() {
    let yt_dlp = yt_dlp_or_skip!();

    // The premise of `append_url_arg`: without the `--` separator, a value
    // beginning with a dash is read as an option. Confirmed against the real
    // parser rather than assumed.
    let output = TokioRunner::new()
        .run(
            ProcessSpec::capturing(
                yt_dlp,
                vec![
                    args::IGNORE_CONFIG.to_owned(),
                    "--no-warnings".to_owned(),
                    "--this-option-does-not-exist".to_owned(),
                ],
            )
            .with_timeout(std::time::Duration::from_secs(30)),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect("the real yt-dlp runs");

    assert_ne!(
        output.code, 0,
        "yt-dlp accepted an unknown option — the whole reason this crate \
         inserts `--` before every URL is that it does not"
    );
}
