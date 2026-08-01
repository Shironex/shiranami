//! RFC 7233 single-range parsing, kept pure so the matrix can be exhaustive.
//!
//! Range support is not a seeking optimisation here — it gates playback outright.
//! Spike A recorded WebKit opening *every* media load with a `Range: bytes=0-1`
//! probe before it asks for anything else, so a server that ignored Range would
//! fail on first load and never reach a seek (`docs/v2/spike-a-results.md` §3).
//!
//! This is a stricter reading than v1's, which matched `bytes=(\d+)-(\d*)` with
//! an unanchored regex: v1 answered a suffix range with the whole file, never
//! sent 416, and never clamped the end, so `bytes=0-999999` on a 100-byte file
//! got a `Content-Range` claiming a million bytes. Chromium tolerated it. The
//! architecture asks for RFC-7233 conformance rather than bug parity, so the
//! deviations from v1 are: suffix ranges work, ends are clamped, and an
//! unsatisfiable range is a 416 instead of a full body.
//!
//! The one rule everything else follows from is RFC 7233 §3.1: a Range header a
//! server cannot make sense of is **ignored**, not rejected. Ignoring it yields
//! a correct 200 with the whole entity; rejecting it would break a client over a
//! header it was free to send.

/// A range resolved against a known entity length. Both bounds inclusive, as
/// they are on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedRange {
    /// First byte position, inclusive.
    pub start: u64,
    /// Last byte position, inclusive. Never less than `start`, never past the end.
    pub end: u64,
}

impl ResolvedRange {
    /// How many bytes the range covers. Always at least one — a resolved range
    /// is never empty, which is why this is not a `len`/`is_empty` pair.
    pub fn length(&self) -> u64 {
        self.end - self.start + 1
    }

    /// The `Content-Range` value for an entity of `total` bytes.
    pub fn content_range(&self, total: u64) -> String {
        format!("bytes {}-{}/{}", self.start, self.end, total)
    }
}

/// What to do with a request, once its Range header has been read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RangeOutcome {
    /// No Range header, or one to be ignored: answer 200 with the whole entity.
    Full,
    /// A satisfiable range: answer 206.
    Partial(ResolvedRange),
    /// Syntax understood, nothing satisfiable: answer 416.
    Unsatisfiable,
}

/// One parsed `byte-range-spec`, before it meets an entity length.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RangeSpec {
    /// `first-last`, both bounds given.
    Closed { first: u64, last: u64 },
    /// `first-`, running to the end of the entity.
    Open { first: u64 },
    /// `-suffix`, the final `suffix` bytes.
    Suffix { length: u64 },
}

/// Resolve a request's Range header against an entity of `total` bytes.
pub fn resolve(header: Option<&str>, total: u64) -> RangeOutcome {
    let Some(header) = header else {
        return RangeOutcome::Full;
    };

    // An unparseable set is ignored rather than refused (§3.1), so every failure
    // below returns `Full` and the client gets the whole entity.
    let Some(specs) = parse_set(header) else {
        return RangeOutcome::Full;
    };

    // "A server MAY send only the first satisfiable range" — and does. A
    // multipart/byteranges body is a second wire format, and the only client
    // that matters asks for one range at a time.
    let first_satisfiable = specs.iter().find_map(|spec| satisfy(*spec, total));

    match first_satisfiable {
        Some(range) => RangeOutcome::Partial(range),
        // Every spec parsed and none overlaps the entity: 416 (§4.4). This is
        // the one case where a Range header changes the status rather than
        // being quietly dropped.
        None => RangeOutcome::Unsatisfiable,
    }
}

/// Parse `bytes=…` into its specs, or `None` if any part of it is invalid.
///
/// All-or-nothing on purpose: RFC 7233 §2.1 makes a byte-range-set invalid if
/// any spec in it is, and a partially-honoured set is how a client asking for
/// two ranges silently receives the wrong bytes for one of them.
fn parse_set(header: &str) -> Option<Vec<RangeSpec>> {
    // The unit is case-insensitive; an unrecognised one means "ignore".
    let (unit, set) = header.split_once('=')?;
    if !unit.trim().eq_ignore_ascii_case("bytes") {
        return None;
    }

    // `split` always yields at least one element, so an empty set arrives here
    // as one empty spec and is rejected by `parse_spec`.
    set.split(',').map(|spec| parse_spec(spec.trim())).collect()
}

