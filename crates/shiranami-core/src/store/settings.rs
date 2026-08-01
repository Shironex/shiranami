//! The atomic settings store.
//!
//! Replaces electron-store (decision D17) while reading the file it wrote. The
//! three reasons `tauri-plugin-store` was rejected are the three things this
//! type does: `0600` at creation because the file holds the Last.fm session key
//! and the ListenBrainz token; quarantine before falling back to defaults, so
//! the next write cannot persist defaults over recoverable data; and a change
//! bus we control, because telemetry consent and the OS login item are driven
//! off it.
//!
//! Data continuity (§3.4): the v1 `config.json` is read **in place**, not
//! converted. The document is kept as raw JSON and written back whole, so keys
//! this version does not model — including anything a later v1.x patch adds —
//! survive a round trip untouched.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::CoreError;
use crate::store::atomic::{quarantine_corrupt, write_atomic};
use crate::store::bus::{ChangeBus, ChangeEvent};
use crate::store::document::{delete_path, get_path, set_path};
use crate::store::keys::{MainStoreKey, RendererStoreKey};
use crate::sync::lock_or_recover;

/// Scrobbling credentials — the secret-bearing corner of the settings file.
///
/// Lives behind [`MainStoreKey::ScrobbleSettings`] and never crosses the command
/// boundary; the renderer sees only [`crate::models::ScrobbleStatus`]. Secrets
/// stay in this file for v2.0, with the OS keychain deferred to post-v2 (§3.4,
/// D18) so the migration release does not also force every user to re-auth.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleSettings {
    /// Master opt-in. Absent in a v1 file means off.
    #[serde(default)]
    pub enabled: bool,
    /// Last.fm session key.
    #[serde(default)]
    pub lastfm_session_key: Option<String>,
    /// Last.fm display name.
    #[serde(default)]
    pub lastfm_username: Option<String>,
    /// ListenBrainz user token.
    #[serde(default)]
    pub listen_brainz_token: Option<String>,
}

/// The settings document, its file, and the change bus over it.
pub struct SettingsStore {
    path: PathBuf,
    document: Mutex<Map<String, Value>>,
    bus: ChangeBus,
}

