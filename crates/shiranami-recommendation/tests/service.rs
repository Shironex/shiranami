//! The I/O half against a real database.
//!
//! `core`'s suites prove the scoring; these prove the **adapter** — that the
//! rows this crate reads fold into the shapes the scorer was tested with, and
//! that the shelf cache behaves the way v1's did around staleness and
//! invalidation.
//!
//! Two of them close the loop with `golden.json`. That fixture records
//! TypeScript's inputs *and* outputs, and `golden_vectors.rs` replays the
//! recorded inputs through the Rust core. What it cannot show is that a real
//! database produces those inputs in the first place — so
//! [`library_stats_reproduces_the_recorded_typescript_inputs`] seeds SQL that
//! must yield the recorded `stats`, and
//! [`smart_mixes_match_the_recorded_typescript_output`] drives the whole
//! adapter-plus-core path and compares against the recorded mixes. Composed with
//! the existing vectors, the pipeline is golden-verified end to end.
//!
//! [`library_stats_reproduces_the_recorded_typescript_inputs`]:
//!     fn.library_stats_reproduces_the_recorded_typescript_inputs.html
//! [`smart_mixes_match_the_recorded_typescript_output`]:
//!     fn.smart_mixes_match_the_recorded_typescript_output.html

use std::collections::HashMap;

use serde::Deserialize;
use shiranami_core::models::{
    RecommendationKind, SmartMixResult, SmartMixSignals, SmartMixWeather,
};
use shiranami_core::time::instant;
use shiranami_db::repo::recommendations as repo;
use shiranami_recommendation::core::TrackStats;
use shiranami_recommendation::service;
use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqliteConnection, SqlitePool};
use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Fixture.
// ---------------------------------------------------------------------------

/// An open database and its one connection.
///
/// The pool holds exactly one connection, so a fixture that acquired twice
/// would hang rather than fail. This acquires once at construction and hands
/// out `&mut` borrows, the same shape `shiranami-db`'s own fixtures use.
struct Fixture {
    _dir: TempDir,
    _pool: SqlitePool,
    connection: PoolConnection<Sqlite>,
}

impl Fixture {
    fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }
}

/// A real database on the app's own boot path, so the schema under test is the
/// one the baseline migration produces.
async fn fresh() -> Fixture {
    let dir = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
        .await
        .expect("a fresh database opens");
    let connection = opened.pool.acquire().await.expect("the one connection");

    Fixture {
        _dir: dir,
        _pool: opened.pool,
        connection,
    }
}

/// An instant the fixtures hang their timestamps off.
const NOW: &str = "2026-06-15T12:00:00.000Z";

fn now_ms() -> i64 {
    instant::parse_iso8601_ms(NOW).expect("a known instant")
}

