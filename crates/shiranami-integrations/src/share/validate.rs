//! The primitives the share contract's bounds are checked with.
//!
//! Split out of [`super::dto`] so that module stays under the 400-code-line cap
//! and holds only the wire types. Everything here mirrors a zod combinator:
//! `.min(1)`, `.max(n)` and `z.iso.datetime({ offset: true })`.

/// Which field failed the contract, and how.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldIssue {
    /// Dotted path to the offending field, as zod would report it.
    pub path: String,
    /// What was wrong.
    pub message: String,
}

impl FieldIssue {
    /// An issue at `path`.
    pub(crate) fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

/// Length in UTF-16 code units, which is what a zod `.max()` on a string counts.
///
/// The two measures diverge past the BMP: a title of 300 emoji is 300 `char`s
/// and 600 units, and only the second is the number the server will apply. A
/// body that passes here must pass there.
pub(crate) fn length(value: &str) -> usize {
    value.encode_utf16().count()
}

/// Check one string field against `.min(1).max(max)`.
pub(crate) fn check_string(issues: &mut Vec<FieldIssue>, path: &str, value: &str, max: usize) {
    if value.is_empty() {
        issues.push(FieldIssue::new(path, "must not be empty"));
    } else if length(value) > max {
        issues.push(FieldIssue::new(
            path,
            format!("must be at most {max} characters"),
        ));
    }
}

/// Check a bounded array against `.min(1).max(max)`.
pub(crate) fn check_length(issues: &mut Vec<FieldIssue>, path: &str, len: usize, max: usize) {
    if len == 0 {
        issues.push(FieldIssue::new(path, "must contain at least one track"));
    } else if len > max {
        issues.push(FieldIssue::new(
            path,
            format!("must contain at most {max} tracks"),
        ));
    }
}

/// Whether `value` matches `z.iso.datetime({ offset: true })`.
///
/// Shape only. The desktop side never did arithmetic on this string — it
/// validated it and passed it to the renderer — so a structural check is the
/// faithful port, not a shortcut.
///
/// The workspace's real ISO-8601 parser lives in
/// `shiranami-recommendation::core::instant`, which sits *above* this crate in
/// the dependency spine and so cannot be reached from here. Its own Phase 4
/// note says it should move down to `shiranami-core` once a second consumer
/// appears; this is that second consumer, and the move is left to the
/// coordinator.
pub(crate) fn is_iso_datetime(value: &str) -> bool {
    let bytes = value.as_bytes();
    // `YYYY-MM-DDTHH:MM:SS` is the fixed head; anything shorter cannot match.
    if bytes.len() < 19 {
        return false;
    }

    let digits = |range: std::ops::Range<usize>| {
        bytes
            .get(range)
            .is_some_and(|slice| slice.iter().all(u8::is_ascii_digit))
    };
    let at = |index: usize, expected: u8| bytes.get(index) == Some(&expected);

    if !(digits(0..4)
        && at(4, b'-')
        && digits(5..7)
        && at(7, b'-')
        && digits(8..10)
        && at(10, b'T')
        && digits(11..13)
        && at(13, b':')
        && digits(14..16)
        && at(16, b':')
        && digits(17..19))
    {
        return false;
    }

    let mut rest = &value[19..];

    // Optional fractional seconds.
    if let Some(fraction) = rest.strip_prefix('.') {
        let taken = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if taken == 0 {
            return false;
        }
        rest = &fraction[taken..];
    }

    // Zulu, or a `±HH:MM` offset — `offset: true` permits either.
    if rest == "Z" {
        return true;
    }
    let Some(offset) = rest.strip_prefix(['+', '-']) else {
        return false;
    };
    let offset = offset.as_bytes();
    offset.len() == 5
        && offset[..2].iter().all(u8::is_ascii_digit)
        && offset[2] == b':'
        && offset[3..].iter().all(u8::is_ascii_digit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_is_measured_in_utf16_code_units() {
        assert_eq!(length("abc"), 3);
        assert_eq!(length("é"), 1);
        assert_eq!(length("🎵"), 2, "an astral character costs two, as in zod");
    }

    #[test]
    fn an_empty_string_and_an_over_long_one_are_reported_differently() {
        let mut issues = Vec::new();
        check_string(&mut issues, "a", "", 5);
        check_string(&mut issues, "b", "toolong", 5);
        check_string(&mut issues, "c", "ok", 5);

        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].message, "must not be empty");
        assert!(issues[1].message.contains("at most 5"));
    }

    #[test]
    fn a_string_exactly_at_the_bound_passes() {
        let mut issues = Vec::new();
        check_string(&mut issues, "a", "12345", 5);
        assert!(issues.is_empty());
    }

    #[test]
    fn an_empty_and_an_over_long_array_are_reported_differently() {
        let mut issues = Vec::new();
        check_length(&mut issues, "a", 0, 3);
        check_length(&mut issues, "b", 4, 3);
        check_length(&mut issues, "c", 3, 3);

        assert_eq!(issues.len(), 2);
        assert!(issues[0].message.contains("at least one"));
        assert!(issues[1].message.contains("at most 3"));
    }

    #[test]
    fn accepts_the_iso_datetimes_zod_accepts() {
        for value in [
            "2026-08-01T12:00:00Z",
            "2026-08-01T12:00:00.000Z",
            "2026-08-01T12:00:00.123456Z",
            "2026-08-01T12:00:00+02:00",
            "2026-08-01T12:00:00-05:00",
            "2026-08-01T12:00:00.5+02:00",
        ] {
            assert!(is_iso_datetime(value), "{value} should be accepted");
        }
    }

    #[test]
    fn rejects_malformed_and_hostile_datetimes() {
        for value in [
            "",
            "2026-08-01",
            "2026-08-01T12:00:00",
            "2026-08-01 12:00:00Z",
            "2026-8-01T12:00:00Z",
            "2026-08-01T12:00:00.Z",
            "2026-08-01T12:00:00+2:00",
            "2026-08-01T12:00:00+0200",
            "2026-08-01T12:00:00Zjunk",
            "not a date at all",
            "<script>alert(1)</script>",
        ] {
            assert!(!is_iso_datetime(value), "{value} should be rejected");
        }
    }
}
