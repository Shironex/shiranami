//! `store:*` — the renderer's window onto the settings file.
//!
//! Three channels, ported from `apps/desktop/src/main/ipc/store.ts`. This is the
//! whole of v1's settings IPC: **there is no `settings:*` namespace.** App
//! settings are one opaque key (`settings`) inside the store blob, and the
//! renderer reaches every preference through this generic get/set/delete triple.
//!
//! # The key allowlist is the security boundary, and it is a type here
//!
//! v1 guarded these with `z.enum(RENDERER_STORE_KEYS)`, a seventeen-entry list,
//! and the keys deliberately left out of it are the point:
//! `discord-rpc-settings`, `downloads.*`, `migrations.albumArtV1` and above all
//! **`scrobble.settings`**, which holds the Last.fm session key and the
//! ListenBrainz token. §3.4 makes the split a Rust enum, so
//! [`RendererStoreKey`] is what these commands take as a parameter and a
//! main-only key is not merely rejected — it is **unrepresentable**. serde
//! refuses the string before the command body runs, so the FORBIDDEN branch v1
//! needed has no reachable equivalent for the key itself.
//!
//! # The value is not validated, exactly as in v1
//!
//! `storeSetArgs` was `z.tuple([rendererStoreKey, z.unknown()])` — the key was
//! checked and the value was waved through for all seventeen keys. That is
//! reproduced here with `serde_json::Value`, deliberately and not by oversight:
//! the renderer owns the shape of `settings`, `player-state` and `window-bounds`
//! (they are its own zustand slices round-tripped through disk), and typing them
//! in Rust would freeze a renderer-internal shape into a wire contract that
//! `apps/web` is free to change. §2.3's "persisted structs are strictly
//! additive" applies to the structs *this* side owns; these are not them.
//!
//! # Why these are `async` when they touch a file
//!
//! v1's three handlers are the only synchronous ones in its whole IPC surface.
//! Under §2.3 a sync command that touches disk is forbidden outright, and the
//! settings store writes atomically — temp file, `sync_data`, rename — which is
//! three syscalls including an fsync. On the WKWebView main thread that is a
//! visible hitch on every volume change. `spawn_blocking` is what makes them
//! honest.

use std::sync::Arc;

use shiranami_core::store::RendererStoreKey;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;
use crate::wire::Json;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::store::store_get,
                crate::commands::store::store_set,
                crate::commands::store::store_delete,
            ]
        }
    };
}
pub(crate) use commands;

/// `store:get` — read one renderer-visible key.
///
/// Returns `null` for an unset key, matching v1's `StoreSchema[K] | undefined`:
/// electron-store returned `undefined` for a missing key and the renderer's
/// `?? fallback` handled it. `undefined` and `null` are the same absence to a
/// `??`, and `null` is what JSON can carry.
#[tauri::command]
#[specta::specta]
pub async fn store_get(state: State<'_, AppState>, key: RendererStoreKey) -> CommandResult<Json> {
    let settings = Arc::clone(state.settings());
    // A read hits the in-memory document, not the file — the store loads once
    // and writes through. Cheap enough to answer inline.
    Ok(settings.get(key).map_or_else(Json::null, Json))
}

/// `store:set` — write one renderer-visible key.
#[tauri::command]
#[specta::specta]
pub async fn store_set(
    state: State<'_, AppState>,
    key: RendererStoreKey,
    value: Json,
) -> CommandResult<()> {
    let settings = Arc::clone(state.settings());
    // The write is atomic (temp + `sync_data` + rename), so it is real disk I/O
    // and must not run on the webview's thread.
    tauri::async_runtime::spawn_blocking(move || settings.set(key, value.0))
        .await
        .map_err(|error| {
            crate::error::bad_request(format!("the settings write panicked: {error}"))
        })?
        .wire()
}

