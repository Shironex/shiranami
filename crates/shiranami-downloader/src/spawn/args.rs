//! Argument construction, and the one guard that makes it safe.
//!
//! # Why this is a module and not four inline `vec![]`s
//!
//! yt-dlp reads any argument beginning with `-` as an option, and it has
//! options that run commands (`--exec`) and options that pick a downloader
//! binary (`--downloader`). A URL is not trusted input: it arrives from the
//! renderer, from a scraped Spotify page, or from a share payload. If a URL
//! ever reaches argv without the `--` end-of-options separator in front of it,
//! `--exec=calc.exe` is a working remote-code-execution path.
//!
//! So every argv that carries a URL is built by [`append_url_arg`], which
//! refuses anything that is not `http(s)` *and* inserts `--`. Two guards for
//! one hole, because either alone is one refactor away from being removed as
//! redundant.
//!
//! `--ignore-config` leads every yt-dlp argv for the neighbouring reason: it
//! stops yt-dlp reading an ambient `yt-dlp.conf` off its config search path,
//! which is a file this app does not own and which can set `--exec` just as
//! well as an argument can.

use std::path::Path;

use crate::error::{DownloaderError, Result};

/// Stops yt-dlp reading any `yt-dlp.conf` on its config search path.
///
/// Always first. Not for aesthetics — a config file that this app neither
/// wrote nor validated can set the same dangerous options the `--` guard exists
/// to keep out of argv, and it would apply to every run.
pub const IGNORE_CONFIG: &str = "--ignore-config";

/// The end-of-options separator.
pub const END_OF_OPTIONS: &str = "--";

/// Append a URL to a yt-dlp argv, guarded.
///
/// Returns a new vector; v1 did too, and a caller that reused a base argv
/// across two URLs would otherwise accumulate them.
///
/// # Errors
///
/// [`DownloaderError::InvalidUrl`] when `url` is not an `http(s)` URL. Callers
/// at a command boundary should check with [`shiranami_net::is_http_url`] first
/// so the user sees a typed refusal rather than an internal one.
pub fn append_url_arg(args: &[String], url: &str) -> Result<Vec<String>> {
    if !shiranami_net::is_http_url(url) {
        return Err(DownloaderError::invalid_url(&format!(
            "yt-dlp: refusing to pass a non-http(s) URL argument: {url}"
        )));
    }

    let mut argv = args.to_vec();
    argv.push(END_OF_OPTIONS.to_owned());
    argv.push(url.to_owned());
    Ok(argv)
}

/// Turn `&str` literals into the owned argv every builder returns.
fn owned(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_owned()).collect()
}

/// `yt-dlp --version`.
///
/// Deliberately without [`IGNORE_CONFIG`]: v1 read the version through
/// `execFile` rather than its `spawnYtDlp` helper, so this argv never had it.
/// The flag guards against a config file injecting options; printing a version
/// string runs nothing, and matching v1 exactly is worth more here than
/// tidiness.
pub fn version() -> Vec<String> {
    owned(&["--version"])
}

/// `yt-dlp --flat-playlist --dump-json --no-warnings ytsearch<limit>:<query>`.
///
/// The query is not URL-guarded and needs no `--`: it is embedded after the
/// `ytsearch<n>:` prefix, so the resulting argument cannot begin with `-`
/// however hostile the query is.
pub fn search(query: &str, limit: u32) -> Vec<String> {
    let mut argv = owned(&[
        IGNORE_CONFIG,
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
    ]);
    argv.push(format!("ytsearch{limit}:{query}"));
    argv
}

/// `yt-dlp -f bestaudio --get-url --no-warnings -- <url>`.
///
/// # Errors
///
/// [`DownloaderError::InvalidUrl`] when `url` is not `http(s)`.
pub fn stream_url(url: &str) -> Result<Vec<String>> {
    append_url_arg(
        &owned(&[
            IGNORE_CONFIG,
            "-f",
            "bestaudio",
            "--get-url",
            "--no-warnings",
        ]),
        url,
    )
}

/// `yt-dlp --flat-playlist --dump-json --no-warnings -- <url>`.
///
/// # Errors
///
/// [`DownloaderError::InvalidUrl`] when `url` is not `http(s)`.
pub fn playlist(url: &str) -> Result<Vec<String>> {
    append_url_arg(
        &owned(&[
            IGNORE_CONFIG,
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
        ]),
        url,
    )
}

