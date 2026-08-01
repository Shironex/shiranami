//! Comparing two version strings that are not necessarily semver.
//!
//! yt-dlp versions itself by date (`2024.01.01`), ffmpeg by release number
//! (`6.1`) or by a git description (`N-113573-g4a2d1b0f9d`), and the GitHub API
//! returns tags that may carry a `v` prefix. None of that parses as semver, and
//! reaching for a semver crate would reject the majority of real inputs.
//!
//! So the rule v1 settled on, kept verbatim: find the first run of digits and
//! dots anywhere in the string, read it as a list of numbers, and compare
//! position by position with missing positions treated as zero. `1.0` and
//! `1.0.0` are equal; `v1.0.0` and `1.0.0` are equal; anything with no digits
//! at all compares as unknown, and unknown never reports an update — offering
//! one on a version we could not read is how a working install gets replaced
//! for no reason.

use std::sync::LazyLock;

use regex::Regex;

/// The first dotted-numeric run in a string.
static VERSION_RUN: LazyLock<Regex> = LazyLock::new(|| {
    #[expect(
        clippy::unwrap_used,
        reason = "a literal pattern that compiles at first use or never; a panic \
                  here is a build-time mistake, not a runtime condition"
    )]
    Regex::new(r"\d+(?:\.\d+)*").unwrap()
});

/// A version segment wider than this is not a version.
///
/// v1 used JavaScript numbers and filtered on `Number.isFinite`, which nothing
/// short of `Infinity` fails. A `u64` parse can fail on a long digit run, so the
/// filter is spelled here instead: an unparseable segment is dropped, exactly as
/// a non-finite one was.
fn parse_segment(segment: &str) -> Option<u64> {
    segment.parse::<u64>().ok()
}

/// Extract the numeric `.`-separated segments from a version string.
///
/// Returns an empty vector for `None`, an empty string, or a string with no
/// digits — all of which mean "unknown" to [`has_update`].
pub fn version_segments(version: Option<&str>) -> Vec<u64> {
    let Some(version) = version else {
        return Vec::new();
    };

    let Some(matched) = VERSION_RUN.find(version) else {
        return Vec::new();
    };

    matched
        .as_str()
        .split('.')
        .filter_map(parse_segment)
        .collect()
}

/// Whether `latest` is strictly newer than `current`.
///
/// False whenever either side is unknown. That asymmetry is deliberate: a
/// failed version probe or an unreachable release API must not present the user
/// with an update prompt it cannot substantiate.
pub fn has_update(current: Option<&str>, latest: Option<&str>) -> bool {
    let current = version_segments(current);
    let latest = version_segments(latest);

    if current.is_empty() || latest.is_empty() {
        return false;
    }

    let length = current.len().max(latest.len());
    for index in 0..length {
        let current = current.get(index).copied().unwrap_or(0);
        let latest = latest.get(index).copied().unwrap_or(0);

        if latest > current {
            return true;
        }
        if latest < current {
            return false;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_semver() {
        assert_eq!(version_segments(Some("1.2.3")), vec![1, 2, 3]);
    }

    #[test]
    fn parses_date_based_versions_stripping_leading_zeros() {
        assert_eq!(version_segments(Some("2024.01.01")), vec![2024, 1, 1]);
    }

    #[test]
    fn extracts_the_version_from_a_prefixed_string() {
        assert_eq!(version_segments(Some("v1.0.0")), vec![1, 0, 0]);
    }

    #[test]
    fn reads_nothing_out_of_absent_empty_or_digitless_input() {
        assert!(version_segments(None).is_empty());
        assert!(version_segments(Some("")).is_empty());
        assert!(version_segments(Some("unknown")).is_empty());
    }

    #[test]
    fn reports_an_update_when_the_latest_is_newer() {
        assert!(has_update(Some("1.0.0"), Some("1.0.1")));
        assert!(has_update(Some("1.0.0"), Some("2.0.0")));
    }

    #[test]
    fn reports_no_update_for_equal_or_older() {
        assert!(!has_update(Some("1.0.0"), Some("1.0.0")));
        assert!(!has_update(Some("2.0.0"), Some("1.0.0")));
    }

    #[test]
    fn an_unknown_version_on_either_side_never_reports_an_update() {
        assert!(!has_update(None, Some("1.0.0")));
        assert!(!has_update(Some("1.0.0"), None));
        assert!(
            !has_update(Some("N-113573-g4a2d1b0f9d"), Some("6.1")),
            "a git-described ffmpeg build reads its first digit run as `113573`, \
             which is not newer than 6 — and must not prompt a downgrade"
        );
    }

    #[test]
    fn handles_date_based_versions() {
        assert!(has_update(Some("2024.01.01"), Some("2024.06.15")));
        assert!(!has_update(Some("2024.06.15"), Some("2024.01.01")));
    }

    #[test]
    fn handles_different_segment_lengths() {
        assert!(has_update(Some("1.0"), Some("1.0.1")));
        assert!(
            !has_update(Some("1.0.0"), Some("1.0")),
            "a missing segment reads as zero, so `1.0` is not newer than `1.0.0`"
        );
    }
}
