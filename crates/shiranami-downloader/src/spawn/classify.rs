//! Turning a failed yt-dlp run into something a user can read.
//!
//! There are two answers and v1 gave both. When the output matches a failure we
//! have seen before, the answer is a frozen code from
//! [`shiranami_core::error::codes::yt_dlp`] and the renderer shows a translated
//! sentence in the user's language. When it does not, the answer is the *tail of
//! yt-dlp's own output* — untranslated technical English, shown verbatim.
//!
//! That second half looks like giving up and is not. yt-dlp's own diagnostics
//! name the extractor, the video and the reason; "Download failed" names
//! nothing. Age restriction is the top cause of per-video failures, which is why
//! it is checked first and why it has three separate needles: YouTube phrases it
//! differently in the human-facing error, the player-response status and the
//! extractor log.

use shiranami_core::error::codes::yt_dlp;

/// Default line ceiling for [`tail_output`]. v1's, unchanged.
pub const TAIL_MAX_LINES: usize = 20;

/// Default byte ceiling for [`tail_output`]. v1's, unchanged.
pub const TAIL_MAX_BYTES: usize = 2048;

/// What a run with no output at all reports.
pub const NO_OUTPUT: &str = "yt-dlp failed without producing any output";

/// Trim verbose output down to its last few non-empty lines.
///
/// Blank lines are dropped *before* the last-`max_lines` slice, so twenty lines
/// of content survive twenty blank ones. Each surviving line is trimmed.
///
/// The byte ceiling is applied to the joined tail and keeps the **end**:
/// truncating format enumeration from the front is what leaves the actual error
/// visible. v1 measured in UTF-16 code units because it was JavaScript; this
/// measures in bytes and steps to the nearest character boundary. The inputs
/// are yt-dlp diagnostics, which are ASCII apart from the occasional title.
pub fn tail_output_with(output: &str, max_lines: usize, max_bytes: usize) -> String {
    let lines: Vec<&str> = output
        .split('\n')
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let start = lines.len().saturating_sub(max_lines);
    let tail = lines[start..].join("\n");

    if tail.len() <= max_bytes {
        return tail;
    }

    let mut cut = tail.len() - max_bytes;
    while cut < tail.len() && !tail.is_char_boundary(cut) {
        cut += 1;
    }
    tail[cut..].to_owned()
}

/// [`tail_output_with`] at v1's defaults: 20 lines, 2048 bytes.
pub fn tail_output(output: &str) -> String {
    tail_output_with(output, TAIL_MAX_LINES, TAIL_MAX_BYTES)
}

/// Classify a failed run from its combined stdout and stderr.
///
/// Returns a frozen `yt_dlp_*` code, or the output tail when nothing matches.
/// The precedence is v1's and is load-bearing: an age-restricted video also
/// reports as unplayable, so checking unavailability first would hide the one
/// classification that tells the user what to do about it.
pub fn classify_failure(output: &str) -> String {
    let text = output.to_lowercase();

    if text.contains("sign in to confirm your age")
        || text.contains("login_required")
        || text.contains("age-restricted")
    {
        return yt_dlp::AGE_RESTRICTED.to_owned();
    }

    if text.contains("video unavailable") || text.contains("unplayable") {
        return yt_dlp::VIDEO_UNAVAILABLE.to_owned();
    }

    if text.contains("requested format is not available") {
        return yt_dlp::NO_AUDIO_FORMAT.to_owned();
    }

    let tail = tail_output(output);
    if tail.is_empty() {
        NO_OUTPUT.to_owned()
    } else {
        tail
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_the_last_n_non_empty_lines() {
        assert_eq!(
            tail_output_with("one\ntwo\n\nthree\nfour\nfive", 3, TAIL_MAX_BYTES),
            "three\nfour\nfive",
            "the blank line is dropped before the slice, not counted by it"
        );
    }

    #[test]
    fn caps_output_to_max_bytes_from_the_end() {
        let output = (0..50)
            .map(|index| format!("line-{index}"))
            .collect::<Vec<_>>()
            .join("\n");

        let tail = tail_output_with(&output, 50, 40);

        assert!(tail.len() <= 40);
        assert!(
            tail.ends_with("line-49"),
            "truncation keeps the tail — the error is at the end, the `[debug]` \
             preamble is at the start"
        );
    }

    #[test]
    fn returns_an_empty_string_for_blank_output() {
        assert_eq!(tail_output("\n\n   \n"), "");
    }

    #[test]
    fn detects_age_restricted_videos_from_yt_dlp_error_output() {
        let output = "[youtube] 74S4rNnpHUE: Downloading webpage\n\
             ERROR: [youtube] 74S4rNnpHUE: Sign in to confirm your age. \
             This video may be inappropriate for some users.";

        assert_eq!(classify_failure(output), "yt_dlp_age_restricted");
    }

    #[test]
    fn detects_age_restriction_from_the_login_required_playability_status() {
        assert_eq!(
            classify_failure(
                "[debug] [youtube] abc: android_vr player response playability status: LOGIN_REQUIRED"
            ),
            "yt_dlp_age_restricted",
            "the needle is matched after lowercasing, so the shouted status \
             still classifies"
        );
    }

    #[test]
    fn detects_the_third_age_restriction_phrasing() {
        assert_eq!(
            classify_failure("ERROR: this video is age-restricted"),
            "yt_dlp_age_restricted"
        );
    }

    #[test]
    fn detects_generic_unavailability() {
        assert_eq!(
            classify_failure("ERROR: Video unavailable"),
            "yt_dlp_video_unavailable"
        );
        assert_eq!(
            classify_failure("ERROR: this video is unplayable"),
            "yt_dlp_video_unavailable"
        );
    }

    #[test]
    fn detects_format_not_available() {
        assert_eq!(
            classify_failure("ERROR: Requested format is not available"),
            "yt_dlp_no_audio_format"
        );
    }

    #[test]
    fn age_restriction_wins_over_unavailability() {
        // YouTube reports both for the same video. v1 checked age first, and
        // that ordering is the difference between telling the user to sign in
        // and telling them the video is gone.
        assert_eq!(
            classify_failure("ERROR: Video unavailable. Sign in to confirm your age."),
            "yt_dlp_age_restricted"
        );
    }

    #[test]
    fn falls_back_to_the_tail_of_the_output_when_no_pattern_matches() {
        assert_eq!(
            classify_failure("some unknown yt-dlp failure mode\nwith a second line"),
            "some unknown yt-dlp failure mode\nwith a second line"
        );
    }

    #[test]
    fn returns_a_sentinel_string_for_empty_output() {
        assert_eq!(classify_failure(""), NO_OUTPUT);
        assert!(NO_OUTPUT.contains("without producing any output"));
    }
}
