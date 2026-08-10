//! The `rules` column's two shapes.
//!
//! The column has always held a JSON array of rules. `limit` and `order_by`
//! ride in it too, as an optional envelope, rather than in columns of their own
//! — v2's adoption path embeds v1's migration ledger verbatim, so adding one
//! there would desync it.
//!
//! That makes the column a compatibility surface rather than a detail, which is
//! why it gets its own suite: a definition using neither extra must still be
//! written as a bare array so an older build can read it, and a row written
//! before either existed must still read and evaluate. Split from
//! `repo_smart_playlists.rs`, which owns the CRUD around it.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    SmartPlaylistField as Field, SmartPlaylistMatchType as Match, SmartPlaylistOperator as Op,
    SmartPlaylistOrderBy, SmartPlaylistSortDirection as Dir,
};
use shiranami_db::repo::smart_playlists::{
    self, SmartPlaylistCreateInput, SmartPlaylistUpdateInput,
};

use library::{fresh, rule, tagged};

/// Read the raw `rules` text, to assert what was actually written rather than
/// what the round trip reports.
async fn stored_rules(library: &mut library::Library, id: &str) -> String {
    sqlx::query_scalar("SELECT rules FROM smart_playlists WHERE id = ?1")
        .bind(id)
        .fetch_one(library.conn())
        .await
        .expect("the column must read")
}

/// A definition using neither a limit nor a sort must still be written as a
/// bare array — byte-identical to what a build predating them wrote, and still
/// readable by one.
#[tokio::test]
async fn a_definition_without_a_limit_or_sort_is_written_as_a_bare_array() {
    let mut library = fresh().await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Plain".to_owned(),
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

    let raw = stored_rules(&mut library, &created.id).await;
    assert!(
        raw.starts_with('['),
        "the legacy shape, not an envelope: {raw}"
    );
    assert!(created.limit.is_none());
    assert!(created.order_by.is_none());
}

#[tokio::test]
async fn a_limit_and_a_sort_round_trip_through_the_envelope() {
    let mut library = fresh().await;
    let order_by = SmartPlaylistOrderBy {
        field: Field::PlayCount,
        direction: Dir::Desc,
    };

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Top 25".to_owned(),
            description: None,
            match_type: Match::All,
            rules: vec![rule(Field::Genre, Op::Is, "Lofi")],
            limit: Some(25),
            order_by: Some(order_by),
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let raw = stored_rules(&mut library, &created.id).await;
    assert!(raw.starts_with('{'), "the envelope shape: {raw}");
    assert!(raw.contains("\"orderBy\""), "camelCase on disk: {raw}");

    let read_back = smart_playlists::get(library.conn(), &created.id)
        .await
        .expect("read")
        .expect("a row");
    assert_eq!(read_back.limit, Some(25));
    assert_eq!(read_back.order_by, Some(order_by));
    assert_eq!(read_back.rules.len(), 1);
}

/// Migration safety: a row written before `limit`/`order_by` existed must read
/// and evaluate exactly as it always did.
#[tokio::test]
async fn a_playlist_saved_before_limit_and_order_by_still_reads_and_evaluates() {
    let mut library = fresh().await;
    tagged(library.conn(), "Lofi Track", "Lofi", None).await;
    tagged(library.conn(), "Rock Track", "Rock", None).await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Legacy".to_owned(),
            description: None,
            match_type: Match::All,
            rules: Vec::new(),
            limit: None,
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    // Exactly the text the pre-change writer produced.
    sqlx::query("UPDATE smart_playlists SET rules = ?1 WHERE id = ?2")
        .bind(r#"[{"field":"genre","operator":"is","value":"Lofi","valueTo":null}]"#)
        .bind(&created.id)
        .execute(library.conn())
        .await
        .expect("write the legacy shape");

    let read_back = smart_playlists::get(library.conn(), &created.id)
        .await
        .expect("read")
        .expect("a row");
    assert_eq!(read_back.rules.len(), 1);
    assert!(read_back.limit.is_none());
    assert!(read_back.order_by.is_none());

    let matched = smart_playlists::get_tracks(library.conn(), &created.id)
        .await
        .expect("evaluate");
    assert_eq!(matched.len(), 1);
    assert_eq!(matched[0].title, "Lofi Track");
}

/// `rules`, `limit` and `order_by` share one column, so a patch naming the
/// rules rewrites all three — which is the only way the editor can clear a
/// limit through an optional field.
#[tokio::test]
async fn a_patch_naming_the_rules_clears_a_stale_limit() {
    let mut library = fresh().await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Top 25".to_owned(),
            description: None,
            match_type: Match::All,
            rules: Vec::new(),
            limit: Some(25),
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let updated = smart_playlists::update(
        library.conn(),
        &created.id,
        &SmartPlaylistUpdateInput {
            rules: Some(vec![rule(Field::Genre, Op::Is, "Lofi")]),
            ..SmartPlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(updated.rules.len(), 1);
    assert!(updated.limit.is_none(), "the limit went with the rewrite");
}

#[tokio::test]
async fn a_patch_naming_only_the_limit_keeps_the_stored_rules() {
    let mut library = fresh().await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Lofi".to_owned(),
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

    let updated = smart_playlists::update(
        library.conn(),
        &created.id,
        &SmartPlaylistUpdateInput {
            limit: Some(10),
            ..SmartPlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(updated.limit, Some(10));
    assert_eq!(updated.rules.len(), 1, "the rules survived the limit patch");
}
