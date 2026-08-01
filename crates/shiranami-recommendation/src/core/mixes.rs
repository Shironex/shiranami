//! Smart-mix generation, ported from `packages/recommendation/src/mixes.ts`.
//!
//! Turns the contextual signals the Overview already collects (time-of-day +
//! current weather) plus library metadata (year, genre) into mood / activity /
//! decade mixes — e.g. "Focus", "Late-night", "Rainy-day", "Best of the 2010s".
//!
//! Pure and deterministic: callers inject the hour and optional weather, so the
//! same library + signals always yields the same mixes. The recommendation
//! service projects the `tracks` table into [`MixTrack`] and resolves the
//! returned track ids; the renderer renders the descriptors.
//!
//! The TypeScript declared its own `MixSignals` / `SmartMix` / `SmartMixKind` /
//! `MixWeather` so the package stayed dependency-free. In Rust those are already
//! the renderer-facing contracts in [`shiranami_core::models`], ported in Phase
//! 2 — re-declaring them here would be a second copy free to drift from the
//! generated TypeScript bindings, so this module consumes and produces them
//! directly.

use std::collections::{BTreeMap, HashSet};

use shiranami_core::models::{SmartMixKind, SmartMixResult, SmartMixSignals, SmartMixWeather};

/// Minimal library shape for mix generation — the metadata axes a mix filters
/// on, plus the play count used to order picks within a mix.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MixTrack {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Free-text genre tag, possibly absent/empty (sparse in this schema).
    pub genre: Option<String>,
    /// Release year, possibly absent (drives the decade mixes).
    pub year: Option<i32>,
    /// Lifetime play count, used to rank picks within a mix (popular first).
    pub play_count: u32,
}

/// Max tracks per generated mix — matches the static mixes' `MIX_LIMIT`.
pub const SMART_MIX_LIMIT: usize = 50;

/// A mix must have at least this many tracks to be surfaced (no near-empty
/// shelves).
const MIN_MIX_SIZE: usize = 5;

/// Most recent N decades to consider, newest first, to avoid a long tail of
/// tiny single-track decades.
const MAX_DECADES: usize = 3;

/// The earliest year that reads as a release year rather than a corrupt tag.
const MIN_PLAUSIBLE_YEAR: i32 = 1000;

/// Lower-cased genre substrings that read as "calm / instrumental / focus".
const FOCUS_GENRES: [&str; 7] = [
    "lofi",
    "lo-fi",
    "instrumental",
    "ambient",
    "classical",
    "jazz",
    "chill",
];

/// Genres that read as "energetic / upbeat" for the sunny-day mix.
const UPBEAT_GENRES: [&str; 7] = [
    "pop",
    "dance",
    "electronic",
    "rock",
    "house",
    "funk",
    "disco",
];

/// Generate the contextual mood/activity mixes for the given signals, plus the
/// decade mixes.
///
/// Mixes that don't reach the minimum size are dropped so the UI never shows a
/// near-empty shelf. The order is: the single most-relevant time/weather mix
/// first, then the remaining contextual mixes, then decades.
///
/// Degrades gracefully: with no weather signal, only the time-of-day + decade
/// mixes are produced; with no usable metadata at all, returns an empty vector.
///
/// TypeScript additionally guarded a non-finite `hour` with a fallback of 12.
/// [`SmartMixSignals::hour`] is a `u8`, so there is no non-finite value to guard
/// against; an out-of-range hour (`25`) still lands in the late-night branch
/// exactly as it did there.
pub fn build_smart_mixes(tracks: &[MixTrack], signals: &SmartMixSignals) -> Vec<SmartMixResult> {
    let hour = signals.hour;
    // `hour >= 22 || hour < 5` and `hour >= 5 && hour < 12`, as ranges. An hour
    // past 23 is out of contract but still lands in late-night, as it did in
    // TypeScript.
    let is_late_night = !(5..22).contains(&hour);
    let is_morning = (5..12).contains(&hour);

    let mut candidates: Vec<Option<SmartMixResult>> = Vec::new();

    // Time-of-day mood mixes.
    if is_late_night {
        candidates.push(build_mix(
            SmartMixKind::LateNight,
            "smart.lateNight",
            "smart.lateNightDesc",
            tracks,
            &FOCUS_GENRES,
        ));
    }
    if is_morning {
        candidates.push(build_mix(
            SmartMixKind::Morning,
            "smart.morning",
            "smart.morningDesc",
            tracks,
            &UPBEAT_GENRES,
        ));
    }

    // Weather-driven mixes (only when a signal is present). Pushed before the
    // generic focus mix so that — when a weather mix shares the FOCUS_GENRES
    // predicate and so yields identical picks — the more contextual shelf wins
    // the content-dedup below and the redundant focus copy is dropped.
    match signals.weather {
        Some(SmartMixWeather::Rain | SmartMixWeather::Thunderstorm | SmartMixWeather::Fog) => {
            candidates.push(build_mix(
                SmartMixKind::RainyDay,
                "smart.rainyDay",
                "smart.rainyDayDesc",
                tracks,
                &FOCUS_GENRES,
            ));
        }
        Some(SmartMixWeather::Snow) => {
            candidates.push(build_mix(
                SmartMixKind::SnowyDay,
                "smart.snowyDay",
                "smart.snowyDayDesc",
                tracks,
                &FOCUS_GENRES,
            ));
        }
        Some(SmartMixWeather::Clear | SmartMixWeather::PartlyCloudy) => {
            candidates.push(build_mix(
                SmartMixKind::SunnyDay,
                "smart.sunnyDay",
                "smart.sunnyDayDesc",
                tracks,
                &UPBEAT_GENRES,
            ));
        }
        // Cloudy, Unknown and "no signal at all" add nothing, as in the
        // TypeScript `default:` arm.
        _ => {}
    }

    // Focus / activity mix — always offered (calm, instrumental picks). Pushed
    // last among the contextual candidates so a colliding weather mix takes
    // precedence.
    candidates.push(build_mix(
        SmartMixKind::Focus,
        "smart.focus",
        "smart.focusDesc",
        tracks,
        &FOCUS_GENRES,
    ));

    // Dedupe by track contents and drop the empties. Several mixes share a genre
    // predicate (e.g. focus, late-night and rainy-day all use FOCUS_GENRES), so
    // distinct kinds can resolve to identical track sets; the first/most-relevant
    // wins so the UI never shows two shelves with the same songs.
    let mut seen_track_sets: HashSet<String> = HashSet::new();
    let mut mixes: Vec<SmartMixResult> = Vec::new();
    for mix in candidates.into_iter().flatten().chain(decade_mixes(tracks)) {
        // Joining on a comma is how TypeScript keyed the set. A track id
        // containing a comma could in principle alias another set; ids are
        // generated identifiers, and reproducing the key exactly is worth more
        // than hardening against an id shape that does not occur.
        if seen_track_sets.insert(mix.track_ids.join(",")) {
            mixes.push(mix);
        }
    }

    mixes
}

