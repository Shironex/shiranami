//! The discover fetch, end to end over a **real** yt-dlp capture.
//!
//! `service/discover.rs`'s own tests script the runner with hand-written JSON,
//! which is how the failure paths are covered. This file uses bytes yt-dlp
//! actually printed, because two of the port's decisions are only visible in
//! them:
//!
//! - a flat-playlist entry has **no** `thumbnail` key, only `thumbnails[]`, so
//!   v1's `data.thumbnail ?? data.thumbnails?.[0]?.url` fallback is the branch
//!   that runs in production rather than the defensive one; and
//! - the **seed video is the mix's first entry**, so "never recommend a seed
//!   back" is not a hypothetical.
//!
//! The fixture is the first six lines of
//!
//! ```text
//! yt-dlp --ignore-config --flat-playlist --dump-json --no-warnings -- \
//!   'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'
//! ```
//!
//! captured 2026-08-02 (314 entries; the prefix is verbatim, nothing edited).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use shiranami_core::time::instant;
use shiranami_db::repo::recommendations as repo;
use shiranami_downloader::spawn::{
    LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec,
};
use shiranami_recommendation::service::{self, DiscoverFetcher};
use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqliteConnection, SqlitePool};
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

/// The seed the capture was taken from, and the mix's own first entry.
const SEED: &str = "dQw4w9WgXcQ";

/// An instant the fixtures hang their timestamps off.
const NOW: &str = "2026-06-15T12:00:00.000Z";

fn now_ms() -> i64 {
    instant::parse_iso8601_ms(NOW).expect("a known instant")
}

fn fixture() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/rd-mix-flat-playlist.jsonl");
    std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

// ---------------------------------------------------------------------------
// The scripted runner and the database fixture.
// ---------------------------------------------------------------------------

/// Answers every run with one canned stdout, and records the argv.
struct Scripted {
    stdout: String,
    calls: std::sync::Mutex<Vec<Vec<String>>>,
}

