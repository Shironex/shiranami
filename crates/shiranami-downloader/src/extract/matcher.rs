//! Picking the right YouTube upload for a Spotify track.
//!
//! Spotify gives us a title, an artist and a duration; YouTube search gives us
//! five candidates. The wrong one is not merely wrong — it is a live take, an
//! hour loop, a nightcore edit or a full-album rip sitting in the user's library
//! under the right name. So this scores rather than taking `results[0]`.
//!
//! # The weighting, and why duration carries as much as the title
//!
//! Title 35%, artist 30%, duration 35%. Duration looks over-weighted until you
//! notice what it is for: every failure mode above has approximately the right
//! title and the right artist, and a wildly wrong length. Duration is the one
//! dimension that separates a 3-minute studio track from a 60-minute loop of it.
//!
//! # Import with a warning, never skip
//!
//! A winner below [`CONFIDENCE_THRESHOLD`] is still returned, flagged `low`, so
//! the renderer can warn. Silently skipping a track leaves the user with a
//! playlist that is quietly short and no way to find out which one is missing.

use std::sync::LazyLock;

use regex::Regex;
use shiranami_core::models::{MatchFlag, SearchResult};
use unicode_normalization::UnicodeNormalization;

use crate::extract::spotify::SpotifyTrack;

/// Below this normalized score a match is flagged `low`.
///
/// 0.5 sits below a clean studio match — which lands well above 0.7 once title,
/// artist and duration align — but above the noise floor a wrong-only candidate
/// set produces.
pub const CONFIDENCE_THRESHOLD: f64 = 0.5;

/// What each forbidden word present in a candidate title costs.
const FORBIDDEN_PENALTY: f64 = 0.15;

/// Exponential decay rate on the duration gap, in seconds.
const DURATION_DECAY: f64 = 0.1;

/// Within this many seconds, duration is treated as exact.
const DURATION_EXACT_WINDOW_SEC: f64 = 4.0;

/// Words that mark an upload as a non-original recording.
///
/// A candidate carrying one is penalised — **unless the Spotify track carries
/// the same word**, which makes it a legitimate descriptor. A song actually
/// released as "… - Live" must not be penalised for matching itself.
const FORBIDDEN_WORDS: &[&str] = &[
    "live",
    "cover",
    "remix",
    "nightcore",
    "sped up",
    "sped-up",
    "speed up",
    "slowed",
    "reverb",
    "8d",
    "karaoke",
    "instrumental",
    "reaction",
    "react",
    "lesson",
    "tutorial",
    "1 hour",
    "1hour",
    "one hour",
    "hour loop",
    "hour version",
    "full album",
    "mashup",
    "parody",
];

/// Declare a lazily-compiled pattern.
///
/// `expect` rather than `unwrap`: these are literal patterns, so a failure is a
/// mistake in this file that shows up the first time the module is touched, and
/// the message says so.
macro_rules! pattern {
    ($name:ident, $source:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new($source).expect("a literal pattern in this module compiles")
        });
    };
}

pattern!(BRACKETED, r"\s*[(\[{][^)\]}]*[)\]}]");
pattern!(FEATURING, r"(?i)\s\b(?:feat\.?|ft\.?|featuring)\s+.*$");
pattern!(NON_ALPHANUMERIC, r"[^a-z0-9]+");
pattern!(TOPIC_SUFFIX, r"(?i)-\s*topic$");

/// Lowercase, strip diacritics, drop credits and bracketed noise, collapse
/// punctuation.
///
/// The order is load-bearing and is v1's. NFKD decomposition has to come before
/// the combining-mark strip or there is nothing decomposed to strip, and the
/// bracket removal has to come before the punctuation collapse or the brackets
/// themselves become spaces and their contents survive.
pub fn normalize_for_match(value: &str) -> String {
    let lowered: String = value.to_lowercase().nfkd().collect();

    // The combining diacritical marks block, U+0300–U+036F.
    let stripped: String = lowered
        .chars()
        .filter(|character| !matches!(*character, '\u{300}'..='\u{36f}'))
        .collect();

    let unbracketed = BRACKETED.replace_all(&stripped, " ");
    // Only the first match, as v1's non-global regex did.
    let uncredited = FEATURING.replace(&unbracketed, " ");
    let collapsed = NON_ALPHANUMERIC.replace_all(&uncredited, " ");

    collapsed.trim().to_owned()
}

/// Token overlap, weighted by the smaller side.
///
/// Dividing by the smaller set means a candidate title carrying extra promo
/// words — "official music video", "lyrics" — is not punished as long as it
/// contains the reference tokens.
pub fn token_similarity(left: &str, right: &str) -> f64 {
    let left: std::collections::HashSet<&str> =
        left.split(' ').filter(|token| !token.is_empty()).collect();
    let right: std::collections::HashSet<&str> =
        right.split(' ').filter(|token| !token.is_empty()).collect();

    if left.is_empty() || right.is_empty() {
        return 0.0;
    }

    let shared = left.intersection(&right).count();
    #[expect(
        clippy::cast_precision_loss,
        reason = "token counts are bounded by title length"
    )]
    let ratio = shared as f64 / left.len().min(right.len()) as f64;
    ratio
}

