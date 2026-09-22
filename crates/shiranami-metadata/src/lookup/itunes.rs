//! The iTunes Search API lookup.
//!
//! Ported from `searchItunes` in
//! `apps/desktop/src/main/services/metadata-lookup.ts`.
//!
//! Requests go through `shiranami-net`'s client, which already carries the
//! 500 ms `itunes.apple.com` gate v1 configured and the 429 back-off that
//! extends it — so the rate discipline is inherited rather than re-implemented.

use serde::Deserialize;
use shiranami_core::UNKNOWN_ARTIST;
use shiranami_net::{HttpClient, RequestOptions};

use crate::lookup::clean::clean_title_for_search;
use crate::lookup::model::{LookupSource, MetadataLookupResult};

/// The endpoint, with v1's three fixed parameters.
///
/// Public so a caller can point a run at a test server; `shiranami-net`'s host
/// gate keys on the hostname, so overriding it also opts out of the 500 ms
/// spacing — which is what a loopback test wants.
pub const ENDPOINT: &str = "https://itunes.apple.com/search";

/// How many candidates to score. v1's `limit=5`.
const LIMIT: usize = 5;

/// Below this, `lookupMetadata` discards the match.
///
/// v1: `if (itunesResult && itunesResult.confidence >= 0.3)`. With the scoring
/// below, 0.3 is exactly "one side matched as a substring" — enough to be worth
/// a cover, not enough to be trusted blindly.
pub const MIN_CONFIDENCE: f64 = 0.3;

/// The artwork size v1 asks for by rewriting the URL.
const ARTWORK_FROM: &str = "100x100bb";
const ARTWORK_TO: &str = "600x600bb";

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    results: Vec<SearchResult>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    #[serde(default)]
    track_name: Option<String>,
    #[serde(default)]
    artist_name: Option<String>,
    #[serde(default)]
    collection_name: Option<String>,
    #[serde(default)]
    primary_genre_name: Option<String>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    track_number: Option<i32>,
    #[serde(default)]
    artwork_url100: Option<String>,
}

/// Build the search URL for a title and artist.
///
/// v1: `` `${artist} ${cleanedTitle}` `` when the artist is real, the cleaned
/// title alone otherwise — space-joined, **not** dash-joined. (The dash form
/// appears only in v1's yt-dlp fallback query.)
pub fn search_url(title: &str, artist: &str, base: &str) -> String {
    let cleaned = clean_title_for_search(title, artist);
    let query = if !artist.is_empty() && artist != UNKNOWN_ARTIST {
        format!("{artist} {cleaned}")
    } else {
        cleaned
    };

    format!(
        "{base}?term={}&media=music&entity=song&limit={LIMIT}",
        encode_query(&query)
    )
}

