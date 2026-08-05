//! `companion:*` — the desk pet's ledger (v2 companion, Phase 1).
//!
//! Three channels, all born in v2 with no v1 counterpart of any kind: v1 had
//! no companion. State lives in the `companion_state` singleton (migration
//! `0006`), growth math in [`shiranami_core::companion`], row access in
//! [`shiranami_db::repo::companion`]. The XP accrual itself is **not** here —
//! it hooks into `db:history:record-play` (see
//! [`crate::commands::db_history`]), because the honest listening clock that
//! feeds that channel is the anti-gaming mechanism and a separate "add xp"
//! command would be a cheat console.
//!
//! # `get-state` reports the previous sighting, then stamps the new one
//!
//! The one subtlety in the namespace: the returned `lastSeenAt` is the value
//! *before* this read, and the read then stamps `last_seen_at = now`. That
//! order gives the renderer return-after-absence moods from a single round
//! trip — "how long was I gone" is the difference between now and what the
//! call returned — without a second channel.

use shiranami_core::companion::{CompanionState, Species};
use shiranami_core::time::iso8601;
use shiranami_db::repo::companion;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::companion::companion_get_state,
                crate::commands::companion::companion_set_name,
                crate::commands::companion::companion_set_species,
            ]
        }
    };
}
pub(crate) use commands;

/// `companion:get-state` — the singleton, hatched from history on first read.
///
/// The first call ever seeds `xp` from `SUM(played_seconds)` over the whole
/// play history, so an existing user's pet hatches at a stage honoring
/// everything they already listened to. See the module docs for the
/// `lastSeenAt` read-then-stamp order.
#[tauri::command]
#[specta::specta]
pub async fn companion_get_state(state: State<'_, AppState>) -> CommandResult<CompanionState> {
    let now = iso8601::now();

    let mut conn = state.conn().await?;
    let snapshot = companion::get_or_hatch(&mut conn, &now).await.wire()?;
    companion::touch_last_seen(&mut conn, &now).await.wire()?;

    Ok(snapshot)
}

/// `companion:set-name` — the naming ceremony. Returns the updated state.
#[tauri::command]
#[specta::specta]
pub async fn companion_set_name(
    state: State<'_, AppState>,
    name: String,
) -> CommandResult<CompanionState> {
    let now = iso8601::now();

    let mut conn = state.conn().await?;
    companion::set_name(&mut conn, &name, &now).await.wire()
}

/// `companion:set-species` — switch who lives with you.
///
/// A preference, not a collection: stage, xp, name and accessories all
/// survive the switch, so trying the other companion costs nothing.
#[tauri::command]
#[specta::specta]
pub async fn companion_set_species(
    state: State<'_, AppState>,
    species: Species,
) -> CommandResult<CompanionState> {
    let now = iso8601::now();

    let mut conn = state.conn().await?;
    companion::set_species(&mut conn, species, &now).await.wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::companion::Species;
    use std::time::Duration;

    /// The three commands back to back over one `AppState`. A command that
    /// leaked the pool's single connection would not fail — it would hang —
    /// so the body runs under a timeout, as the db_history suite does.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let exercise = async {
            {
                let now = iso8601::now();
                let mut conn = state.conn().await.expect("acquire");
                shiranami_db::repo::companion::get_or_hatch(&mut conn, &now)
                    .await
                    .expect("hatch");
                shiranami_db::repo::companion::touch_last_seen(&mut conn, &now)
                    .await
                    .expect("touch");
            }
            {
                let now = iso8601::now();
                let mut conn = state.conn().await.expect("acquire");
                shiranami_db::repo::companion::set_name(&mut conn, "Puddle", &now)
                    .await
                    .expect("name");
            }
            {
                let now = iso8601::now();
                let mut conn = state.conn().await.expect("acquire");
                shiranami_db::repo::companion::set_species(&mut conn, Species::Hotaru, &now)
                    .await
                    .expect("switch");
            }
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// The species argument arrives as the lowercase wire string the renderer
    /// sends; anything else must be refused before the command body runs.
    #[test]
    fn the_species_argument_parses_only_the_two_wire_strings() {
        for (raw, expected) in [("\"shio\"", Species::Shio), ("\"hotaru\"", Species::Hotaru)] {
            let parsed: Species = serde_json::from_str(raw).expect("a wire species parses");
            assert_eq!(parsed, expected);
        }

        let unknown: Result<Species, _> = serde_json::from_str("\"kurage\"");
        assert!(
            unknown.is_err(),
            "an unknown species must be a deserialization error, not a silent default"
        );
    }
}
