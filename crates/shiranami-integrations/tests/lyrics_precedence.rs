//! The precedence matrix: which of the three sources wins, in both toggle
//! states, and when the network is consulted at all.
//!
//! Ported from the `fetchLyrics precedence` block in
//! `apps/desktop/src/main/services/lyrics-service.test.ts`. v1 mocked each
//! source; these drive the real ones — real sidecar files, real tagged audio,
//! a real socket — so "skips the network entirely" is asserted by counting
//! requests the server actually received rather than calls to a stub.
//!
//! # The matrix
//!
//! | Case                          | `preferSyncedFromLrclib` off | on              |
//! | ----------------------------- | ---------------------------- | --------------- |
//! | local synced present          | local                        | local           |
//! | embedded synced, no local     | embedded                     | embedded        |
//! | local plain vs LRCLIB synced  | **local** (no request)       | **LRCLIB**      |
//! | local plain vs LRCLIB plain   | **local** (no request)       | **local**       |
//! | local plain, LRCLIB empty     | local                        | local           |
//! | nothing local                 | LRCLIB                       | LRCLIB          |

mod support;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use lofty::config::WriteOptions;
use lofty::prelude::{ItemKey, TagExt};
use lofty::tag::{Tag, TagType};
use shiranami_core::models::lyrics::LyricsSource;
use shiranami_integrations::lyrics::{LrclibClient, LyricsPolicy, LyricsRequest, LyricsService};
use shiranami_net::HttpClient;
use support::test_server::{Reply, TestServer};

/// A policy with a settable preference and an optional containment denial.
struct FakePolicy {
    prefer_synced: AtomicBool,
    deny_local: AtomicBool,
}

impl FakePolicy {
    fn new(prefer_synced: bool) -> Arc<Self> {
        Arc::new(Self {
            prefer_synced: AtomicBool::new(prefer_synced),
            deny_local: AtomicBool::new(false),
        })
    }
}

impl LyricsPolicy for FakePolicy {
    fn is_local_resolution_allowed(&self, _path: &Path) -> bool {
        !self.deny_local.load(Ordering::SeqCst)
    }

    fn prefer_synced_from_lrclib(&self) -> bool {
        self.prefer_synced.load(Ordering::SeqCst)
    }
}

/// A record body for `/api/get`.
fn record(synced: Option<&str>, plain: Option<&str>) -> String {
    serde_json::json!({ "syncedLyrics": synced, "plainLyrics": plain }).to_string()
}

/// The three replies a full miss chain consumes: `/get` plus two `/search`.
fn full_miss() -> Vec<Reply> {
    vec![Reply::failing(404, "{}"), Reply::ok("[]"), Reply::ok("[]")]
}

struct Fixture {
    _directory: tempfile::TempDir,
    audio: PathBuf,
    service: LyricsService,
    server: TestServer,
    policy: Arc<FakePolicy>,
}

impl Fixture {
    async fn new(prefer_synced: bool, replies: Vec<Reply>) -> Self {
        let directory = tempfile::tempdir().expect("a temp dir");
        let audio = directory.path().join("Song.mp3");
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sine.mp3");
        std::fs::copy(&source, &audio).expect("copying the fixture");

        let server = TestServer::start(replies).await;
        let policy = FakePolicy::new(prefer_synced);
        let service = LyricsService::new(
            LrclibClient::with_base(
                HttpClient::new().expect("the shared client builds"),
                server.url(""),
            ),
            Arc::clone(&policy) as Arc<dyn LyricsPolicy>,
        );

        Self {
            _directory: directory,
            audio,
            service,
            server,
            policy,
        }
    }

    /// Write a sidecar lyric file beside the track.
    fn sidecar(&self, extension: &str, contents: &str) {
        std::fs::write(self.audio.with_extension(extension), contents)
            .expect("writing the sidecar");
    }

    /// Write lyrics into the track's own tags.
    fn embed(&self, lyrics: &str) {
        let mut tag = Tag::new(TagType::Id3v2);
        tag.insert_text(ItemKey::UnsyncLyrics, lyrics.to_owned());
        tag.save_to_path(&self.audio, WriteOptions::default())
            .expect("writing the lyrics tag");
    }

    fn request(&self) -> LyricsRequest {
        LyricsRequest {
            title: "Song".to_owned(),
            artist: "Artist".to_owned(),
            file_path: Some(self.audio.clone()),
            ..LyricsRequest::default()
        }
    }
}