/// Insert a track. Every column the recommendation reads touch is nameable.
#[expect(clippy::too_many_arguments, reason = "one argument per read column")]
async fn track(
    conn: &mut SqliteConnection,
    id: &str,
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
    album_art: Option<&str>,
    is_favorite: bool,
    genre: Option<&str>,
    year: Option<i64>,
    play_count: i64,
) {
    sqlx::query(
        "INSERT INTO tracks (id, file_path, title, artist, album, album_art, is_favorite, \
                             genre, year, play_count) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )
    .bind(id)
    .bind(format!("/music/{id}.mp3"))
    .bind(title)
    .bind(artist)
    .bind(album)
    .bind(album_art)
    .bind(is_favorite)
    .bind(genre)
    .bind(year)
    .bind(play_count)
    .execute(conn)
    .await
    .unwrap_or_else(|error| panic!("seed track `{id}`: {error}"));
}

/// The minimal track the ranking tests need.
async fn plain_track(conn: &mut SqliteConnection, id: &str, artist: &str) {
    track(
        conn,
        id,
        id,
        Some(artist),
        Some("Album"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
}

/// Insert one play.
async fn play(
    conn: &mut SqliteConnection,
    id: &str,
    track_id: &str,
    played_at: &str,
    completion: f64,
) {
    sqlx::query(
        "INSERT INTO play_history \
           (id, track_id, played_at, played_seconds, completion_ratio, completed, source) \
         VALUES (?1, ?2, ?3, 100.0, ?4, ?5, 'library')",
    )
    .bind(id)
    .bind(track_id)
    .bind(played_at)
    .bind(completion)
    .bind(completion >= 0.95)
    .execute(conn)
    .await
    .unwrap_or_else(|error| panic!("seed play `{id}`: {error}"));
}

/// The library shelf's track ids, in shelf order.
async fn shelf_ids(fixture: &mut Fixture) -> Vec<String> {
    service::shelves(fixture.conn(), now_ms())
        .await
        .expect("shelves")
        .library
        .items
        .into_iter()
        .map(|item| item.track_id)
        .collect()
}

// ---------------------------------------------------------------------------
// The library shelf.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn an_empty_library_yields_two_empty_stale_shelves() {
    let mut fixture = fresh().await;

    let shelves = service::shelves(fixture.conn(), now_ms())
        .await
        .expect("shelves");

    assert!(shelves.library.items.is_empty());
    assert!(shelves.discover.items.is_empty());
    assert_eq!(shelves.library.kind, RecommendationKind::Library);
    assert_eq!(shelves.discover.kind, RecommendationKind::Discover);
    assert!(
        shelves.discover.stale,
        "never generated is stale, so the renderer can say so"
    );
}

/// The whole point of the shelf: more plays, more recent, ranks higher.
#[tokio::test]
async fn the_library_shelf_ranks_by_affinity() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "heavy", "Aoi").await;
    plain_track(fixture.conn(), "light", "Aoi").await;

    for index in 0..5 {
        play(
            fixture.conn(),
            &format!("h{index}"),
            "heavy",
            "2026-06-14T12:00:00.000Z",
            1.0,
        )
        .await;
    }
    play(
        fixture.conn(),
        "l1",
        "light",
        "2026-06-14T12:00:00.000Z",
        1.0,
    )
    .await;

    assert_eq!(shelf_ids(&mut fixture).await, vec!["heavy", "light"]);
}

/// A track with no plays never reaches the shelf — the `INNER JOIN` and the
/// scorer's `plays == 0` guard agree, so a freshly imported library produces an
/// empty shelf rather than an arbitrary one.
#[tokio::test]
async fn a_never_played_track_is_not_recommended() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "unplayed", "Aoi").await;

    assert!(shelf_ids(&mut fixture).await.is_empty());
}

#[tokio::test]
async fn the_shelf_carries_the_cover_art_the_track_has() {
    let mut fixture = fresh().await;
    track(
        fixture.conn(),
        "with",
        "With",
        Some("Aoi"),
        Some("Album"),
        Some("abc.jpg"),
        false,
        None,
        None,
        0,
    )
    .await;
    track(
        fixture.conn(),
        "without",
        "Without",
        Some("Aoi"),
        Some("Album"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    play(
        fixture.conn(),
        "h1",
        "with",
        "2026-06-14T12:00:00.000Z",
        1.0,
    )
    .await;
    play(
        fixture.conn(),
        "h2",
        "without",
        "2026-06-14T12:00:00.000Z",
        1.0,
    )
    .await;

    let items = service::shelves(fixture.conn(), now_ms())
        .await
        .expect("shelves")
        .library
        .items;

    let art: HashMap<String, Option<String>> = items
        .into_iter()
        .map(|item| (item.track_id, item.album_art))
        .collect();

    assert_eq!(art["with"], Some("abc.jpg".to_owned()));
    assert_eq!(art["without"], None, "a miss is None, never an empty URL");
}

/// Reading twice must not recompute: the second call finds a fresh row and
/// serves it, which is what keeps mounting the shelf cheap.
#[tokio::test]
async fn a_fresh_shelf_is_served_from_the_cache_rather_than_recomputed() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;
    play(fixture.conn(), "h1", "t1", "2026-06-14T12:00:00.000Z", 1.0).await;

    let first = service::shelves(fixture.conn(), now_ms())
        .await
        .expect("first read");
    assert!(!first.library.stale);

    // A minute later, still inside the 24-hour TTL.
    let second = service::shelves(fixture.conn(), now_ms() + 60_000)
        .await
        .expect("second read");

    assert_eq!(
        first.library.generated_at, second.library.generated_at,
        "a fresh shelf was recomputed anyway — the TTL is not being read"
    );
}

/// The user pressed refresh, so "not stale yet" is not an answer. This is the
/// one behaviour that separates `refresh` from `get`.
#[tokio::test]
async fn refresh_recomputes_a_shelf_that_is_not_yet_stale() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;
    play(fixture.conn(), "h1", "t1", "2026-06-14T12:00:00.000Z", 1.0).await;

    let first = service::shelves(fixture.conn(), now_ms())
        .await
        .expect("populate the cache");
    let refreshed = service::refresh(fixture.conn(), now_ms() + 60_000)
        .await
        .expect("refresh");

    assert_ne!(first.library.generated_at, refreshed.library.generated_at);
    assert!(!refreshed.library.stale);
}

