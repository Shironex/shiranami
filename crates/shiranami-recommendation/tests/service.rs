//! The I/O half against a real database.
//!
//! `core`'s suites prove the scoring; these prove the **adapter** — that the
//! rows this crate reads fold into the shapes the scorer was tested with, and
//! that the shelf cache behaves the way v1's did around staleness and
//! invalidation.
//!
//! `service_golden.rs` covers the same adapter against `golden.json`, and is a
//! separate file only because one covering both grew past the module-shape cap.

use std::collections::HashMap;

use shiranami_core::models::RecommendationKind;
use shiranami_core::time::instant;
use shiranami_db::repo::recommendations as repo;
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
