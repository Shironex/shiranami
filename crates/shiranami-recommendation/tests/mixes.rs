//! Ported from `packages/recommendation/src/mixes.test.ts`.
//!
//! Every case in the TypeScript suite has a counterpart here, against the same
//! `focusTracks(n)` fixture. Two additions beyond the port: the generated `id`
//! is pinned against the serde name of its kind (the renderer keys on that
//! string, and it now lives in two places), and the shared-predicate dedup that
//! the TypeScript only exercised implicitly is asserted directly.

use shiranami_core::models::{SmartMixKind, SmartMixResult, SmartMixSignals, SmartMixWeather};
use shiranami_recommendation::core::{MixTrack, build_smart_mixes};

/// N focus-genre tracks with distinct ids and ascending play counts.
fn focus_tracks(count: u32, year: Option<i32>) -> Vec<MixTrack> {
    (0..count)
        .map(|index| MixTrack {
            track_id: format!("focus-{index}"),
            genre: Some("lofi".to_owned()),
            year,
            play_count: index,
        })
        .collect()
}

/// `{ hour }` with no weather signal.
fn at_hour(hour: u8) -> SmartMixSignals {
    SmartMixSignals {
        hour,
        weather: None,
    }
}

/// `{ hour, weather }`.
fn at_hour_with(hour: u8, weather: SmartMixWeather) -> SmartMixSignals {
    SmartMixSignals {
        hour,
        weather: Some(weather),
    }
}

fn find(mixes: &[SmartMixResult], kind: SmartMixKind) -> Option<&SmartMixResult> {
    mixes.iter().find(|mix| mix.kind == kind)
}

fn has(mixes: &[SmartMixResult], kind: SmartMixKind) -> bool {
    find(mixes, kind).is_some()
}

// ---------------------------------------------------------------------------
// describe('buildSmartMixes')
// ---------------------------------------------------------------------------

#[test]
fn returns_empty_when_no_mix_reaches_the_minimum_size() {
    assert!(build_smart_mixes(&focus_tracks(2, None), &at_hour(14)).is_empty());
}

#[test]
fn produces_a_focus_mix_from_instrumental_calm_genres() {
    let mixes = build_smart_mixes(&focus_tracks(6, None), &at_hour(14));
    let focus = find(&mixes, SmartMixKind::Focus).expect("a focus mix");
    assert_eq!(focus.track_ids.len(), 6);
}

#[test]
fn ranks_picks_by_play_count_most_played_first() {
    let mixes = build_smart_mixes(&focus_tracks(6, None), &at_hour(14));
    let focus = find(&mixes, SmartMixKind::Focus).expect("a focus mix");
    // focus_tracks assigns play_count = index, so the highest index leads.
    assert_eq!(focus.track_ids.first().map(String::as_str), Some("focus-5"));
    assert_eq!(focus.track_ids.last().map(String::as_str), Some("focus-0"));
}

#[test]
fn adds_a_late_night_mix_in_the_small_hours_and_not_midday() {
    let tracks = focus_tracks(6, None);
    assert!(has(
        &build_smart_mixes(&tracks, &at_hour(2)),
        SmartMixKind::LateNight
    ));
    assert!(!has(
        &build_smart_mixes(&tracks, &at_hour(14)),
        SmartMixKind::LateNight
    ));
}

#[test]
fn adds_a_rainy_day_mix_only_when_weather_is_rain_storm_or_fog() {
    let tracks = focus_tracks(6, None);
    assert!(has(
        &build_smart_mixes(&tracks, &at_hour_with(14, SmartMixWeather::Rain)),
        SmartMixKind::RainyDay
    ));
    assert!(!has(
        &build_smart_mixes(&tracks, &at_hour_with(14, SmartMixWeather::Clear)),
        SmartMixKind::RainyDay
    ));
}

#[test]
fn degrades_to_time_and_decade_mixes_when_no_weather_signal_is_given() {
    let mixes = build_smart_mixes(&focus_tracks(6, None), &at_hour(14));
    assert!(
        mixes
            .iter()
            .all(|mix| mix.kind != SmartMixKind::RainyDay && mix.kind != SmartMixKind::SunnyDay)
    );
}

#[test]
fn builds_decade_mixes_bucketed_by_release_year_newest_first() {
    let mut tracks = focus_tracks(6, Some(1994));
    for (index, track) in focus_tracks(6, Some(2017)).into_iter().enumerate() {
        tracks.push(MixTrack {
            track_id: format!("b-{index}"),
            ..track
        });
    }
    let decades: Vec<Option<u32>> = build_smart_mixes(&tracks, &at_hour(14))
        .into_iter()
        .filter(|mix| mix.kind == SmartMixKind::Decade)
        .map(|mix| mix.decade)
        .collect();
    assert_eq!(decades, [Some(2010), Some(1990)]);
}

