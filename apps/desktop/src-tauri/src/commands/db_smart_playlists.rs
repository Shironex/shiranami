//! `db:smart-playlists:*` — rule-based playlists.
//!
//! Seven channels, ported from
//! `apps/desktop/src/main/ipc/database/smart-playlists.ts`. A smart playlist
//! persists only its rules; its tracks are evaluated against the library at read
//! time, so it follows the library as that changes. The rule → SQL translation
//! is `shiranami_db::repo::smart_rules` and the storage around it is
//! `repo::smart_playlists`; both settled in Phase 7 and neither is
//! re-implemented here.
//!
//! # The two input shapes live here because v1's only definition was a zod
//! schema
//!
//! `smartPlaylistCreateInput` and `smartPlaylistUpdateInput` were never domain
//! types in v1 — the channel's schema was the whole contract, so there is
//! nothing in `packages/contracts/src/domain/` for `shiranami-core` to have
//! ported. The repository declares its own plain-Rust equivalents (no serde, no
//! specta, because a repository has no wire), so [`SmartPlaylistCreateInput`]
//! and [`SmartPlaylistUpdateInput`] below are the *wire* halves and this module
//! maps one onto the other. The same shape as `db_tracks`'s `TrackUpdateEntry`,
//! and for the same reason.
//!
//! # `update` uses a plain `Option`, not `Patch`
//!
//! v1's handler tested each field against `undefined` and had no way to write
//! `NULL` through this channel — `description: z.string().optional()` accepts a
//! string or nothing, never `null`. So there is no third state to carry and
//! `Option<T>` is the entire contract: absent leaves the column alone. Reaching
//! for [`shiranami_core::models::Patch`] here would invent a "clear it" state
//! the renderer has no way to send and the repository has no column write for.
//!
//! # Malformed rules are survivable, and that is the repository's decision
//!
//! The `rules` column is JSON text written by a build that may be older than
//! this one. A document that will not parse, or that parses but fails
//! validation, degrades to *no rules* rather than failing the read — which means
//! a smart playlist whose rules are unreadable matches the whole library rather
//! than disappearing from the sidebar. Losing the filter is visible and
//! recoverable; losing the playlist looks like data loss. `match_type` degrades
//! to `all` the same way. Stated here because it reads like something a command
//! layer would want to "fix" by rejecting, and rejecting is the worse outcome.
//!
//! # Validation
//!
//! `name` was `z.string().min(1)` on create and `.optional()` on update. serde
//! gives the shape; the non-empty bound is semantic and is re-raised as
//! `BAD_REQUEST`. Everything else in these payloads is an enum or a string the
//! rule compiler already treats defensively — an unparseable numeric value
//! makes its rule contribute no condition rather than erroring, which is v1's
//! behaviour and the repository's.

use shiranami_core::models::{
    SmartPlaylist, SmartPlaylistDefinition, SmartPlaylistMatchType, SmartPlaylistOrderBy,
    SmartPlaylistRule, Track,
};
use shiranami_db::repo::smart_playlists;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_smart_playlists::db_smart_playlists_get_all,
                crate::commands::db_smart_playlists::db_smart_playlists_get,
                crate::commands::db_smart_playlists::db_smart_playlists_create,
                crate::commands::db_smart_playlists::db_smart_playlists_update,
                crate::commands::db_smart_playlists::db_smart_playlists_delete,
                crate::commands::db_smart_playlists::db_smart_playlists_get_tracks,
                crate::commands::db_smart_playlists::db_smart_playlists_preview,
            ]
        }
    };
}
pub(crate) use commands;

/// The payload `db:smart-playlists:create` takes.
///
/// v1's `smartPlaylistCreateInput`, field for field. `description` is optional
/// rather than nullable because the zod schema was `z.string().optional()`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistCreateInput {
    /// Display name. Non-empty.
    pub name: String,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// How the rules combine.
    pub match_type: SmartPlaylistMatchType,
    /// The rules themselves.
    pub rules: Vec<SmartPlaylistRule>,
    /// Maximum tracks to return. Absent means unbounded.
    #[specta(optional)]
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    #[specta(optional)]
    pub order_by: Option<SmartPlaylistOrderBy>,
}

/// The patch `db:smart-playlists:update` takes. Absent fields are left alone.
#[derive(
    Debug, Clone, PartialEq, Eq, Default, serde::Deserialize, serde::Serialize, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistUpdateInput {
    /// Display name. Non-empty when present.
    #[specta(optional)]
    pub name: Option<String>,
    /// Free-text description.
    #[specta(optional)]
    pub description: Option<String>,
    /// How the rules combine.
    #[specta(optional)]
    pub match_type: Option<SmartPlaylistMatchType>,
    /// The rules, replacing the stored set wholesale. Written as a unit with
    /// `limit` and `order_by`, which share its stored column.
    #[specta(optional)]
    pub rules: Option<Vec<SmartPlaylistRule>>,
    /// Maximum tracks to return.
    #[specta(optional)]
    pub limit: Option<u32>,
    /// Explicit sort, replacing the default library order.
    #[specta(optional)]
    pub order_by: Option<SmartPlaylistOrderBy>,
}

