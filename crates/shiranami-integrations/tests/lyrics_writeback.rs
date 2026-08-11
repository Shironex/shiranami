//! What the write-back lane refuses to put in a music folder.
//!
//! The unit tests in `lyrics::writeback` pin the filesystem mechanics; this
//! suite drives the whole per-track unit — real socket, real LRCLIB decoding,
//! real sidecar probe — because the rule under test is a decision made *across*
//! those layers and is not visible from inside any one of them:
//!
//! **A file the user already has is never shadowed.** With
//! `lyrics.preferSyncedFromLrclib` off, a hand-written `Song.txt` stops the
//! write, because a fresh `Song.lrc` outranks it everywhere in the reader's
//! ladder and would retire it for good. With the setting on it does not — that
//! setting *is* the user asking for the directory's timings instead.

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
