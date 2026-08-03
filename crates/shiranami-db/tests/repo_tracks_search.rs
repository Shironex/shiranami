//! `db:tracks:search` against a real database — the FTS5 index end to end.
//!
//! Its own file beside `repo_tracks.rs` for the same reason the queue got one:
//! search is one concern, and the module-shape cap is a budget, not a target.
//! The adoption suite proves the index exists and rebuilds on every open path;
//! this one pins the query semantics (prefix terms, ranking, diacritics,
//! operator input) and that the index tracks the bulk write paths.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks;

use library::{add_track, add_tracks, fresh, retitle, track};

// ── search ────────────────────────────────────────────────────────────────────

/// One `TrackCreateInput` with the searchable metadata fields set.
fn searchable(
    file_path: &str,
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
    genre: Option<&str>,
) -> TrackCreateInput {
    TrackCreateInput {
        artist: artist.map(str::to_owned),
        album: album.map(str::to_owned),
        genre: genre.map(str::to_owned),
        ..track(file_path, title)
    }
}

/// A query term reaches every indexed column, and `bm25`'s column weights put
/// a title hit above a metadata hit — the property the renderer's ranked list
/// depends on, since the JS filter it replaces returned table order.
#[tokio::test]
async fn search_reaches_every_field_and_ranks_title_hits_first() {
    let mut library = fresh().await;

    let by_album = tracks::add(
        library.conn(),
        &searchable(
            "/music/a.mp3",
            "Night Drive",
            None,
            Some("Sakura Nights"),
            None,
        ),
    )
    .await
    .expect("insert")
    .expect("a row")
    .id;
    let by_title = tracks::add(
        library.conn(),
        &searchable("/music/b.mp3", "Sakura Rain", None, None, None),
    )
    .await
    .expect("insert")
    .expect("a row")
    .id;
    let by_genre = tracks::add(
        library.conn(),
        &searchable(
            "/music/c.mp3",
            "Closing Loop",
            None,
            None,
            Some("Sakura Beats"),
        ),
    )
    .await
    .expect("insert")
    .expect("a row")
    .id;

    let found = tracks::search(library.conn(), "sakura", 10)
        .await
        .expect("search");

    let ids: Vec<&str> = found.iter().map(|track| track.id.as_str()).collect();
    assert_eq!(found.len(), 3, "the term must reach title, album and genre");
    assert_eq!(
        ids.first().copied(),
        Some(by_title.as_str()),
        "the title hit outranks the metadata hits"
    );
    assert!(ids.contains(&by_album.as_str()));
    assert!(ids.contains(&by_genre.as_str()));
}

/// `remove_diacritics 2` folds accents on both the index side and the query
/// side, which is the concrete upgrade over the `.includes()` filter this
/// replaces.
#[tokio::test]
async fn search_folds_diacritics_in_both_directions() {
    let mut library = fresh().await;
    let id = tracks::add(
        library.conn(),
        &searchable("/music/halo.mp3", "Halo", Some("Beyoncé"), None, None),
    )
    .await
    .expect("insert")
    .expect("a row")
    .id;

    for query in ["beyonce", "beyoncé", "Beyoncé"] {
        let found = tracks::search(library.conn(), query, 10)
            .await
            .expect("search");
        assert!(
            found.iter().any(|track| track.id == id),
            "`{query}` must find the accented artist"
        );
    }
}

/// Every term is a prefix query and all terms must land — half-typed input
/// narrows rather than misses.
#[tokio::test]
async fn search_treats_every_term_as_a_required_prefix() {
    let mut library = fresh().await;
    add_track(library.conn(), "/music/rain.mp3", "Sakura Rain").await;
    add_track(library.conn(), "/music/snow.mp3", "Sakura Snow").await;

    let broad = tracks::search(library.conn(), "saku", 10)
        .await
        .expect("search");
    assert_eq!(broad.len(), 2, "a half-typed term is a prefix, not a miss");

    // Prefixes match token *starts*, not substrings: "ra" reaches "Rain" but
    // not the "ra" inside "Sakura", so the second term narrows to one row.
    let narrowed = tracks::search(library.conn(), "saku ra", 10)
        .await
        .expect("search");
    assert_eq!(narrowed.len(), 1);
    assert_eq!(narrowed[0].title, "Sakura Rain");
}