#[tokio::test]
async fn local_synced_wins_and_skips_the_embedded_parse_and_the_network() {
    let fixture = Fixture::new(false, Vec::new()).await;
    fixture.sidecar("lrc", "[00:01.00]Local synced");
    fixture.embed("[00:02.00]Embedded synced");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::LocalLrc));
    assert_eq!(fixture.server.received(), 0, "the network was not touched");
}

#[tokio::test]
async fn embedded_synced_beats_everything_but_a_local_synced_file() {
    let fixture = Fixture::new(false, Vec::new()).await;
    fixture.sidecar("txt", "Local plain");
    fixture.embed("[00:02.00]Embedded synced");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::Embedded));
    assert!(found.synced.is_some());
    assert_eq!(fixture.server.received(), 0);
}

/// A synced embedded tag outranks LRCLIB in *both* toggle states — the setting
/// only ever promotes LRCLIB past *untimed* local sources.
#[tokio::test]
async fn embedded_synced_beats_lrclib_even_with_the_preference_on() {
    let fixture = Fixture::new(true, Vec::new()).await;
    fixture.embed("[00:02.00]Embedded synced");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::Embedded));
    assert_eq!(fixture.server.received(), 0);
}

#[tokio::test]
async fn default_off_local_plain_suppresses_the_network_call() {
    let fixture = Fixture::new(false, Vec::new()).await;
    fixture.sidecar("txt", "Local plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::LocalTxt));
    assert_eq!(found.plain.as_deref(), Some("Local plain"));
    assert_eq!(fixture.server.received(), 0);
}

#[tokio::test]
async fn default_off_embedded_plain_suppresses_the_network_when_no_local_file_exists() {
    let fixture = Fixture::new(false, Vec::new()).await;
    fixture.embed("Embedded plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::Embedded));
    assert_eq!(found.plain.as_deref(), Some("Embedded plain"));
    assert_eq!(fixture.server.received(), 0);
}

#[tokio::test]
async fn default_off_local_plain_beats_embedded_plain() {
    let fixture = Fixture::new(false, Vec::new()).await;
    fixture.sidecar("txt", "Local plain");
    fixture.embed("Embedded plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::LocalTxt));
}

#[tokio::test]
async fn falls_through_to_lrclib_when_nothing_local_exists() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(None, Some("Network")))]).await;

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::Lrclib));
    assert_eq!(found.plain.as_deref(), Some("Network"));
    assert_eq!(fixture.server.received(), 1);
}

/// The whole point of the setting: a timed lyric from the directory is
/// preferred to an untimed file the user happens to own.
#[tokio::test]
async fn preference_on_lrclib_synced_outranks_local_plain() {
    let fixture = Fixture::new(true, vec![Reply::ok(&record(Some("[00:03.00]Net"), None))]).await;
    fixture.sidecar("txt", "Local plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::Lrclib));
    assert!(found.synced.is_some());
}

#[tokio::test]
async fn preference_on_local_plain_wins_when_lrclib_has_nothing() {
    let fixture = Fixture::new(true, full_miss()).await;
    fixture.sidecar("txt", "Local plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::LocalTxt));
    assert_eq!(fixture.server.received(), 3, "the whole chain was tried");
}

/// The setting promotes LRCLIB's *synced* lyrics only. A plain-only network
/// result still loses to a plain local file.
#[tokio::test]
async fn preference_on_local_plain_still_wins_over_lrclib_plain_only() {
    let fixture = Fixture::new(true, vec![Reply::ok(&record(None, Some("Network plain")))]).await;
    fixture.sidecar("txt", "Local plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.source, Some(LyricsSource::LocalTxt));
    assert_eq!(found.plain.as_deref(), Some("Local plain"));
}

/// A radio stream has no file, so only the network can answer.
#[tokio::test]
async fn without_a_file_path_only_lrclib_is_consulted() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(None, Some("Network")))]).await;
    fixture.sidecar("lrc", "[00:01.00]Local synced");

    let found = fixture
        .service
        .fetch(&LyricsRequest {
            title: "Song".to_owned(),
            artist: "Artist".to_owned(),
            ..LyricsRequest::default()
        })
        .await
        .expect("a result");

    assert_eq!(
        found.source,
        Some(LyricsSource::Lrclib),
        "the sidecar next to a file we were not given must not be found"
    );
}