/// `store:delete` — remove one renderer-visible key.
#[tauri::command]
#[specta::specta]
pub async fn store_delete(state: State<'_, AppState>, key: RendererStoreKey) -> CommandResult<()> {
    let settings = Arc::clone(state.settings());
    tauri::async_runtime::spawn_blocking(move || settings.delete(key))
        .await
        .map_err(|error| {
            crate::error::bad_request(format!("the settings delete panicked: {error}"))
        })?
        .wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use serde_json::{Value, json};

    /// The round-trip the renderer performs on every preference change.
    #[tokio::test]
    async fn a_value_written_through_set_reads_back_through_get() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        state
            .settings()
            .set(RendererStoreKey::PlayerVolume, json!(0.42))
            .expect("write the volume");

        assert_eq!(
            state.settings().get(RendererStoreKey::PlayerVolume),
            Some(json!(0.42))
        );
    }

    /// v1 returned `undefined` for an unset key and the renderer's `??` handled
    /// it. `null` is the same absence to a `??` and is what JSON can carry.
    #[tokio::test]
    async fn an_unset_key_reads_as_null_not_as_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        assert_eq!(state.settings().get(RendererStoreKey::Theme), None);
    }

    /// The value half is deliberately unvalidated, exactly as `z.unknown()` was:
    /// the renderer owns these shapes and typing them here would freeze a
    /// zustand slice into a wire contract.
    #[tokio::test]
    async fn an_arbitrary_json_value_survives_a_round_trip() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let blob = json!({ "sidebar": { "width": 240 }, "grid": [1, 2, 3] });

        state
            .settings()
            .set(RendererStoreKey::Settings, blob.clone())
            .expect("write the blob");

        assert_eq!(
            state.settings().get(RendererStoreKey::Settings),
            Some(blob),
            "the renderer's own shapes pass through untyped"
        );
    }

    #[tokio::test]
    async fn delete_removes_the_key_rather_than_nulling_it() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        state
            .settings()
            .set(RendererStoreKey::AppLanguage, json!("pl"))
            .expect("write the language");
        state
            .settings()
            .delete(RendererStoreKey::AppLanguage)
            .expect("delete the language");

        assert_eq!(state.settings().get(RendererStoreKey::AppLanguage), None);
    }

    /// The security property, asserted at the boundary the commands actually
    /// have: a main-only key has no `RendererStoreKey` spelling, so the string
    /// the renderer would have to send does not deserialize into the parameter
    /// type and the command body never runs.
    ///
    /// `scrobble.settings` is the one that matters — it holds the Last.fm
    /// session key and the ListenBrainz token, and Phase 12's charter is that
    /// they never cross the command boundary in either direction.
    #[test]
    fn a_main_only_key_cannot_be_named_as_a_command_argument() {
        for main_only in [
            "scrobble.settings",
            "discord-rpc-settings",
            "downloads.location",
            "downloads.toolStatusCache",
            "migrations.albumArtV1",
            "v2.crossoverPinged",
        ] {
            let parsed: Result<RendererStoreKey, _> =
                serde_json::from_value(Value::String(main_only.to_owned()));

            assert!(
                parsed.is_err(),
                "`{main_only}` deserialized into RendererStoreKey — a main-only \
                 key must be unrepresentable as a command argument, not merely \
                 rejected inside one"
            );
        }
    }

    /// …and the seventeen v1 allowed every one of.
    #[test]
    fn every_v1_renderer_key_still_deserializes() {
        for allowed in [
            "settings",
            "music-folders",
            "player-state",
            "player.volume",
            "player.isMuted",
            "theme",
            "window-bounds",
            "app.language",
            "app.onboardingCompleted",
            "app.supportBannerSeen",
            "app.telemetryEnabled",
            "app.performanceMonitoringEnabled",
            "metadata-enrich.skippedIds",
            "system.launchAtStartup",
            "system.minimizeToTray",
            "system.closeToTray",
            "lyrics.preferSyncedFromLrclib",
        ] {
            let parsed: Result<RendererStoreKey, _> =
                serde_json::from_value(Value::String(allowed.to_owned()));

            assert!(
                parsed.is_ok(),
                "`{allowed}` is in v1's RENDERER_STORE_KEYS and stopped \
                 deserializing — that is a renderer feature going dark"
            );
        }
    }
}
