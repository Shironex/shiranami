//! `Retry-After` / `x-ratelimit-reset` parsing, and the five-minute clamp.
//!
//! Ported from `parseRetryAfter` in `apps/desktop/src/main/app/http.ts`. The
//! header is attacker-adjacent in the ordinary sense that we do not control the
//! server: a hostile or merely broken origin can answer `Retry-After: 99999999`,
//! and an unclamped value would park a request for weeks. [`RETRY_AFTER_MAX`] is
//! the ceiling that turns that into a five-minute pause.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::HeaderMap;

/// The longest server-dictated backoff we honour.
///
/// A larger value is not an error — it is clamped down to this, exactly as v1
/// did. The point is that no origin gets to decide we stop talking to it for
/// longer than the user is likely to keep the app open.
pub const RETRY_AFTER_MAX: Duration = Duration::from_secs(300);

/// The backoff applied to a 429 that carried no parseable hint.
///
/// v1's `DEFAULT_429_BACKOFF_MS`. A host that rate-limits without saying for how
/// long still has to be believed, so we pick a value rather than retrying
/// immediately.
pub const DEFAULT_429_BACKOFF: Duration = Duration::from_secs(60);

/// Read the backoff a rate-limited response is asking for.
///
/// Tries `Retry-After` first in both of its RFC 9110 forms — a delay in whole
/// seconds, then an HTTP-date — and falls back to the widely-deployed
/// `x-ratelimit-reset` (epoch seconds) when `Retry-After` is absent or
/// unparseable. Returns `None` when nothing usable is present or the deadline
/// has already passed; the result is always clamped to [`RETRY_AFTER_MAX`].
pub fn parse_retry_after(headers: &HeaderMap) -> Option<Duration> {
    parse_retry_after_at(headers, SystemTime::now())
}

/// [`parse_retry_after`] against an explicit clock.
///
/// Both date-bearing forms are absolute instants, so the tests need to pin
/// "now" the way the TypeScript suite pinned it with `vi.setSystemTime`.
fn parse_retry_after_at(headers: &HeaderMap, now: SystemTime) -> Option<Duration> {
    if let Some(raw) = header_str(headers, "retry-after") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            // The delay-seconds form wins over the date form, and an all-digit
            // value is never a valid HTTP-date, so this ordering cannot
            // misread one as the other.
            if let Some(seconds) = whole_seconds(trimmed) {
                return Some(Duration::from_secs(seconds).min(RETRY_AFTER_MAX));
            }
            if let Ok(deadline) = httpdate::parse_http_date(trimmed) {
                return clamp_until(deadline, now);
            }
            // Unparseable in both forms — fall through to `x-ratelimit-reset`
            // rather than giving up, as v1 did.
        }
    }

    let reset = header_str(headers, "x-ratelimit-reset")?;
    let epoch_seconds = whole_seconds(reset.trim())?;
    clamp_until(UNIX_EPOCH + Duration::from_secs(epoch_seconds), now)
}

/// First value of `name`, if it is present and is valid single-line ASCII.
///
/// A repeated header collapses to its first value, matching v1's
/// `Array.isArray(raw) ? raw[0] : raw`. [`HeaderMap`] keys are already
/// case-insensitive, which is what the TypeScript's manual lowercasing pass was
/// for.
fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name)?.to_str().ok()
}

/// Parse an all-ASCII-digit string, saturating instead of overflowing.
///
/// Anything not matching v1's `/^\d+$/` is rejected outright — notably a leading
/// `+`, `-` or whitespace, all of which `str::parse` would otherwise accept or
/// reject on its own terms. A value too large for `u64` saturates rather than
/// failing, because a 30-digit `Retry-After` still means "a very long time" and
/// clamping it is the right answer; treating it as unparseable would instead
/// fall through to the next header.
fn whole_seconds(text: &str) -> Option<u64> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(text.parse::<u64>().unwrap_or(u64::MAX))
}

