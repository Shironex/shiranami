//! Smart-playlist evaluation against real rows.
//!
//! `db:smart-playlists:get-tracks` and `:preview` — the two channels that run
//! a rule set over the library. The compiler's operator matrix is in
//! `smart_rules.rs` and asserts SQL text; these are the ported cases from v1's
//! `smart-playlists.test.ts`, which assert which tracks come back.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    SmartPlaylistDefinition, SmartPlaylistField as Field, SmartPlaylistMatchType as Match,
    SmartPlaylistOperator as Op, SmartPlaylistOrderBy, SmartPlaylistRule,
    SmartPlaylistSortDirection as Dir,
};
use shiranami_db::repo::smart_playlists::{self, SmartPlaylistCreateInput};
use shiranami_db::repo::tracks;

use library::{
    definition, fresh, played, preview, rule, set_analysis, set_created_at, set_play_count, tagged,
};

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
async fn get_tracks_evaluates_a_saved_playlist_and_tolerates_an_unknown_id() {
    let mut library = fresh().await;
    tagged(library.conn(), "Lofi Track", "Lofi", None).await;
    tagged(library.conn(), "Rock Track", "Rock", None).await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Lofi only".to_owned(),
            description: None,
            match_type: Match::All,
            rules: vec![rule(Field::Genre, Op::Is, "Lofi")],
            limit: None,
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let matched = smart_playlists::get_tracks(library.conn(), &created.id)
        .await
        .expect("evaluate");
    assert_eq!(matched.len(), 1);
    assert_eq!(matched[0].title, "Lofi Track");

    assert!(
        smart_playlists::get_tracks(library.conn(), "not-a-playlist")
            .await
            .expect("an unknown id is empty, not an error")
            .is_empty()
    );
}

#[tokio::test]
async fn preview_filters_by_genre_is() {
    let mut library = fresh().await;
    tagged(library.conn(), "Lofi Track", "Lofi", None).await;
    tagged(library.conn(), "Rock Track", "Rock", None).await;

    let matched = preview(
        library.conn(),
        &definition(Match::All, vec![rule(Field::Genre, Op::Is, "Lofi")]),
    )
    .await;

    assert_eq!(matched, vec!["Lofi Track"]);
}

#[tokio::test]
async fn preview_filters_by_year_between_inclusively() {
    let mut library = fresh().await;
    tagged(library.conn(), "Nineteen", "Lofi", Some(1999)).await;
    tagged(library.conn(), "Two Thousand", "Lofi", Some(2000)).await;
    tagged(library.conn(), "Middle", "Lofi", Some(2005)).await;
    tagged(library.conn(), "Eight", "Lofi", Some(2008)).await;
    tagged(library.conn(), "Ten", "Lofi", Some(2010)).await;

    let matched = preview(
        library.conn(),
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
    let mut library = fresh().await;
    let high = tagged(library.conn(), "Popular", "Lofi", None).await;
    let low = tagged(library.conn(), "Rare", "Lofi", None).await;
    set_play_count(library.conn(), &high, 6).await;
    set_play_count(library.conn(), &low, 1).await;

    let matched = preview(
        library.conn(),
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
    let mut library = fresh().await;
    tagged(library.conn(), "Recent Lofi", "Lofi", Some(2020)).await;
    tagged(library.conn(), "Old Lofi", "Lofi", Some(2000)).await;
    tagged(library.conn(), "Recent Jazz", "Jazz", Some(2020)).await;

    let both = preview(
        library.conn(),
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
        library.conn(),
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
    let mut library = fresh().await;
    tagged(library.conn(), "100% Lofi", "Lofi", None).await;
    tagged(library.conn(), "Pure Jazz", "Jazz", None).await;

    let matched = preview(
        library.conn(),
        &definition(Match::All, vec![rule(Field::Title, Op::Contains, "100%")]),
    )
    .await;

    assert_eq!(matched, vec!["100% Lofi"]);
}

#[tokio::test]
async fn preview_with_an_empty_rule_set_matches_the_whole_library() {
    let mut library = fresh().await;
    tagged(library.conn(), "One", "Lofi", None).await;
    tagged(library.conn(), "Two", "Rock", None).await;

    let matched = preview(library.conn(), &definition(Match::All, Vec::new())).await;

    assert_eq!(matched.len(), 2);
}

#[tokio::test]
async fn preview_filters_by_favourite() {
    let mut library = fresh().await;
    let favourite = tagged(library.conn(), "Loved", "Lofi", None).await;
    tagged(library.conn(), "Ignored", "Lofi", None).await;
    tracks::toggle_favorite(library.conn(), &favourite)
        .await
        .expect("toggle");

    let matched = preview(
        library.conn(),
        &definition(Match::All, vec![rule(Field::IsFavorite, Op::Is, "true")]),
    )
    .await;
    assert_eq!(matched, vec!["Loved"]);

    let inverted = preview(
        library.conn(),
        &definition(Match::All, vec![rule(Field::IsFavorite, Op::IsNot, "true")]),
    )
    .await;
    assert_eq!(inverted, vec!["Ignored"]);
}

#[tokio::test]
async fn preview_filters_by_date_added_within_the_last_days() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let ancient = tagged(library.conn(), "Ancient", "Lofi", None).await;
    set_created_at(library.conn(), &ancient, "2020-01-01 00:00:00").await;

    let matched = preview(
        library.conn(),
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
    let mut library = fresh().await;
    let first = tagged(library.conn(), "First", "Lofi", None).await;
    let second = tagged(library.conn(), "Second", "Lofi", None).await;
    let older = tagged(library.conn(), "Older", "Lofi", None).await;

    for id in [&first, &second] {
        set_created_at(library.conn(), id, "2026-06-01 12:00:00").await;
    }
    set_created_at(library.conn(), &older, "2026-01-01 12:00:00").await;

    let matched = preview(library.conn(), &definition(Match::All, Vec::new())).await;

    assert_eq!(matched, vec!["First", "Second", "Older"]);
}

// ── last_played ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn last_played_in_last_days_matches_only_plays_inside_the_window() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let stale = tagged(library.conn(), "Stale", "Lofi", None).await;
    tagged(library.conn(), "Never", "Lofi", None).await;
    played(library.conn(), &recent, 3, "library").await;
    played(library.conn(), &stale, 120, "library").await;

    let matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LastPlayed, Op::InLastDays, "90")],
        ),
    )
    .await;

    assert_eq!(matched, vec!["Recent"]);
}