/// Duration similarity, by exponential decay on the gap.
///
/// An unknown Spotify duration scores a neutral 0.5 — the embed scrape supplies
/// one, but the regex fallbacks do not, and scoring an unknown as a mismatch
/// would make every fallback-parsed track look wrong.
pub fn duration_score(spotify_sec: Option<f64>, candidate_sec: f64) -> f64 {
    let Some(spotify_sec) = spotify_sec.filter(|seconds| *seconds > 0.0) else {
        return 0.5;
    };
    if candidate_sec <= 0.0 {
        return 0.5;
    }

    let delta = (spotify_sec - candidate_sec).abs();
    if delta <= DURATION_EXACT_WINDOW_SEC {
        return 1.0;
    }

    (-DURATION_DECAY * (delta - DURATION_EXACT_WINDOW_SEC)).exp()
}

/// Whether an uploader is one of YouTube's auto-generated `Artist - Topic`
/// channels — which carry official audio and are therefore a positive signal.
pub fn is_topic_channel(uploader: &str) -> bool {
    TOPIC_SUFFIX.is_match(uploader.trim())
}

/// Forbidden words in the candidate that the Spotify track does not itself use.
fn forbidden_hits(candidate_title: &str, track: &SpotifyTrack) -> usize {
    let candidate = padded(candidate_title);
    let own = format!(
        " {} {} ",
        collapse(&track.title),
        collapse(track.album.as_deref().unwrap_or_default())
    );

    FORBIDDEN_WORDS
        .iter()
        .filter(|word| {
            let padded_word = format!(" {word} ");
            candidate.contains(&padded_word) && !own.contains(&padded_word)
        })
        .count()
}

/// Lowercased with punctuation collapsed to spaces, wrapped in spaces so a
/// whole-word `contains` works at both ends.
fn padded(value: &str) -> String {
    format!(" {} ", collapse(value))
}

fn collapse(value: &str) -> String {
    NON_ALPHANUMERIC
        .replace_all(&value.to_lowercase(), " ")
        .into_owned()
}

/// Score one candidate against one track, in 0..=1.
pub fn score_candidate(track: &SpotifyTrack, candidate: &SearchResult) -> f64 {
    let reference_title = normalize_for_match(&track.title);
    let reference_artist = normalize_for_match(&track.artist);
    let candidate_title = normalize_for_match(&candidate.title);
    // A Topic channel is literally "Artist - Topic", and a music video embeds
    // the artist in its title, so the artist is compared against both.
    let candidate_channel = normalize_for_match(&TOPIC_SUFFIX.replace(&candidate.uploader, ""));

    let title_score = token_similarity(&reference_title, &candidate_title);
    let artist_score = token_similarity(&reference_artist, &candidate_channel)
        .max(token_similarity(&reference_artist, &candidate_title));
    let duration = duration_score(track.duration_sec, candidate.duration);

    let mut score = title_score * 0.35 + artist_score * 0.3 + duration * 0.35;

    #[expect(
        clippy::cast_precision_loss,
        reason = "at most the length of FORBIDDEN_WORDS"
    )]
    let penalty = forbidden_hits(&candidate.title, track) as f64 * FORBIDDEN_PENALTY;
    score -= penalty;

    // Small nudges — never enough to rescue a duration or title mismatch.
    if is_topic_channel(&candidate.uploader) {
        score += 0.05;
    }
    if track.isrc.is_some() {
        score += 0.03;
    }

    score.clamp(0.0, 1.0)
}

/// The chosen candidate and how much to trust it.
#[derive(Debug, Clone, PartialEq)]
pub struct MatchResult {
    /// The winner, or `None` when there were no candidates at all.
    pub result: Option<SearchResult>,
    /// The winner's normalized score.
    pub confidence: f64,
    /// Whether the score cleared [`CONFIDENCE_THRESHOLD`].
    pub flag: MatchFlag,
}

/// Pick the best candidate.
///
/// Ties break toward the higher view count, then toward a Topic channel. Both
/// tie-breaks favour the upload more likely to be the official audio.
pub fn pick_best_match(track: &SpotifyTrack, candidates: &[SearchResult]) -> MatchResult {
    if candidates.is_empty() {
        return MatchResult {
            result: None,
            confidence: 0.0,
            flag: MatchFlag::Low,
        };
    }

    let mut best: Option<&SearchResult> = None;
    let mut best_score = -1.0_f64;

    for candidate in candidates {
        let score = score_candidate(track, candidate);

        if score > best_score {
            best = Some(candidate);
            best_score = score;
            continue;
        }

        if let Some(current) = best
            && (score - best_score).abs() < f64::EPSILON
        {
            let candidate_views = candidate.view_count.unwrap_or(0);
            let best_views = current.view_count.unwrap_or(0);

            let wins_on_views = candidate_views > best_views;
            let wins_on_channel =
                candidate_views == best_views && is_topic_channel(&candidate.uploader);

            if wins_on_views || wins_on_channel {
                best = Some(candidate);
            }
        }
    }

    let confidence = best_score.max(0.0);
    MatchResult {
        result: best.cloned(),
        confidence,
        flag: if confidence >= CONFIDENCE_THRESHOLD {
            MatchFlag::Ok
        } else {
            MatchFlag::Low
        },
    }
}
