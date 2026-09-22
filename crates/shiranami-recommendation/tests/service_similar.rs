//! "More like this" and the discovery seed selection, against a real database.
//!
//! The half of `service.rs` that does not touch the shelf cache, split from it
//! only because one file covering both grew past the module-shape cap. What is
//! asserted here is the prefilter's sentinel handling — an untagged seed must
//! match *nothing* rather than everything — and the affinity ordering the
//! deferred RD-mix fetch will depend on.

use shiranami_core::time::instant;
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