/// Time from `now` until `deadline`, clamped, or `None` if it already passed.
///
/// The already-passed case is v1's `ms < 0 → null`: a reset timestamp in the
/// past carries no information, and reporting it as a zero-length wait would be
/// indistinguishable from a server that asked for no wait at all.
fn clamp_until(deadline: SystemTime, now: SystemTime) -> Option<Duration> {
    let remaining = deadline.duration_since(now).ok()?;
    Some(remaining.min(RETRY_AFTER_MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `2025-01-01T00:00:00Z`, the instant the TypeScript suite pinned its clock
    /// to so the date-bearing cases have a fixed answer.
    const FIXED_NOW: Duration = Duration::from_secs(1_735_689_600);

    fn now() -> SystemTime {
        UNIX_EPOCH + FIXED_NOW
    }

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            let name: reqwest::header::HeaderName =
                name.parse().expect("test header name is valid");
            let value: reqwest::header::HeaderValue =
                value.parse().expect("test header value is valid");
            map.insert(name, value);
        }
        map
    }

    #[test]
    fn parses_integer_seconds() {
        assert_eq!(
            parse_retry_after(&headers(&[("retry-after", "30")])),
            Some(Duration::from_secs(30))
        );
        assert_eq!(
            parse_retry_after(&headers(&[("Retry-After", "5")])),
            Some(Duration::from_secs(5)),
            "header lookup is case-insensitive"
        );
    }

    #[test]
    fn parses_an_http_date() {
        let ten_seconds_later = httpdate::fmt_http_date(now() + Duration::from_secs(10));
        let parsed = parse_retry_after_at(&headers(&[("retry-after", &ten_seconds_later)]), now());
        assert_eq!(parsed, Some(Duration::from_secs(10)));
    }

    #[test]
    fn clamps_anything_over_five_minutes() {
        // Ten minutes, in the delay-seconds form.
        assert_eq!(
            parse_retry_after(&headers(&[("retry-after", "600")])),
            Some(RETRY_AFTER_MAX)
        );
        let far_future = httpdate::fmt_http_date(now() + Duration::from_secs(86_400));
        assert_eq!(
            parse_retry_after_at(&headers(&[("retry-after", &far_future)]), now()),
            Some(RETRY_AFTER_MAX)
        );
    }

    /// A digit string longer than `u64` saturates and is then clamped. The
    /// tempting `parse().ok()?` would instead treat it as unparseable and fall
    /// through to `x-ratelimit-reset`, which is the opposite of what a caller
    /// asking for an absurdly long wait should get.
    #[test]
    fn saturates_rather_than_rejecting_an_absurd_delay() {
        assert_eq!(
            parse_retry_after(&headers(&[("retry-after", "99999999999999999999999")])),
            Some(RETRY_AFTER_MAX)
        );
    }

    #[test]
    fn returns_none_on_garbage() {
        assert_eq!(
            parse_retry_after(&headers(&[("retry-after", "not-a-date")])),
            None
        );
        assert_eq!(parse_retry_after(&HeaderMap::new()), None);
        assert_eq!(parse_retry_after(&headers(&[("retry-after", "")])), None);
    }

    #[test]
    fn falls_back_to_x_ratelimit_reset_in_epoch_seconds() {
        let reset_in_30s = (FIXED_NOW.as_secs() + 30).to_string();
        let parsed = parse_retry_after_at(&headers(&[("x-ratelimit-reset", &reset_in_30s)]), now());
        assert_eq!(parsed, Some(Duration::from_secs(30)));
    }

    /// An unparseable `Retry-After` must not shadow a usable
    /// `x-ratelimit-reset` — v1 deliberately fell through rather than returning
    /// early, because the two headers come from different middleware and a host
    /// can easily emit one badly and the other well.
    #[test]
    fn an_unparseable_retry_after_falls_through_to_the_reset_header() {
        let reset_in_30s = (FIXED_NOW.as_secs() + 30).to_string();
        let parsed = parse_retry_after_at(
            &headers(&[
                ("retry-after", "soon-ish"),
                ("x-ratelimit-reset", &reset_in_30s),
            ]),
            now(),
        );
        assert_eq!(parsed, Some(Duration::from_secs(30)));
    }

    #[test]
    fn returns_none_for_a_reset_timestamp_in_the_past() {
        let a_minute_ago = (FIXED_NOW.as_secs() - 60).to_string();
        assert_eq!(
            parse_retry_after_at(&headers(&[("x-ratelimit-reset", &a_minute_ago)]), now()),
            None
        );
    }

    /// `Retry-After: 0` means "retry now", which is information — it must not
    /// collapse into the same `None` that "the server said nothing" produces,
    /// because the caller substitutes a 60-second fallback for `None`.
    #[test]
    fn a_zero_delay_is_zero_and_not_absent() {
        assert_eq!(
            parse_retry_after(&headers(&[("retry-after", "0")])),
            Some(Duration::ZERO)
        );
    }
}
