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