/// The single most-requested rule, and the one easiest to get wrong: a track
/// with no play history at all has not been played in the last 90 days.
#[tokio::test]
async fn last_played_not_in_last_days_includes_a_never_played_track() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let stale = tagged(library.conn(), "Stale", "Lofi", None).await;
    tagged(library.conn(), "Never", "Lofi", None).await;
    played(library.conn(), &recent, 3, "library").await;
    played(library.conn(), &stale, 120, "library").await;

    let mut matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LastPlayed, Op::NotInLastDays, "90")],
        ),
    )
    .await;
    matched.sort();

    assert_eq!(matched, vec!["Never", "Stale"]);
}

#[tokio::test]
async fn last_played_reads_the_newest_play_not_the_oldest() {
    let mut library = fresh().await;
    let revisited = tagged(library.conn(), "Revisited", "Lofi", None).await;
    played(library.conn(), &revisited, 400, "library").await;
    played(library.conn(), &revisited, 2, "library").await;

    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::InLastDays, "30")],
            ),
        )
        .await,
        vec!["Revisited"]
    );
    assert!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::NotInLastDays, "30")],
            ),
        )
        .await
        .is_empty()
    );
}

/// A radio row in `play_history` is not a play of the track it is keyed to, so
/// it must neither satisfy "played recently" nor stop the track satisfying
/// "not played recently".
#[tokio::test]
async fn a_radio_play_never_counts_as_playing_the_track() {
    let mut library = fresh().await;
    let track = tagged(library.conn(), "Radio only", "Lofi", None).await;
    played(library.conn(), &track, 1, "radio").await;

    assert!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::InLastDays, "30")],
            ),
        )
        .await
        .is_empty(),
        "a radio row is not a play of this track"
    );
    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::NotInLastDays, "30")],
            ),
        )
        .await,
        vec!["Radio only"],
        "and it must not hide the track from the negated rule either"
    );
}

// ── the analysis columns ──────────────────────────────────────────────────────

#[tokio::test]
async fn preview_filters_by_bpm_between() {
    let mut library = fresh().await;
    let slow = tagged(library.conn(), "Slow", "Lofi", None).await;
    let mid = tagged(library.conn(), "Mid", "Lofi", None).await;
    let fast = tagged(library.conn(), "Fast", "Lofi", None).await;
    tagged(library.conn(), "Unanalysed", "Lofi", None).await;
    set_analysis(library.conn(), &slow, Some(80.0), None).await;
    set_analysis(library.conn(), &mid, Some(118.0), None).await;
    set_analysis(library.conn(), &fast, Some(174.0), None).await;

    let matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![SmartPlaylistRule {
                field: Field::Bpm,
                operator: Op::Between,
                value: "100".to_owned(),
                value_to: Some("130".to_owned()),
            }],
        ),
    )
    .await;

    assert_eq!(matched, vec!["Mid"], "an unanalysed track is not in range");
}

/// `NULL` means "not analysed". SQL excludes it from every comparison, `isNot`
/// included — asserted because the other reading ("unknown is not 120, so it
/// matches") would quietly fill this playlist with unanalysed tracks.
#[tokio::test]
async fn an_unanalysed_track_satisfies_no_numeric_operator() {
    let mut library = fresh().await;
    let analysed = tagged(library.conn(), "Analysed", "Lofi", None).await;
    tagged(library.conn(), "Unanalysed", "Lofi", None).await;
    set_analysis(library.conn(), &analysed, Some(120.0), Some(-14.0)).await;

    for operator in [Op::Is, Op::IsNot, Op::GreaterThan, Op::LessThan] {
        let matched = preview(
            library.conn(),
            &definition(Match::All, vec![rule(Field::Bpm, operator, "120")]),
        )
        .await;
        assert!(
            !matched.iter().any(|title| title == "Unanalysed"),
            "`{operator:?}` must not admit an unanalysed track: {matched:?}"
        );
    }

    let quiet = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LoudnessLufs, Op::LessThan, "-10")],
        ),
    )
    .await;
    assert_eq!(quiet, vec!["Analysed"]);
}

#[tokio::test]
async fn preview_filters_by_duration_and_musical_key() {
    let mut library = fresh().await;
    // `tagged` gives every track a 200-second duration.
    let keyed = tagged(library.conn(), "Keyed", "Lofi", None).await;
    tagged(library.conn(), "Unkeyed", "Lofi", None).await;
    sqlx::query("UPDATE tracks SET musical_key = '8A' WHERE id = ?1")
        .bind(&keyed)
        .execute(library.conn())
        .await
        .expect("the key must set");

    assert_eq!(
        preview(
            library.conn(),
            &definition(Match::All, vec![rule(Field::MusicalKey, Op::Is, "8A")]),
        )
        .await,
        vec!["Keyed"]
    );
    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::Duration, Op::GreaterThan, "100")],
            ),
        )
        .await
        .len(),
        2
    );
}

// ── limit and order_by ────────────────────────────────────────────────────────

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