/// Which ffmpeg the download run has available, if any.
///
/// The distinction is not cosmetic: with ffmpeg, yt-dlp extracts audio and
/// transcodes to MP3; without it, the best audio-only format is downloaded
/// as-is. v1 branched here and so does this.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FfmpegAvailability {
    /// The managed build, whose directory is passed as `--ffmpeg-location`.
    Managed(std::path::PathBuf),
    /// An ffmpeg found on `PATH`, which yt-dlp will locate for itself.
    OnPath,
    /// None available. Audio is downloaded without conversion.
    Absent,
}

/// The full download argv.
///
/// `print_to` receives the resolved output path via `--print-to-file
/// after_move:filepath` — the only reliable way to learn where yt-dlp actually
/// wrote, once `%(title)s` templating and post-processing have both had their
/// say.
///
/// # Errors
///
/// [`DownloaderError::InvalidUrl`] when `url` is not `http(s)`.
pub fn download(
    url: &str,
    output_template: &Path,
    print_to: &Path,
    ffmpeg: &FfmpegAvailability,
) -> Result<Vec<String>> {
    let mut argv = owned(&[IGNORE_CONFIG]);

    if let FfmpegAvailability::Managed(directory) = ffmpeg {
        argv.push("--ffmpeg-location".to_owned());
        argv.push(directory.to_string_lossy().into_owned());
    }

    if matches!(
        ffmpeg,
        FfmpegAvailability::Managed(_) | FfmpegAvailability::OnPath
    ) {
        argv.extend(owned(&[
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--embed-thumbnail",
            "--add-metadata",
        ]));
    } else {
        argv.extend(owned(&["-f", "bestaudio", "--add-metadata"]));
    }

    argv.extend(owned(&[
        "--no-warnings",
        // Progress on its own line instead of carriage-return overwrites,
        // which is what makes line-oriented progress parsing possible at all.
        "--newline",
        "--print-to-file",
        "after_move:filepath",
    ]));
    argv.push(print_to.to_string_lossy().into_owned());
    argv.push("-o".to_owned());
    argv.push(output_template.to_string_lossy().into_owned());

    append_url_arg(&argv, url)
}

/// `ffmpeg -version`.
pub fn ffmpeg_version() -> Vec<String> {
    owned(&["-version"])
}

