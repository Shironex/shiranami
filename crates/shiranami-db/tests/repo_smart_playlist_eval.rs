//! Smart-playlist evaluation against real rows.
//!
//! `db:smart-playlists:get-tracks` and `:preview` — the two channels that run
//! a rule set over the library. The compiler's operator matrix is in
//! `smart_rules.rs` and asserts SQL text; these are the ported cases from v1's
//! `smart-playlists.test.ts`, which assert which tracks come back.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    SmartPlaylistField as Field, SmartPlaylistMatchType as Match, SmartPlaylistOperator as Op,
    SmartPlaylistRule,
};
use shiranami_db::repo::smart_playlists::{self, SmartPlaylistCreateInput};
use shiranami_db::repo::tracks;

use library::{definition, fresh, preview, rule, set_created_at, set_play_count, tagged};

#[tokio::test]
async fn get_tracks_evaluates_a_saved_playlist_and_tolerates_an_unknown_id() {
    let library = fresh().await;
    tagged(&library, "Lofi Track", "Lofi", None).await;
    tagged(&library, "Rock Track", "Rock", None).await;

    let created = smart_playlists::create(
        &library.pool,
        &SmartPlaylistCreateInput {
            name: "Lofi only".to_owned(),
            description: None,
            match_type: Match::All,
            rules: vec![rule(Field::Genre, Op::Is, "Lofi")],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let matched = smart_playlists::get_tracks(&library.pool, &created.id)
        .await
        .expect("evaluate");
    assert_eq!(matched.len(), 1);
    assert_eq!(matched[0].title, "Lofi Track");

    assert!(
        smart_playlists::get_tracks(&library.pool, "not-a-playlist")
            .await
            .expect("an unknown id is empty, not an error")
            .is_empty()
    );
}

#[tokio::test]
async fn preview_filters_by_genre_is() {
    let library = fresh().await;
    tagged(&library, "Lofi Track", "Lofi", None).await;
    tagged(&library, "Rock Track", "Rock", None).await;

    let matched = preview(
        &library,
        &definition(Match::All, vec![rule(Field::Genre, Op::Is, "Lofi")]),
    )
    .await;

    assert_eq!(matched, vec!["Lofi Track"]);
}

#[tokio::test]
async fn preview_filters_by_year_between_inclusively() {
    let library = fresh().await;
    tagged(&library, "Nineteen", "Lofi", Some(1999)).await;
    tagged(&library, "Two Thousand", "Lofi", Some(2000)).await;
    tagged(&library, "Middle", "Lofi", Some(2005)).await;
    tagged(&library, "Eight", "Lofi", Some(2008)).await;
    tagged(&library, "Ten", "Lofi", Some(2010)).await;

    let matched = preview(
        &library,
        &definition(
            Match::All,
            vec![SmartPlaylistRule {
                field: Field::Year,
                operator: Op::Between,
                value: "2000".to_owned(),
                value_to: Some("2008".to_owned()),
            }],
        ),
    )
    .await;

    assert_eq!(matched.len(), 3, "the bounds are inclusive: {matched:?}");
    assert!(matched.contains(&"Two Thousand".to_owned()));
    assert!(matched.contains(&"Eight".to_owned()));
}

#[tokio::test]
async fn preview_filters_by_play_count_greater_than() {
    let library = fresh().await;
    let high = tagged(&library, "Popular", "Lofi", None).await;
    let low = tagged(&library, "Rare", "Lofi", None).await;
    set_play_count(&library, &high, 6).await;
    set_play_count(&library, &low, 1).await;

    let matched = preview(
        &library,
        &definition(
            Match::All,
            vec![rule(Field::PlayCount, Op::GreaterThan, "5")],
        ),
    )
    .await;

    assert_eq!(matched, vec!["Popular"]);
}

#[tokio::test]
async fn preview_combines_rules_with_all_and_with_any() {
    let library = fresh().await;
    tagged(&library, "Recent Lofi", "Lofi", Some(2020)).await;
    tagged(&library, "Old Lofi", "Lofi", Some(2000)).await;
    tagged(&library, "Recent Jazz", "Jazz", Some(2020)).await;

    let both = preview(
        &library,
        &definition(
            Match::All,
            vec![
                rule(Field::Genre, Op::Is, "Lofi"),
                rule(Field::Year, Op::GreaterThan, "2010"),
            ],
        ),
    )
    .await;
    assert_eq!(both, vec!["Recent Lofi"]);

    let either = preview(
        &library,
        &definition(
            Match::Any,
            vec![
                rule(Field::Genre, Op::Is, "Jazz"),
                rule(Field::Year, Op::GreaterThan, "2010"),
            ],
        ),
    )
    .await;
    assert_eq!(either.len(), 2);
}

/// Unescaped, the `%` would match any sequence and return both rows.
#[tokio::test]
async fn preview_treats_like_wildcards_in_a_contains_value_as_literal() {
    let library = fresh().await;
    tagged(&library, "100% Lofi", "Lofi", None).await;
    tagged(&library, "Pure Jazz", "Jazz", None).await;

    let matched = preview(
        &library,
        &definition(Match::All, vec![rule(Field::Title, Op::Contains, "100%")]),
    )
    .await;

    assert_eq!(matched, vec!["100% Lofi"]);
}

#[tokio::test]
async fn preview_with_an_empty_rule_set_matches_the_whole_library() {
    let library = fresh().await;
    tagged(&library, "One", "Lofi", None).await;
    tagged(&library, "Two", "Rock", None).await;

    let matched = preview(&library, &definition(Match::All, Vec::new())).await;

    assert_eq!(matched.len(), 2);
}

#[tokio::test]
async fn preview_filters_by_favourite() {
    let library = fresh().await;
    let favourite = tagged(&library, "Loved", "Lofi", None).await;
    tagged(&library, "Ignored", "Lofi", None).await;
    tracks::toggle_favorite(&library.pool, &favourite)
        .await
        .expect("toggle");

    let matched = preview(
        &library,
        &definition(Match::All, vec![rule(Field::IsFavorite, Op::Is, "true")]),
    )
    .await;
    assert_eq!(matched, vec!["Loved"]);

    let inverted = preview(
        &library,
        &definition(Match::All, vec![rule(Field::IsFavorite, Op::IsNot, "true")]),
    )
    .await;
    assert_eq!(inverted, vec!["Ignored"]);
}

#[tokio::test]
async fn preview_filters_by_date_added_within_the_last_days() {
    let library = fresh().await;
    let recent = tagged(&library, "Recent", "Lofi", None).await;
    let ancient = tagged(&library, "Ancient", "Lofi", None).await;
    set_created_at(&library, &ancient, "2020-01-01 00:00:00").await;

    let matched = preview(
        &library,
        &definition(
            Match::All,
            vec![rule(Field::DateAdded, Op::InLastDays, "7")],
        ),
    )
    .await;

    assert_eq!(matched, vec!["Recent"]);
    assert!(!recent.is_empty());
}

/// Evaluation is a library read, so it carries the same order and the same
/// tie-break as `db:tracks:get-all`.
#[tokio::test]
async fn evaluation_orders_newest_first_with_the_library_tie_break() {
    let library = fresh().await;
    let first = tagged(&library, "First", "Lofi", None).await;
    let second = tagged(&library, "Second", "Lofi", None).await;
    let older = tagged(&library, "Older", "Lofi", None).await;

    for id in [&first, &second] {
        set_created_at(&library, id, "2026-06-01 12:00:00").await;
    }
    set_created_at(&library, &older, "2026-01-01 12:00:00").await;

    let matched = preview(&library, &definition(Match::All, Vec::new())).await;

    assert_eq!(matched, vec!["First", "Second", "Older"]);
}
