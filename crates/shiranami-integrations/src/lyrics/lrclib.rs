//! The LRCLIB directory, over the gated HTTP client.
//!
//! v1 reached LRCLIB through the `lrclib-api` npm package, which builds its own
//! URLs on top of global `fetch`. That left a gap its own comment admitted:
//! *"lrclib-api uses global fetch; we can only enforce spacing here, not honor
//! Retry-After the way the electron-net path does."* Porting the two endpoints
//! directly onto [`HttpClient`] closes it — `lrclib.net` is in
//! [`shiranami_net::HOST_GATES`] at 250 ms, so the gate now both spaces the
//! requests **and** absorbs a `Retry-After`, which the package could not.
//!
//! The wire shape is reproduced from the package rather than reinvented:
//! `GET /api/get?track_name&artist_name&album_name&duration` and
//! `GET /api/search?q`, empty parameters omitted, `duration` in **seconds**,
//! and `encodeURIComponent` escaping (see
//! [`encode_uri_component`](crate::lyrics::query::encode_uri_component)).
//!
//! # Failure is not absence
//!
//! The one deliberate departure from v1. Its `fetchFromLrclib` swallowed every
//! per-step error and, if nothing turned up, returned the *cacheable* empty
//! result — so a track whose lookup was rate-limited end to end was recorded as
//! having no lyrics for the rest of the session. [`LrclibClient::lookup`]
//! separates the two: a 404 is a genuine miss, and anything else that leaves the
//! chain empty-handed is a [`LookupFailure`] the cache refuses to store. This is
//! the Phase 9 amendment's iTunes ruling applied to the sibling lookup.

use serde::Deserialize;
use shiranami_core::constants::UNKNOWN_ALBUM;
use shiranami_core::models::lyrics::{LyricsResult, LyricsSource};
use shiranami_net::{HttpClient, RequestOptions};

use crate::lyrics::error::LookupFailure;
use crate::lyrics::parse::parse_lrc;
use crate::lyrics::query::{build_search_queries, encode_uri_component};

/// The public LRCLIB API root.
pub const LRCLIB_API_BASE: &str = "https://lrclib.net/api";

/// What a completed LRCLIB chain concluded.
#[derive(Debug, Clone, PartialEq)]
pub enum LrclibOutcome {
    /// The directory answered with a record. May still hold no lyric text —
    /// v1 took the first search hit unconditionally, and so does this.
    Found(LrclibLyrics),
    /// The directory was reached and genuinely has nothing. Cacheable.
    Missing,
}

/// One LRCLIB hit: the parsed result the renderer wants, plus the **raw** LRC
/// document the record carried.
///
/// The raw text is kept because [`crate::lyrics::writeback`] writes it to a
/// sidecar byte for byte. Reconstructing it from [`LyricsResult::synced`] would
/// not round-trip: a refrain is spelled by stacking several timestamps on one
/// line and the parser expands it into one entry per timestamp, and a two-digit
/// fraction (centiseconds) and a three-digit one (milliseconds) both land in the
/// same `f64`. A re-rendered file would be a different file that happens to play
/// the same — and the point of write-back is that the user keeps what the
/// directory actually published.
#[derive(Debug, Clone, PartialEq)]
pub struct LrclibLyrics {
    /// The result the ladder ranks and the renderer displays.
    pub result: LyricsResult,
    /// The record's `syncedLyrics` field, unparsed, when it carried one.
    pub synced_lrc: Option<String>,
}

/// One track to look up.
#[derive(Debug, Clone, Default)]
pub struct LrclibQuery {
    /// Track title.
    pub title: String,
    /// Track artist.
    pub artist: String,
    /// Album, when known and not the placeholder.
    pub album: Option<String>,
    /// Track length in seconds.
    pub duration_seconds: Option<f64>,
}

/// The two LRCLIB endpoints v1 used.
#[derive(Debug, Clone)]
pub struct LrclibClient {
    http: HttpClient,
    base: String,
}

/// The subset of an LRCLIB record v1 read. Every other field is ignored,
/// including `instrumental` — v1's fetch path never consulted it.
#[derive(Debug, Deserialize)]
struct LrclibRecord {
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

impl LrclibClient {
    /// A client against the public API.
    pub fn new(http: HttpClient) -> Self {
        Self::with_base(http, LRCLIB_API_BASE)
    }

    /// A client against `base`, so tests can drive a loopback server.
    pub fn with_base(http: HttpClient, base: impl Into<String>) -> Self {
        Self {
            http,
            base: base.into(),
        }
    }

