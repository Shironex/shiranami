//! `db:smart-playlists:*` — storage, against a real database.
//!
//! Round-tripping a rule set through the JSON `rules` column, and what happens
//! when that column holds something this build cannot read. Evaluation lives in
//! `repo_smart_playlist_eval.rs`; the compiler's operator matrix is in
//! `smart_rules.rs`.

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

#[tokio::test]
async fn create_round_trips_the_rules_through_the_rules_column() {
    let mut library = fresh().await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Lofi only".to_owned(),
            description: Some("just lofi".to_owned()),
            match_type: Match::Any,
            rules: vec![
                rule(Field::Genre, Op::Is, "Lofi"),
                rule(Field::Year, Op::GreaterThan, "2010"),
            ],
            limit: None,
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    assert!(!created.id.is_empty());
    assert_eq!(created.name, "Lofi only");
    assert_eq!(created.description.as_deref(), Some("just lofi"));
    assert_eq!(created.match_type, Match::Any);
    assert_eq!(created.rules.len(), 2);
    assert_eq!(created.rules[0], rule(Field::Genre, Op::Is, "Lofi"));

    let read_back = smart_playlists::get(library.conn(), &created.id)
        .await
        .expect("read")
        .expect("a row");
    assert_eq!(read_back, created);
}

#[tokio::test]
async fn get_all_returns_the_newest_first_and_get_handles_an_unknown_id() {
    let mut library = fresh().await;

    let older = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Older".to_owned(),
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

    let newer = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Newer".to_owned(),
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

    sqlx::query("UPDATE smart_playlists SET created_at = ?1 WHERE id = ?2")
        .bind("2026-01-01 00:00:00")
        .bind(&older.id)
        .execute(library.conn())
        .await
        .expect("backdate");

    let all = smart_playlists::get_all(library.conn())
        .await
        .expect("read");
    assert_eq!(
        all.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(),
        vec!["Newer", "Older"]
    );
    assert_eq!(all[0].id, newer.id);

    assert!(
        smart_playlists::get(library.conn(), "not-a-playlist")
            .await
            .expect("read")
            .is_none()
    );
}

#[tokio::test]
async fn update_replaces_only_the_fields_it_names() {
    let mut library = fresh().await;
    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Before".to_owned(),
            description: Some("kept".to_owned()),
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
            name: Some("After".to_owned()),
            match_type: Some(Match::Any),
            ..SmartPlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(updated.name, "After");
    assert_eq!(updated.match_type, Match::Any);
    assert_eq!(updated.description.as_deref(), Some("kept"), "untouched");
    assert_eq!(updated.rules, created.rules, "untouched");
}

#[tokio::test]
async fn update_replaces_the_whole_rule_set() {
    let mut library = fresh().await;
    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Rules".to_owned(),
            description: None,
            match_type: Match::All,
            rules: vec![
                rule(Field::Genre, Op::Is, "Lofi"),
                rule(Field::Year, Op::GreaterThan, "2010"),
            ],
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
            rules: Some(vec![rule(Field::IsFavorite, Op::Is, "true")]),
            ..SmartPlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(updated.rules, vec![rule(Field::IsFavorite, Op::Is, "true")]);
}

/// v1 passed drizzle a raw ``sql`datetime('now')` `` here rather than a
/// JavaScript date, so this column keeps the *other* timestamp spelling — the
/// one with a space and no milliseconds.
#[tokio::test]
async fn update_stamps_updated_at_in_the_sqlite_format() {
    let mut library = fresh().await;
    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Stamped".to_owned(),
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

    let updated = smart_playlists::update(
        library.conn(),
        &created.id,
        &SmartPlaylistUpdateInput::default(),
    )
    .await
    .expect("an empty patch still stamps")
    .expect("a row");

    assert_eq!(updated.updated_at.len(), 19);
    assert!(!updated.updated_at.contains('T'));
    assert!(!updated.updated_at.ends_with('Z'));
}

#[tokio::test]
async fn update_of_an_unknown_id_returns_nothing() {
    let mut library = fresh().await;

    assert!(
        smart_playlists::update(library.conn(), "nope", &SmartPlaylistUpdateInput::default())
            .await
            .expect("update")
            .is_none()
    );
}

#[tokio::test]
async fn delete_removes_the_smart_playlist() {
    let mut library = fresh().await;
    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Doomed".to_owned(),
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

    smart_playlists::delete(library.conn(), &created.id)
        .await
        .expect("delete");

    assert!(
        smart_playlists::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

// ── degrading rather than failing ─────────────────────────────────────────────

/// The `rules` column is JSON written by a possibly-older build. A document
/// that cannot be read costs the playlist its filter, not its existence:
/// losing the filter is visible and recoverable, and a playlist vanishing from
/// the sidebar looks like data loss.
#[tokio::test]
async fn a_malformed_rules_document_degrades_to_no_rules() {
    let mut library = fresh().await;
    tagged(library.conn(), "Anything", "Lofi", None).await;

    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Corrupted".to_owned(),
            description: None,
            match_type: Match::All,
            rules: vec![rule(Field::Genre, Op::Is, "Jazz")],
            limit: None,
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    for broken in ["not json at all", r#"[{"field":"nonsense"}]"#, "{}"] {
        sqlx::query("UPDATE smart_playlists SET rules = ?1 WHERE id = ?2")
            .bind(broken)
            .bind(&created.id)
            .execute(library.conn())
            .await
            .expect("corrupt the column");

        let read_back = smart_playlists::get(library.conn(), &created.id)
            .await
            .expect("the read must not fail")
            .expect("the playlist must still exist");
        assert!(read_back.rules.is_empty(), "the filter is what is lost");

        let matched = smart_playlists::get_tracks(library.conn(), &created.id)
            .await
            .expect("evaluate");
        assert_eq!(matched.len(), 1, "and it then matches the whole library");
    }
}

#[tokio::test]
async fn an_unrecognised_match_type_degrades_to_all() {
    let mut library = fresh().await;
    let created = smart_playlists::create(
        library.conn(),
        &SmartPlaylistCreateInput {
            name: "Odd".to_owned(),
            description: None,
            match_type: Match::Any,
            rules: Vec::new(),
            limit: None,
            order_by: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    sqlx::query("UPDATE smart_playlists SET match_type = 'sideways' WHERE id = ?1")
        .bind(&created.id)
        .execute(library.conn())
        .await
        .expect("corrupt the column");

    let read_back = smart_playlists::get(library.conn(), &created.id)
        .await
        .expect("read")
        .expect("a row");

    assert_eq!(read_back.match_type, Match::All);
}

// ── the rules column's two shapes ─────────────────────────────────────────────

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