/// `xattr -d com.apple.quarantine <path>`.
///
/// macOS marks anything downloaded with a quarantine attribute, and Gatekeeper
/// refuses to execute a quarantined binary. Removing it is what makes a
/// just-downloaded yt-dlp runnable at all.
pub fn strip_quarantine(path: &Path) -> Vec<String> {
    vec![
        "-d".to_owned(),
        "com.apple.quarantine".to_owned(),
        path.to_string_lossy().into_owned(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn appends_the_end_of_options_separator_before_a_valid_url() {
        let argv = append_url_arg(
            &owned(&["-f", "bestaudio", "--get-url"]),
            "https://www.youtube.com/watch?v=abc",
        )
        .expect("an http URL is accepted");

        assert_eq!(
            argv,
            vec![
                "-f",
                "bestaudio",
                "--get-url",
                "--",
                "https://www.youtube.com/watch?v=abc"
            ]
        );
        assert_eq!(argv[argv.len() - 2], "--");
        assert_eq!(argv[argv.len() - 1], "https://www.youtube.com/watch?v=abc");
    }

    #[test]
    fn does_not_mutate_the_original_args() {
        let original = owned(&["--flat-playlist", "--dump-json"]);

        let _ = append_url_arg(&original, "https://youtube.com/playlist?list=PL1")
            .expect("an http URL is accepted");

        assert_eq!(original, vec!["--flat-playlist", "--dump-json"]);
    }

    #[test]
    fn refuses_argument_injection_payloads_instead_of_passing_them_to_yt_dlp() {
        for payload in ["--exec=calc.exe", "--downloader=/bin/sh", "-x"] {
            let error = append_url_arg(&owned(&["--get-url"]), payload)
                .expect_err("an option-shaped value is refused");

            assert!(
                error.to_string().contains("non-http"),
                "{payload} must be refused as a non-http(s) URL, not passed on"
            );
        }
    }

    #[test]
    fn refuses_non_http_schemes() {
        for payload in ["file:///etc/passwd", "ftp://example.com/x"] {
            let error = append_url_arg(&[], payload).expect_err("a non-http scheme is refused");
            assert!(error.to_string().contains("non-http"));
        }
    }

    #[test]
    fn refuses_empty_and_non_url_input() {
        for payload in ["", "not a url"] {
            let error = append_url_arg(&[], payload).expect_err("a non-URL is refused");
            assert!(error.to_string().contains("non-http"));
        }
    }

    #[test]
    fn the_search_argv_matches_v1_exactly() {
        assert_eq!(
            search("lofi beats", 10),
            vec![
                "--ignore-config",
                "--flat-playlist",
                "--dump-json",
                "--no-warnings",
                "ytsearch10:lofi beats",
            ]
        );
    }

    #[test]
    fn a_hostile_search_query_cannot_become_an_option() {
        let argv = search("--exec=calc.exe", 5);

        assert_eq!(
            argv.last().map(String::as_str),
            Some("ytsearch5:--exec=calc.exe"),
            "the `ytsearch<n>:` prefix is what keeps a query from ever \
             beginning with a dash, which is why this argv needs no `--`"
        );
    }

    #[test]
    fn the_stream_url_argv_matches_v1_exactly() {
        assert_eq!(
            stream_url("https://youtu.be/abc").expect("an http URL is accepted"),
            vec![
                "--ignore-config",
                "-f",
                "bestaudio",
                "--get-url",
                "--no-warnings",
                "--",
                "https://youtu.be/abc",
            ]
        );
    }

    #[test]
    fn the_playlist_argv_matches_v1_exactly() {
        assert_eq!(
            playlist("https://youtube.com/playlist?list=PL1").expect("an http URL is accepted"),
            vec![
                "--ignore-config",
                "--flat-playlist",
                "--dump-json",
                "--no-warnings",
                "--",
                "https://youtube.com/playlist?list=PL1",
            ]
        );
    }

    #[test]
    fn the_version_argv_carries_no_ignore_config_just_as_v1_did() {
        assert_eq!(
            version(),
            vec!["--version"],
            "v1 read the version through `execFile`, not through its \
             `spawnYtDlp` helper, so this argv never had the flag"
        );
    }

    #[test]
    fn the_download_argv_with_a_managed_ffmpeg_matches_v1_exactly() {
        let argv = download(
            "https://youtu.be/abc",
            &PathBuf::from("/music/%(title)s.%(ext)s"),
            &PathBuf::from("/tmp/print.txt"),
            &FfmpegAvailability::Managed(PathBuf::from("/data/bin")),
        )
        .expect("an http URL is accepted");

        assert_eq!(
            argv,
            vec![
                "--ignore-config",
                "--ffmpeg-location",
                "/data/bin",
                "-x",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0",
                "--embed-thumbnail",
                "--add-metadata",
                "--no-warnings",
                "--newline",
                "--print-to-file",
                "after_move:filepath",
                "/tmp/print.txt",
                "-o",
                "/music/%(title)s.%(ext)s",
                "--",
                "https://youtu.be/abc",
            ]
        );
    }

    #[test]
    fn a_system_ffmpeg_gets_the_conversion_flags_but_no_location() {
        let argv = download(
            "https://youtu.be/abc",
            &PathBuf::from("/music/%(title)s.%(ext)s"),
            &PathBuf::from("/tmp/print.txt"),
            &FfmpegAvailability::OnPath,
        )
        .expect("an http URL is accepted");

        assert!(!argv.contains(&"--ffmpeg-location".to_owned()));
        assert!(argv.contains(&"--audio-format".to_owned()));
    }

    #[test]
    fn without_ffmpeg_the_download_asks_for_best_audio_and_no_conversion() {
        let argv = download(
            "https://youtu.be/abc",
            &PathBuf::from("/music/%(title)s.%(ext)s"),
            &PathBuf::from("/tmp/print.txt"),
            &FfmpegAvailability::Absent,
        )
        .expect("an http URL is accepted");

        assert_eq!(
            argv,
            vec![
                "--ignore-config",
                "-f",
                "bestaudio",
                "--add-metadata",
                "--no-warnings",
                "--newline",
                "--print-to-file",
                "after_move:filepath",
                "/tmp/print.txt",
                "-o",
                "/music/%(title)s.%(ext)s",
                "--",
                "https://youtu.be/abc",
            ]
        );
    }

    #[test]
    fn a_download_of_a_non_http_url_is_refused_before_any_argv_exists() {
        let error = download(
            "file:///etc/passwd",
            &PathBuf::from("/music/%(title)s.%(ext)s"),
            &PathBuf::from("/tmp/print.txt"),
            &FfmpegAvailability::Absent,
        )
        .expect_err("a non-http URL is refused");

        assert!(matches!(error, DownloaderError::InvalidUrl { .. }));
    }

    #[test]
    fn the_quarantine_argv_matches_v1_exactly() {
        assert_eq!(
            strip_quarantine(&PathBuf::from("/data/bin/yt-dlp")),
            vec!["-d", "com.apple.quarantine", "/data/bin/yt-dlp"],
            "asserted as an argv array rather than a command string — the \
             shape is the security property"
        );
    }
}