/// Build a non-decade mix from a genre predicate; returns `None` if too small.
fn build_mix(
    kind: SmartMixKind,
    title_key: &str,
    desc_key: &str,
    tracks: &[MixTrack],
    needles: &[&str],
) -> Option<SmartMixResult> {
    let matched: Vec<&MixTrack> = tracks
        .iter()
        .filter(|track| genre_matches(track, needles))
        .collect();
    if matched.len() < MIN_MIX_SIZE {
        return None;
    }
    Some(SmartMixResult {
        id: mix_id(kind).to_owned(),
        kind,
        title_key: title_key.to_owned(),
        desc_key: desc_key.to_owned(),
        decade: None,
        track_ids: rank_and_cap(&matched),
    })
}

/// Generate the decade mixes — one per decade with enough tracks, newest first,
/// limited to [`MAX_DECADES`]. Each is ranked by play count.
fn decade_mixes(tracks: &[MixTrack]) -> Vec<SmartMixResult> {
    let mut by_decade: BTreeMap<u32, Vec<&MixTrack>> = BTreeMap::new();
    for track in tracks {
        if let Some(decade) = decade_of(track.year) {
            by_decade.entry(decade).or_default().push(track);
        }
    }

    // A `BTreeMap` iterated in reverse is the sorted-descending-by-decade that
    // TypeScript got from `.sort((a, b) => b[0] - a[0])` over the Map entries,
    // without depending on hash iteration order for a user-visible ordering.
    by_decade
        .iter()
        .rev()
        .filter(|(_, bucket)| bucket.len() >= MIN_MIX_SIZE)
        .take(MAX_DECADES)
        .map(|(&decade, bucket)| SmartMixResult {
            id: format!("decade-{decade}"),
            kind: SmartMixKind::Decade,
            title_key: "smart.decade".to_owned(),
            desc_key: "smart.decadeDesc".to_owned(),
            decade: Some(decade),
            track_ids: rank_and_cap(bucket),
        })
        .collect()
}

/// Decade start year for a release year (1994 → 1990); `None` when unknown.
///
/// TypeScript used `Math.floor(year / 10) * 10`. The year is an integer at or
/// above [`MIN_PLAUSIBLE_YEAR`] by the time it gets here, and for a non-negative
/// integer Rust's truncating division is exactly `Math.floor`.
fn decade_of(year: Option<i32>) -> Option<u32> {
    let year = year?;
    if year < MIN_PLAUSIBLE_YEAR {
        return None;
    }
    u32::try_from(year / 10 * 10).ok()
}

/// Whether the track's genre contains any of `needles`, case-insensitively.
fn genre_matches(track: &MixTrack, needles: &[&str]) -> bool {
    let Some(genre) = track.genre.as_deref() else {
        return false;
    };
    let genre = genre.to_lowercase();
    if genre.is_empty() {
        return false;
    }
    needles.iter().any(|needle| genre.contains(needle))
}

/// Rank by play count desc (stable, so ties keep input order) and cap.
fn rank_and_cap(tracks: &[&MixTrack]) -> Vec<String> {
    let mut ordered: Vec<&MixTrack> = tracks.to_vec();
    ordered.sort_by(|left, right| right.play_count.cmp(&left.play_count));
    ordered
        .into_iter()
        .take(SMART_MIX_LIMIT)
        .map(|track| track.track_id.clone())
        .collect()
}

/// The stable per-render id TypeScript built as `id: kind`.
///
/// These strings are the serde representation of [`SmartMixKind`] — the
/// renderer keys on them — and `tests/mixes.rs` pins that they stay identical to
/// what the generated bindings emit.
fn mix_id(kind: SmartMixKind) -> &'static str {
    match kind {
        SmartMixKind::Focus => "focus",
        SmartMixKind::LateNight => "late-night",
        SmartMixKind::Morning => "morning",
        SmartMixKind::RainyDay => "rainy-day",
        SmartMixKind::SunnyDay => "sunny-day",
        SmartMixKind::SnowyDay => "snowy-day",
        SmartMixKind::Decade => "decade",
    }
}