/// `db:smart-playlists:get-all` — every smart playlist, newest first.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_get_all(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SmartPlaylist>> {
    let mut conn = state.conn().await?;
    smart_playlists::get_all(&mut conn).await.wire()
}

/// `db:smart-playlists:get` — one smart playlist by id.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_get(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<SmartPlaylist>> {
    let mut conn = state.conn().await?;
    smart_playlists::get(&mut conn, &id).await.wire()
}

/// `db:smart-playlists:create` — persist a rule definition.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_create(
    state: State<'_, AppState>,
    data: SmartPlaylistCreateInput,
) -> CommandResult<Option<SmartPlaylist>> {
    validate_name(&data.name)?;

    let input = smart_playlists::SmartPlaylistCreateInput {
        name: data.name,
        description: data.description,
        match_type: data.match_type,
        rules: data.rules,
        limit: data.limit,
        order_by: data.order_by,
    };

    let mut conn = state.conn().await?;
    smart_playlists::create(&mut conn, &input).await.wire()
}

/// `db:smart-playlists:update` — patch one, returning the row.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_update(
    state: State<'_, AppState>,
    id: String,
    data: SmartPlaylistUpdateInput,
) -> CommandResult<Option<SmartPlaylist>> {
    if let Some(name) = &data.name {
        validate_name(name)?;
    }

    let patch = smart_playlists::SmartPlaylistUpdateInput {
        name: data.name,
        description: data.description,
        match_type: data.match_type,
        rules: data.rules,
        limit: data.limit,
        order_by: data.order_by,
    };

    let mut conn = state.conn().await?;
    smart_playlists::update(&mut conn, &id, &patch).await.wire()
}

/// v1's `z.string().min(1)` on `name`.
fn validate_name(name: &str) -> CommandResult<()> {
    if name.is_empty() {
        return Err(bad_request("the smart playlist name must not be empty"));
    }
    Ok(())
}

/// `db:smart-playlists:delete` — remove one. Nothing cascades; it owns no rows.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_delete(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<()> {
    let mut conn = state.conn().await?;
    smart_playlists::delete(&mut conn, &id).await.wire()
}

/// `db:smart-playlists:get-tracks` — evaluate a saved playlist's rules.
///
/// An unknown id reads as an empty list rather than an error, as in v1: a
/// playlist deleted in another window should read as empty, not as a failure.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_get_tracks(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    smart_playlists::get_tracks(&mut conn, &id).await.wire()
}

