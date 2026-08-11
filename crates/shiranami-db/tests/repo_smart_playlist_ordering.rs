//! Smart-playlist ordering and capping, against real rows.
//!
//! Split from `repo_smart_playlist_eval.rs`, which owns *which* rows a
//! definition selects. This owns the other half: what order they come back in
//! and how many. The two interact — a cap applied before the filter, or a sort
//! that reads a play the filter would have excluded, are both wrong in ways a
//! matching-only test cannot see — so the cases that cross that line live here.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    SmartPlaylistDefinition, SmartPlaylistField as Field, SmartPlaylistMatchType as Match,
    SmartPlaylistOperator as Op, SmartPlaylistOrderBy, SmartPlaylistRule,
    SmartPlaylistSortDirection as Dir,
};

use library::{fresh, played, preview, rule, set_play_count, tagged};

/// A definition with an explicit sort and/or a cap.
fn ordered(
    rules: Vec<SmartPlaylistRule>,
    limit: Option<u32>,
    order_by: Option<(Field, Dir)>,
) -> SmartPlaylistDefinition {
    SmartPlaylistDefinition {
        match_type: Match::All,
        rules,
        limit,
        order_by: order_by.map(|(field, direction)| SmartPlaylistOrderBy { field, direction }),
    }
}

#[tokio::test]
async fn a_limit_and_a_sort_express_top_n_most_played() {
    let mut library = fresh().await;
    let first = tagged(library.conn(), "First", "Lofi", None).await;
    let second = tagged(library.conn(), "Second", "Lofi", None).await;
    let third = tagged(library.conn(), "Third", "Lofi", None).await;
    set_play_count(library.conn(), &first, 9).await;
    set_play_count(library.conn(), &second, 5).await;
    set_play_count(library.conn(), &third, 1).await;

    let matched = preview(
        library.conn(),
        &ordered(Vec::new(), Some(2), Some((Field::PlayCount, Dir::Desc))),
    )
    .await;

    assert_eq!(matched, vec!["First", "Second"]);
}

/// A track never played is the least recently played thing in the library, and
/// SQLite sorting `NULL` lowest puts it exactly there.
#[tokio::test]
async fn sorting_by_last_played_ascending_puts_never_played_first() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let stale = tagged(library.conn(), "Stale", "Lofi", None).await;
    tagged(library.conn(), "Never", "Lofi", None).await;
    played(library.conn(), &recent, 1, "library").await;
    played(library.conn(), &stale, 200, "library").await;

    let matched = preview(
        library.conn(),
        &ordered(Vec::new(), None, Some((Field::LastPlayed, Dir::Asc))),
    )
    .await;

    assert_eq!(matched, vec!["Never", "Stale", "Recent"]);
}

/// A radio row must not make a track look recently played to the *sort* either,
/// not just to the filter.
#[tokio::test]
async fn sorting_by_last_played_ignores_radio_rows() {
    let mut library = fresh().await;
    let radio = tagged(library.conn(), "Radio only", "Lofi", None).await;
    let real = tagged(library.conn(), "Really played", "Lofi", None).await;
    played(library.conn(), &radio, 1, "radio").await;
    played(library.conn(), &real, 300, "library").await;

    let matched = preview(
        library.conn(),
        &ordered(Vec::new(), None, Some((Field::LastPlayed, Dir::Asc))),
    )
    .await;

    assert_eq!(
        matched,
        vec!["Radio only", "Really played"],
        "the radio-only track has no library play, so it sorts as never played"
    );
}

#[tokio::test]
async fn a_limit_applies_after_the_rules_and_composes_with_any() {
    let mut library = fresh().await;
    let popular = tagged(library.conn(), "Popular Jazz", "Jazz", None).await;
    tagged(library.conn(), "Lofi", "Lofi", None).await;
    tagged(library.conn(), "Ignored", "Rock", None).await;
    set_play_count(library.conn(), &popular, 7).await;

    let matched = preview(
        library.conn(),
        &SmartPlaylistDefinition {
            match_type: Match::Any,
            rules: vec![
                rule(Field::Genre, Op::Is, "Lofi"),
                rule(Field::PlayCount, Op::GreaterThan, "5"),
            ],
            limit: Some(1),
            order_by: Some(SmartPlaylistOrderBy {
                field: Field::PlayCount,
                direction: Dir::Desc,
            }),
        },
    )
    .await;

    assert_eq!(matched, vec!["Popular Jazz"], "the cap follows the filter");
}

#[tokio::test]
async fn a_definition_matching_nothing_evaluates_to_an_empty_list() {
    let mut library = fresh().await;
    tagged(library.conn(), "Lofi", "Lofi", None).await;

    assert!(
        preview(
            library.conn(),
            &ordered(
                vec![rule(Field::Genre, Op::Is, "Polka")],
                Some(25),
                Some((Field::PlayCount, Dir::Desc)),
            ),
        )
        .await
        .is_empty(),
        "a limit must not conjure rows a filter excluded"
    );
}

/// The explicit sort replaces the leading key but keeps `rowid` as the final
/// one, so a run of equal values stays in a stable, reproducible order.
#[tokio::test]
async fn an_explicit_sort_keeps_the_library_tie_break() {
    let mut library = fresh().await;
    for title in ["First", "Second", "Third"] {
        let id = tagged(library.conn(), title, "Lofi", None).await;
        set_play_count(library.conn(), &id, 4).await;
    }

    let matched = preview(
        library.conn(),
        &ordered(Vec::new(), None, Some((Field::PlayCount, Dir::Desc))),
    )
    .await;

    assert_eq!(matched, vec!["First", "Second", "Third"], "insertion order");
}
