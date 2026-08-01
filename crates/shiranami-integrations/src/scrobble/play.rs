//! The play being scrobbled, and the timestamp arithmetic behind it.
//!
//! Ported from `ScrobblePlay` and `playStartTimestamp` in
//! `apps/desktop/src/main/scrobble/scrobble-payload.ts`.

/// A single play to scrobble, resolved from the `tracks` row and the play event.
#[derive(Debug, Clone, PartialEq)]
pub struct ScrobblePlay {
    /// Track artist.
    pub artist: String,
    /// Track title.
    pub track: String,
    /// Album, when the track has one.
    pub album: Option<String>,
    /// Track length in seconds, when known. Both APIs accept it and neither
    /// requires it.
    pub duration_seconds: Option<f64>,
    /// Unix **seconds** at which playback started — not the moment the
    /// qualification threshold tripped.
    pub started_at: i64,
}

impl ScrobblePlay {
    /// The `duration` both backends want: whole seconds, or nothing.
    ///
    /// v1's guard was `play.durationSeconds && play.durationSeconds > 0`, which
    /// dropped `0`, `NaN` and `undefined` alike. `Option<f64>` covers the third;
    /// the other two are checked here, because a `NaN` reaching `Math.round`
    /// would have produced the string `"NaN"` in a signed parameter.
    pub fn whole_duration(&self) -> Option<i64> {
        self.duration_seconds
            .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
            .map(|seconds| seconds.round() as i64)
    }

    /// Whether this play is worth submitting at all.
    ///
    /// v1 skipped a play whose artist or track was blank after trimming — a
    /// bare radio entry, typically, which has a stream title and nothing to
    /// attribute it to. Both APIs would accept the submission and record
    /// something meaningless.
    pub fn is_submittable(&self) -> bool {
        !self.artist.trim().is_empty() && !self.track.trim().is_empty()
    }
}

/// The unix-**seconds** instant a track started, from the play-event instant
/// and how much of it had played.
///
/// Last.fm and ListenBrainz both want the start time, not the moment the
/// ~30s/50% threshold tripped, so the played duration is subtracted back off.
///
/// Two clamps, both v1's. The played seconds are rounded and floored at zero
/// before subtraction, and the result is floored at zero afterwards — a
/// timestamp before the epoch is not a thing either API can store.
///
/// JavaScript's `Math.round` breaks ties toward `+∞` while Rust's `f64::round`
/// breaks them away from zero. They differ only for negative halves, and a
/// negative `played_seconds` is clamped to zero by both, so the ported result
/// is identical across the whole reachable input range.
pub fn play_start_timestamp(event_ms: i64, played_seconds: f64) -> i64 {
    let played = if played_seconds.is_finite() {
        (played_seconds.round() as i64).max(0)
    } else {
        0
    };

    event_ms.div_euclid(1_000).saturating_sub(played).max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play() -> ScrobblePlay {
        ScrobblePlay {
            artist: "Nujabes".to_owned(),
            track: "Aruarian Dance".to_owned(),
            album: Some("Modal Soul".to_owned()),
            duration_seconds: Some(247.0),
            started_at: 1_700_000_000,
        }
    }

    /// v1's `playStartTimestamp` cases, verbatim.
    #[test]
    fn the_start_time_is_the_event_time_less_what_had_played() {
        assert_eq!(play_start_timestamp(1_700_000_030_000, 30.0), 1_700_000_000);
    }

    #[test]
    fn the_start_time_is_never_negative() {
        assert_eq!(play_start_timestamp(10_000, 999.0), 0);
    }

    /// The event instant floors to whole seconds before the subtraction, so a
    /// play reported mid-second does not round the start time forward past the
    /// moment it actually began.
    #[test]
    fn the_event_instant_floors_to_whole_seconds() {
        assert_eq!(play_start_timestamp(1_700_000_030_999, 30.0), 1_700_000_000);
        assert_eq!(play_start_timestamp(1_700_000_030_001, 30.0), 1_700_000_000);
    }

    #[test]
    fn a_fractional_played_duration_rounds_to_the_nearest_second() {
        assert_eq!(play_start_timestamp(1_700_000_030_000, 30.4), 1_700_000_000);
        assert_eq!(play_start_timestamp(1_700_000_030_000, 29.5), 1_700_000_000);
        assert_eq!(play_start_timestamp(1_700_000_030_000, 30.5), 1_699_999_999);
    }

    /// A negative played duration clamps before the subtraction rather than
    /// pushing the start time into the future.
    #[test]
    fn a_negative_played_duration_clamps_to_zero() {
        assert_eq!(play_start_timestamp(1_700_000_030_000, -5.0), 1_700_000_030);
    }

    /// A non-finite duration would have stringified into a signed parameter.
    #[test]
    fn a_non_finite_played_duration_is_treated_as_none_played() {
        assert_eq!(play_start_timestamp(1_000_000, f64::NAN), 1_000);
        assert_eq!(play_start_timestamp(1_000_000, f64::INFINITY), 1_000);
    }

    #[test]
    fn a_duration_is_reported_only_when_it_is_positive_and_finite() {
        assert_eq!(play().whole_duration(), Some(247));
        assert_eq!(
            ScrobblePlay {
                duration_seconds: Some(246.6),
                ..play()
            }
            .whole_duration(),
            Some(247)
        );
        for absent in [Some(0.0), Some(-1.0), Some(f64::NAN), None] {
            assert_eq!(
                ScrobblePlay {
                    duration_seconds: absent,
                    ..play()
                }
                .whole_duration(),
                None,
                "{absent:?} must not reach the wire"
            );
        }
    }

    /// v1's `if (!input.artist.trim() || !input.track.trim()) return;`.
    #[test]
    fn a_play_with_no_artist_or_no_title_is_not_submittable() {
        assert!(play().is_submittable());
        for blank in ["", "   ", "\t\n"] {
            assert!(
                !ScrobblePlay {
                    artist: blank.to_owned(),
                    ..play()
                }
                .is_submittable()
            );
            assert!(
                !ScrobblePlay {
                    track: blank.to_owned(),
                    ..play()
                }
                .is_submittable()
            );
        }
    }
}