impl Scripted {
    fn new(stdout: String) -> Self {
        Self {
            stdout,
            calls: std::sync::Mutex::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<Vec<String>> {
        self.calls.lock().expect("the recorded argv").clone()
    }
}

#[async_trait::async_trait]
impl ProcessRunner for Scripted {
    async fn run(
        &self,
        spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        self.calls.lock().expect("record the argv").push(spec.args);

        Ok(ProcessOutput {
            stdout: self.stdout.clone(),
            stderr: String::new(),
            code: 0,
            truncated: false,
        })
    }
}

/// An open database, its one connection, and a yt-dlp path that exists.
struct Fixture {
    _dir: TempDir,
    _pool: SqlitePool,
    connection: PoolConnection<Sqlite>,
    yt_dlp: PathBuf,
}

impl Fixture {
    fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }

    /// A fetcher over `runner`, pointed at this fixture's yt-dlp stand-in.
    ///
    /// The file is real and empty: the fetch gate is an existence check, and a
    /// path that does not exist would short-circuit before any run.
    fn fetcher(&self, runner: Arc<dyn ProcessRunner>) -> DiscoverFetcher {
        DiscoverFetcher::new(runner, self.yt_dlp.clone())
    }
}

async fn fresh() -> Fixture {
    let dir = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
        .await
        .expect("a fresh database opens");
    let connection = opened.pool.acquire().await.expect("the one connection");

    let yt_dlp = dir.path().join("yt-dlp");
    std::fs::write(&yt_dlp, b"").expect("a stand-in binary");

    Fixture {
        _dir: dir,
        _pool: opened.pool,
        connection,
        yt_dlp,
    }
}

/// A played, mapped track — the shape a discover seed is selected from.
async fn seed_track(conn: &mut SqliteConnection, track_id: &str, youtube_id: &str) {
    sqlx::query(
        "INSERT INTO tracks (id, file_path, title, artist, album, duration, play_count) \
         VALUES (?, ?, 'Title', 'Artist', 'Album', 100, 5)",
    )
    .bind(track_id)
    .bind(format!("/music/{track_id}.mp3"))
    .execute(&mut *conn)
    .await
    .expect("insert a track");

    sqlx::query(
        "INSERT INTO play_history \
           (id, track_id, played_at, played_seconds, completion_ratio, completed, source) \
         VALUES (?1, ?2, ?3, 100.0, 1.0, 1, 'library')",
    )
    .bind(format!("h-{track_id}"))
    .bind(track_id)
    .bind(NOW)
    .execute(&mut *conn)
    .await
    .expect("record a play");

    shiranami_db::repo::youtube_mappings::upsert(&mut *conn, track_id, youtube_id)
        .await
        .expect("map the track to a video");
}

/// The three phases, in the order the composition root runs them.
///
/// Written out here rather than hidden behind one crate call because the split
/// **is** the contract: the plan is read, the fan-out runs with no connection
/// held, and the result is committed. A test that could not express the gap
/// could not prove the gap exists.
async fn refresh_discover(
    fixture: &mut Fixture,
    fetcher: &DiscoverFetcher,
) -> shiranami_core::models::DiscoverShelf {
    let plan = service::discover_plan(fixture.conn(), now_ms())
        .await
        .expect("plan the discover refresh");

    let items = fetcher
        .fetch(&plan, &CancellationToken::new())
        .await
        .expect("the fan-out was not cancelled");

    service::commit_discover(fixture.conn(), items, now_ms())
        .await
        .expect("commit the shelf")
}

// ---------------------------------------------------------------------------
// The fixture itself.
// ---------------------------------------------------------------------------

/// What makes the capture worth keeping. If a future yt-dlp starts emitting a
/// flat `thumbnail`, this is the test that says the port's fallback stopped
/// being the production branch.
#[test]
fn the_capture_has_no_flat_thumbnail_and_leads_with_the_seed() {
    let lines: Vec<serde_json::Value> = fixture()
        .lines()
        .map(|line| serde_json::from_str(line).expect("every captured line is JSON"))
        .collect();

    assert_eq!(lines.len(), 6, "the fixture is a six-entry prefix");
    assert_eq!(
        lines[0].get("id").and_then(serde_json::Value::as_str),
        Some(SEED),
        "yt-dlp returns the seed video as the mix's first entry"
    );

    for entry in &lines {
        assert!(
            entry.get("thumbnail").is_none(),
            "a flat-playlist entry carries `thumbnails[]` and no `thumbnail`"
        );
        assert!(entry.get("thumbnails").is_some());
    }
}

// ---------------------------------------------------------------------------
// The fetch, through `refresh`.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_real_capture_becomes_the_discover_shelf() {
    let mut fixture = fresh().await;
    seed_track(fixture.conn(), "t1", SEED).await;
    let runner = Arc::new(Scripted::new(self::fixture()));

    let fetcher = fixture.fetcher(Arc::clone(&runner) as Arc<dyn ProcessRunner>);

    let discover = refresh_discover(&mut fixture, &fetcher).await;

    let items = &discover.items;
    assert_eq!(
        items
            .iter()
            .map(|item| item.youtube_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "izGwDsrQ1eQ",
            "r3Pr1_v7hsw",
            "79fzeNUqQbQ",
            "djV11Xbc914",
            "YHRvDo8rUoQ",
        ],
        "the seed is dropped and mix order is kept"
    );

    let first = &items[0];
    assert_eq!(
        first.title,
        "George Michael - Careless Whisper (Official Video)"
    );
    assert_eq!(first.uploader, "George Michael");
    assert_eq!(first.url, "https://www.youtube.com/watch?v=izGwDsrQ1eQ");
    assert!(
        first
            .thumbnail
            .starts_with("https://i.ytimg.com/vi/izGwDsrQ1eQ/hqdefault.jpg"),
        "the thumbnail comes from `thumbnails[0].url`, which is the only one \
         a flat-playlist entry has: {}",
        first.thumbnail
    );

    assert_eq!(discover.generated_at.as_deref(), Some(NOW));
    assert!(!discover.stale);
}