/// Producing the discover shelf spawns yt-dlp, so neither read path may do it.
/// The shelf is served from its cache with its real staleness — deferred, not
/// faked.
#[tokio::test]
async fn neither_read_path_recomputes_the_discover_shelf() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;
    play(fixture.conn(), "h1", "t1", "2026-06-14T12:00:00.000Z", 1.0).await;

    for shelves in [
        service::shelves(fixture.conn(), now_ms())
            .await
            .expect("get"),
        service::refresh(fixture.conn(), now_ms())
            .await
            .expect("refresh"),
    ] {
        assert!(shelves.discover.items.is_empty());
        assert_eq!(shelves.discover.generated_at, None);
        assert!(shelves.discover.stale);
    }
}

/// A cached discover shelf is passed through untouched by both paths, so the
/// deferral costs nothing once Phase 16 starts writing one.
#[tokio::test]
async fn a_cached_discover_shelf_survives_a_library_refresh() {
    let mut fixture = fresh().await;
    let payload = r#"[{"youtubeId":"abc","title":"T","uploader":"U","thumbnail":"th","url":"u"}]"#;
    repo::write_shelf(fixture.conn(), "discover", payload, NOW)
        .await
        .expect("seed the discover cache");

    let shelves = service::refresh(fixture.conn(), now_ms())
        .await
        .expect("refresh");

    assert_eq!(shelves.discover.items.len(), 1);
    assert_eq!(shelves.discover.items[0].youtube_id, "abc");
    assert_eq!(shelves.discover.generated_at.as_deref(), Some(NOW));
    assert!(!shelves.discover.stale);
}

/// v1 marked an unreadable payload `valid: false` and served an empty, stale
/// shelf. A row that errored the channel instead would make one corrupt cache
/// write break the screen until someone cleared it by hand.
#[tokio::test]
async fn an_unreadable_cached_payload_is_an_empty_stale_shelf_not_a_failure() {
    let mut fixture = fresh().await;
    repo::write_shelf(fixture.conn(), "discover", "{not json", NOW)
        .await
        .expect("seed a corrupt row");

    let shelves = service::shelves(fixture.conn(), now_ms())
        .await
        .expect("the read still succeeds");

    assert!(shelves.discover.items.is_empty());
    assert!(shelves.discover.stale);
}

// ---------------------------------------------------------------------------
// Not interested.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn marking_a_track_not_interested_drops_it_from_the_next_shelf() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "keep", "Aoi").await;
    plain_track(fixture.conn(), "drop", "Other").await;
    play(
        fixture.conn(),
        "h1",
        "keep",
        "2026-06-14T12:00:00.000Z",
        1.0,
    )
    .await;
    play(
        fixture.conn(),
        "h2",
        "drop",
        "2026-06-14T12:00:00.000Z",
        1.0,
    )
    .await;

    assert_eq!(shelf_ids(&mut fixture).await.len(), 2);

    service::mark_not_interested(fixture.conn(), "n1", "drop")
        .await
        .expect("mark");

    assert_eq!(
        shelf_ids(&mut fixture).await,
        vec!["keep"],
        "the mark must be visible immediately — the cached shelf is dropped, \
         not left to age out over a day"
    );
}

