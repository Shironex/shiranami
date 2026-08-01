//! Reading and writing the Discord Rich Presence settings.
//!
//! Ported from `getSettings` / `saveSettings` in
//! `apps/desktop/src/main/integrations/discord-rpc.ts`.
//!
//! Two behaviours here are load-bearing and neither is obvious from the types.
//!
//! **Partial blobs are coerced, never rejected.** v1 read each field with a
//! `typeof … === 'boolean'` check and fell back to the default, so a settings
//! file written by an older build — or a hand-edited one — always produced a
//! complete, usable value. [`load`] reproduces that by deserializing into the
//! *patch* type and applying it over the defaults, which is the same rule
//! expressed once instead of per field.
//!
//! **The legacy flag is read exactly once.** Before Rich Presence had its own
//! store key, whether it was on lived in `settings.discordRpc`. A user who
//! enabled it under that build must keep it enabled, so when the dedicated key
//! is absent the legacy boolean seeds `enabled`. The very next save writes the
//! dedicated key, after which the legacy flag is never consulted again.

use shiranami_core::error::CoreError;
use shiranami_core::models::{DiscordRpcSettings, DiscordRpcSettingsPatch};
use shiranami_core::store::{MainStoreKey, RendererStoreKey, SettingsStore};

/// The renderer-settings field Rich Presence used to live in.
const LEGACY_ENABLED_FIELD: &str = "discordRpc";

/// The stored settings, completed from the defaults.
pub fn load(store: &SettingsStore) -> DiscordRpcSettings {
    let Some(stored) = store.get_main(MainStoreKey::DiscordRpcSettings) else {
        return DiscordRpcSettings {
            enabled: legacy_enabled(store),
            ..DiscordRpcSettings::default()
        };
    };

    // A blob that will not parse at all degrades to the defaults, as v1's
    // `try/catch` around `store.get` did. Losing a preference is recoverable;
    // refusing to start Rich Presence is not obviously better.
    let patch: DiscordRpcSettingsPatch = serde_json::from_value(stored).unwrap_or_default();
    DiscordRpcSettings::default().patched(patch)
}

/// Apply `patch` to the stored settings and persist the result.
///
/// # Errors
///
/// Returns [`CoreError`] when the settings file could not be written.
pub fn update(
    store: &SettingsStore,
    patch: DiscordRpcSettingsPatch,
) -> Result<DiscordRpcSettings, CoreError> {
    let next = load(store).patched(patch);
    save(store, &next)?;
    Ok(next)
}

/// Persist `settings` under the main-only key.
///
/// # Errors
///
/// Returns [`CoreError`] when the settings file could not be written.
pub fn save(store: &SettingsStore, settings: &DiscordRpcSettings) -> Result<(), CoreError> {
    let value = serde_json::to_value(settings).map_err(|source| CoreError::Json {
        path: store.path().to_path_buf(),
        source,
    })?;
    store.set_main(MainStoreKey::DiscordRpcSettings, value)
}