impl SettingsStore {
    /// Load the store from `path`, tolerating an absent or unparsable file.
    ///
    /// Returns the store together with the quarantine path when the file was
    /// unparsable, so the caller can log where the old bytes went. A missing
    /// file is not an error: v1 passed electron-store no `defaults`, so a fresh
    /// install genuinely starts from `{}` and every consumer already treats an
    /// absent key as off.
    ///
    /// Quarantine happens **before** the empty document is adopted. Skipping it
    /// would mean the next `set` writes `{}` over a file that may still hold a
    /// recoverable library configuration and the user's scrobble credentials.
    pub fn load(path: PathBuf) -> (Self, Option<PathBuf>) {
        let (document, quarantined) = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Object(map)) => (map, None),
                // Valid JSON that is not an object is as unusable as a parse
                // failure, and just as recoverable, so it takes the same route.
                Ok(_) | Err(_) => {
                    let backup = quarantine_corrupt(&path)
                        .inspect_err(|error| {
                            tracing::warn!(
                                %error,
                                path = %path.display(),
                                "could not quarantine the corrupt settings file"
                            );
                        })
                        .ok();
                    tracing::warn!(
                        path = %path.display(),
                        backup = ?backup,
                        "settings file was unreadable; starting from defaults"
                    );
                    (Map::new(), backup)
                }
            },
            Err(_) => (Map::new(), None),
        };

        let store = Self {
            path,
            document: Mutex::new(document),
            bus: ChangeBus::new(),
        };
        (store, quarantined)
    }

    /// The file this store reads and writes.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The change bus. Subscribe here for telemetry consent and login-item changes.
    pub fn bus(&self) -> &ChangeBus {
        &self.bus
    }

    /// Read a renderer-writable key.
    pub fn get(&self, key: RendererStoreKey) -> Option<Value> {
        self.get_raw(key.path())
    }

    /// Write a renderer-writable key.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] when the file could not be written. The
    /// in-memory document is left unchanged in that case, so a failed write
    /// never leaves memory and disk disagreeing.
    pub fn set(&self, key: RendererStoreKey, value: Value) -> Result<(), CoreError> {
        self.set_raw(key.path(), value)
    }

    /// Delete a renderer-writable key.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] when the file could not be written.
    pub fn delete(&self, key: RendererStoreKey) -> Result<(), CoreError> {
        self.delete_raw(key.path())
    }

    /// Read a main-only key. Unreachable from the command surface by construction.
    pub fn get_main(&self, key: MainStoreKey) -> Option<Value> {
        self.get_raw(key.path())
    }

    /// Write a main-only key.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] when the file could not be written.
    pub fn set_main(&self, key: MainStoreKey, value: Value) -> Result<(), CoreError> {
        self.set_raw(key.path(), value)
    }

    /// Delete a main-only key.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] when the file could not be written.
    pub fn delete_main(&self, key: MainStoreKey) -> Result<(), CoreError> {
        self.delete_raw(key.path())
    }

    /// The stored scrobbling credentials, or defaults when the key is absent or
    /// malformed.
    ///
    /// A malformed blob degrades to defaults rather than failing: v1's getter
    /// coerced field by field for the same reason, so a partial blob written by
    /// an older version still yields a usable value.
    pub fn scrobble_settings(&self) -> ScrobbleSettings {
        self.get_main(MainStoreKey::ScrobbleSettings)
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }

    /// The configured downloads directory, if the user set a non-blank one.
    ///
    /// `None` means "use the platform default"; v1 treated a blank string the
    /// same as an absent key, and so does this.
    pub fn downloads_location(&self) -> Option<PathBuf> {
        let value = self.get_main(MainStoreKey::DownloadsLocation)?;
        let text = value.as_str()?.trim();
        (!text.is_empty()).then(|| PathBuf::from(text))
    }

    /// Whether the user has consented to telemetry.
    ///
    /// Absent means **no**: a fresh install must never initialise Sentry.
    pub fn telemetry_enabled(&self) -> bool {
        self.get(RendererStoreKey::AppTelemetryEnabled) == Some(Value::Bool(true))
    }

    /// Whether to register an OS login item, or `None` when never set.
    ///
    /// The three-way answer is deliberate. v1 only touched the OS login item
    /// when the stored value was a boolean, so a fresh install never writes OS
    /// state on the user's behalf — `None` must stay distinguishable from
    /// `Some(false)`.
    pub fn launch_at_startup(&self) -> Option<bool> {
        self.get(RendererStoreKey::SystemLaunchAtStartup)?.as_bool()
    }

    fn get_raw(&self, path: &str) -> Option<Value> {
        get_path(&lock_or_recover(&self.document), path).cloned()
    }

    /// Apply `mutate` to a copy of the document, persist it, then adopt it.
    ///
    /// Working on a copy is what makes a failed write a no-op instead of leaving
    /// memory ahead of disk. The change event is published after the lock is
    /// released, so a listener may read the store back — the launch-at-startup
    /// handler does — without deadlocking.
    fn mutate(
        &self,
        path: &str,
        mutate: impl FnOnce(&mut Map<String, Value>),
    ) -> Result<(), CoreError> {
        let event = {
            let mut document = lock_or_recover(&self.document);
            let previous = get_path(&document, path).cloned();

            let mut next = document.clone();
            mutate(&mut next);
            let current = get_path(&next, path).cloned();

            if previous == current {
                // electron-store's onDidChange fires only on an actual change,
                // and re-writing identical bytes would be pure I/O.
                return Ok(());
            }

            self.persist(&next)?;
            *document = next;

            ChangeEvent {
                path: path.to_owned(),
                previous,
                current,
            }
        };

        self.bus.publish(&event);
        Ok(())
    }

    fn set_raw(&self, path: &str, value: Value) -> Result<(), CoreError> {
        self.mutate(path, |document| set_path(document, path, value))
    }

    fn delete_raw(&self, path: &str) -> Result<(), CoreError> {
        self.mutate(path, |document| {
            delete_path(document, path);
        })
    }

    /// Serialize and atomically write the document.
    ///
    /// Tab-indented to match what electron-store wrote, so a user diffing their
    /// v1 and v2 files sees only the values change.
    fn persist(&self, document: &Map<String, Value>) -> Result<(), CoreError> {
        let mut buffer = Vec::new();
        let formatter = serde_json::ser::PrettyFormatter::with_indent(b"\t");
        let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
        Value::Object(document.clone())
            .serialize(&mut serializer)
            .map_err(|source| CoreError::Json {
                path: self.path.clone(),
                source,
            })?;

        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|source| CoreError::Io {
                operation: "create the settings directory",
                path: parent.to_path_buf(),
                source,
            })?;
        }

        write_atomic(&self.path, &buffer).map_err(|source| CoreError::Io {
            operation: "write the settings file",
            path: self.path.clone(),
            source,
        })
    }
}
