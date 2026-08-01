//! The adapter against `golden.json`, closing a loop `golden_vectors.rs` cannot.
//!
//! That fixture records TypeScript's inputs *and* outputs, and
//! `golden_vectors.rs` replays the recorded inputs through the Rust core. Its
//! inputs are deserialized straight out of the fixture, so nothing there shows
//! that a real database ever **produces** them.
//!
//! This file supplies the missing half from both ends:
//! `library_stats_reproduces_the_recorded_typescript_inputs` seeds SQL that must
//! yield the recorded `stats`, and `smart_mixes_match_the_recorded_typescript_output`
//! drives the whole adapter-plus-core path and compares against the recorded
//! mixes. Composed with the existing vectors, every step from a `play_history`
//! row to a shelf position is covered by one fixture.

use serde::Deserialize;
use shiranami_core::models::{SmartMixResult, SmartMixSignals, SmartMixWeather};
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