/// Whether the pre-dedicated-key build had Rich Presence switched on.
///
/// Best-effort by design: an unreadable or unexpectedly shaped `settings` blob
/// answers "off", which is the default anyway.
fn legacy_enabled(store: &SettingsStore) -> bool {
    store
        .get(RendererStoreKey::Settings)
        .and_then(|settings| {
            settings
                .get(LEGACY_ENABLED_FIELD)
                .and_then(|on| on.as_bool())
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use shiranami_core::models::DiscordPresenceTemplates;

    fn store() -> (SettingsStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temp dir");
        let (store, _quarantined) = SettingsStore::load(dir.path().join("config.json"));
        (store, dir)
    }

    #[test]
    fn an_empty_store_reads_as_the_defaults() {
        let (store, _dir) = store();
        assert_eq!(load(&store), DiscordRpcSettings::default());
    }

    /// The migration that keeps an existing user's presence switched on.
    #[test]
    fn the_legacy_flag_seeds_enabled_when_the_dedicated_key_is_absent() {
        let (store, _dir) = store();
        store
            .set(RendererStoreKey::Settings, json!({ "discordRpc": true }))
            .expect("write the legacy settings");

        let settings = load(&store);
        assert!(settings.enabled, "a user who had it on keeps it on");
        assert_eq!(settings.templates, DiscordPresenceTemplates::default());
    }

    /// …and only when the dedicated key is absent. Once it exists it is the
    /// single source of truth, so a stale legacy flag cannot switch presence
    /// back on for someone who deliberately turned it off.
    #[test]
    fn the_dedicated_key_wins_over_the_legacy_flag() {
        let (store, _dir) = store();
        store
            .set(RendererStoreKey::Settings, json!({ "discordRpc": true }))
            .expect("write the legacy settings");
        save(
            &store,
            &DiscordRpcSettings {
                enabled: false,
                ..DiscordRpcSettings::default()
            },
        )
        .expect("write the dedicated key");

        assert!(!load(&store).enabled);
    }

    #[test]
    fn a_legacy_flag_that_is_not_true_reads_as_off() {
        for legacy in [
            json!({}),
            json!({ "discordRpc": false }),
            json!({ "discordRpc": "yes" }),
        ] {
            let (store, _dir) = store();
            store
                .set(RendererStoreKey::Settings, legacy.clone())
                .expect("write the legacy settings");
            assert!(!load(&store).enabled, "{legacy} should read as off");
        }
    }

    /// v1 coerced field by field, so a blob missing keys still produced a
    /// complete value rather than an error or a half-populated struct.
    #[test]
    fn a_partial_blob_is_completed_from_the_defaults() {
        let (store, _dir) = store();
        store
            .set_main(
                MainStoreKey::DiscordRpcSettings,
                json!({ "enabled": true, "showTrackDetails": false }),
            )
            .expect("write a partial blob");

        let settings = load(&store);
        assert!(settings.enabled);
        assert!(!settings.show_track_details);
        assert!(
            settings.show_elapsed_time,
            "an absent key takes its default"
        );
        assert_eq!(settings.templates, DiscordPresenceTemplates::default());
    }

    /// A blob of the wrong shape entirely degrades to the defaults rather than
    /// failing — v1 wrapped its `store.get` in a `try/catch` for this.
    #[test]
    fn an_unusable_blob_degrades_to_the_defaults() {
        let (store, _dir) = store();
        store
            .set_main(MainStoreKey::DiscordRpcSettings, json!("not an object"))
            .expect("write nonsense");

        assert_eq!(load(&store), DiscordRpcSettings::default());
    }

    /// A stored blob naming only some activity templates keeps the defaults for
    /// the rest, which is v1's per-key spread over `DEFAULT_DISCORD_TEMPLATES`.
    #[test]
    fn stored_templates_merge_over_the_defaults_per_activity_type() {
        let (store, _dir) = store();
        store
            .set_main(
                MainStoreKey::DiscordRpcSettings,
                json!({
                    "templates": {
                        "idle": {
                            "details": "Away",
                            "state": "",
                            "showTimestamp": false,
                            "showLargeImage": false,
                            "showButton": false
                        }
                    }
                }),
            )
            .expect("write a partial template set");

        let settings = load(&store);
        assert_eq!(settings.templates.idle.details, "Away");
        assert!(!settings.templates.idle.show_large_image);
        assert_eq!(
            settings.templates.playing,
            DiscordPresenceTemplates::default().playing,
            "an unnamed activity type keeps its default template"
        );
    }

    #[test]
    fn an_update_round_trips_through_the_settings_file() {
        let (store, _dir) = store();

        let updated = update(
            &store,
            DiscordRpcSettingsPatch {
                enabled: Some(true),
                use_custom_templates: Some(true),
                ..DiscordRpcSettingsPatch::default()
            },
        )
        .expect("persist the update");

        assert!(updated.enabled && updated.use_custom_templates);
        assert_eq!(load(&store), updated);
    }
}
