//! Reading a running yt-dlp's stdout.
//!
//! Three things have to be recovered from a download in flight, and yt-dlp
//! offers no structured output for any of them — `--progress-template` covers
//! the percentage but not the post-processor transitions, and nothing covers
//! the destination paths. So v1 matched on the human-readable lines, and this
//! matches the same ones.
//!
//! # Why destinations are collected at all
//!
//! An aborted download has to leave the downloads folder clean, and "clean"
//! means both `<dest>` and `<dest>.part` for every path yt-dlp announced —
//! plural, because a run with ffmpeg announces one destination for the download
//! and another for the extracted audio. Missing either leaves a stray file
//! whose name looks exactly like a real track.

use std::sync::LazyLock;

use regex::Regex;

/// `[download] Destination: /path/to/file.webm`, and the `[ExtractAudio]` and
/// `[ffmpeg]` variants of the same line.
static DESTINATION: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::unwrap_used,
        reason = "a literal pattern that compiles at first use or never"
    )]
    Regex::new(r"\[[^\]]+\]\s+Destination:\s+(.+)").unwrap()
});

/// `[download]  42.3% of 4.20MiB at 1.10MiB/s ETA 00:02`.
static PERCENT: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::unwrap_used,
        reason = "a literal pattern that compiles at first use or never"
    )]
    Regex::new(r"\[download\]\s+([\d.]+)%").unwrap()
});

/// What one line of yt-dlp's stdout told us.
#[derive(Debug, Clone, PartialEq)]
pub enum Signal {
    /// yt-dlp announced where it is writing.
    Destination(String),
    /// Transfer progress, as a percentage.
    Percent(f64),
    /// Post-processing started — audio extraction or a stream merge.
    Converting,
    /// Nothing this crate cares about.
    Ignored,
}

/// Read one line.
///
/// Order matters and is v1's: a `Destination:` line is never also a percentage
/// line, but `[download] Destination: …` matches the `[download]` prefix both
/// patterns share, so the destination is tried first.
pub fn read_line(line: &str) -> Signal {
    if let Some(captured) = DESTINATION.captures(line)
        && let Some(path) = captured.get(1)
    {
        return Signal::Destination(path.as_str().trim().to_owned());
    }

    if let Some(captured) = PERCENT.captures(line)
        && let Some(percent) = captured.get(1)
        && let Ok(percent) = percent.as_str().parse::<f64>()
    {
        return Signal::Percent(percent);
    }

    // v1 tested these with `includes` on the raw chunk rather than anchoring
    // them, and the same substring test is kept: yt-dlp prefixes the line with
    // the post-processor's name but has moved what follows between releases.
    if line.contains("[ExtractAudio]") || line.contains("[Merger]") {
        return Signal::Converting;
    }

    Signal::Ignored
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_download_destination() {
        assert_eq!(
            read_line("[download] Destination: /music/Some Track.webm"),
            Signal::Destination("/music/Some Track.webm".to_owned())
        );
    }

    #[test]
    fn reads_the_post_processor_destinations_too() {
        // Both announce where they write, and both files exist on disk during
        // the run — an abort has to remove each of them.
        assert_eq!(
            read_line("[ExtractAudio] Destination: /music/Some Track.mp3"),
            Signal::Destination("/music/Some Track.mp3".to_owned())
        );
        assert_eq!(
            read_line("[ffmpeg] Destination: /music/Some Track.m4a"),
            Signal::Destination("/music/Some Track.m4a".to_owned())
        );
    }

    #[test]
    fn a_destination_is_trimmed_but_keeps_its_inner_spaces() {
        assert_eq!(
            read_line("[download] Destination:   /music/A Long Title.webm  "),
            Signal::Destination("/music/A Long Title.webm".to_owned())
        );
    }

    #[test]
    fn reads_a_fractional_percentage() {
        assert_eq!(
            read_line("[download]  42.3% of 4.20MiB at 1.10MiB/s ETA 00:02"),
            Signal::Percent(42.3)
        );
        assert_eq!(
            read_line("[download] 100.0% of 4.20MiB in 00:03"),
            Signal::Percent(100.0)
        );
        assert_eq!(
            read_line("[download]   0.0% of ~4.20MiB at Unknown B/s ETA Unknown"),
            Signal::Percent(0.0)
        );
    }

    #[test]
    fn a_destination_line_is_read_as_a_destination_not_a_percentage() {
        // `[download] Destination: …` carries the prefix both patterns share.
        // A file named `50%.webm` would otherwise be read as progress.
        assert_eq!(
            read_line("[download] Destination: /music/50%.webm"),
            Signal::Destination("/music/50%.webm".to_owned())
        );
    }

    #[test]
    fn recognises_both_post_processors() {
        assert_eq!(
            read_line("[ExtractAudio] Converting audio to mp3"),
            Signal::Converting
        );
        assert_eq!(
            read_line("[Merger] Merging formats into \"/music/x.mkv\""),
            Signal::Converting
        );
    }

    #[test]
    fn everything_else_is_ignored() {
        for line in [
            "[youtube] abc: Downloading webpage",
            "[info] abc: Downloading 1 format(s): 251",
            "",
            "WARNING: something",
        ] {
            assert_eq!(
                read_line(line),
                Signal::Ignored,
                "unexpected read of {line}"
            );
        }
    }
}