/// The cache covers the network only. Local sources are re-read every time, so
/// a lyric file dropped next to a track shows up without a restart.
#[tokio::test]
async fn lrclib_results_are_cached_but_local_sources_are_re_read() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(None, Some("Network")))]).await;

    let first = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");
    assert_eq!(first.source, Some(LyricsSource::Lrclib));
    assert_eq!(fixture.server.received(), 1);

    // Second call: the network answer is cached…
    let second = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");
    assert_eq!(second.source, Some(LyricsSource::Lrclib));
    assert_eq!(fixture.server.received(), 1, "no second request");

    // …but a sidecar that appears now still takes over.
    fixture.sidecar("lrc", "[00:01.00]Newly added");
    let third = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");
    assert_eq!(third.source, Some(LyricsSource::LocalLrc));
    assert_eq!(fixture.server.received(), 1);
}

/// A genuine miss is a successful lookup with an empty result — the caller must
/// be able to tell it from a failure.
#[tokio::test]
async fn returns_an_empty_result_when_no_source_has_lyrics() {
    let fixture = Fixture::new(false, full_miss()).await;

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a miss is not an error");

    assert_eq!(found.source, None);
    assert!(found.synced.is_none());
    assert!(found.plain.is_none());
}

/// The containment gate: a path outside the library is not probed at all, and
/// the track degrades to network-only lyrics.
#[tokio::test]
async fn a_denied_path_skips_local_resolution_and_degrades_to_the_network() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(None, Some("Network")))]).await;
    fixture.sidecar("lrc", "[00:01.00]Local synced");
    fixture.policy.deny_local.store(true, Ordering::SeqCst);

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(
        found.source,
        Some(LyricsSource::Lrclib),
        "the sidecar was present but out of bounds"
    );
}

/// One request, however many callers — otherwise a settings invalidation racing
/// a panel mount double-occupies the 250 ms rate gate.
#[tokio::test]
async fn concurrent_fetches_for_one_track_share_a_single_request() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(None, Some("Network")))]).await;
    let request = fixture.request();

    let (first, second, third) = tokio::join!(
        fixture.service.fetch(&request),
        fixture.service.fetch(&request),
        fixture.service.fetch(&request),
    );

    for result in [first, second, third] {
        assert_eq!(result.expect("a result").plain.as_deref(), Some("Network"));
    }
    assert_eq!(fixture.server.received(), 1);
}

/// **The deviation.** A lookup that failed is not "this track has no lyrics".
#[tokio::test]
async fn a_failed_lookup_with_no_other_source_is_an_error() {
    let fixture = Fixture::new(
        false,
        vec![
            Reply::failing(429, ""),
            Reply::failing(429, ""),
            Reply::failing(429, ""),
        ],
    )
    .await;

    let error = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect_err("a rate-limited lookup must not read as a miss");

    assert!(error.to_string().contains("429"), "got {error}");
}

/// …but a failure never overrides a source that *did* answer.
#[tokio::test]
async fn a_local_result_still_wins_over_a_failed_lookup() {
    let fixture = Fixture::new(
        true,
        vec![
            Reply::failing(500, ""),
            Reply::failing(500, ""),
            Reply::failing(500, ""),
        ],
    )
    .await;
    fixture.sidecar("txt", "Local plain");

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("the local file answered, so this is not an error");

    assert_eq!(found.source, Some(LyricsSource::LocalTxt));
}

/// A failure is not negatively cached, so the next attempt actually retries.
/// Caching it is what would mark a rate-limited track lyric-less for the
/// session.
#[tokio::test]
async fn a_failed_lookup_is_not_cached() {
    let fixture = Fixture::new(
        false,
        vec![
            Reply::failing(500, ""),
            Reply::failing(500, ""),
            Reply::failing(500, ""),
            Reply::ok(&record(None, Some("Recovered"))),
        ],
    )
    .await;

    assert!(fixture.service.fetch(&fixture.request()).await.is_err());
    assert_eq!(fixture.server.received(), 3);

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("the retry succeeded");

    assert_eq!(found.plain.as_deref(), Some("Recovered"));
    assert_eq!(fixture.server.received(), 4, "the retry hit the network");
}

/// A miss *is* cached, so a track the directory genuinely lacks is not looked
/// up again and again.
#[tokio::test]
async fn a_miss_is_cached() {
    let fixture = Fixture::new(false, full_miss()).await;

    for _ in 0..3 {
        let found = fixture
            .service
            .fetch(&fixture.request())
            .await
            .expect("a miss");
        assert_eq!(found.source, None);
    }

    assert_eq!(
        fixture.server.received(),
        3,
        "one chain of three requests, not three chains"
    );
}