    /// Look `query` up, trying the exact record first and then each search
    /// variant in turn.
    ///
    /// # Errors
    ///
    /// [`LookupFailure`] when the chain ended empty-handed *and* at least one
    /// step failed for a reason other than a 404. A 404 is a miss, not a
    /// failure: it is the directory saying it does not have the track.
    pub async fn lookup(&self, query: &LrclibQuery) -> Result<LrclibOutcome, LookupFailure> {
        // Kept across the whole chain, so a failure early on is not forgotten
        // just because a later search variant returned a clean empty list.
        let mut failure: Option<LookupFailure> = None;

        match self.fetch_record(query).await {
            Ok(Some(found)) => return Ok(LrclibOutcome::Found(found)),
            Ok(None) => {}
            Err(error) => {
                if error.status() != Some(404) {
                    failure = Some(error);
                }
            }
        }

        for variant in build_search_queries(&query.title, &query.artist) {
            match self.search(&variant).await {
                Ok(Some(found)) => {
                    tracing::info!(
                        variant,
                        title = query.title,
                        "found lyrics via LRCLIB search"
                    );
                    return Ok(LrclibOutcome::Found(found));
                }
                Ok(None) => {}
                Err(error) => failure = Some(error),
            }
        }

        match failure {
            Some(error) => Err(error),
            None => {
                tracing::debug!(
                    title = query.title,
                    artist = query.artist,
                    "no lyrics found"
                );
                Ok(LrclibOutcome::Missing)
            }
        }
    }

    /// `GET /get` — the exact-match endpoint.
    ///
    /// `Ok(None)` means the record came back carrying no lyric text at all,
    /// which v1 treated the same as no record: fall through to search.
    async fn fetch_record(
        &self,
        query: &LrclibQuery,
    ) -> Result<Option<LrclibLyrics>, LookupFailure> {
        let mut params: Vec<(&str, String)> = vec![
            ("track_name", query.title.clone()),
            ("artist_name", query.artist.clone()),
        ];

        // The placeholder album is worse than no album: it narrows the search
        // to records literally titled "Unknown Album".
        if let Some(album) = query
            .album
            .as_deref()
            .filter(|album| !album.is_empty() && *album != UNKNOWN_ALBUM)
        {
            params.push(("album_name", album.to_owned()));
        }

        if let Some(duration) = query.duration_seconds.filter(|value| *value > 0.0) {
            params.push(("duration", format_duration(duration)));
        }

        let url = format!("{}/get{}", self.base, query_string(&params));
        tracing::debug!(
            title = query.title,
            artist = query.artist,
            "fetching lyrics"
        );

        let record: LrclibRecord = self
            .http
            .json(&url, RequestOptions::default())
            .await
            .map_err(|error| LookupFailure::of(&error))?;

        Ok(into_result(record))
    }

    /// `GET /search` — the fuzzy endpoint, one variant at a time.
    async fn search(&self, variant: &str) -> Result<Option<LrclibLyrics>, LookupFailure> {
        let url = format!(
            "{}/search{}",
            self.base,
            query_string(&[("q", variant.to_owned())])
        );

        let records: Vec<LrclibRecord> = self
            .http
            .json(&url, RequestOptions::default())
            .await
            .map_err(|error| LookupFailure::of(&error))?;

        // v1 took `searchResults[0]` unconditionally — not the first result
        // *with* lyrics. A first hit carrying neither is still a hit, and still
        // ends the chain.
        Ok(records.into_iter().next().map(|record| {
            into_result(record).unwrap_or(LrclibLyrics {
                result: LyricsResult {
                    synced: None,
                    plain: None,
                    source: Some(LyricsSource::Lrclib),
                },
                synced_lrc: None,
            })
        }))
    }
}

/// Project an LRCLIB record onto the shared result, or `None` when it holds no
/// lyric text in either form.
fn into_result(record: LrclibRecord) -> Option<LrclibLyrics> {
    let synced = record.synced_lyrics.filter(|text| !text.is_empty());
    let plain = record.plain_lyrics.filter(|text| !text.is_empty());

    if synced.is_none() && plain.is_none() {
        return None;
    }

    Some(LrclibLyrics {
        result: LyricsResult {
            synced: synced.as_deref().map(parse_lrc),
            plain,
            source: Some(LyricsSource::Lrclib),
        },
        synced_lrc: synced,
    })
}

/// `?a=1&b=2`, omitting empty values and encoding the rest.
///
/// Empty parameters are dropped rather than sent blank because that is what the
/// `lrclib-api` package did, and LRCLIB treats a present-but-empty `artist_name`
/// as a constraint rather than as an absent one.
fn query_string(params: &[(&str, String)]) -> String {
    let pairs: Vec<String> = params
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, value)| format!("{name}={}", encode_uri_component(value)))
        .collect();

    if pairs.is_empty() {
        String::new()
    } else {
        format!("?{}", pairs.join("&"))
    }
}