/// `db:smart-playlists:preview` — evaluate an unsaved definition.
///
/// The live rule-editor preview, so it runs on every keystroke in the editor and
/// persists nothing.
#[tauri::command]
#[specta::specta]
pub async fn db_smart_playlists_preview(
    state: State<'_, AppState>,
    definition: SmartPlaylistDefinition,
) -> CommandResult<Vec<Track>> {
    let mut conn = state.conn().await?;
    smart_playlists::preview(&mut conn, &definition)
        .await
        .wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;
    use shiranami_core::models::{SmartPlaylistField, SmartPlaylistOperator, TrackCreateInput};
    use shiranami_db::repo::tracks;
    use std::time::Duration;

    fn rule(
        field: SmartPlaylistField,
        operator: SmartPlaylistOperator,
        value: &str,
    ) -> SmartPlaylistRule {
        SmartPlaylistRule {
            field,
            operator,
            value: value.to_owned(),
            value_to: None,
        }
    }

    fn saved(
        name: &str,
        rules: Vec<SmartPlaylistRule>,
    ) -> smart_playlists::SmartPlaylistCreateInput {
        smart_playlists::SmartPlaylistCreateInput {
            name: name.to_owned(),
            description: None,
            match_type: SmartPlaylistMatchType::All,
            rules,
            limit: None,
            order_by: None,
        }
    }

    fn track(file_path: &str, genre: &str) -> TrackCreateInput {
        TrackCreateInput {
            file_path: file_path.to_owned(),
            title: "Test Track".to_owned(),
            genre: Some(genre.to_owned()),
            ..TrackCreateInput::default()
        }
    }

    /// The acquire-once discipline, asserted the way `db:tracks` asserts it: a
    /// leaked connection hangs rather than fails, so the body runs under a
    /// timeout and a hang is a named failure.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let exercise = async {
            let mut conn = state.conn().await.expect("acquire");
            let created = smart_playlists::create(&mut conn, &saved("Everything", Vec::new()))
                .await
                .expect("insert")
                .expect("a row");
            drop(conn);

            for _ in 0..7 {
                let mut conn = state.conn().await.expect("acquire");
                smart_playlists::get_all(&mut conn).await.expect("read");
            }

            // `get_tracks` issues two statements on one connection — the
            // definition read and the evaluation that follows it. If either
            // acquired for itself this is where it would stop.
            let mut conn = state.conn().await.expect("acquire");
            smart_playlists::get_tracks(&mut conn, &created.id)
                .await
                .expect("evaluate");
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// The create payload's key names, pinned against v1's zod object. The shim
    /// forwards the renderer's argument straight through, so a rename here is a
    /// silently dropped field there.
    #[test]
    fn the_create_input_keeps_v1s_field_names() {
        let parsed: SmartPlaylistCreateInput = serde_json::from_str(
            r#"{"name":"Lofi only","description":"chill","matchType":"all",
                "rules":[{"field":"genre","operator":"is","value":"Lofi"}]}"#,
        )
        .expect("v1's shape parses");

        assert_eq!(parsed.name, "Lofi only");
        assert_eq!(parsed.description.as_deref(), Some("chill"));
        assert_eq!(parsed.match_type, SmartPlaylistMatchType::All);
        assert_eq!(parsed.rules[0].field, SmartPlaylistField::Genre);
    }

    /// `description` was `z.string().optional()`, never nullable — so an absent
    /// field is the only way to not send one, and the payload without it must
    /// still parse.
    #[test]
    fn the_create_input_accepts_an_absent_description() {
        let parsed: SmartPlaylistCreateInput =
            serde_json::from_str(r#"{"name":"All","matchType":"any","rules":[]}"#)
                .expect("v1's minimal shape parses");

        assert!(parsed.description.is_none());
        assert_eq!(parsed.match_type, SmartPlaylistMatchType::Any);
    }

    /// An all-absent patch is the shape v1's handler received when the editor
    /// saved nothing but the timestamp, and it must parse rather than being
    /// rejected as an empty object.
    #[test]
    fn the_update_input_treats_every_field_as_absent_by_default() {
        let parsed: SmartPlaylistUpdateInput =
            serde_json::from_str("{}").expect("an empty patch parses");

        assert_eq!(parsed, SmartPlaylistUpdateInput::default());
    }

    #[test]
    fn an_empty_name_is_a_bad_request() {
        assert_eq!(
            validate_name("").expect_err("empty is refused").code,
            codes::validation::BAD_REQUEST
        );
        assert!(validate_name("Lofi only").is_ok());
    }

    /// v1's `persists and re-evaluates a saved smart playlist`, at the layer the
    /// renderer calls: create, then read the tracks back through the saved
    /// definition rather than through the one that was passed in.
    #[tokio::test]
    async fn a_saved_playlist_re_evaluates_its_own_rules() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &track("/music/a.mp3", "Lofi"))
            .await
            .expect("seed");
        tracks::add(&mut conn, &track("/music/b.mp3", "Rock"))
            .await
            .expect("seed");

        let created = smart_playlists::create(
            &mut conn,
            &saved(
                "Lofi only",
                vec![rule(
                    SmartPlaylistField::Genre,
                    SmartPlaylistOperator::Is,
                    "Lofi",
                )],
            ),
        )
        .await
        .expect("insert")
        .expect("a row");

        assert_eq!(created.name, "Lofi only");
        assert_eq!(created.rules.len(), 1);

        let matched = smart_playlists::get_tracks(&mut conn, &created.id)
            .await
            .expect("evaluate");

        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].genre.as_deref(), Some("Lofi"));
    }

    /// v1's `empty rule set matches the whole library`. Worth an assertion
    /// rather than a comment: the other reading — an empty rule set matching
    /// *nothing* — is equally defensible and would empty every rule-less smart
    /// playlist in the sidebar on upgrade.
    #[tokio::test]
    async fn an_empty_rule_set_matches_the_whole_library() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &track("/music/a.mp3", "Lofi"))
            .await
            .expect("seed");
        tracks::add(&mut conn, &track("/music/b.mp3", "Rock"))
            .await
            .expect("seed");

        let matched = smart_playlists::preview(
            &mut conn,
            &SmartPlaylistDefinition {
                match_type: SmartPlaylistMatchType::All,
                rules: Vec::new(),
                limit: None,
                order_by: None,
            },
        )
        .await
        .expect("evaluate");

        assert_eq!(matched.len(), 2);
    }

    /// v1 returned `[]` for an unknown id rather than rejecting — a playlist
    /// deleted in another window reads as empty, not as a failure.
    #[tokio::test]
    async fn an_unknown_id_evaluates_to_an_empty_list_not_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        tracks::add(&mut conn, &track("/music/a.mp3", "Lofi"))
            .await
            .expect("seed");

        let matched = smart_playlists::get_tracks(&mut conn, "no-such-playlist")
            .await
            .expect("evaluate");

        assert!(matched.is_empty(), "not the whole library");
        assert!(
            smart_playlists::get(&mut conn, "no-such-playlist")
                .await
                .expect("read")
                .is_none()
        );
    }
}
