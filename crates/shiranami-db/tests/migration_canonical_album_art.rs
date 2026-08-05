//! Migration `0007_canonical_album_art.sql`, run against rows it has to repair.
//!
//! The migration has already run by the time [`fresh`] returns — on empty
//! tables, where it can prove nothing. So this suite seeds the two columns
//! through raw SQL (the repositories now normalise on write, which is the other
//! half of the fix and would hide the values under test), then executes the
//! migration's own text a second time. That makes every assertion here a claim
//! about the shipped file rather than about a transcription of it, and running
//! it against already-migrated rows is exactly the idempotency check a
//! re-runnable migration owes.
//!
//! The corpus is deliberately wider than the bug: weird ports, every loopback
//! authority, query strings, fragments, values that are already canonical,
//! genuinely remote covers, `data:` URLs and `NULL`. The failure this guards
//! against is not "the repair did not happen" — it is "the repair happened to
//! something it had no business touching".

#[path = "support/library.rs"]
mod library;

use shiranami_core::art::canonical_art_url;
use sqlx::SqliteConnection;

use library::{Library, fresh};

/// The shipped migration, compiled in so the test cannot drift from the file.
const MIGRATION: &str = include_str!("../migrations/0007_canonical_album_art.sql");

/// A loopback art URL with a realistic 64-hex session token.
fn loopback(port: u16, name: &str) -> String {
    format!(
        "http://127.0.0.1:{port}/{}/art/{name}",
        "9f8e7d6c".repeat(8)
    )
}

/// Insert a track with `album_art` bound verbatim, bypassing the write guard.
async fn seed_track(conn: &mut SqliteConnection, id: &str, album_art: Option<&str>) {
    sqlx::query("INSERT INTO tracks (id, file_path, title, album_art) VALUES (?1, ?2, ?3, ?4)")
        .bind(id)
        .bind(format!("/music/{id}.mp3"))
        .bind(id)
        .bind(album_art)
        .execute(&mut *conn)
        .await
        .expect("the seed row inserts");
}

/// Insert a playlist with `cover_art` bound verbatim.
async fn seed_playlist(conn: &mut SqliteConnection, id: &str, cover_art: Option<&str>) {
    sqlx::query("INSERT INTO playlists (id, name, cover_art) VALUES (?1, ?2, ?3)")
        .bind(id)
        .bind(id)
        .bind(cover_art)
        .execute(&mut *conn)
        .await
        .expect("the seed row inserts");
}

/// Run the migration's statements, as sqlx would.
async fn run_migration(conn: &mut SqliteConnection) {
    sqlx::raw_sql(MIGRATION)
        .execute(&mut *conn)
        .await
        .expect("the migration executes");
}

async fn track_art(conn: &mut SqliteConnection, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT album_art FROM tracks WHERE id = ?1")
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .expect("the row is readable")
}

async fn playlist_art(conn: &mut SqliteConnection, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT cover_art FROM playlists WHERE id = ?1")
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .expect("the row is readable")
}

/// Every value the migration must rewrite, and what it must become.
fn repaired() -> Vec<(String, &'static str)> {
    vec![
        // The shape actually found in the user's database.
        (
            loopback(60241, "abc123.jpg"),
            "shiranami-art://art/abc123.jpg",
        ),
        // Any port, including the extremes of the range.
        (loopback(1, "low.jpg"), "shiranami-art://art/low.jpg"),
        (loopback(65535, "high.jpg"), "shiranami-art://art/high.jpg"),
        // Any token, including one short enough to look like a path segment.
        (
            "http://127.0.0.1:50346/t/art/short-token.jpg".to_owned(),
            "shiranami-art://art/short-token.jpg",
        ),
        // Every authority the loopback server can be addressed on.
        (
            "http://localhost:50346/deadbeef/art/local.jpg".to_owned(),
            "shiranami-art://art/local.jpg",
        ),
        (
            "http://[::1]:8080/deadbeef/art/six.jpg".to_owned(),
            "shiranami-art://art/six.jpg",
        ),
        // Query strings and fragments are not part of the file name, in either
        // order.
        (
            "http://127.0.0.1:60241/tok/art/query.jpg?v=2".to_owned(),
            "shiranami-art://art/query.jpg",
        ),
        (
            "http://127.0.0.1:60241/tok/art/frag.jpg#top".to_owned(),
            "shiranami-art://art/frag.jpg",
        ),
        (
            "http://127.0.0.1:60241/tok/art/both.jpg?v=2#top".to_owned(),
            "shiranami-art://art/both.jpg",
        ),
        (
            "http://127.0.0.1:60241/tok/art/both.jpg#top?v=2".to_owned(),
            "shiranami-art://art/both.jpg",
        ),
        // Other cache extensions the directory holds.
        (
            "http://127.0.0.1:60241/tok/art/cover.png".to_owned(),
            "shiranami-art://art/cover.png",
        ),
    ]
}

