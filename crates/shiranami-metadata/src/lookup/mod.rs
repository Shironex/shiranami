//! Finding tags for a track that has none worth keeping.
//!
//! Ported from `apps/desktop/src/main/services/metadata-lookup.ts`: the search-
//! title cleaner ([`clean`]), the iTunes Search API ([`itunes`]), and the
//! orchestration that combines them ([`orchestrate`]).
//!
//! Requests ride `shiranami-net`'s client, so the 500 ms `itunes.apple.com`
//! gate and the 429 back-off v1 configured are inherited rather than rebuilt.

pub mod clean;
pub mod itunes;
pub mod model;
pub mod orchestrate;

pub use clean::{clean_title_for_search, split_artist_and_title};
pub use itunes::MIN_CONFIDENCE;
pub use model::{LookupSource, MetadataLookupResult};
pub use orchestrate::{FallbackFuture, FallbackMatch, LookupFallback, download_cover, lookup};
