//! The two cached shelves: reading them, deciding they are stale, recomputing
//! the one that can be recomputed offline, and writing it back.

use super::discover::DiscoverPlan;
use super::stats;
use crate::core::{AffinityOptions, build_smart_mixes, select_seed_tracks};
use serde::Serialize;
use serde::de::DeserializeOwned;
use shiranami_core::models::{
    DiscoverRecommendation, DiscoverShelf, LibraryRecommendation, LibraryShelf,
    RECOMMENDATION_TTL_MS, RecommendationKind, RecommendationShelves, SmartMixResult,
    SmartMixSignals,
};
use shiranami_core::time::{instant, iso8601};
use shiranami_db::Result;
use shiranami_db::repo::{recommendations as repo, youtube_mappings};
use sqlx::SqliteConnection;

/// How many tracks the library shelf carries. v1's `LIBRARY_MAX_ITEMS`.
pub const LIBRARY_MAX_ITEMS: usize = 20;

/// How many seed tracks discovery fans out from. v1's `DISCOVER_SEED_COUNT`.
const DISCOVER_SEED_COUNT: usize = 3;

/// The `recommendations.kind` primary key for a shelf.
///
/// Spelled out rather than derived from [`RecommendationKind`]'s serde rename,
/// because it is a **database key** and not a wire encoding: the rows are
/// already on disk under these two strings, and a future `rename_all` change on
/// the enum must not silently orphan them. The two are asserted equal in the
/// tests, which is the honest way to have it both ways.
pub(super) const fn kind_key(kind: RecommendationKind) -> &'static str {
    match kind {
        RecommendationKind::Library => "library",
        RecommendationKind::Discover => "discover",
    }
}

/// A shelf as it came out of the cache, before it becomes a wire shelf.
struct Cached<T> {
    items: Vec<T>,
    generated_at: Option<String>,
    stale: bool,
}

/// Whether a shelf generated at `generated_at` has aged out.
///
/// Three ways to be stale and v1 had all three: never generated, a timestamp
/// that does not parse, and one older than the TTL. The middle case is not
/// paranoia — `generated_at` is a text column that a hand-edited or
/// partially-restored database can hold anything in, and treating an
/// unparseable instant as *fresh* would pin a shelf forever.
fn is_stale(generated_at: Option<&str>, now_ms: i64) -> bool {
    let Some(generated_at) = generated_at else {
        return true;
    };
    let Some(generated_ms) = instant::parse_iso8601_ms(generated_at) else {
        return true;
    };

    now_ms - generated_ms > RECOMMENDATION_TTL_MS
}

/// Read one shelf out of the cache.
///
/// An unparseable payload is **stale and empty**, not an error: v1 marked it
/// `valid: false` and served an empty shelf, because a shelf the renderer
/// cannot draw is a quiet empty state and never a toast. The row's own
/// `generated_at` is still reported, as v1 reported it, so the staleness the
/// caller sees is about the row rather than about the parse.
async fn read_shelf<T: DeserializeOwned>(
    conn: &mut SqliteConnection,
    kind: RecommendationKind,
    now_ms: i64,
) -> Result<Cached<T>> {
    let Some(row) = repo::read_shelf(conn, kind_key(kind)).await? else {
        return Ok(Cached {
            items: Vec::new(),
            generated_at: None,
            stale: true,
        });
    };

    let parsed: Option<Vec<T>> = serde_json::from_str(&row.payload).ok();
    let valid = parsed.is_some();

    Ok(Cached {
        items: parsed.unwrap_or_default(),
        stale: is_stale(Some(&row.generated_at), now_ms) || !valid,
        generated_at: Some(row.generated_at),
    })
}

/// Write one shelf into the cache, returning the instant it was stamped with.
async fn write_shelf<T: Serialize>(
    conn: &mut SqliteConnection,
    kind: RecommendationKind,
    items: &[T],
    now_ms: i64,
) -> Result<String> {
    let generated_at = iso8601::from_epoch_millis(now_ms);
    // Serialising a `Vec` of owned structs cannot fail, but `expect` here would
    // be a panic in a command; an empty array keeps the row writable and the
    // next read treats it as an empty shelf.
    let payload = serde_json::to_string(items).unwrap_or_else(|_| "[]".to_owned());

    repo::write_shelf(conn, kind_key(kind), &payload, &generated_at).await?;

    Ok(generated_at)
}

/// Rank the library by listening affinity and dress the top slice for the
/// shelf.
///
/// `now_ms` is the reference instant for the recency half-life. v1 read
/// `Date.now()` inside the scorer, which is why its decay could not be tested;
/// here it is the caller's, so a shelf can be scored as of a fixed time.
async fn compute_library_items(
    conn: &mut SqliteConnection,
    now_ms: i64,
) -> Result<Vec<LibraryRecommendation>> {
    let stats = stats::library_stats(&mut *conn).await?;

    // Every other knob stays defaulted, as v1 left them: it called
    // `rankByAffinity(stats)` with no options at all.
    let ranked = select_seed_tracks(
        &stats,
        LIBRARY_MAX_ITEMS,
        &AffinityOptions {
            now_ms: Some(now_ms),
            ..AffinityOptions::default()
        },
    );

    let ids: Vec<String> = ranked.iter().map(|track| track.track_id.clone()).collect();
    let art = repo::album_art_for(&mut *conn, &ids).await?;

    Ok(ranked
        .into_iter()
        .map(|track| LibraryRecommendation {
            album_art: art.get(&track.track_id).cloned(),
            track_id: track.track_id,
            title: track.title,
            artist: track.artist,
            album: track.album,
        })
        .collect())
}

