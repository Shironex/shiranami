//! The two clock primitives the scoring core needs: `Date.parse` and
//! `Date.now`, as epoch milliseconds.
//!
//! [`affinity_score`](super::affinity::affinity_score) decays a play by how old
//! it is, so it has to turn the ISO-8601 `lastPlayedAt` string into an instant
//! and compare it against "now". In TypeScript both came free from the `Date`
//! global; in Rust they do not, and `docs/v2/architecture.md` Appendix B pins no
//! date crate — Phase 2 reached for `std::time::SystemTime` directly rather than
//! adding one. Adding `chrono`/`time` for one field would be a workspace-wide
//! dependency decision made in a leaf crate, so this module hand-rolls the small
//! subset instead. It is ~80 lines and fully tested; see `tests/instant.rs`.
//!
//! It belongs one rank lower the moment a second consumer appears (scrobble
//! timestamps, shelf TTL staleness), at which point it should move to
//! `shiranami-core` — but Phase 4's scope is this crate, and inventing a
//! `core::time` module from here would collide with the lanes that own it.
//!
//! **Accepted grammar** — the ECMAScript Date Time String Format, which is what
//! the only producer emits (`new Date().toISOString()`, i.e.
//! `YYYY-MM-DDTHH:MM:SS.sssZ`):
//!
//! ```text
//! YYYY [ -MM [ -DD ] ] [ (T|t|space) HH:MM [ :SS [ .fraction ] ] [ Z|z | ±HH:MM | ±HHMM ] ]
//! ```
//!
//! Anything else is [`None`], which the caller treats exactly as TypeScript
//! treated `NaN`: a score of 0. Two shapes V8 accepts are deliberately left out,
//! because nothing in this app produces them and neither is in the spec grammar:
//! extended six-digit years (`+002026-…`), and the legacy free-form parses
//! (`2026/05/23`, RFC 2822) that V8 reads as **local** time — an
//! implementation-defined extension whose result depends on the host timezone.
//!
//! Every accepted and rejected case in `tests/instant.rs` was cross-checked
//! against `node -e "Date.parse(…)"` on the runtime v1 shipped.

use std::time::{SystemTime, UNIX_EPOCH};

const MS_PER_SECOND: i64 = 1_000;
const SECONDS_PER_MINUTE: i64 = 60;
const SECONDS_PER_HOUR: i64 = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY: i64 = 24 * SECONDS_PER_HOUR;

/// Wall-clock now, in epoch milliseconds — the port of `Date.now()`.
///
/// Saturates at 0 for a system clock set before 1970 rather than panicking; a
/// nonsensical clock should skew a recommendation shelf, never crash the app.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since_epoch| {
            i64::try_from(since_epoch.as_millis()).unwrap_or(i64::MAX)
        })
}

/// Parse an ISO-8601 instant into epoch milliseconds — the port of
/// `Date.parse()` over the grammar documented on this module.
///
/// Returns [`None`] where TypeScript returned `NaN`: an unparseable string or an
/// out-of-range field.
///
/// One deliberate divergence: a date-time with **no** offset is read as UTC,
/// where `Date.parse` would read it as the host's local time. A pure scoring
/// core whose output depends on the machine's timezone is not a scoring core,
/// and the only producer of this field (`new Date().toISOString()` in
/// `apps/desktop/src/main/ipc/database/history.ts`) always writes the `Z`.
pub fn parse_iso8601_ms(input: &str) -> Option<i64> {
    // Bytes, not chars: `&str` slicing panics on a non-ASCII boundary, and every
    // byte this grammar accepts is ASCII anyway.
    let (date, rest) = parse_date(input.as_bytes())?;
    let (time, rest) = parse_time(rest)?;
    let offset_minutes = parse_offset(rest)?;

    let days = days_from_civil(date.year, date.month, date.day);
    let seconds = days * SECONDS_PER_DAY
        + time.hour * SECONDS_PER_HOUR
        + (time.minute - offset_minutes) * SECONDS_PER_MINUTE
        + time.second;
    Some(seconds * MS_PER_SECOND + time.millis)
}

/// A calendar date, range-checked but deliberately not calendar-checked.
struct CivilDate {
    year: i64,
    month: i64,
    day: i64,
}

/// Parse the `YYYY[-MM[-DD]]` head, returning the date and the remainder.
///
/// Fields are only *range*-checked, never calendar-checked: `2026-02-29` is a
/// day out of a non-leap February, and both V8 and the day-count below roll it
/// forward to March 1 rather than rejecting it. Reproduced deliberately — the
/// rollover is what a v1 database row would have scored against.
fn parse_date(bytes: &[u8]) -> Option<(CivilDate, &[u8])> {
    if bytes.len() < 4 {
        return None;
    }
    let year = digits(&bytes[0..4])?;
    let date = |month, day| CivilDate { year, month, day };
    if bytes.len() == 4 {
        return Some((date(1, 1), &bytes[4..]));
    }

    if bytes[4] != b'-' || bytes.len() < 7 {
        return None;
    }
    let month = digits(&bytes[5..7])?;
    if !(1..=12).contains(&month) {
        return None;
    }
    if bytes.len() == 7 {
        return Some((date(month, 1), &bytes[7..]));
    }

    if bytes[7] != b'-' || bytes.len() < 10 {
        return None;
    }
    let day = digits(&bytes[8..10])?;
    if !(1..=31).contains(&day) {
        return None;
    }
    Some((date(month, day), &bytes[10..]))
}