/// Raw FTS5 operator syntax must come back as results (or none), never as an
/// error — the input is a search box, not a query language.
#[tokio::test]
async fn search_survives_operator_and_punctuation_input() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/loop.mp3", "Sakura Loop").await;

    let found = tracks::search(library.conn(), "-\"sakura\"* ((loop))", 10)
        .await
        .expect("operator input is defanged, not a syntax error");
    assert!(
        found.iter().any(|track| track.id == id),
        "a defanged NOT reads as a positive term, and parentheses vanish"
    );

    // Keyword operators become literal required terms — surprising-looking,
    // but the box is a search field, not a query language, and an error or a
    // NOT would be worse. "AND" simply matches nothing here.
    let keywords = tracks::search(library.conn(), "sakura AND loop", 10)
        .await
        .expect("keyword input is defanged too");
    assert!(keywords.is_empty(), "no token starts with \"and\"");

    let none = tracks::search(library.conn(), "\"*-^()", 10)
        .await
        .expect("punctuation-only input is an empty search");
    assert!(none.is_empty());

    let empty = tracks::search(library.conn(), "   ", 10)
        .await
        .expect("whitespace input is an empty search");
    assert!(empty.is_empty());
}

#[tokio::test]
async fn search_respects_the_limit() {
    let mut library = fresh().await;
    add_tracks(library.conn(), "loop", 5).await;

    let capped = tracks::search(library.conn(), "loop", 3)
        .await
        .expect("search");
    assert_eq!(capped.len(), 3);
}

/// The index follows the *bulk* write paths — chunked inserts and the
/// transactional retitle/delete — not just the single-row ones the adoption
/// suite proves. A stale index here would be invisible until a search missed
/// a renamed track months later.
#[tokio::test]
async fn search_stays_in_sync_through_the_bulk_paths() {
    let mut library = fresh().await;
    let ids = add_tracks(library.conn(), "batch", 3).await;

    let found = tracks::search(library.conn(), "batch", 10)
        .await
        .expect("search");
    assert_eq!(found.len(), 3, "a bulk insert indexes every row");

    let updates: Vec<(String, _)> = ids
        .iter()
        .map(|id| (id.clone(), retitle("Renamed Wave")))
        .collect();
    tracks::update_many(library.conn(), &updates)
        .await
        .expect("bulk retitle");
    assert!(
        tracks::search(library.conn(), "batch", 10)
            .await
            .expect("search")
            .is_empty(),
        "the old titles must stop matching after a bulk retitle"
    );
    assert_eq!(
        tracks::search(library.conn(), "renamed", 10)
            .await
            .expect("search")
            .len(),
        3
    );

    tracks::remove_many(library.conn(), &ids)
        .await
        .expect("bulk delete");
    assert!(
        tracks::search(library.conn(), "renamed", 10)
            .await
            .expect("search")
            .is_empty(),
        "deleted rows must leave the index"
    );
}

/// Not a regression test — a measurement, for sizing the renderer threshold.
/// Run by hand:
///
/// ```text
/// cargo test -p shiranami-db --test repo_tracks -- --ignored fifty_thousand --nocapture
/// ```
#[tokio::test]
#[ignore = "manual benchmark; prints seed and query timings"]
async fn fts_search_scales_to_a_fifty_thousand_track_library() {
    const WORDS: [&str; 24] = [
        "sakura", "rain", "night", "drive", "lofi", "beat", "dream", "haze", "neon", "tokyo",
        "study", "chill", "wave", "echo", "cloud", "moon", "cafe", "tape", "dust", "glow", "slow",
        "warm", "street", "midnight",
    ];

    let mut library = fresh().await;
    let mut incoming = Vec::with_capacity(50_000);
    for index in 0..50_000_usize {
        let a = WORDS[index % WORDS.len()];
        let b = WORDS[(index / 24) % WORDS.len()];
        let c = WORDS[(index / 576) % WORDS.len()];
        incoming.push(TrackCreateInput {
            artist: Some(format!("{b} collective")),
            album: Some(format!("{c} tapes vol {}", index % 40)),
            genre: Some("Lofi".to_owned()),
            ..track(
                &format!("/music/bench/{index}.mp3"),
                &format!("{a} {b} {c}"),
            )
        });
    }

    let seed = std::time::Instant::now();
    tracks::add_many(library.conn(), &incoming)
        .await
        .expect("seed 50k rows");
    println!(
        "seed 50,000 rows through the triggers: {:?}",
        seed.elapsed()
    );

    for query in ["sakura", "sakura ra", "neon toky", "warm", "nomatchxyz"] {
        let timer = std::time::Instant::now();
        let found = tracks::search(library.conn(), query, 1_000)
            .await
            .expect("search");
        println!(
            "search {query:?}: {} rows in {:?}",
            found.len(),
            timer.elapsed()
        );
    }
}