/// Seconds, as the number JavaScript would have stringified.
///
/// v1 handed the package milliseconds (`Math.round(duration * 1000)`) and the
/// package divided by 1000 on the way out, so the wire carries seconds rounded
/// to the nearest millisecond. Reproducing the round-trip rather than printing
/// the raw float keeps `245.60000000000002` off the URL.
fn format_duration(seconds: f64) -> String {
    let millis = (seconds * 1000.0).round();
    format!("{}", millis / 1000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_record_with_neither_form_of_lyrics_is_not_a_result() {
        assert!(
            into_result(LrclibRecord {
                synced_lyrics: None,
                plain_lyrics: None,
            })
            .is_none()
        );
    }

    /// Empty strings are absence, not content. v1's `|| null` collapsed them.
    #[test]
    fn empty_lyric_strings_are_treated_as_absent() {
        assert!(
            into_result(LrclibRecord {
                synced_lyrics: Some(String::new()),
                plain_lyrics: Some(String::new()),
            })
            .is_none()
        );
    }

    #[test]
    fn synced_text_is_parsed_and_plain_text_is_passed_through() {
        let found = into_result(LrclibRecord {
            synced_lyrics: Some("[00:01.00]Hi".to_owned()),
            plain_lyrics: Some("Hi".to_owned()),
        })
        .expect("a result");

        assert_eq!(found.result.source, Some(LyricsSource::Lrclib));
        assert_eq!(found.result.synced.as_ref().map(Vec::len), Some(1));
        assert_eq!(found.result.plain.as_deref(), Some("Hi"));
    }

    /// The raw document is kept beside the parsed one, unaltered. Write-back
    /// copies these bytes to the sidecar, so anything this pass normalised
    /// would be normalised into the user's file too.
    #[test]
    fn the_raw_synced_document_is_carried_alongside_the_parsed_one() {
        let found = into_result(LrclibRecord {
            // Two timestamps on one line and a three-digit fraction: both are
            // shapes a re-render from the parsed lines could not reproduce.
            synced_lyrics: Some("[00:02.03][00:01.000]Refrain\r\n".to_owned()),
            plain_lyrics: None,
        })
        .expect("a result");

        assert_eq!(
            found.synced_lrc.as_deref(),
            Some("[00:02.03][00:01.000]Refrain\r\n")
        );
        assert_eq!(
            found.result.synced.as_ref().map(Vec::len),
            Some(2),
            "the parsed view still expands the refrain"
        );
    }

    /// A record with only plain text carries no document to write back — the
    /// sidecar lane is synced-only, so `None` here is what stops it.
    #[test]
    fn a_plain_only_record_carries_no_raw_document() {
        let found = into_result(LrclibRecord {
            synced_lyrics: None,
            plain_lyrics: Some("Just words".to_owned()),
        })
        .expect("a result");

        assert_eq!(found.synced_lrc, None);
    }

    #[test]
    fn empty_parameters_are_omitted_entirely() {
        let query = query_string(&[
            ("track_name", "Song".to_owned()),
            ("artist_name", String::new()),
            ("album_name", "Album".to_owned()),
        ]);
        assert_eq!(query, "?track_name=Song&album_name=Album");
    }

    #[test]
    fn an_all_empty_parameter_set_produces_no_query_string() {
        assert_eq!(query_string(&[("q", String::new())]), "");
    }

    #[test]
    fn parameter_values_are_percent_encoded() {
        assert_eq!(
            query_string(&[("q", "Song & Dance".to_owned())]),
            "?q=Song%20%26%20Dance"
        );
    }

    /// Seconds on the wire, not milliseconds: v1 multiplied by 1000 only
    /// because the package it called divided by 1000 again.
    #[test]
    fn duration_is_formatted_as_seconds_rounded_to_milliseconds() {
        assert_eq!(format_duration(245.0), "245");
        assert_eq!(format_duration(245.6), "245.6");
        assert_eq!(format_duration(245.60000000000002), "245.6");
        assert_eq!(format_duration(3.7777), "3.778");
    }
}