/// Percent-encode a query term the way `encodeURIComponent` does.
///
/// The unreserved set is exactly JavaScript's: alphanumerics plus
/// `-_.!~*'()`. Anything else, including spaces, becomes `%XX` over the UTF-8
/// bytes — spaces are `%20`, never `+`.
fn encode_query(value: &str) -> String {
    const UNRESERVED: &[u8] = b"-_.!~*'()";

    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || UNRESERVED.contains(byte) {
            out.push(char::from(*byte));
        } else {
            use std::fmt::Write as _;
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

/// Search iTunes for a track.
///
/// Returns [`MetadataLookupResult::none`] when nothing matches. Unlike v1 this
/// propagates transport failures instead of collapsing them into "no result":
/// v1's `catch → return null` made a 429, a timeout and a genuine miss
/// indistinguishable, and the renderer then added the track to a *persisted*
/// skip list — so a rate-limited track was permanently marked unmatchable. The
/// caller decides what to do with the error; the enrich batch reports it as an
/// error rather than as a miss.
pub async fn search(
    client: &HttpClient,
    title: &str,
    artist: &str,
) -> crate::Result<MetadataLookupResult> {
    search_at(client, title, artist, ENDPOINT).await
}

/// [`search`], against a caller-supplied base URL, so tests can point at a
/// loopback server.
pub async fn search_at(
    client: &HttpClient,
    title: &str,
    artist: &str,
    base: &str,
) -> crate::Result<MetadataLookupResult> {
    let url = search_url(title, artist, base);
    let response: SearchResponse = client.json(&url, RequestOptions::default()).await?;

    let cleaned = clean_title_for_search(title, artist);
    Ok(best_match(&response.results, &cleaned, artist))
}

/// Score the candidates and project the winner.
///
/// v1's scoring, reproduced exactly:
///
/// ```text
/// title  exact  +0.5   substring either way  +0.3
/// artist exact  +0.5   substring either way  +0.3   (skipped when unknown)
/// ```
///
/// Two consequences worth stating, because both are load-bearing rather than
/// accidental:
///
/// - Ties go to the **earliest** result, since the comparison is strict `>` and
///   `bestMatch` starts at `results[0]`. iTunes orders by relevance, so the
///   earlier candidate is the better prior.
/// - When every candidate scores zero, `results[0]` is still returned with
///   `confidence: 0` — which `lookupMetadata` then rejects against
///   [`MIN_CONFIDENCE`]. The zero is the signal, not the absence of a result.
fn best_match(results: &[SearchResult], cleaned_title: &str, artist: &str) -> MetadataLookupResult {
    let Some(first) = results.first() else {
        return MetadataLookupResult::none();
    };

    let normalized_title = cleaned_title.to_lowercase();
    let normalized_artist = artist.to_lowercase();
    let artist_is_known = normalized_artist != UNKNOWN_ARTIST.to_lowercase();

    let mut best = first;
    let mut best_score = 0.0_f64;

    for result in results.iter().take(LIMIT) {
        let mut score = 0.0_f64;

        let result_title = result
            .track_name
            .as_deref()
            .unwrap_or_default()
            .to_lowercase();
        score += overlap(&result_title, &normalized_title);

        if artist_is_known {
            let result_artist = result
                .artist_name
                .as_deref()
                .unwrap_or_default()
                .to_lowercase();
            score += overlap(&result_artist, &normalized_artist);
        }

        if score > best_score {
            best_score = score;
            best = result;
        }
    }

    MetadataLookupResult {
        title: non_empty(best.track_name.as_deref()),
        artist: non_empty(best.artist_name.as_deref()),
        album: non_empty(best.collection_name.as_deref()),
        genre: non_empty(best.primary_genre_name.as_deref()),
        year: best.release_date.as_deref().and_then(release_year),
        // v1's `bestMatch.trackNumber || undefined`, so a zero is absent.
        track_number: best.track_number.filter(|number| *number != 0),
        cover_image_url: best.artwork_url100.as_deref().map(upscale_artwork),
        source: LookupSource::Itunes,
        confidence: best_score,
    }
}

/// v1's two-tier string comparison.
fn overlap(candidate: &str, wanted: &str) -> f64 {
    if candidate == wanted {
        0.5
    } else if !candidate.is_empty()
        && !wanted.is_empty()
        && (candidate.contains(wanted) || wanted.contains(candidate))
    {
        0.3
    } else {
        0.0
    }
}

/// The leading four digits of an ISO date.
///
/// v1 used `new Date(releaseDate).getFullYear()`, which reads the timestamp in
/// **local time** — so a release dated `2020-01-01T00:00:00Z` reports 2019 west
/// of UTC. Taking the year from the string is what the tag actually says and
/// removes a machine-dependent result; the divergence only ever appears for
/// January-1 releases in negative offsets.
fn release_year(release_date: &str) -> Option<i32> {
    let digits: String = release_date
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    let year = digits.parse::<i32>().ok()?;
    (year != 0).then_some(year)
}

/// Ask for a 600 px cover instead of the 100 px one iTunes advertises.
///
/// v1's `.replace('100x100bb', '600x600bb')` — a plain first-occurrence string
/// replace, so a URL not carrying that segment is returned unchanged. The cache
/// downscales to 512 px afterwards either way; the point is to start from
/// something better than a 100 px thumbnail.
fn upscale_artwork(url: &str) -> String {
    match url.find(ARTWORK_FROM) {
        Some(index) => {
            let mut out = String::with_capacity(url.len() + 2);
            out.push_str(&url[..index]);
            out.push_str(ARTWORK_TO);
            out.push_str(&url[index + ARTWORK_FROM.len()..]);
            out
        }
        None => url.to_owned(),
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value.filter(|value| !value.is_empty()).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(title: &str, artist: &str) -> SearchResult {
        SearchResult {
            track_name: Some(title.to_owned()),
            artist_name: Some(artist.to_owned()),
            collection_name: Some("An Album".to_owned()),
            primary_genre_name: Some("J-Pop".to_owned()),
            release_date: Some("2020-07-01T07:00:00Z".to_owned()),
            track_number: Some(4),
            artwork_url100: Some("https://is1.mzstatic.com/image/100x100bb.jpg".to_owned()),
        }
    }

    #[test]
    fn the_url_carries_v1s_fixed_parameters() {
        let url = search_url("Belgium", "Lil Peep", ENDPOINT);

        assert!(url.starts_with("https://itunes.apple.com/search?term="));
        assert!(url.ends_with("&media=music&entity=song&limit=5"));
    }

    #[test]
    fn the_query_is_the_artist_then_the_cleaned_title() {
        let url = search_url("Belgium (Official Video)", "Lil Peep", "");

        assert!(
            url.contains("term=Lil%20Peep%20Belgium&"),
            "unexpected query in {url}"
        );
    }

    #[test]
    fn an_unknown_artist_is_left_out_of_the_query() {
        let url = search_url("Belgium (Official Video)", UNKNOWN_ARTIST, "");

        assert!(url.contains("term=Belgium&"), "unexpected query in {url}");
    }

    #[test]
    fn the_query_encodes_like_encode_uri_component() {
        // Spaces are %20 and not `+`; the unreserved set matches JavaScript's.
        assert_eq!(encode_query("a b"), "a%20b");
        assert_eq!(encode_query("a&b=c"), "a%26b%3Dc");
        assert_eq!(encode_query("-_.!~*'()"), "-_.!~*'()");
        assert_eq!(
            encode_query("ヨルシカ"),
            "%E3%83%A8%E3%83%AB%E3%82%B7%E3%82%AB"
        );
    }

    #[test]
    fn an_exact_match_on_both_sides_scores_one() {
        let results = [result("Belgium", "Lil Peep")];
        let best = best_match(&results, "belgium", "Lil Peep");

        assert!((best.confidence - 1.0).abs() < f64::EPSILON);
        assert_eq!(best.artist.as_deref(), Some("Lil Peep"));
    }

    #[test]
    fn a_substring_match_scores_lower_than_an_exact_one() {
        let results = [result("Belgium (Remix)", "Lil Peep")];
        let best = best_match(&results, "belgium", "Lil Peep");

        // 0.3 for the title substring plus 0.5 for the exact artist.
        assert!((best.confidence - 0.8).abs() < 1e-12, "{}", best.confidence);
    }

    #[test]
    fn an_unknown_artist_caps_the_score_at_the_title_half() {
        let results = [result("Belgium", "Lil Peep")];
        let best = best_match(&results, "belgium", UNKNOWN_ARTIST);

        assert!(
            (best.confidence - 0.5).abs() < f64::EPSILON,
            "the artist half must be skipped entirely, got {}",
            best.confidence
        );
    }

    #[test]
    fn the_best_scoring_candidate_wins_regardless_of_position() {
        let results = [
            result("Something Else", "Another Artist"),
            result("Belgium", "Lil Peep"),
        ];
        let best = best_match(&results, "belgium", "Lil Peep");

        assert_eq!(best.title.as_deref(), Some("Belgium"));
    }

    #[test]
    fn a_tie_goes_to_the_earlier_candidate() {
        // Strict `>` in v1, and iTunes orders by relevance — so the earlier
        // result is the better prior.
        let results = [result("Belgium", "Lil Peep"), result("Belgium", "Lil Peep")];
        let mut results = results;
        results[0].collection_name = Some("First".to_owned());
        results[1].collection_name = Some("Second".to_owned());

        let best = best_match(&results, "belgium", "Lil Peep");
        assert_eq!(best.album.as_deref(), Some("First"));
    }

    #[test]
    fn no_results_is_the_none_result() {
        assert!(!best_match(&[], "belgium", "Lil Peep").is_match());
    }

    #[test]
    fn a_zero_scoring_set_still_returns_the_first_candidate() {
        // v1 leaves `bestMatch` at `results[0]` and reports confidence 0, which
        // the caller then rejects against MIN_CONFIDENCE. The zero is the
        // signal — it must not be mistaken for "no result".
        let results = [result("Totally Different", "Someone Else")];
        let best = best_match(&results, "belgium", "Lil Peep");

        assert!(best.is_match());
        assert_eq!(best.confidence, 0.0);
        assert!(best.confidence < MIN_CONFIDENCE);
    }

    #[test]
    fn the_artwork_url_is_upscaled_to_six_hundred() {
        assert_eq!(
            upscale_artwork("https://is1.mzstatic.com/image/100x100bb.jpg"),
            "https://is1.mzstatic.com/image/600x600bb.jpg"
        );
    }

    #[test]
    fn an_artwork_url_without_the_marker_is_left_alone() {
        assert_eq!(
            upscale_artwork("https://example.com/cover.jpg"),
            "https://example.com/cover.jpg"
        );
    }

    #[test]
    fn the_release_year_is_the_leading_four_digits() {
        assert_eq!(release_year("2020-07-01T07:00:00Z"), Some(2020));
        assert_eq!(release_year("1998"), Some(1998));
        assert_eq!(release_year("not a date"), None);
    }

    #[test]
    fn a_new_years_day_release_is_not_shifted_by_the_local_timezone() {
        // v1's `new Date(...).getFullYear()` reports 2019 for this west of UTC.
        // Reading the string is machine-independent and matches the tag.
        assert_eq!(release_year("2020-01-01T00:00:00Z"), Some(2020));
    }

    #[test]
    fn a_zero_track_number_is_absent() {
        let mut results = [result("Belgium", "Lil Peep")];
        results[0].track_number = Some(0);

        assert_eq!(
            best_match(&results, "belgium", "Lil Peep").track_number,
            None
        );
    }
}
