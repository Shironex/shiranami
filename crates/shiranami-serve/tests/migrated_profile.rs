//! The caches a migration carries over have to be *usable*, not merely present.
//!
//! §3.3's decision is that v2 does not rehash the album-art cache: it copies the
//! directory and keeps serving by the hash already stored in `tracks.album_art`.
//! That only works if the copied files answer over the real art route, at the
//! names v1 gave them, with v1's bytes. This file is the end of that chain —
//! `shiranami_core::migrate` writes the directory, `shiranami_serve` reads it,
//! and nothing in between gets to reinterpret a filename.
//!
//! The audio route is here for the other half of the same question: a migrated
//! library's `tracks.file_path` still points at the user's music folder, which
//! is *outside* both data directories and is not copied by anything. The route
//! has to keep serving it.
//!
//! A separate authority rather than `common::Harness`, because the harness
//! serves art from a temp directory of its own and the whole point here is to
//! serve it from `<data>/album-art` — the path the migration actually produces.

mod common;

use std::path::PathBuf;
use std::sync::Arc;

use common::{FakeUpstream, TestResolver};
use reqwest::StatusCode;
use shiranami_core::migrate::{self, Outcome};
use shiranami_core::paths::FoldersCache;
use shiranami_core::paths::authority::{PathAuthority, PathAuthorityResult};
use shiranami_net::url_safety::UrlGuard;
use shiranami_serve::state::ServeConfig;
use shiranami_serve::upstream::RadioUpstream;

/// v1's real cover name shape: `sha256(jpeg_bytes)[0..32].jpg`.
const COVER: &str = "6f1ed002ab5595859014ebf0951522d9.jpg";
const COVER_BYTES: &[u8] = b"\xff\xd8\xff\xe0 not really a jpeg, but it is what v1 wrote";

struct Authority {
    downloads: PathBuf,
    folders: Vec<PathBuf>,
}

impl PathAuthority for Authority {
    fn download_location(&self) -> PathBuf {
        self.downloads.clone()
    }
    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(self.folders.clone())
    }
    fn has_track_at(&self, _path: &std::path::Path) -> PathAuthorityResult<bool> {
        Ok(false)
    }
}

/// A v1 profile, migrated, with a server pointed at the result.
#[tokio::test]
async fn a_migrated_art_cache_serves_v1s_covers_at_v1s_names() {
    let root = tempfile::tempdir().expect("a temp root");
    let legacy = root.path().join("Shiranami");
    let data = root.path().join("com.shironex.shiranami");
    let music = root.path().join("Music");
    std::fs::create_dir_all(legacy.join("album-art")).expect("art");
    std::fs::create_dir_all(legacy.join("waveform-peaks")).expect("peaks");
    std::fs::create_dir_all(&data).expect("data");
    std::fs::create_dir_all(&music).expect("music");

    std::fs::write(legacy.join("shiranami.db"), b"SQLite format 3\0").expect("db");
    std::fs::write(legacy.join("album-art").join(COVER), COVER_BYTES).expect("cover");
    std::fs::write(
        legacy.join("waveform-peaks/9e107d9d372bb6826bd81d3542a419d6.json"),
        br#"{"peaks":[0.1,0.9]}"#,
    )
    .expect("peaks");

    // A track file, where a real one lives: in the user's music folder, which no
    // part of the migration copies.
    let track = music.join("song.mp3");
    std::fs::write(&track, b"ID3\x04\x00\x00\x00\x00\x00\x00audio bytes").expect("track");

    assert!(matches!(
        migrate::run(Some(&legacy), &data).expect("migrate"),
        Outcome::Migrated(_)
    ));

    let folders = Arc::new(FoldersCache::new(
        data.clone(),
        Arc::new(Authority {
            downloads: data.join("downloads"),
            folders: vec![music.clone()],
        }),
    ));
    let handle = shiranami_serve::start(ServeConfig {
        folders,
        // Exactly where the migration put it.
        art_dir: data.join("album-art"),
        background_dir: data.join("backgrounds"),
        guard: UrlGuard::with_resolver(Arc::new(TestResolver::new())),
        upstream: Arc::new(FakeUpstream::new()) as Arc<dyn RadioUpstream>,
        now_playing: shiranami_serve::NowPlayingSink::discarding(),
    })
    .await
    .expect("the server binds");

    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("a client");

    // The cover, by the name v1 hashed it under.
    let response = client
        .get(format!("{}/art/{COVER}", handle.base_url()))
        .send()
        .await
        .expect("the art route answers");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.bytes().await.expect("a body")[..],
        COVER_BYTES[..],
        "the migrated cover is byte-identical to the one v1 cached"
    );

    // And the track, which lives outside every migrated directory.
    let audio = client
        .get(format!(
            "{}/audio?path={}",
            handle.base_url(),
            urlencoding(&track.to_string_lossy())
        ))
        .header("Range", "bytes=0-1")
        .send()
        .await
        .expect("the audio route answers");
    assert_eq!(
        audio.status(),
        StatusCode::PARTIAL_CONTENT,
        "WebKit opens every media load with this probe (Spike A)"
    );

    // The peaks cache came across readable, which is what lets a seekbar draw
    // without re-decoding every track the user already played.
    let peaks =
        std::fs::read_to_string(data.join("waveform-peaks/9e107d9d372bb6826bd81d3542a419d6.json"))
            .expect("the peaks file is there");
    assert_eq!(peaks, r#"{"peaks":[0.1,0.9]}"#);

    handle.shutdown().await;
}

/// Percent-encode a path for the query string, the way the harness does.
fn urlencoding(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