#[tokio::test]
async fn undoing_the_mark_brings_the_track_back() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;
    play(fixture.conn(), "h1", "t1", "2026-06-14T12:00:00.000Z", 1.0).await;

    service::mark_not_interested(fixture.conn(), "n1", "t1")
        .await
        .expect("mark");
    assert!(shelf_ids(&mut fixture).await.is_empty());

    service::undo_not_interested(fixture.conn(), "t1")
        .await
        .expect("undo");

    assert_eq!(shelf_ids(&mut fixture).await, vec!["t1"]);
}

/// The context menu can outlive the row it was opened on, and there is nothing
/// a user could do about "that track is gone" except be interrupted by it.
#[tokio::test]
async fn marking_a_track_that_is_gone_is_a_silent_no_op() {
    let mut fixture = fresh().await;

    service::mark_not_interested(fixture.conn(), "n1", "vanished")
        .await
        .expect("a missing track is not an error");

    assert!(
        repo::disliked_track_ids(fixture.conn())
            .await
            .expect("read")
            .is_empty(),
        "no orphan signal row was written"
    );
}

/// The artist-level penalty has to survive the track being retagged, so the
/// artist is copied into the signal row at write time rather than joined later.
#[tokio::test]
async fn a_marks_artist_is_denormalised_at_write_time() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;

    service::mark_not_interested(fixture.conn(), "n1", "t1")
        .await
        .expect("mark");

    let counts = repo::artist_dislike_counts(fixture.conn())
        .await
        .expect("count");
    assert_eq!(counts.get("Aoi"), Some(&1));
}

/// Invalidation is scoped to the library shelf; recomputing discover spawns
/// yt-dlp, so a context-menu click must not trigger it.
#[tokio::test]
async fn marking_a_track_leaves_the_discover_cache_alone() {
    let mut fixture = fresh().await;
    plain_track(fixture.conn(), "t1", "Aoi").await;
    repo::write_shelf(fixture.conn(), "discover", "[]", NOW)
        .await
        .expect("seed the discover cache");

    service::mark_not_interested(fixture.conn(), "n1", "t1")
        .await
        .expect("mark");

    assert!(
        repo::read_shelf(fixture.conn(), "discover")
            .await
            .expect("read")
            .is_some()
    );
}

// ---------------------------------------------------------------------------
// Similar tracks.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_seed_that_is_gone_yields_an_empty_list_rather_than_an_error() {
    let mut fixture = fresh().await;

    let similar = service::similar_tracks(fixture.conn(), "vanished")
        .await
        .expect("the channel still resolves");

    assert!(similar.is_empty());
}