#[test]
fn drops_decades_that_are_too_small() {
    let mut tracks = focus_tracks(6, Some(2017));
    tracks.push(MixTrack {
        track_id: "lonely".to_owned(),
        genre: Some("lofi".to_owned()),
        year: Some(1985),
        play_count: 1,
    });
    let decades: Vec<Option<u32>> = build_smart_mixes(&tracks, &at_hour(14))
        .into_iter()
        .filter(|mix| mix.kind == SmartMixKind::Decade)
        .map(|mix| mix.decade)
        .collect();
    assert_eq!(decades, [Some(2010)]);
}

// ---------------------------------------------------------------------------
// Beyond the TypeScript suite.
// ---------------------------------------------------------------------------

/// The TypeScript set `id: kind`, so the two were one string by construction.
/// In Rust the id is a literal and the kind is a serde-renamed enum, which is
/// two places that can drift — and the renderer keys React elements on the id.
#[test]
fn every_mix_id_is_the_serde_name_of_its_kind() {
    let tracks = focus_tracks(6, Some(2017));
    let mut generated: Vec<SmartMixResult> = Vec::new();
    // One call per kind-producing branch, so all seven kinds are covered.
    for signals in [
        at_hour(2),
        at_hour(8),
        at_hour_with(14, SmartMixWeather::Rain),
        at_hour_with(14, SmartMixWeather::Snow),
        at_hour_with(14, SmartMixWeather::Clear),
        at_hour(14),
    ] {
        generated.extend(build_smart_mixes(&upbeat_and_focus(&tracks), &signals));
    }

    let mut seen: Vec<SmartMixKind> = Vec::new();
    for mix in &generated {
        let serde_name = serde_json::to_string(&mix.kind).expect("kind serializes");
        let serde_name = serde_name.trim_matches('"');
        if mix.kind == SmartMixKind::Decade {
            assert_eq!(mix.id, format!("decade-{}", mix.decade.unwrap_or_default()));
        } else {
            assert_eq!(mix.id, serde_name, "id drifted from the kind's serde name");
        }
        if !seen.contains(&mix.kind) {
            seen.push(mix.kind);
        }
    }

    assert_eq!(seen.len(), 7, "not every mix kind was generated: {seen:?}");
}

/// The morning mix filters on the upbeat genres, so covering it needs tracks
/// that match both predicates.
fn upbeat_and_focus(focus: &[MixTrack]) -> Vec<MixTrack> {
    let mut tracks = focus.to_vec();
    for index in 0..6 {
        tracks.push(MixTrack {
            track_id: format!("upbeat-{index}"),
            genre: Some("Dance".to_owned()),
            year: Some(2017),
            play_count: index,
        });
    }
    tracks
}

/// Focus, late-night and rainy-day all filter on the same genre list, so at
/// 2 a.m. in the rain all three resolve to identical picks. Only the first
/// survives, and the order of the survivors is the contextual ranking the
/// TypeScript comments describe: time first, then weather, then the generic
/// focus shelf.
#[test]
fn mixes_with_identical_picks_are_deduped_most_contextual_first() {
    let mixes = build_smart_mixes(
        &focus_tracks(6, None),
        &at_hour_with(2, SmartMixWeather::Rain),
    );
    let kinds: Vec<SmartMixKind> = mixes.iter().map(|mix| mix.kind).collect();
    assert_eq!(kinds, [SmartMixKind::LateNight]);
}

/// Genre matching is a case-insensitive substring test, as in TypeScript.
#[test]
fn genre_matching_is_case_insensitive_and_substring_based() {
    let tracks: Vec<MixTrack> = (0..6)
        .map(|index| MixTrack {
            track_id: format!("t-{index}"),
            genre: Some("Instrumental Hip-Hop".to_owned()),
            year: None,
            play_count: index,
        })
        .collect();
    assert!(has(
        &build_smart_mixes(&tracks, &at_hour(14)),
        SmartMixKind::Focus
    ));
}

/// A missing or empty genre never matches, so a library with no genre tags
/// produces no mood mixes at all.
#[test]
fn a_missing_or_empty_genre_never_matches() {
    let tracks: Vec<MixTrack> = (0..6)
        .map(|index| MixTrack {
            track_id: format!("t-{index}"),
            genre: if index % 2 == 0 {
                None
            } else {
                Some(String::new())
            },
            year: None,
            play_count: index,
        })
        .collect();
    assert!(build_smart_mixes(&tracks, &at_hour(14)).is_empty());
}

/// The decade bucket ignores implausible years rather than inventing a
/// "decade 0" shelf, and truncates toward the decade start.
#[test]
fn implausible_years_are_not_bucketed() {
    let mut tracks = focus_tracks(6, Some(12));
    tracks.extend(
        focus_tracks(6, Some(1999))
            .into_iter()
            .enumerate()
            .map(|(index, track)| MixTrack {
                track_id: format!("nineties-{index}"),
                ..track
            }),
    );
    let decades: Vec<Option<u32>> = build_smart_mixes(&tracks, &at_hour(14))
        .into_iter()
        .filter(|mix| mix.kind == SmartMixKind::Decade)
        .map(|mix| mix.decade)
        .collect();
    assert_eq!(decades, [Some(1990)]);
}
