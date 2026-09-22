//! What the write-back lane refuses to put in a music folder.
//!
//! The unit tests in `lyrics::writeback` pin the filesystem mechanics; these
//! drive the whole per-track unit — real socket, real LRCLIB decoding, real
//! sidecar probe — because both rules under test are decisions made *across*
//! those layers and neither is visible from inside one of them:
//!
//! 1. **A file the user already has is never shadowed.** With
//!    `lyrics.preferSyncedFromLrclib` off, a hand-written `Song.txt` stops the
//!    write, because a fresh `Song.lrc` outranks it everywhere in the reader's
//!    ladder and would retire it for good. With the setting on it does not —
//!    that setting *is* the user asking for the directory's timings instead.
//! 2. **A document with no timings is not a lyric file.** LRCLIB records are
//!    user-submitted, and `syncedLyrics` carrying only ID tags or whitespace is
//!    non-empty while parsing to nothing. Written out it would be found by the
//!    reader, served as plain text, and — under the default precedence — stop
//!    the ladder before the network was ever consulted again.

mod support;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use shiranami_integrations::lyrics::{
    LrclibClient, LyricsPolicy, LyricsRequest, LyricsService, SaveOutcome, SidecarSkip,
};
use shiranami_net::HttpClient;
use support::test_server::{Reply, TestServer};

/// An opted-in policy that may write anywhere, with a settable preference.
struct WritingPolicy {
    prefer_synced: AtomicBool,
}

impl LyricsPolicy for WritingPolicy {
    fn is_local_resolution_allowed(&self, _path: &Path) -> bool {
        true
    }

    fn prefer_synced_from_lrclib(&self) -> bool {
        self.prefer_synced.load(Ordering::SeqCst)
    }

    fn should_save_fetched_lyrics(&self) -> bool {
        true
    }

    fn is_lyrics_write_allowed(&self, _path: &Path) -> bool {
        true
    }
}

/// A record body for `/api/get`.
fn record(synced: Option<&str>, plain: Option<&str>) -> String {
    serde_json::json!({ "syncedLyrics": synced, "plainLyrics": plain }).to_string()
}

struct Fixture {
    _directory: tempfile::TempDir,
    audio: PathBuf,
    service: LyricsService,
    server: TestServer,
}

impl Fixture {
    async fn new(prefer_synced: bool, replies: Vec<Reply>) -> Self {
        let directory = tempfile::tempdir().expect("a temp dir");
        let audio = directory.path().join("Song.mp3");
        let server = TestServer::start(replies).await;

        let service = LyricsService::new(
            LrclibClient::with_base(
                HttpClient::new().expect("the shared client builds"),
                server.url(""),
            ),
            Arc::new(WritingPolicy {
                prefer_synced: AtomicBool::new(prefer_synced),
            }) as Arc<dyn LyricsPolicy>,
        );

        Self {
            _directory: directory,
            audio,
            service,
            server,
        }
    }

    fn sidecar(&self, extension: &str) -> PathBuf {
        self.audio.with_extension(extension)
    }

    fn seed(&self, extension: &str, contents: &str) {
        std::fs::write(self.sidecar(extension), contents).expect("seeding the user's file");
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

/* ------------------------- the user's own files ------------------------- */

/// The default. One click on "save lyrics for library" must not walk over a
/// curated `.txt` collection — and it must not spend a lookup finding out.
#[tokio::test]
async fn a_hand_written_txt_stops_the_batch_before_the_lookup() {
    let fixture = Fixture::new(false, vec![Reply::ok(&record(Some("[00:01.00]Net"), None))]).await;
    fixture.seed("txt", "The words I typed myself");

    let outcome = fixture.service.save_lyrics(&fixture.request()).await;

    assert_eq!(outcome, SaveOutcome::Skipped(SidecarSkip::AlreadyExists));
    assert!(!fixture.sidecar("lrc").exists());
    assert_eq!(
        fixture.server.received(),
        0,
        "a track the user has already answered for costs the directory nothing"
    );
}

/// …and the setting is what lifts it, exactly as it lifts the same rule on the
/// fetch ladder.
#[tokio::test]
async fn preferring_lrclib_timings_lets_the_write_past_a_txt() {
    let fixture = Fixture::new(true, vec![Reply::ok(&record(Some("[00:01.00]Net"), None))]).await;
    fixture.seed("txt", "The words I typed myself");

    let outcome = fixture.service.save_lyrics(&fixture.request()).await;

    assert_eq!(outcome, SaveOutcome::Saved(fixture.sidecar("lrc")));
    assert_eq!(
        std::fs::read_to_string(fixture.sidecar("txt")).expect("read it back"),
        "The words I typed myself",
        "the plain-text file is still never touched"
    );
}

/* ---------------------- documents with no timings ---------------------- */

/// ID tags are ordinary in user-submitted LRC and parse to zero timed lines.
/// Kept, the file would serve `[ar:Artist]` as the lyric — forever, because the
/// never-overwrite guard then blocks every later attempt to replace it.
#[tokio::test]
async fn an_id_tags_only_document_is_not_kept() {
    let payload = "[ar:Artist]\n[ti:Title]\n[by:Someone]\n";
    let fixture = Fixture::new(
        false,
        vec![Reply::ok(&record(Some(payload), Some("Real words")))],
    )
    .await;

    let outcome = fixture.service.save_lyrics(&fixture.request()).await;

    assert_eq!(outcome, SaveOutcome::Skipped(SidecarSkip::NotSynced));
    assert!(
        !fixture.sidecar("lrc").exists(),
        "a `.lrc` with no timings would shadow a future timed one"
    );
}

/// The blank-pane variant of the same bug: non-empty by the byte, empty by the
/// parser.
#[tokio::test]
async fn a_whitespace_only_document_is_not_kept() {
    let fixture = Fixture::new(
        false,
        vec![Reply::ok(&record(
            Some("   \n\n \t \n"),
            Some("Real words"),
        ))],
    )
    .await;

    let outcome = fixture.service.save_lyrics(&fixture.request()).await;

    assert_eq!(outcome, SaveOutcome::Skipped(SidecarSkip::NotSynced));
    assert!(!fixture.sidecar("lrc").exists());
}

/// The control: a document that does parse is written verbatim.
#[tokio::test]
async fn a_timed_document_is_kept_byte_for_byte() {
    let payload = "[ar:Artist]\n[00:01.00]One\n[00:02.50]Two\n";
    let fixture = Fixture::new(false, vec![Reply::ok(&record(Some(payload), None))]).await;

    let outcome = fixture.service.save_lyrics(&fixture.request()).await;

    assert_eq!(outcome, SaveOutcome::Saved(fixture.sidecar("lrc")));
    assert_eq!(
        std::fs::read_to_string(fixture.sidecar("lrc")).expect("read it back"),
        payload,
        "tags and all — nothing re-renders the document"
    );
}

/// The fetch path shares the gate. It writes as a side effect of displaying, so
/// an untimed document reaching it would plant the same permanent shadow.
#[tokio::test]
async fn the_fetch_path_refuses_an_untimed_document_too() {
    let fixture = Fixture::new(
        false,
        vec![Reply::ok(&record(Some("[ti:Title]\n"), Some("Real words")))],
    )
    .await;

    let found = fixture
        .service
        .fetch(&fixture.request())
        .await
        .expect("a result");

    assert_eq!(found.plain.as_deref(), Some("Real words"));
    assert!(
        !fixture.sidecar("lrc").exists(),
        "nothing timed was found, so there is nothing to keep"
    );
}
