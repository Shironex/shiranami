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

/// What kind of failure a yt-dlp run was, for deciding whether a newer yt-dlp
/// could fix it.
///
/// Separate from [`classify_failure`], which answers "what does the user read",
/// because this answers "what does the app do". Only [`Self::Extractor`] ever
/// triggers an update check: a network error is not fixed by a new binary, and
/// a private or removed video is not fixed by anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    /// The site changed under yt-dlp: an extractor, signature or format
    /// failure of the kind yt-dlp fixes in a release.
    Extractor,
    /// The connection failed before the site had a chance to answer.
    Network,
    /// The video itself cannot be had: private, removed, age-restricted,
    /// region-blocked. A newer yt-dlp changes none of that.
    Unavailable,
    /// Nothing recognisable.
    Other,
}

impl FailureKind {
    /// Whether a newer yt-dlp might fix this.
    pub fn suggests_outdated_yt_dlp(self) -> bool {
        self == Self::Extractor
    }
}

/// Needles for content that is gone or gated. Checked first: yt-dlp wraps
/// several of these in an extractor error, and "update yt-dlp" is the wrong
/// answer to a private video however it is phrased.
const UNAVAILABLE: &[&str] = &[
    "private video",
    "video unavailable",
    "unplayable",
    "has been removed",
    "no longer available",
    "account associated with this video has been terminated",
    "members-only",
    "join this channel to get access",
    "not available in your country",
    "blocked it in your country",
    "on copyright grounds",
    "sign in to confirm your age",
    "login_required",
    "age-restricted",
    "premieres in",
    "this live event will begin",
];

/// Needles for a connection that failed. `HTTP Error 429` belongs here too:
/// being rate limited is a reason to wait, not to update.
const NETWORK: &[&str] = &[
    "urlopen error",
    "getaddrinfo failed",
    "nodename nor servname",
    "name or service not known",
    "temporary failure in name resolution",
    "connection refused",
    "connection reset",
    "connection aborted",
    "network is unreachable",
    "no route to host",
    "timed out",
    "incompleteread",
    "http error 429",
    "ssl: certificate_verify_failed",
];

/// Needles for yt-dlp's own "the site changed" failures. Several of these are
/// yt-dlp literally asking to be updated.
const EXTRACTOR: &[&str] = &[
    "unable to extract",
    "signature extraction failed",
    "nsig extraction failed",
    "please report this issue on",
    "confirm you are on the latest version",
    "requested format is not available",
    "no video formats found",
    "failed to parse json",
    "unable to decode",
];

/// Decide what kind of failure `text` describes.
///
/// `text` is what the queue kept of a failed download: either one of the
/// frozen `yt_dlp_*` codes [`classify_failure`] produced, or the tail of
/// yt-dlp's output when nothing matched. Both are handled, which is why the
/// codes are matched as well as the raw lines.
///
/// `yt_dlp_no_audio_format` reads as [`FailureKind::Extractor`]. On YouTube
/// "requested format is not available" for an audio-only request is almost
/// always the tail of a signature (`nsig`) failure, the single most common
/// breakage a yt-dlp release fixes. Checking for an update on it costs one API
/// request when there is none.
pub fn failure_kind(text: &str) -> FailureKind {
    let text = text.to_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|needle| text.contains(needle));

    if text == yt_dlp::AGE_RESTRICTED || text == yt_dlp::VIDEO_UNAVAILABLE || has(UNAVAILABLE) {
        return FailureKind::Unavailable;
    }
    if text == yt_dlp::NO_AUDIO_FORMAT {
        return FailureKind::Extractor;
    }
    if has(NETWORK) {
        return FailureKind::Network;
    }
    if has(EXTRACTOR) {
        return FailureKind::Extractor;
    }
    FailureKind::Other
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extractor_breakage_suggests_an_outdated_yt_dlp() {
        // Real lines, from yt-dlp issues filed after YouTube changes.
        for line in [
            "ERROR: [youtube] dQw4w9WgXcQ: Unable to extract uploader id; please report this issue on  https://github.com/yt-dlp/yt-dlp/issues?q= , filling out the appropriate issue template. Confirm you are on the latest version using  yt-dlp -U",
            "WARNING: [youtube] dQw4w9WgXcQ: nsig extraction failed: Some formats may be missing\nERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats for a list of available formats",
            "ERROR: [youtube] dQw4w9WgXcQ: Signature extraction failed: Some formats may be missing",
            "ERROR: [soundcloud] 123456: Unable to extract client id",
            "yt_dlp_no_audio_format",
        ] {
            let kind = failure_kind(line);
            assert_eq!(kind, FailureKind::Extractor, "{line}");
            assert!(kind.suggests_outdated_yt_dlp());
        }
    }

    #[test]
    fn a_video_that_is_gone_never_suggests_an_update() {
        for line in [
            "ERROR: [youtube] abcdefghijk: Private video. Sign in if you've been granted access to this video",
            "ERROR: [youtube] abcdefghijk: Video unavailable. This video has been removed by the uploader",
            "ERROR: [youtube] abcdefghijk: Video unavailable. This video is no longer available because the YouTube account associated with this video has been terminated.",
            "ERROR: [youtube] abcdefghijk: Join this channel to get access to members-only content like this video, and other exclusive perks.",
            "ERROR: [youtube] abcdefghijk: Video unavailable. The uploader has not made this video available in your country",
            "ERROR: [youtube] abcdefghijk: This video is not available in your country",
            "yt_dlp_video_unavailable",
            "yt_dlp_age_restricted",
        ] {
            let kind = failure_kind(line);
            assert_eq!(kind, FailureKind::Unavailable, "{line}");
            assert!(!kind.suggests_outdated_yt_dlp(), "{line}");
        }
    }

    #[test]
    fn a_gone_video_wins_even_when_yt_dlp_asks_to_be_reported() {
        assert_eq!(
            failure_kind(
                "ERROR: [youtube] abcdefghijk: Private video; please report this issue on https://github.com/yt-dlp/yt-dlp/issues"
            ),
            FailureKind::Unavailable
        );
    }

    #[test]
    fn a_network_failure_never_suggests_an_update() {
        for line in [
            "ERROR: [youtube] abcdefghijk: Unable to download webpage: <urlopen error [Errno 8] nodename nor servname provided, or not known> (caused by URLError(gaierror(8, 'nodename nor servname provided, or not known')))",
            "ERROR: [youtube] abcdefghijk: Unable to download API page: <urlopen error [Errno 11001] getaddrinfo failed> (caused by TransportError(\"<urlopen error [Errno 11001] getaddrinfo failed>\"))",
            "ERROR: unable to download video data: HTTP Error 429: Too Many Requests",
            "ERROR: [download] Got error: The read operation timed out",
        ] {
            let kind = failure_kind(line);
            assert_eq!(kind, FailureKind::Network, "{line}");
            assert!(!kind.suggests_outdated_yt_dlp(), "{line}");
        }
    }

    #[test]
    fn an_unrecognised_failure_does_not_suggest_an_update() {
        assert_eq!(failure_kind(NO_OUTPUT), FailureKind::Other);
        assert_eq!(
            failure_kind("ERROR: Postprocessing: audio conversion failed"),
            FailureKind::Other
        );
        assert_eq!(failure_kind(""), FailureKind::Other);
    }

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