/// Both shelves, recomputing the library one inline when it has aged out.
///
/// **Discover is never recomputed here**, as it was not in v1: producing it
/// spawns yt-dlp, and doing that on the read path would stall the shelf every
/// time the renderer mounted. It is served from the cache with its real
/// staleness flag, and [`refresh`] is the channel that asks for a new one.
///
/// A failed library recompute serves the cached shelf rather than failing the
/// channel. v1 wrapped the same recompute in a `try/catch` for the same reason:
/// a stale shelf is a worse shelf, and no shelf is a broken screen.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] only if reading the cache itself fails.
pub async fn shelves(conn: &mut SqliteConnection, now_ms: i64) -> Result<RecommendationShelves> {
    let mut library =
        read_shelf::<LibraryRecommendation>(&mut *conn, RecommendationKind::Library, now_ms)
            .await?;

    if library.stale {
        match recompute_library(&mut *conn, now_ms).await {
            Ok(fresh) => library = fresh,
            Err(error) => tracing::warn!(
                %error,
                "inline library recompute failed; serving the cached shelf"
            ),
        }
    }

    let discover =
        read_shelf::<DiscoverRecommendation>(&mut *conn, RecommendationKind::Discover, now_ms)
            .await?;

    Ok(assemble(library, discover))
}

/// Recompute the library shelf and cache it.
async fn recompute_library(
    conn: &mut SqliteConnection,
    now_ms: i64,
) -> Result<Cached<LibraryRecommendation>> {
    let items = compute_library_items(&mut *conn, now_ms).await?;
    let generated_at = write_shelf(&mut *conn, RecommendationKind::Library, &items, now_ms).await?;

    Ok(Cached {
        items,
        generated_at: Some(generated_at),
        stale: false,
    })
}

/// Recompute what can be recomputed from the database, then return both
/// shelves.
///
/// The library shelf is rebuilt **unconditionally**, which is the difference
/// between this and [`shelves`]: the user pressed refresh, so "it is not stale
/// yet" is not an answer.
///
/// The discover shelf is served from its cache, because rebuilding it spawns
/// processes and waits seconds for them — the caller drives that half through
/// [`discover_plan`], [`super::DiscoverFetcher::fetch`] and [`commit_discover`] with
/// no connection held. See [`DiscoverPlan`] for why that split exists.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if reading the cache fails.
pub async fn refresh(conn: &mut SqliteConnection, now_ms: i64) -> Result<RecommendationShelves> {
    let previous =
        read_shelf::<LibraryRecommendation>(&mut *conn, RecommendationKind::Library, now_ms)
            .await?;

    let library = match recompute_library(&mut *conn, now_ms).await {
        Ok(fresh) => fresh,
        Err(error) => {
            tracing::warn!(%error, "library refresh failed; serving the previous shelf");
            previous
        }
    };

    let discover =
        read_shelf::<DiscoverRecommendation>(&mut *conn, RecommendationKind::Discover, now_ms)
            .await?;

    Ok(assemble(library, discover))
}

/// Read everything the discover fan-out needs, in one pass.
///
/// Three reads and no processes: the seeds in affinity order, the library's
/// YouTube ids, and whether the cached shelf has aged out. The caller releases
/// the connection before fetching — see [`DiscoverPlan`].
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if any of the three reads fails.
pub async fn discover_plan(conn: &mut SqliteConnection, now_ms: i64) -> Result<DiscoverPlan> {
    let seeds = discover_seed_youtube_ids(&mut *conn, now_ms).await?;
    let library = youtube_mappings::all_youtube_ids(&mut *conn).await?;
    let cached = repo::read_shelf(&mut *conn, kind_key(RecommendationKind::Discover)).await?;

    Ok(DiscoverPlan {
        seeds,
        library,
        stale: is_stale(cached.as_ref().map(|row| row.generated_at.as_str()), now_ms),
    })
}

/// Cache a fetched discover shelf, and report what it looks like now.
///
/// An empty `items` is written rather than skipped, and that is v1's behaviour
/// rather than an oversight: `writeCacheRow('discover', [])` ran whenever the
/// fan-out found nothing — including when yt-dlp was absent — so an empty shelf
/// is a real, freshly-stamped answer. Skipping the write instead would pin the
/// previous shelf until the TTL and make "no results" indistinguishable from
/// "never refreshed".
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if the write fails.
pub async fn commit_discover(
    conn: &mut SqliteConnection,
    items: Vec<DiscoverRecommendation>,
    now_ms: i64,
) -> Result<DiscoverShelf> {
    let generated_at =
        write_shelf(&mut *conn, RecommendationKind::Discover, &items, now_ms).await?;
    tracing::info!(items = items.len(), "the discover refresh wrote a shelf");

    Ok(DiscoverShelf {
        kind: RecommendationKind::Discover,
        items,
        generated_at: Some(generated_at),
        stale: false,
    })
}