/// The argv, recorded at the seam a real run would use, and one process per
/// seed rather than per entry.
#[tokio::test]
async fn one_run_per_seed_with_v1s_argv() {
    let mut fixture = fresh().await;
    seed_track(fixture.conn(), "t1", SEED).await;
    seed_track(fixture.conn(), "t2", "second-seed").await;
    let runner = Arc::new(Scripted::new(self::fixture()));

    let fetcher = fixture.fetcher(Arc::clone(&runner) as Arc<dyn ProcessRunner>);

    refresh_discover(&mut fixture, &fetcher).await;

    let calls = runner.calls();
    assert_eq!(calls.len(), 2, "one yt-dlp run per mapped seed");

    for argv in &calls {
        assert_eq!(
            argv[..4],
            [
                "--ignore-config",
                "--flat-playlist",
                "--dump-json",
                "--no-warnings"
            ]
        );
        assert_eq!(argv[4], "--", "the end-of-options guard precedes the URL");
        assert!(
            argv[5].starts_with("https://www.youtube.com/watch?v=") && argv[5].contains("&list=RD"),
            "{}",
            argv[5]
        );
    }
}

/// The cached payload is v1's: a camelCase JSON array in the `payload` column,
/// stamped with an ISO-8601 instant. Rows written by v1 and by v2 have to be
/// the same rows — a user's cache survives the upgrade.
#[tokio::test]
async fn the_cached_payload_keeps_v1s_json_shape() {
    let mut fixture = fresh().await;
    seed_track(fixture.conn(), "t1", SEED).await;
    let runner = Arc::new(Scripted::new(self::fixture()));

    let fetcher = fixture.fetcher(runner);

    refresh_discover(&mut fixture, &fetcher).await;

    let row = repo::read_shelf(fixture.conn(), "discover")
        .await
        .expect("read the row")
        .expect("the refresh wrote one");

    assert_eq!(row.generated_at, NOW);

    let payload: Vec<serde_json::Map<String, serde_json::Value>> =
        serde_json::from_str(&row.payload).expect("a JSON array of objects");
    // Sorted, because `serde_json::Map` is a `BTreeMap` here and object key
    // order is not part of the shape the renderer reads — the **names** are.
    let mut keys: Vec<&str> = payload[0].keys().map(String::as_str).collect();
    keys.sort_unstable();

    assert_eq!(
        keys,
        vec!["thumbnail", "title", "uploader", "url", "youtubeId"],
        "v1 stored `JSON.stringify(DiscoverRecommendation[])` and the renderer \
         still reads those five camelCase names"
    );
}

/// A video the library already has is not new music, and the seed set is
/// excluded from **every** mix rather than only from its own.
#[tokio::test]
async fn the_library_and_the_seeds_are_excluded_from_the_shelf() {
    let mut fixture = fresh().await;
    seed_track(fixture.conn(), "t1", SEED).await;
    // Owned, but never played — so it maps a video without becoming a seed.
    sqlx::query("INSERT INTO tracks (id, file_path, title, duration) VALUES ('t2', '/m/2.mp3', 'Owned', 100)")
        .execute(fixture.conn())
        .await
        .expect("insert the owned track");
    shiranami_db::repo::youtube_mappings::upsert(fixture.conn(), "t2", "izGwDsrQ1eQ")
        .await
        .expect("map the owned track");

    let runner = Arc::new(Scripted::new(self::fixture()));
    let fetcher = fixture.fetcher(runner);

    let discover = refresh_discover(&mut fixture, &fetcher).await;

    let ids: Vec<&str> = discover
        .items
        .iter()
        .map(|item| item.youtube_id.as_str())
        .collect();

    assert!(!ids.contains(&"izGwDsrQ1eQ"), "already in the library");
    assert!(!ids.contains(&SEED), "a seed is never recommended back");
    assert_eq!(ids.len(), 4);
}

/// v1 cached the empty result rather than leaving the previous shelf in place,
/// so a user who deleted yt-dlp gets a quiet empty shelf and not an
/// indefinitely stale one. Ported deliberately, and pinned here because it is
/// the kind of behaviour a later reader would "fix".
#[tokio::test]
async fn an_absent_yt_dlp_writes_an_empty_shelf_instead_of_running_anything() {
    let mut fixture = fresh().await;
    seed_track(fixture.conn(), "t1", SEED).await;
    repo::write_shelf(
        fixture.conn(),
        "discover",
        r#"[{"youtubeId":"old","title":"T","uploader":"U","thumbnail":"","url":"u"}]"#,
        "2026-06-14T12:00:00.000Z",
    )
    .await
    .expect("seed the cache");

    let runner = Arc::new(Scripted::new(self::fixture()));
    let absent = DiscoverFetcher::new(
        Arc::clone(&runner) as Arc<dyn ProcessRunner>,
        PathBuf::from("/nowhere/yt-dlp"),
    );

    let discover = refresh_discover(&mut fixture, &absent).await;

    assert!(runner.calls().is_empty(), "nothing was spawned");
    assert!(discover.items.is_empty());
    assert_eq!(discover.generated_at.as_deref(), Some(NOW));
    assert!(!discover.stale);
}

