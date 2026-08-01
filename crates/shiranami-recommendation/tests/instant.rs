//! Tests for the hand-rolled `Date.parse` / `Date.now` replacements.
//!
//! These have no TypeScript counterpart — the `Date` global needed no tests.
//! They exist because the port replaced a platform primitive with ~80 lines of
//! our own, and the affinity score silently returns 0 whenever that code says
//! "unparseable": a parser bug would not crash, it would quietly stop
//! recommending. Every expectation below was cross-checked against
//! `node -e "Date.parse(…)"`.

use shiranami_recommendation::core::instant::{now_ms, parse_iso8601_ms};

/// The exact shape the only producer emits — `new Date().toISOString()` in
/// `apps/desktop/src/main/ipc/database/history.ts`.
#[test]
fn parses_the_shape_the_history_table_stores() {
    assert_eq!(
        parse_iso8601_ms("2026-05-23T12:00:00.000Z"),
        Some(1_779_537_600_000)
    );
    assert_eq!(parse_iso8601_ms("1970-01-01T00:00:00.000Z"), Some(0));
    assert_eq!(
        parse_iso8601_ms("2000-02-29T23:59:59.999Z"),
        Some(951_868_799_999)
    );
}

#[test]
fn parses_a_pre_epoch_instant_as_a_negative() {
    assert_eq!(parse_iso8601_ms("1969-12-31T23:59:59.000Z"), Some(-1_000));
    assert_eq!(
        parse_iso8601_ms("1900-01-01T00:00:00.000Z"),
        Some(-2_208_988_800_000)
    );
}

#[test]
fn accepts_the_optional_parts_of_the_grammar() {
    let noon = 1_779_537_600_000;
    // Year-only and year-month forms, date-only, minute-precision, and the
    // lower-case / space separators — all of which `Date.parse` accepts.
    assert_eq!(parse_iso8601_ms("2026"), Some(1_767_225_600_000));
    assert_eq!(parse_iso8601_ms("2026-05"), Some(1_777_593_600_000));
    assert_eq!(parse_iso8601_ms("2026-05-23"), Some(noon - 12 * 3_600_000));
    assert_eq!(parse_iso8601_ms("2026-05-23T12:00Z"), Some(noon));
    assert_eq!(parse_iso8601_ms("2026-05-23T12:00:00Z"), Some(noon));
    assert_eq!(parse_iso8601_ms("2026-05-23t12:00:00Z"), Some(noon));
    assert_eq!(parse_iso8601_ms("2026-05-23 12:00:00Z"), Some(noon));
}

#[test]
fn applies_a_numeric_utc_offset() {
    let noon = 1_779_537_600_000;
    assert_eq!(parse_iso8601_ms("2026-05-23T14:00:00+02:00"), Some(noon));
    assert_eq!(parse_iso8601_ms("2026-05-23T14:00:00+0200"), Some(noon));
    assert_eq!(parse_iso8601_ms("2026-05-23T09:30:00-02:30"), Some(noon));
}

/// V8 range-checks the day but does not calendar-check it: `MakeDay` carries
/// the overflow into the next month. Reproduced, because a v1 row holding such
/// a string scored against the rolled-over instant, not against zero.
#[test]
fn a_day_past_the_end_of_its_month_rolls_forward() {
    // 2026 is not a leap year, so the 29th of February is the 1st of March.
    assert_eq!(
        parse_iso8601_ms("2026-02-29T00:00:00Z"),
        parse_iso8601_ms("2026-03-01T00:00:00Z")
    );
    assert_eq!(
        parse_iso8601_ms("2025-02-30T00:00:00Z"),
        parse_iso8601_ms("2025-03-02T00:00:00Z")
    );
    // A real leap day is a real day, not a rollover.
    assert_eq!(
        parse_iso8601_ms("2024-02-29T00:00:00Z"),
        Some(1_709_164_800_000)
    );
}

/// The documented divergence from `Date.parse`, which would read an
/// offset-less date-time as host-local time.
#[test]
fn an_offset_less_date_time_is_read_as_utc() {
    assert_eq!(
        parse_iso8601_ms("2026-05-23T12:00:00.000"),
        parse_iso8601_ms("2026-05-23T12:00:00.000Z")
    );
}

