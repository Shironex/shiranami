//! `new Date().toISOString()`, in Rust.
//!
//! One caller today — [`crate::storage`]'s `computedAt` — and no date crate is
//! pinned in Appendix B to produce it. Phase 4 hit the mirror image of this
//! problem and hand-rolled the *parse* direction in
//! `shiranami-recommendation`'s `core/instant.rs`; this is the format direction,
//! written the same way and for the same reason.
//!
//! **Move to `shiranami-core` when a second consumer appears.** That is the note
//! Phase 4 left on `instant.rs` and it applies verbatim here: two hand-rolled
//! calendars in one workspace is one too many.
//!
//! The calendar conversion is Howard Hinnant's `civil_from_days`, which is the
//! algorithm every date library uses and is exact for the whole proleptic
//! Gregorian range. It is reproduced rather than approximated because the string
//! it produces is compared against timestamps `apps/web` renders directly.

use std::time::{SystemTime, UNIX_EPOCH};

/// The current instant as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
///
/// Same 24 characters, same `T` separator, same millisecond precision and same
/// trailing `Z` as the strings v1's handlers wrote, and as
/// [`shiranami_db`]'s `ISO_8601_NOW` produces from SQLite's clock.
///
/// [`shiranami_db`]: https://docs.rs/shiranami-db
pub fn now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| {
            i64::try_from(since.as_millis()).unwrap_or(i64::MAX)
        });

    from_epoch_millis(millis)
}

/// Render epoch milliseconds as an ISO-8601 instant.
///
/// Split out from [`now`] so the calendar arithmetic is testable against fixed
/// vectors rather than against whatever the clock says.
pub fn from_epoch_millis(millis: i64) -> String {
    // Euclidean division throughout, so instants before the epoch render as
    // 1969 rather than as a negative time-of-day.
    let seconds = millis.div_euclid(1_000);
    let sub_second = millis.rem_euclid(1_000);

    let days = seconds.div_euclid(86_400);
    let second_of_day = seconds.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days);
    let hour = second_of_day / 3_600;
    let minute = (second_of_day / 60) % 60;
    let second = second_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{sub_second:03}Z")
}

/// Days since the Unix epoch to a proleptic Gregorian `(year, month, day)`.
///
/// Hinnant's algorithm, shifted so the internal era begins on 0000-03-01 and
/// leap days land at the end of a year — which is what removes every special
/// case from the month arithmetic.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    // Shift the epoch from 1970-01-01 to 0000-03-01.
    let shifted = days + 719_468;

    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097; // [0, 146096]
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365; // [0, 399]

    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100); // [0, 365]
    let month_position = (5 * day_of_year + 2) / 153; // [0, 11], March-based

    let day = day_of_year - (153 * month_position + 2) / 5 + 1; // [1, 31]
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    };

    // January and February belong to the following calendar year.
    (year + i64::from(month <= 2), month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_epoch_renders_as_v8_renders_it() {
        assert_eq!(from_epoch_millis(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn known_instants_match_new_date_to_iso_string() {
        // Each pair was taken from `new Date(ms).toISOString()`.
        for (millis, expected) in [
            (946_684_800_000, "2000-01-01T00:00:00.000Z"),
            (1_000_000_000_000, "2001-09-09T01:46:40.000Z"),
            (1_234_567_890_123, "2009-02-13T23:31:30.123Z"),
            (1_709_164_800_000, "2024-02-29T00:00:00.000Z"),
        ] {
            assert_eq!(from_epoch_millis(millis), expected, "{millis}");
        }
    }

    #[test]
    fn a_leap_day_is_a_real_day() {
        // 2100 is not a leap year despite being divisible by four — the century
        // rule is exactly what a naive conversion gets wrong.
        assert_eq!(
            from_epoch_millis(4_107_542_400_000),
            "2100-03-01T00:00:00.000Z"
        );
    }

    #[test]
    fn instants_before_the_epoch_borrow_rather_than_going_negative() {
        assert_eq!(from_epoch_millis(-1), "1969-12-31T23:59:59.999Z");
        assert_eq!(from_epoch_millis(-1_000), "1969-12-31T23:59:59.000Z");
    }

    #[test]
    fn every_field_is_zero_padded_to_v8s_width() {
        // Single digits in month, day, hour, minute, second and milliseconds at
        // once — the one vector where a missing `:02` would show everywhere.
        assert_eq!(
            from_epoch_millis(1_041_386_584_005),
            "2003-01-01T02:03:04.005Z"
        );
    }

    #[test]
    fn now_has_the_shape_apps_web_parses() {
        let rendered = now();

        assert_eq!(rendered.len(), 24, "{rendered}");
        assert!(rendered.ends_with('Z'), "{rendered}");
        assert_eq!(rendered.as_bytes()[10], b'T', "{rendered}");
        // Sanity: this decade, not 1970 — a broken clock read would show here.
        assert!(rendered.starts_with("20"), "{rendered}");
    }
}