#[tokio::test]
async fn the_same_artist_outranks_the_same_album_and_the_seed_is_excluded() {
    let mut fixture = fresh().await;
    // Artist is worth 3, album 2, so `same_artist` must come first.
    track(
        fixture.conn(),
        "seed",
        "Seed",
        Some("Aoi"),
        Some("Nocturne"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    track(
        fixture.conn(),
        "same_artist",
        "A",
        Some("Aoi"),
        Some("Other"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    track(
        fixture.conn(),
        "same_album",
        "B",
        Some("Other"),
        Some("Nocturne"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    track(
        fixture.conn(),
        "unrelated",
        "C",
        Some("Nobody"),
        Some("Nothing"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;

    let similar = service::similar_tracks(fixture.conn(), "seed")
        .await
        .expect("rank");

    let ids: Vec<&str> = similar
        .iter()
        .map(|entry| entry.track_id.as_str())
        .collect();
    assert_eq!(ids, vec!["same_artist", "same_album"]);
    assert!((similar[0].similarity - 3.0).abs() < f64::EPSILON);
    assert!((similar[1].similarity - 2.0).abs() < f64::EPSILON);
}

/// Playlist co-membership is a signal in its own right, so a track sharing
/// nothing but a playlist still surfaces.
#[tokio::test]
async fn playlist_co_membership_alone_makes_a_track_similar() {
    let mut fixture = fresh().await;
    track(
        fixture.conn(),
        "seed",
        "Seed",
        Some("Aoi"),
        Some("Nocturne"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    track(
        fixture.conn(),
        "friend",
        "Friend",
        Some("Other"),
        Some("Other"),
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    sqlx::query("INSERT INTO playlists (id, name) VALUES ('p1', 'Mix')")
        .execute(fixture.conn())
        .await
        .expect("seed a playlist");
    sqlx::query(
        "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) \
         VALUES ('m1', 'p1', 'seed', 0), ('m2', 'p1', 'friend', 1)",
    )
    .execute(fixture.conn())
    .await
    .expect("seed memberships");

    let similar = service::similar_tracks(fixture.conn(), "seed")
        .await
        .expect("rank");

    assert_eq!(similar.len(), 1);
    assert_eq!(similar[0].track_id, "friend");
    assert!((similar[0].similarity - 1.0).abs() < f64::EPSILON);
}

/// An untagged seed in no playlist can match nothing, and must not therefore
/// match *everything*: the sentinel guard is what stops the prefilter from
/// returning the whole library.
#[tokio::test]
async fn an_untagged_seed_matches_nothing_rather_than_everything() {
    let mut fixture = fresh().await;
    track(
        fixture.conn(),
        "seed",
        "Seed",
        None,
        None,
        None,
        false,
        None,
        None,
        0,
    )
    .await;
    for id in ["a", "b"] {
        track(
            fixture.conn(),
            id,
            id,
            None,
            None,
            None,
            false,
            None,
            None,
            0,
        )
        .await;
    }

    let similar = service::similar_tracks(fixture.conn(), "seed")
        .await
        .expect("rank");

    assert!(similar.is_empty());
}

/// The sentinel is a real string in the column, and treating it as a tag would
/// make every unscanned track "similar" to every other.
#[tokio::test]
async fn the_unknown_artist_sentinel_is_not_treated_as_a_tag() {
    let mut fixture = fresh().await;
    for id in ["seed", "other"] {
        track(
            fixture.conn(),
            id,
            id,
            Some(shiranami_core::constants::UNKNOWN_ARTIST),
            Some(shiranami_core::constants::UNKNOWN_ALBUM),
            None,
            false,
            None,
            None,
            0,
        )
        .await;
    }

    let similar = service::similar_tracks(fixture.conn(), "seed")
        .await
        .expect("rank");

    assert!(similar.is_empty());
}

// ---------------------------------------------------------------------------
// Discovery seeds.
// ---------------------------------------------------------------------------

/// The ordering decision the fetch half depends on: seeds resolve in affinity
/// order, so the strongest seed's mix wins the dedupe. A SQL join would hand
/// back database order and silently change which mix the shelf is built from.
#[tokio::test]
async fn discovery_seeds_keep_affinity_order_and_drop_the_unmapped() {
    let mut fixture = fresh().await;
    for (id, plays) in [("strong", 5), ("weak", 1), ("unmapped", 3)] {
        plain_track(fixture.conn(), id, "Aoi").await;
        for index in 0..plays {
            play(
                fixture.conn(),
                &format!("{id}-{index}"),
                id,
                "2026-06-14T12:00:00.000Z",
                1.0,
            )
            .await;
        }
    }
    shiranami_db::repo::youtube_mappings::upsert(fixture.conn(), "strong", "STRONG")
        .await
        .expect("map");
    shiranami_db::repo::youtube_mappings::upsert(fixture.conn(), "weak", "WEAK")
        .await
        .expect("map");

    let seeds = service::discover_seed_youtube_ids(fixture.conn(), now_ms())
        .await
        .expect("select seeds");

    assert_eq!(
        seeds,
        vec!["STRONG".to_owned(), "WEAK".to_owned()],
        "affinity order, with the unmapped track dropped rather than searched"
    );
}

// ---------------------------------------------------------------------------
// Golden vectors, through the adapter.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Golden {
    now_ms: i64,
    affinity: Vec<AffinityCase>,
    mix_tracks: Vec<GoldenMixTrack>,
    mixes: Vec<MixCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AffinityCase {
    stats: GoldenStats,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GoldenStats {
    track_id: String,
    title: String,
    artist: String,
    album: String,
    plays: u32,
    avg_completion: f64,
    last_played_at: String,
    is_favorite: bool,
    is_disliked: bool,
    artist_dislikes: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenMixTrack {
    track_id: String,
    genre: Option<String>,
    year: Option<i64>,
    play_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MixCase {
    hour: u8,
    weather: Option<SmartMixWeather>,
    mixes: Vec<SmartMixResult>,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("fixtures/golden.json")).expect("golden.json parses")
}

impl From<&GoldenStats> for TrackStats {
    fn from(recorded: &GoldenStats) -> Self {
        Self {
            track_id: recorded.track_id.clone(),
            title: recorded.title.clone(),
            artist: recorded.artist.clone(),
            album: recorded.album.clone(),
            plays: recorded.plays,
            avg_completion: recorded.avg_completion,
            last_played_at: recorded.last_played_at.clone(),
            is_favorite: recorded.is_favorite,
            is_disliked: recorded.is_disliked,
            artist_dislikes: recorded.artist_dislikes,
        }
    }
}

/// Whether a recorded stats row is reachable through SQL at all.
///
/// Two combinations the fixture contains are unrepresentable, and both are
/// unrepresentable for a *reason* rather than by accident, which is why they
/// are filtered rather than worked around:
///
/// - `plays == 0`. The aggregate is `COUNT(*)` over an `INNER JOIN`, so a row
///   only exists once there is at least one play. TypeScript could be handed a
///   zero because its input was a plain object; SQL cannot produce one.
/// - An untagged artist with `artist_dislikes > 0`. The fold reads the count
///   only when the artist is a real tag, exactly as v1's `artist ? … : 0` did,
///   so an empty artist always folds to 0 marks.
fn representable(stats: &GoldenStats) -> bool {
    stats.plays > 0 && !(stats.artist.is_empty() && stats.artist_dislikes > 0)
}

/// Build the SQL that must aggregate back into `expected`, and assert it does.
///
/// `plays` play-history rows all at `avg_completion` so the `AVG` is that value
/// exactly rather than a rounding of it; the newest of them at `last_played_at`
/// so the `MAX` lands there; a signal row on the track itself for
/// `is_disliked`; and `artist_dislikes` further signals on otherwise-unplayed
/// tracks by the same artist. Those decoy tracks carry **no plays**, so the
/// `INNER JOIN` keeps them out of the aggregate while `artist_dislike_counts`
/// still sees them — which is exactly the asymmetry the fold is written around,
/// and the reason the decoys are worth seeding rather than stubbing.
async fn assert_aggregates_back_to(expected: &TrackStats) {
    let mut fixture = fresh().await;
    let artist = (!expected.artist.is_empty()).then_some(expected.artist.as_str());
    let album = (!expected.album.is_empty()).then_some(expected.album.as_str());

    track(
        fixture.conn(),
        &expected.track_id,
        &expected.title,
        artist,
        album,
        None,
        expected.is_favorite,
        None,
        None,
        0,
    )
    .await;

    let newest_ms =
        instant::parse_iso8601_ms(&expected.last_played_at).expect("a recorded instant");
    for play_index in 0..expected.plays {
        let at = if play_index == 0 {
            expected.last_played_at.clone()
        } else {
            shiranami_core::time::iso8601::from_epoch_millis(
                newest_ms - i64::from(play_index) * 86_400_000,
            )
        };
        play(
            fixture.conn(),
            &format!("{}-{play_index}", expected.track_id),
            &expected.track_id,
            &at,
            expected.avg_completion,
        )
        .await;
    }

    if expected.is_disliked {
        repo::add_negative_signal(
            fixture.conn(),
            "sig-self",
            &expected.track_id,
            artist,
            "context-menu",
        )
        .await
        .expect("dislike the track itself");
    }

    for decoy in 0..expected.artist_dislikes {
        let decoy_id = format!("decoy-{decoy}");
        track(
            fixture.conn(),
            &decoy_id,
            &decoy_id,
            artist,
            album,
            None,
            false,
            None,
            None,
            0,
        )
        .await;
        repo::add_negative_signal(
            fixture.conn(),
            &format!("sig-{decoy_id}"),
            &decoy_id,
            artist,
            "context-menu",
        )
        .await
        .expect("dislike the decoy");
    }

    let produced = service::library_stats(fixture.conn())
        .await
        .expect("aggregate");

    assert_eq!(
        produced.len(),
        1,
        "the decoys have no plays, so only the seeded track may aggregate"
    );
    assert_eq!(
        &produced[0], expected,
        "the SQL and the fold did not reproduce TypeScript's recorded input"
    );
}

/// The other half of the golden proof: that a real database produces the inputs
/// `golden_vectors.rs` replays.
///
/// `golden_vectors.rs` shows the Rust core turns the recorded `stats` into the
/// recorded scores. It cannot show that a database ever produces those stats —
/// its inputs are deserialized straight out of the fixture. This walks the same
/// sweep backwards: each recorded row becomes SQL, and the aggregate plus the
/// fold have to hand it back unchanged. Composed, every step from a
/// `play_history` row to a shelf position is covered by the same fixture.
///
/// **One case per database.** The sweep reuses artist names across cases, so a
/// shared database would let one case's decoy signals inflate another's
/// `artist_dislikes` — the first version of this test did exactly that and read
/// 20 marks where TypeScript recorded 1. Isolation is cheap here and the
/// alternative (rewriting the recorded artist names) would stop asserting the
/// values that were actually recorded.
#[tokio::test]
async fn library_stats_reproduces_the_recorded_typescript_inputs() {
    let golden = golden();

    let expected: Vec<TrackStats> = golden
        .affinity
        .iter()
        .map(|case| &case.stats)
        .filter(|stats| representable(stats))
        .map(TrackStats::from)
        .collect();

    assert!(
        expected.len() > 50,
        "the filter dropped too much of the sweep to be a meaningful check"
    );

    for stats in &expected {
        assert_aggregates_back_to(stats).await;
    }
}

/// The mix path end to end: recorded library rows in through SQL, recorded
/// mixes out. Every one of the 36 recorded `(hour, weather)` contexts is
/// replayed, so the time-of-day branches, all nine weather buckets, the decade
/// buckets and the content-dedupe order are all covered against TypeScript's
/// own output rather than against a re-derivation of it.
#[tokio::test]
async fn smart_mixes_match_the_recorded_typescript_output() {
    let golden = golden();
    let mut fixture = fresh().await;

    for recorded in &golden.mix_tracks {
        track(
            fixture.conn(),
            &recorded.track_id,
            &recorded.track_id,
            Some("Aoi"),
            Some("Album"),
            None,
            false,
            recorded.genre.as_deref(),
            recorded.year,
            recorded.play_count,
        )
        .await;
    }

    for case in &golden.mixes {
        let signals = SmartMixSignals {
            hour: case.hour,
            weather: case.weather,
        };

        let produced = service::smart_mixes(fixture.conn(), &signals)
            .await
            .expect("build the mixes");

        assert_eq!(
            produced, case.mixes,
            "hour {} / weather {:?}: the adapter-plus-core path diverged from \
             the recorded TypeScript output",
            case.hour, case.weather
        );
    }

    assert_eq!(golden.now_ms, 1_779_537_600_000, "the fixture moved");
}