/// Millisecond is the finest unit a `Date` carries, so V8 truncates the rest.
#[test]
fn a_fractional_second_is_padded_and_truncated_to_milliseconds() {
    let base = 1_779_537_600_000;
    assert_eq!(parse_iso8601_ms("2026-05-23T12:00:00.5Z"), Some(base + 500));
    assert_eq!(
        parse_iso8601_ms("2026-05-23T12:00:00.12Z"),
        Some(base + 120)
    );
    assert_eq!(
        parse_iso8601_ms("2026-05-23T12:00:00.1239Z"),
        Some(base + 123)
    );
}

#[test]
fn rejects_what_date_parse_called_nan() {
    for input in [
        "",
        "not-a-date",
        "2026-13-01T00:00:00Z",
        "2026-00-01T00:00:00Z",
        "2026-05-32T00:00:00Z",
        "2026-05-00T00:00:00Z",
        // Field ranges. `:60` is out of range, not a leap second — `Date` has
        // no leap-second concept.
        "2026-05-23T25:00:00Z",
        "2026-05-23T24:00:01Z",
        "2026-05-23T12:60:00Z",
        "2026-05-23T12:00:61Z",
        "2016-12-31T23:59:60Z",
        // Truncated and malformed shapes.
        "2026-05-23T12",
        "2026-05-23T1:00:00Z",
        "2026-05-23X12:00:00Z",
        "2026-05-23T12-00-00Z",
        "2026-05-23T12:00:00.Z",
        "2026-05-23T12:00:00Zulu",
        "2026-05-23T12:00:00+2:00",
        "2026-05-23T12:00:00+02:60",
        "2026-05-23T12:00:00+24:00",
        "2026-05-23T12:00:00 ",
        // A comma decimal mark and a bare `±HH` offset: both legal ISO-8601,
        // neither legal ES, and V8 rejects both.
        "2026-05-23T12:00:00,250Z",
        "2026-05-23T14:00:00+02",
        // Non-ASCII, to pin that the byte slicing never panics on a boundary.
        "2026-05-23T12:00:00Ź",
        "２０２６-０５-２３",
    ] {
        assert_eq!(
            parse_iso8601_ms(input),
            None,
            "expected {input:?} to reject"
        );
    }
}

/// The two shapes V8 accepts that this parser deliberately does not: the
/// extended six-digit year, and the legacy free-form parse that V8 reads as
/// host-local time. Pinned so the divergence is a decision, not a surprise.
#[test]
fn the_documented_v8_extensions_are_not_accepted() {
    assert_eq!(parse_iso8601_ms("+002026-05-23T00:00:00Z"), None);
    assert_eq!(parse_iso8601_ms("2026/05/23"), None);
}

/// `24:00:00.000` is the one legal hour-24 form.
#[test]
fn accepts_the_end_of_day_hour_24_form() {
    assert_eq!(
        parse_iso8601_ms("2026-05-23T24:00:00.000Z"),
        parse_iso8601_ms("2026-05-24T00:00:00.000Z")
    );
}

#[test]
fn now_is_a_plausible_wall_clock() {
    // 2020-01-01, comfortably in the past, and 2100-01-01, comfortably not.
    let now = now_ms();
    assert!(now > 1_577_836_800_000, "clock reads before 2020: {now}");
    assert!(now < 4_102_444_800_000, "clock reads after 2100: {now}");
}

/// The round trip the affinity fixture depends on: a whole-day offset from a
/// known instant lands on the same instant when parsed back.
#[test]
fn parses_back_the_instants_the_affinity_fixture_builds() {
    for (iso, expected) in [
        ("2026-05-23T12:00:00.000Z", 1_779_537_600_000_i64),
        ("2026-05-09T12:00:00.000Z", 1_778_328_000_000),
        ("2026-06-02T12:00:00.000Z", 1_780_401_600_000),
    ] {
        assert_eq!(parse_iso8601_ms(iso), Some(expected), "for {iso}");
    }
}