/// Every value the migration must leave exactly as it found it.
fn untouched() -> Vec<&'static str> {
    vec![
        "shiranami-art://art/already.jpg",
        "https://example.com/cover.jpg",
        // A remote cover whose *path* contains the art segment: the match is
        // anchored to the origin precisely so this survives.
        "https://example.com/tok/art/cover.jpg",
        "http://example.com/tok/art/cover.jpg",
        "data:image/png;base64,AA",
        // Names no file, so there is nothing to rewrite it to.
        "http://127.0.0.1:60241/tok/art/",
        // A loopback URL for another route is not a cover reference.
        "http://127.0.0.1:60241/tok/audio?path=%2Fmusic%2Fa.mp3",
    ]
}

#[tokio::test]
async fn a_loopback_url_becomes_the_canonical_form_in_both_columns() {
    let mut library: Library = fresh().await;

    for (index, (stored, _)) in repaired().into_iter().enumerate() {
        seed_track(library.conn(), &format!("t{index}"), Some(&stored)).await;
        seed_playlist(library.conn(), &format!("p{index}"), Some(&stored)).await;
    }

    run_migration(library.conn()).await;

    for (index, (stored, expected)) in repaired().into_iter().enumerate() {
        assert_eq!(
            track_art(library.conn(), &format!("t{index}"))
                .await
                .as_deref(),
            Some(expected),
            "tracks.album_art was not repaired for {stored}"
        );
        assert_eq!(
            playlist_art(library.conn(), &format!("p{index}"))
                .await
                .as_deref(),
            Some(expected),
            "playlists.cover_art was not repaired for {stored}"
        );
    }
}

/// The half that would be a second data-loss bug if it were wrong.
#[tokio::test]
async fn a_value_that_is_not_a_loopback_art_url_is_left_alone() {
    let mut library = fresh().await;

    for (index, stored) in untouched().into_iter().enumerate() {
        seed_track(library.conn(), &format!("t{index}"), Some(stored)).await;
        seed_playlist(library.conn(), &format!("p{index}"), Some(stored)).await;
    }
    seed_track(library.conn(), "null-art", None).await;
    seed_playlist(library.conn(), "null-cover", None).await;

    run_migration(library.conn()).await;

    for (index, stored) in untouched().into_iter().enumerate() {
        assert_eq!(
            track_art(library.conn(), &format!("t{index}"))
                .await
                .as_deref(),
            Some(stored),
            "tracks.album_art was rewritten and should not have been"
        );
        assert_eq!(
            playlist_art(library.conn(), &format!("p{index}"))
                .await
                .as_deref(),
            Some(stored),
            "playlists.cover_art was rewritten and should not have been"
        );
    }

    assert_eq!(track_art(library.conn(), "null-art").await, None);
    assert_eq!(playlist_art(library.conn(), "null-cover").await, None);
}

/// A migration that is re-runnable is a migration that can ship beside an
/// adoption path which replays whatever it cannot prove has run.
#[tokio::test]
async fn running_the_migration_again_changes_nothing() {
    let mut library = fresh().await;
    let stored = loopback(60241, "twice.jpg");

    seed_track(library.conn(), "t", Some(&stored)).await;
    seed_playlist(library.conn(), "p", Some(&stored)).await;

    run_migration(library.conn()).await;
    let after_first = track_art(library.conn(), "t").await;
    let cover_after_first = playlist_art(library.conn(), "p").await;

    run_migration(library.conn()).await;

    assert_eq!(track_art(library.conn(), "t").await, after_first);
    assert_eq!(playlist_art(library.conn(), "p").await, cover_after_first);
    assert_eq!(
        after_first.as_deref(),
        Some("shiranami-art://art/twice.jpg")
    );
}

/// The SQL and the Rust write guard are two spellings of one rule, and a
/// database repaired by one must be indistinguishable from a database whose
/// writes went through the other.
#[tokio::test]
async fn the_sql_agrees_with_the_rust_guard_on_every_value() {
    let mut library = fresh().await;

    let corpus: Vec<String> = repaired()
        .into_iter()
        .map(|(stored, _)| stored)
        .chain(untouched().into_iter().map(str::to_owned))
        .collect();

    for (index, stored) in corpus.iter().enumerate() {
        seed_track(library.conn(), &format!("t{index}"), Some(stored)).await;
    }

    run_migration(library.conn()).await;

    for (index, stored) in corpus.iter().enumerate() {
        let by_sql = track_art(library.conn(), &format!("t{index}")).await;
        assert_eq!(
            by_sql.as_deref(),
            Some(canonical_art_url(stored).as_ref()),
            "the migration and `canonical_art_url` disagree about {stored}"
        );
    }
}
