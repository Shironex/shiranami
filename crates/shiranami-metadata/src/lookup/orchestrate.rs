//! Choosing and combining lookup backends.
//!
//! Ported from `lookupMetadata` and `downloadImage` in
//! `apps/desktop/src/main/services/metadata-lookup.ts`.
//!
//! # Why the YouTube fallback is a trait
//!
//! v1's `lookupMetadata` falls back to `yt-dlp --dump-json ytsearch1:…` for a
//! thumbnail when iTunes has no cover. yt-dlp lives in the downloader crate,
//! which sits *above* this one in the spine, so calling it from here would
//! invert the layering. It arrives as [`LookupFallback`] instead, supplied by
//! the composition root — the same inversion `shiranami-core::paths` uses for
//! `PathAuthority` and `shiranami-net` uses for `Resolver`.
//!
//! Pass `None` and the lookup is iTunes-only, which is a complete and useful
//! configuration: it is what Phase 9's scope names, and the fallback only ever
//! contributed cover art.

use std::future::Future;
use std::pin::Pin;

use shiranami_net::{HttpClient, RequestOptions};

use crate::error::Result;
use crate::lookup::clean::{clean_title_for_search, split_artist_and_title};
use crate::lookup::itunes::{self, MIN_CONFIDENCE};
use crate::lookup::model::{LookupSource, MetadataLookupResult};

/// Timeout for a cover download. v1's `IMAGE_TIMEOUT_MS`.
const IMAGE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Size ceiling for a cover download. v1's `IMAGE_MAX_SIZE`.
const IMAGE_MAX_BYTES: u64 = 10 * 1024 * 1024;

/// A boxed future, so [`LookupFallback`] stays object-safe.
pub type FallbackFuture<'a> = Pin<Box<dyn Future<Output = Option<FallbackMatch>> + Send + 'a>>;

/// What a fallback backend can contribute.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FallbackMatch {
    /// A cover URL, which is the only thing v1's fallback ever supplied.
    pub cover_image_url: Option<String>,
}

/// A secondary lookup, consulted when iTunes has no cover.
pub trait LookupFallback: Send + Sync {
    /// Search for `query`, which is already `"Artist - Cleaned Title"`.
    fn search<'a>(&'a self, query: &'a str) -> FallbackFuture<'a>;
}

/// Look a track up, combining backends the way v1 did.
///
/// 1. Split `Artist - Title` when the track's own artist is useless.
/// 2. Ask iTunes; accept the result only at or above [`MIN_CONFIDENCE`].
/// 3. If a fallback is configured, ask it too.
/// 4. Merge: iTunes keeps the text fields, the fallback supplies a cover if
///    iTunes had none, and the source becomes `youtube` only when the fallback
///    is what produced the cover.
pub async fn lookup(
    client: &HttpClient,
    title: &str,
    artist: &str,
    fallback: Option<&dyn LookupFallback>,
) -> Result<MetadataLookupResult> {
    lookup_at(client, title, artist, fallback, itunes::ENDPOINT).await
}

/// [`lookup`], against a caller-supplied iTunes base URL.
///
/// Exists so a batch can be driven against a loopback server; production
/// callers want [`lookup`].
pub async fn lookup_at(
    client: &HttpClient,
    title: &str,
    artist: &str,
    fallback: Option<&dyn LookupFallback>,
    itunes_endpoint: &str,
) -> Result<MetadataLookupResult> {
    let (search_artist, search_title) = split_artist_and_title(title, artist);

    let itunes = itunes::search_at(client, &search_title, &search_artist, itunes_endpoint).await?;
    let itunes = (itunes.is_match() && itunes.confidence >= MIN_CONFIDENCE).then_some(itunes);

    let Some(fallback) = fallback else {
        return Ok(itunes.unwrap_or_else(MetadataLookupResult::none));
    };

    // v1 skips the fallback entirely when iTunes already produced a cover; the
    // fallback exists to fill that one gap and costs a subprocess.
    if itunes
        .as_ref()
        .is_some_and(|result| result.cover_image_url.is_some())
    {
        return Ok(itunes.unwrap_or_else(MetadataLookupResult::none));
    }

    // The dash form, unlike the iTunes query's space form. v1 builds this one
    // as `` `${artist} - ${cleanedTitle}` ``.
    let cleaned = clean_title_for_search(&search_title, &search_artist);
    let query = format!("{search_artist} - {cleaned}");

    let found = fallback.search(&query).await;

    Ok(merge(itunes, found))
}