/// Put the two cached halves into the wire shape.
fn assemble(
    library: Cached<LibraryRecommendation>,
    discover: Cached<DiscoverRecommendation>,
) -> RecommendationShelves {
    RecommendationShelves {
        library: LibraryShelf {
            kind: RecommendationKind::Library,
            items: library.items,
            generated_at: library.generated_at,
            stale: library.stale,
        },
        discover: DiscoverShelf {
            kind: RecommendationKind::Discover,
            items: discover.items,
            generated_at: discover.generated_at,
            stale: discover.stale,
        },
    }
}

/// The YouTube ids discovery would fan out from, strongest seed first.
///
/// The half of `computeDiscoverItems` that needs no subprocess, ported now
/// because it is where the *ordering* decision lives and that decision is
/// observable: seeds are ranked by affinity, resolved through the mapping
/// cache, and kept **in affinity order**, so when two RD mixes offer the same
/// video the stronger seed's copy is the one that survives the dedupe.
/// Resolving them with a SQL join instead would hand back database order and
/// silently change which mix a shelf is built from.
///
/// Tracks with no cached mapping are dropped rather than searched, exactly as
/// v1 dropped them: discovery is a background nicety and must not spawn a
/// yt-dlp search per unmapped track.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if any read fails.
pub async fn discover_seed_youtube_ids(
    conn: &mut SqliteConnection,
    now_ms: i64,
) -> Result<Vec<String>> {
    let stats = stats::library_stats(&mut *conn).await?;
    let seeds = select_seed_tracks(
        &stats,
        DISCOVER_SEED_COUNT,
        &AffinityOptions {
            now_ms: Some(now_ms),
            ..AffinityOptions::default()
        },
    );

    let seed_ids: Vec<String> = seeds.iter().map(|track| track.track_id.clone()).collect();
    let mapped = youtube_mappings::get_many(&mut *conn, &seed_ids).await?;

    Ok(seed_ids
        .iter()
        .filter_map(|track_id| mapped.get(track_id).cloned())
        .collect())
}

/// The mood, weather and decade mixes for the current context.
///
/// Computed on every call and never cached, as v1 computed them: the inputs are
/// the hour and the weather, so a cached answer would be wrong within the hour,
/// and the whole thing is one table scan plus a sort.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if the library read fails.
pub async fn smart_mixes(
    conn: &mut SqliteConnection,
    signals: &SmartMixSignals,
) -> Result<Vec<SmartMixResult>> {
    let tracks = stats::mix_tracks(conn).await?;

    Ok(build_smart_mixes(&tracks, signals))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The database keys and the wire encoding must agree, but for different
    /// reasons — one names rows already on disk, the other names a TypeScript
    /// union. Asserting the equality is what lets [`kind_key`] be spelled out
    /// without the two silently drifting.
    #[test]
    fn the_cache_keys_match_the_wire_encoding_of_the_kind() {
        for kind in [RecommendationKind::Library, RecommendationKind::Discover] {
            let encoded = serde_json::to_string(&kind).expect("serialize the kind");

            assert_eq!(format!("\"{}\"", kind_key(kind)), encoded);
        }
    }

    #[test]
    fn a_shelf_that_was_never_generated_is_stale() {
        assert!(is_stale(None, 0));
    }

    /// A text column can hold anything, and treating an unreadable instant as
    /// fresh would pin the shelf forever.
    #[test]
    fn an_unparseable_timestamp_is_stale() {
        assert!(is_stale(Some("whenever"), 1_000));
        assert!(is_stale(Some(""), 1_000));
    }

    /// The TTL boundary, asserted exactly. v1's `Date.now() - ms > TTL` is a
    /// strict comparison, so a shelf exactly one TTL old is still fresh — the
    /// off-by-one that a `>=` would introduce is invisible except at the edge.
    #[test]
    fn the_ttl_boundary_is_exclusive_the_way_v1s_comparison_was() {
        let generated = "2026-06-01T00:00:00.000Z";
        let generated_ms = instant::parse_iso8601_ms(generated).expect("a known instant");

        assert!(!is_stale(Some(generated), generated_ms));
        assert!(!is_stale(
            Some(generated),
            generated_ms + RECOMMENDATION_TTL_MS
        ));
        assert!(is_stale(
            Some(generated),
            generated_ms + RECOMMENDATION_TTL_MS + 1
        ));
    }

    /// A clock that went backwards yields a negative age, which must not read
    /// as "very stale" — the subtraction is signed for exactly this reason.
    #[test]
    fn a_shelf_generated_in_the_future_is_not_stale() {
        let generated = "2026-06-01T00:00:00.000Z";
        let generated_ms = instant::parse_iso8601_ms(generated).expect("a known instant");

        assert!(!is_stale(Some(generated), generated_ms - 60_000));
    }
}
