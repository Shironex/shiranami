//! The metadata a phone pulls: manifest pages, playlists, favourites, history.

// Test code: a failed unwrap is a failed test, with the location in the panic.
#![allow(clippy::unwrap_used)]

mod common;

use common::Harness;

#[tokio::test(flavor = "multi_thread")]
async fn the_manifest_pages_with_opaque_cursors() {
    let harness = Harness::start().await;
    for i in 1..=5 {
        harness
            .add_track(
                &format!("t{i}"),
                &format!("{i}.mp3"),
                &vec![0_u8; i * 10],
                "",
            )
            .await;
    }
    harness
        .exec(
            "UPDATE tracks SET content_hash = 'v1:abc', is_favorite = 1, play_count = 7, \
             album_art = 'shiranami-art://art/0123456789abcdef0123456789abcdef.jpg', \
             artist = 'Artist' WHERE id = 't1'",
        )
        .await;
    let phone = harness.paired_phone().await;

    let mut ids = Vec::new();
    let mut path = "/v1/sync/manifest?limit=2".to_owned();
    let mut pages = 0;
    loop {
        let reply = phone.get(&path).await;
        assert_eq!(reply.status, 200);
        let page = reply.json();
        assert_eq!(page["trackCount"], 5);
        assert_eq!(page["libraryId"], harness.server.library_id());
        for track in page["tracks"].as_array().unwrap() {
            ids.push(track["id"].as_str().unwrap().to_owned());
        }
        pages += 1;
        if !page["hasMore"].as_bool().unwrap() {
            assert!(page["nextCursor"].is_null());
            break;
        }
        let cursor = page["nextCursor"].as_str().unwrap();
        path = format!("/v1/sync/manifest?limit=2&cursor={cursor}");
    }
    assert_eq!(pages, 3);
    assert_eq!(ids, ["t1", "t2", "t3", "t4", "t5"]);

    let first = phone.get("/v1/sync/manifest?limit=1").await.json();
    let t1 = &first["tracks"][0];
    assert_eq!(t1["title"], "Title t1");
    assert_eq!(t1["artist"], "Artist");
    assert_eq!(t1["contentHash"], "v1:abc");
    assert_eq!(t1["artworkHash"], "0123456789abcdef0123456789abcdef");
    assert_eq!(t1["sizeBytes"], 10);
    assert_eq!(t1["format"], "mp3");
    assert_eq!(t1["isFavorite"], true);
    assert_eq!(t1["playCount"], 7);
    assert!(t1["fileVersion"].as_str().unwrap().starts_with("10-"));

    let bad = phone.get("/v1/sync/manifest?cursor=garbage").await;
    assert_eq!(bad.status, 400);
    assert_eq!(bad.json()["error"], "bad_request");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_missing_file_has_no_size() {
    let harness = Harness::start().await;
    let gone = harness.music.path().join("gone.flac");
    harness.insert_track("gone", &gone, "").await;
    let phone = harness.paired_phone().await;
    let track = &phone.get("/v1/sync/manifest").await.json()["tracks"][0];
    assert!(track["sizeBytes"].is_null());
    assert!(track["fileVersion"].is_null());
    assert_eq!(track["format"], "flac");
}

#[tokio::test(flavor = "multi_thread")]
async fn playlists_favourites_and_history() {
    let harness = Harness::start().await;
    for id in ["a", "b", "c"] {
        harness.add_track(id, &format!("{id}.mp3"), b"x", "").await;
    }
    harness
        .exec("UPDATE tracks SET is_favorite = 1 WHERE id IN ('a', 'c')")
        .await;
    harness
        .exec("INSERT INTO playlists (id, name, description) VALUES ('p1', 'Road', 'long drives')")
        .await;
    harness
        .exec(
            "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) VALUES \
             ('e1', 'p1', 'c', 0), ('e2', 'p1', 'a', 1)",
        )
        .await;
    for i in 0..3 {
        harness
            .exec(&format!(
                "INSERT INTO play_history (id, track_id, played_at, played_seconds, \
                 completion_ratio, completed, source) VALUES \
                 ('h{i}', 'b', '2026-11-0{}T10:00:00.000Z', 30.5, 0.5, 0, 'library')",
                i + 1
            ))
            .await;
    }
    let phone = harness.paired_phone().await;

    let playlists = phone.get("/v1/sync/playlists").await.json();
    let road = &playlists["playlists"][0];
    assert_eq!(road["name"], "Road");
    assert_eq!(road["description"], "long drives");
    assert_eq!(road["trackIds"], serde_json::json!(["c", "a"]));

    let favorites = phone.get("/v1/sync/favorites").await.json();
    assert_eq!(favorites["trackIds"], serde_json::json!(["a", "c"]));

    let page = phone.get("/v1/sync/history?limit=2").await.json();
    assert_eq!(page["entries"].as_array().unwrap().len(), 2);
    assert_eq!(page["entries"][0]["id"], "h0");
    assert_eq!(page["entries"][0]["playedSeconds"], 30.5);
    assert_eq!(page["hasMore"], true);
    let next = format!(
        "/v1/sync/history?limit=2&cursor={}",
        page["nextCursor"].as_str().unwrap()
    );
    let rest = phone.get(&next).await.json();
    assert_eq!(rest["entries"][0]["id"], "h2");
    assert_eq!(rest["hasMore"], false);
}

#[tokio::test(flavor = "multi_thread")]
async fn artwork_downloads_by_hash_only() {
    let harness = Harness::start().await;
    let hash = "0123456789abcdef0123456789abcdef";
    std::fs::write(
        harness.art.path().join(format!("{hash}.jpg")),
        b"jpeg-bytes",
    )
    .unwrap();
    let phone = harness.paired_phone().await;

    let art = phone.get(&format!("/v1/sync/art/{hash}")).await;
    assert_eq!(art.status, 200);
    assert_eq!(art.body, b"jpeg-bytes");
    assert_eq!(art.headers["content-type"], "image/jpeg");
    assert!(
        art.headers["cache-control"]
            .to_str()
            .unwrap()
            .contains("immutable")
    );

    assert_eq!(phone.get("/v1/sync/art/ffffffffffffffff").await.status, 404);
    assert_eq!(phone.get("/v1/sync/art/..%2F..%2Fsecret").await.status, 404);
}