/// A library with no YouTube-mapped seeds spawns nothing either.
#[tokio::test]
async fn a_library_with_no_mapped_seeds_spawns_nothing() {
    let mut fixture = fresh().await;
    let runner = Arc::new(Scripted::new(self::fixture()));

    let fetcher = fixture.fetcher(Arc::clone(&runner) as Arc<dyn ProcessRunner>);

    let discover = refresh_discover(&mut fixture, &fetcher).await;

    assert!(runner.calls().is_empty());
    assert!(discover.items.is_empty());
}

// ---------------------------------------------------------------------------
// The real binary, when this machine has one.
// ---------------------------------------------------------------------------

/// Points the gated test at a specific binary, overriding discovery.
///
/// `shiranami-downloader`'s `real_ytdlp.rs` explains why this exists: a test
/// that skips can rot unnoticed, and pointing this at a program that is not
/// yt-dlp must make the test fail — which it does, because the assertion is on
/// yt-dlp's own option parser.
const OVERRIDE: &str = "SHIRANAMI_YTDLP_PATH";

fn installed_yt_dlp() -> Option<PathBuf> {
    if let Ok(path) = std::env::var(OVERRIDE) {
        return Some(PathBuf::from(path));
    }

    [
        shiranami_core::paths::dirs::data_dir(),
        shiranami_core::paths::dirs::legacy_data_dir(),
    ]
    .into_iter()
    .flatten()
    .map(|data_dir| {
        shiranami_downloader::bin::layout::yt_dlp_path(
            &shiranami_downloader::bin::layout::bin_dir(&data_dir),
            shiranami_downloader::bin::layout::Platform::HOST,
        )
    })
    .find(|path| path.is_file())
}

/// Every option in the discover argv is one this yt-dlp has.
///
/// `--help` makes yt-dlp parse the whole argv and then exit **0** without
/// touching the network; an option it does not recognise exits 2 instead. So
/// this asks the real parser the one question a mocked runner cannot answer —
/// "are these flags real?" — and asks it on a train, which is why the RD mix
/// itself is not fetched here.
#[tokio::test]
async fn the_real_binary_accepts_every_option_in_the_discover_argv() {
    let Some(yt_dlp) = installed_yt_dlp() else {
        eprintln!(
            "skipping: no managed yt-dlp installed. Install one through the app, \
             or ignore — CI is expected to skip this."
        );
        return;
    };

    let url = format!("https://www.youtube.com/watch?v={SEED}&list=RD{SEED}");
    let mut argv = shiranami_downloader::spawn::args::playlist(&url).expect("an http URL");
    // Appended, not substituted: the four flags under test are still the four
    // flags a real fetch sends.
    argv.insert(argv.len() - 2, "--help".to_owned());

    let output = shiranami_downloader::spawn::TokioRunner::new()
        .run(
            ProcessSpec::capturing(yt_dlp, argv).with_timeout(std::time::Duration::from_secs(30)),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect("the binary starts");

    assert_eq!(
        output.code, 0,
        "yt-dlp exits 2 on an option it does not know: {}",
        output.stderr
    );
    // Both halves are load-bearing, and the second one is the R17 lesson: with
    // `SHIRANAMI_YTDLP_PATH=/bin/echo` the argv is *echoed back*, so asserting
    // only that the output names `--flat-playlist` passes against a program
    // that never parsed anything. The usage banner is text only yt-dlp writes.
    assert!(
        output.stdout.starts_with("Usage: yt-dlp"),
        "this is not yt-dlp's help output: {}",
        output.stdout.lines().next().unwrap_or_default()
    );
    assert!(
        output.stdout.contains("--flat-playlist"),
        "the help text names the flag the discover fetch relies on"
    );
}