fn parse_spec(spec: &str) -> Option<RangeSpec> {
    let (first, last) = spec.split_once('-')?;
    let (first, last) = (first.trim_end(), last.trim_start());

    match (first.is_empty(), last.is_empty()) {
        // `-` alone: neither bound. Not a range.
        (true, true) => None,
        // `-suffix`
        (true, false) => Some(RangeSpec::Suffix {
            length: parse_position(last)?,
        }),
        // `first-`
        (false, true) => Some(RangeSpec::Open {
            first: parse_position(first)?,
        }),
        // `first-last`, invalid when it runs backwards.
        (false, false) => {
            let (first, last) = (parse_position(first)?, parse_position(last)?);
            (first <= last).then_some(RangeSpec::Closed { first, last })
        }
    }
}

/// A byte position: digits only, and small enough to be one.
///
/// `u64::from_str_radix` would accept a leading `+`, and `str::parse` accepts a
/// leading `-`; either would let `bytes=+0-+1` through as a valid range. An
/// overflowing position is invalid rather than saturating — saturation would
/// turn a nonsense request into a plausible one.
fn parse_position(text: &str) -> Option<u64> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// Clamp a spec to an entity of `total` bytes, or `None` if it cannot be met.
fn satisfy(spec: RangeSpec, total: u64) -> Option<ResolvedRange> {
    // An empty entity has no byte positions at all, so nothing is satisfiable.
    // Guarding here keeps every `total - 1` below from underflowing.
    if total == 0 {
        return None;
    }
    let last_byte = total - 1;

    match spec {
        RangeSpec::Closed { first, last } if first <= last_byte => Some(ResolvedRange {
            start: first,
            end: last.min(last_byte),
        }),
        RangeSpec::Open { first } if first <= last_byte => Some(ResolvedRange {
            start: first,
            end: last_byte,
        }),
        // `-0` asks for the last zero bytes. Understood, and unsatisfiable.
        RangeSpec::Suffix { length } if length > 0 => Some(ResolvedRange {
            start: total.saturating_sub(length),
            end: last_byte,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 1,000-byte entity, so positions and lengths never look alike.
    const TOTAL: u64 = 1_000;

    fn partial(header: &str) -> ResolvedRange {
        match resolve(Some(header), TOTAL) {
            RangeOutcome::Partial(range) => range,
            other => panic!("expected a partial response for `{header}`, got {other:?}"),
        }
    }

    fn outcome(header: &str) -> RangeOutcome {
        resolve(Some(header), TOTAL)
    }

    #[test]
    fn no_header_is_a_full_body() {
        assert_eq!(resolve(None, TOTAL), RangeOutcome::Full);
    }

    /// The probe WebKit opens every single media load with. If this one is
    /// wrong, nothing plays — it is not a seeking edge case.
    #[test]
    fn the_webkit_two_byte_probe_is_honoured() {
        let range = partial("bytes=0-1");
        assert_eq!(range, ResolvedRange { start: 0, end: 1 });
        assert_eq!(range.length(), 2);
        assert_eq!(range.content_range(TOTAL), "bytes 0-1/1000");
    }

    /// The request WebKit sends straight after the probe.
    #[test]
    fn the_full_span_request_is_a_partial_not_a_full_body() {
        let range = partial("bytes=0-999");
        assert_eq!(range, ResolvedRange { start: 0, end: 999 });
        assert_eq!(range.length(), TOTAL);
    }

    #[test]
    fn a_closed_range_is_taken_as_written() {
        assert_eq!(
            partial("bytes=100-199"),
            ResolvedRange {
                start: 100,
                end: 199
            }
        );
        assert_eq!(partial("bytes=100-199").length(), 100);
    }

    #[test]
    fn an_open_ended_range_runs_to_the_last_byte() {
        assert_eq!(
            partial("bytes=500-"),
            ResolvedRange {
                start: 500,
                end: 999
            }
        );
    }

    #[test]
    fn a_single_byte_range_is_one_byte() {
        assert_eq!(partial("bytes=0-0"), ResolvedRange { start: 0, end: 0 });
        assert_eq!(partial("bytes=0-0").length(), 1);
    }

    #[test]
    fn the_last_byte_is_reachable() {
        assert_eq!(
            partial("bytes=999-"),
            ResolvedRange {
                start: 999,
                end: 999
            }
        );
        assert_eq!(
            partial("bytes=999-999"),
            ResolvedRange {
                start: 999,
                end: 999
            }
        );
    }

    /// v1 answered this with the whole file, because its regex did not match a
    /// suffix at all. RFC 7233 §2.1 says it is the *last* n bytes.
    #[test]
    fn a_suffix_range_counts_back_from_the_end() {
        assert_eq!(
            partial("bytes=-500"),
            ResolvedRange {
                start: 500,
                end: 999
            }
        );
        assert_eq!(
            partial("bytes=-1"),
            ResolvedRange {
                start: 999,
                end: 999
            }
        );
    }

    #[test]
    fn a_suffix_longer_than_the_entity_is_the_whole_entity() {
        assert_eq!(
            partial("bytes=-99999"),
            ResolvedRange { start: 0, end: 999 }
        );
    }

    /// The one suffix that is understood and cannot be met.
    #[test]
    fn a_zero_length_suffix_is_unsatisfiable() {
        assert_eq!(outcome("bytes=-0"), RangeOutcome::Unsatisfiable);
    }

    /// v1 sent `Content-Range: bytes 0-999999/100` here and streamed 100 bytes.
    #[test]
    fn an_end_past_the_entity_is_clamped() {
        assert_eq!(
            partial("bytes=0-999999"),
            ResolvedRange { start: 0, end: 999 }
        );
        assert_eq!(
            partial("bytes=900-999999"),
            ResolvedRange {
                start: 900,
                end: 999
            }
        );
    }

    #[test]
    fn a_start_past_the_entity_is_unsatisfiable() {
        assert_eq!(outcome("bytes=1000-"), RangeOutcome::Unsatisfiable);
        assert_eq!(outcome("bytes=1000-2000"), RangeOutcome::Unsatisfiable);
        assert_eq!(outcome("bytes=99999-"), RangeOutcome::Unsatisfiable);
    }

    /// An empty file has no satisfiable position, and the arithmetic that says
    /// so must not underflow on the way.
    #[test]
    fn nothing_is_satisfiable_in_an_empty_entity() {
        assert_eq!(resolve(Some("bytes=0-"), 0), RangeOutcome::Unsatisfiable);
        assert_eq!(resolve(Some("bytes=0-0"), 0), RangeOutcome::Unsatisfiable);
        assert_eq!(resolve(Some("bytes=-1"), 0), RangeOutcome::Unsatisfiable);
        assert_eq!(resolve(None, 0), RangeOutcome::Full);
    }

    #[test]
    fn a_one_byte_entity_is_fully_addressable() {
        assert_eq!(
            resolve(Some("bytes=0-1"), 1),
            RangeOutcome::Partial(ResolvedRange { start: 0, end: 0 }),
            "the WebKit probe against a one-byte file clamps rather than 416s"
        );
        assert_eq!(
            resolve(Some("bytes=-1"), 1),
            RangeOutcome::Partial(ResolvedRange { start: 0, end: 0 })
        );
    }

    #[test]
    fn the_unit_is_case_insensitive() {
        assert_eq!(partial("BYTES=0-1"), ResolvedRange { start: 0, end: 1 });
        assert_eq!(partial("Bytes=0-1"), ResolvedRange { start: 0, end: 1 });
    }

    #[test]
    fn surrounding_whitespace_is_tolerated() {
        assert_eq!(partial("bytes = 0-1"), ResolvedRange { start: 0, end: 1 });
        assert_eq!(
            partial("bytes=0-1, 5-6"),
            ResolvedRange { start: 0, end: 1 }
        );
    }

    /// A multi-range request is answered with a single 206 for the first
    /// satisfiable range, never a multipart body.
    #[test]
    fn a_multi_range_request_is_answered_with_its_first_range() {
        assert_eq!(
            partial("bytes=0-99,200-299"),
            ResolvedRange { start: 0, end: 99 }
        );
    }

    #[test]
    fn a_multi_range_request_skips_leading_unsatisfiable_ranges() {
        assert_eq!(
            partial("bytes=5000-6000,0-1"),
            ResolvedRange { start: 0, end: 1 }
        );
    }

    #[test]
    fn a_multi_range_request_with_nothing_satisfiable_is_a_416() {
        assert_eq!(
            outcome("bytes=5000-6000,7000-"),
            RangeOutcome::Unsatisfiable
        );
    }

    /// One invalid spec invalidates the set, and an invalid set is ignored —
    /// so this is a 200, not a 416 and not a partial for the valid half.
    #[test]
    fn one_invalid_spec_invalidates_the_whole_set() {
        assert_eq!(outcome("bytes=0-1,nonsense"), RangeOutcome::Full);
        assert_eq!(outcome("bytes=0-1,9-5"), RangeOutcome::Full);
    }

    /// Every malformed shape resolves to a full body. None of them may 416:
    /// a 416 tells the client its request was understood and refused, which
    /// would be a lie, and WebKit treats it as a hard media error.
    #[test]
    fn malformed_headers_are_ignored_rather_than_refused() {
        for header in [
            "",
            "bytes",
            "bytes=",
            "bytes=-",
            "bytes=abc",
            "bytes=abc-def",
            "bytes=0-abc",
            "bytes=abc-9",
            "bytes=--1",
            "bytes=1-2-3",
            "bytes=5-2",
            "bytes= - ",
            "bytes=0-1;q=1",
            "0-1",
            "=0-1",
        ] {
            assert_eq!(
                outcome(header),
                RangeOutcome::Full,
                "`{header}` must be ignored, not refused"
            );
        }
    }

    /// A unit we do not implement means "ignore the header" (§3.1), not "refuse".
    #[test]
    fn an_unknown_unit_is_ignored() {
        assert_eq!(outcome("items=0-1"), RangeOutcome::Full);
        assert_eq!(outcome("seconds=0-1"), RangeOutcome::Full);
    }

    /// Signs are not digits. `bytes=+0-+1` parsing would mean the position
    /// parser had been swapped for `str::parse`, which accepts them.
    #[test]
    fn signed_positions_are_not_positions() {
        assert_eq!(outcome("bytes=+0-+1"), RangeOutcome::Full);
        assert_eq!(outcome("bytes=-+1"), RangeOutcome::Full);
    }

    /// A position past `u64::MAX` is invalid, not saturated: saturating would
    /// turn `bytes=99999999999999999999-` into a plausible request for the end
    /// of the file.
    #[test]
    fn an_overflowing_position_is_invalid() {
        assert_eq!(
            outcome("bytes=0-99999999999999999999999"),
            RangeOutcome::Full
        );
        assert_eq!(
            outcome("bytes=99999999999999999999999-"),
            RangeOutcome::Full
        );
        assert_eq!(
            outcome("bytes=-99999999999999999999999"),
            RangeOutcome::Full
        );
    }

    /// The largest entity the arithmetic has to hold, checked for overflow.
    #[test]
    fn positions_at_the_top_of_the_range_do_not_overflow() {
        let total = u64::MAX;
        assert_eq!(
            resolve(Some("bytes=0-"), total),
            RangeOutcome::Partial(ResolvedRange {
                start: 0,
                end: u64::MAX - 1
            })
        );
        assert_eq!(
            resolve(Some(&format!("bytes=-{}", u64::MAX)), total),
            RangeOutcome::Partial(ResolvedRange {
                start: 0,
                end: u64::MAX - 1
            })
        );
    }

    #[test]
    fn a_resolved_range_reports_its_own_length_and_header() {
        let range = ResolvedRange { start: 10, end: 19 };
        assert_eq!(range.length(), 10);
        assert_eq!(range.content_range(100), "bytes 10-19/100");
    }
}