/// Combine an iTunes result with whatever the fallback found.
fn merge(
    itunes: Option<MetadataLookupResult>,
    fallback: Option<FallbackMatch>,
) -> MetadataLookupResult {
    let cover = fallback.and_then(|found| found.cover_image_url);

    match (itunes, cover) {
        (Some(mut itunes), Some(cover)) => {
            itunes.cover_image_url = Some(cover);
            // v1 flips the source to `youtube` when the cover came from there,
            // even though every text field is still iTunes'. The renderer shows
            // it as provenance for the *artwork*, which is the part the user
            // can see.
            itunes.source = LookupSource::Youtube;
            // `Math.max` of the two confidences, and v1 hardcodes the
            // fallback's at MIN_CONFIDENCE.
            itunes.confidence = itunes.confidence.max(MIN_CONFIDENCE);
            itunes
        }
        (Some(itunes), None) => itunes,
        (None, Some(cover)) => MetadataLookupResult {
            cover_image_url: Some(cover),
            source: LookupSource::Youtube,
            confidence: MIN_CONFIDENCE,
            ..MetadataLookupResult::none()
        },
        (None, None) => MetadataLookupResult::none(),
    }
}

/// Download a cover image, through the SSRF guard.
///
/// The URL comes from an upstream API response, which is precisely the
/// untrusted-input case `RequestOptions::guarded()` exists for — v1 called
/// `isStreamUrlAllowed` here for the same reason. The size and time ceilings
/// are v1's.
pub async fn download_cover(client: &HttpClient, url: &str) -> Result<Vec<u8>> {
    let options = RequestOptions::guarded()
        .with_timeout(IMAGE_TIMEOUT)
        .with_max_bytes(IMAGE_MAX_BYTES);

    Ok(client.bytes(url, options).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn itunes_result(cover: Option<&str>) -> MetadataLookupResult {
        MetadataLookupResult {
            title: Some("Belgium".to_owned()),
            artist: Some("Lil Peep".to_owned()),
            album: Some("An Album".to_owned()),
            genre: Some("Hip-Hop".to_owned()),
            year: Some(2018),
            track_number: Some(4),
            cover_image_url: cover.map(str::to_owned),
            source: LookupSource::Itunes,
            confidence: 0.9,
        }
    }

    #[test]
    fn a_fallback_cover_is_adopted_and_credited() {
        let merged = merge(
            Some(itunes_result(None)),
            Some(FallbackMatch {
                cover_image_url: Some("https://i.ytimg.com/x.jpg".to_owned()),
            }),
        );

        assert_eq!(
            merged.cover_image_url.as_deref(),
            Some("https://i.ytimg.com/x.jpg")
        );
        assert_eq!(merged.source, LookupSource::Youtube);
        // The text fields stay iTunes'.
        assert_eq!(merged.album.as_deref(), Some("An Album"));
        assert!((merged.confidence - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn a_fallback_that_found_nothing_leaves_the_itunes_result_intact() {
        let merged = merge(Some(itunes_result(None)), Some(FallbackMatch::default()));

        assert_eq!(merged.source, LookupSource::Itunes);
        assert_eq!(merged.cover_image_url, None);
    }

    #[test]
    fn a_fallback_cover_alone_is_a_low_confidence_youtube_result() {
        let merged = merge(
            None,
            Some(FallbackMatch {
                cover_image_url: Some("https://i.ytimg.com/x.jpg".to_owned()),
            }),
        );

        assert_eq!(merged.source, LookupSource::Youtube);
        assert!((merged.confidence - MIN_CONFIDENCE).abs() < f64::EPSILON);
        assert_eq!(merged.artist, None, "there is no text data to report");
    }

    #[test]
    fn nothing_anywhere_is_the_none_result() {
        assert!(!merge(None, None).is_match());
        assert!(!merge(None, Some(FallbackMatch::default())).is_match());
    }
}