/// The time-of-day fields, all zero for a date-only input.
#[derive(Default)]
struct TimeOfDay {
    hour: i64,
    minute: i64,
    second: i64,
    millis: i64,
}

/// Parse the optional `T HH:MM[:SS[.fff]]` tail, returning it and whatever
/// follows (the offset, if any).
fn parse_time(bytes: &[u8]) -> Option<(TimeOfDay, &[u8])> {
    let Some((&separator, after_separator)) = bytes.split_first() else {
        return Some((TimeOfDay::default(), bytes));
    };
    if !matches!(separator, b'T' | b't' | b' ') {
        return None;
    }

    let mut rest = after_separator;
    if rest.len() < 5 || rest[2] != b':' {
        return None;
    }
    let mut time = TimeOfDay {
        hour: digits(&rest[0..2])?,
        minute: digits(&rest[3..5])?,
        ..TimeOfDay::default()
    };
    rest = &rest[5..];

    if rest.first() == Some(&b':') {
        if rest.len() < 3 {
            return None;
        }
        time.second = digits(&rest[1..3])?;
        rest = &rest[3..];
    }

    // A comma is a legal ISO-8601 decimal mark but not an ES one, and V8 rejects
    // it; so does this.
    if rest.first() == Some(&b'.') {
        let width = rest[1..].iter().take_while(|b| b.is_ascii_digit()).count();
        if width == 0 {
            return None;
        }
        time.millis = fractional_millis(&rest[1..=width]);
        rest = &rest[1 + width..];
    }

    // `24:00:00.000` is the one legal hour-24 form; anything past it is a
    // rollover the ES grammar rejects. `Date` has no leap-second concept, so
    // `:60` is out of range rather than a leap second.
    let hour_ok = time.hour < 24
        || (time.hour == 24 && time.minute == 0 && time.second == 0 && time.millis == 0);
    if !hour_ok || time.minute > 59 || time.second > 59 {
        return None;
    }

    Some((time, rest))
}

/// Signed minutes east of UTC. Empty means "no offset given" — see the UTC note
/// on [`parse_iso8601_ms`].
fn parse_offset(bytes: &[u8]) -> Option<i64> {
    let Some((&sign, rest)) = bytes.split_first() else {
        return Some(0);
    };
    if matches!(sign, b'Z' | b'z') {
        return if rest.is_empty() { Some(0) } else { None };
    }
    if !matches!(sign, b'+' | b'-') {
        return None;
    }

    // `±HH` alone is legal ISO-8601 but not ES, and V8 rejects it; so does this.
    let (hours, minutes) = match rest.len() {
        4 => (digits(&rest[0..2])?, digits(&rest[2..4])?),
        5 if rest[2] == b':' => (digits(&rest[0..2])?, digits(&rest[3..5])?),
        _ => return None,
    };
    if hours > 23 || minutes > 59 {
        return None;
    }

    let magnitude = hours * SECONDS_PER_MINUTE + minutes;
    Some(if sign == b'-' { -magnitude } else { magnitude })
}

/// An all-ASCII-digit run as a number; `None` if any byte is not a digit.
fn digits(bytes: &[u8]) -> Option<i64> {
    if bytes.is_empty() {
        return None;
    }
    bytes.iter().try_fold(0_i64, |value, &byte| {
        byte.is_ascii_digit()
            .then(|| value * 10 + i64::from(byte - b'0'))
    })
}

/// A fractional-second run as milliseconds.
///
/// Truncates past three digits (`.1239` → 123 ms) and pads short ones (`.5` →
/// 500 ms), which is what V8 does — millisecond is the finest unit a `Date`
/// carries, so the rest is dropped rather than rounded.
fn fractional_millis(bytes: &[u8]) -> i64 {
    let mut millis = 0;
    for position in 0..3 {
        let digit = bytes.get(position).map_or(0, |byte| i64::from(byte - b'0'));
        millis = millis * 10 + digit;
    }
    millis
}

/// Days between 1970-01-01 and `year-month-day`, proleptic-Gregorian.
///
/// Howard Hinnant's `days_from_civil`: shift the year to start in March so the
/// leap day lands last, count 400-year eras (146,097 days each, exactly), then
/// re-base onto the Unix epoch. Branch-free and correct for negative years, and
/// — like V8's `MakeDay` — it carries a day past the end of its month into the
/// next one instead of rejecting it.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let shifted_year = if month <= 2 { year - 1 } else { year };
    let era = if shifted_year >= 0 {
        shifted_year
    } else {
        shifted_year - 399
    } / 400;
    let year_of_era = shifted_year - era * 400;
    let march_month = (month + 9) % 12;
    let day_of_year = (153 * march_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}
