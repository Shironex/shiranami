//! The two files the v1.x bridge release leaves next to the database.
//!
//! Architecture §4.1 gives the bridge a "data prep" job: it writes
//! `v2-handoff.json` (the paths v1 resolved natively, which v2 would otherwise
//! have to guess) and `renderer-state.json` (§3.5's `localStorage` dump, because
//! Chromium's partition, WebKit's store and WebView2's store are three separate
//! origins and every `shiranami.*` key would otherwise reset).
//!
//! # Both are optional, and that is the common case today
//!
//! The bridge only writes them once a live `v2.json` manifest resolves an
//! artifact for the platform. Every user who upgrades before that — and every
//! user of a v1 older than the bridge release — arrives with neither file. So
//! nothing here returns an error for an absent, unreadable or malformed file:
//! the migration proceeds, `v1_version` goes unrecorded, and §3.5's fallback
//! covers the part of the renderer state that has a second source.
//!
//! # The dump's values are strings, and stay strings
//!
//! The bridge captures `localStorage.getItem()` output verbatim, so a
//! zustand-persisted slice arrives as a JSON *string* — `"{\"state\":{…}}"`,
//! not an object. Re-encoding it here would mean parsing and re-serializing
//! someone else's schema, and any normalisation `serde_json` applied on the way
//! through (key order, number formatting) would hand the renderer bytes that are
//! not the ones it wrote. They are carried opaquely and put back verbatim.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Deserialize;

/// The bridge's file names, as `apps/desktop/src/main/app/v2-bridge/constants.ts`
/// spells them. Both sit at the root of the v1 data directory.
pub const HANDOFF_FILE: &str = "v2-handoff.json";
/// See [`HANDOFF_FILE`].
pub const RENDERER_STATE_FILE: &str = "renderer-state.json";

/// The prefix the bridge filters `localStorage` on, and the one this module
/// re-checks before seeding anything.
pub const RENDERER_KEY_PREFIX: &str = "shiranami.";

/// `v2-handoff.json`, as the bridge writes it.
///
/// Every field is optional on the way in. The bridge writes all of them, but
/// this file is produced by a *different, already-shipped* binary, and a reader
/// that refuses the whole file over one unexpected field would lose the other
/// five for no gain.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Handoff {
    /// The bridge's own schema version. `1` at the time of writing.
    pub schema_version: Option<u32>,
    /// When v1 captured the descriptor.
    pub captured_at: Option<String>,
    /// The v1 version, which is the only place v2 can learn it.
    pub v1_version: Option<String>,
    /// `process.platform` — `darwin`, `win32` or `linux`.
    pub platform: Option<String>,
    /// The `userData` directory v1 resolved for itself.
    pub user_data_path: Option<String>,
    /// The database path v1 resolved for itself.
    pub database_path: Option<String>,
    /// The configured download folder, or `None` when the user never set one.
    pub downloads_location: Option<String>,
}

impl Handoff {
    /// Read `v2-handoff.json` out of the v1 directory, if it is there.
    ///
    /// Returns `None` for absent, unreadable or malformed. See the module docs.
    #[must_use]
    pub fn read(legacy_dir: &Path) -> Option<Self> {
        let path = legacy_dir.join(HANDOFF_FILE);
        let bytes = std::fs::read(&path).ok()?;
        match serde_json::from_slice::<Self>(&bytes) {
            Ok(handoff) => Some(handoff),
            Err(error) => {
                tracing::warn!(
                    path = %path.display(),
                    %error,
                    "the v1 handoff descriptor did not parse; continuing without it"
                );
                None
            }
        }
    }
}

/// `renderer-state.json`, as the bridge writes it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RendererState {
    /// The bridge's own schema version.
    pub schema_version: Option<u32>,
    /// When v1 captured the dump.
    pub captured_at: Option<String>,
    /// The raw `shiranami.*` entries, values exactly as `localStorage` held
    /// them. `BTreeMap` so the seed script is byte-stable across runs, which is
    /// what makes it testable.
    pub keys: BTreeMap<String, String>,
}

impl RendererState {
    /// Read `renderer-state.json` out of a directory, if it is there.
    ///
    /// Called against the **v2** directory after the copy, not the v1 one: the
    /// file is copied like everything else, and reading the copy is what makes
    /// the seed reproducible on a later launch without reaching back into a v1
    /// tree that may since have been removed.
    #[must_use]
    pub fn read(dir: &Path) -> Option<Self> {
        let path = dir.join(RENDERER_STATE_FILE);
        let bytes = std::fs::read(&path).ok()?;
        match serde_json::from_slice::<Self>(&bytes) {
            Ok(state) => Some(state),
            Err(error) => {
                tracing::warn!(
                    path = %path.display(),
                    %error,
                    "the v1 renderer-state dump did not parse; continuing without it"
                );
                None
            }
        }
    }

    /// The entries that are safe to seed: `shiranami.`-prefixed, and nothing
    /// else.
    ///
    /// The bridge already filters on the prefix, but this file is written by a
    /// binary we no longer control and lands in the data directory as plain
    /// JSON. Re-checking here is what stops an edited dump from writing
    /// arbitrary `localStorage` keys into the webview — the seed runs before
    /// page script, so anything it writes is indistinguishable from something
    /// the app itself stored.
    pub fn seedable(&self) -> impl Iterator<Item = (&str, &str)> {
        self.keys
            .iter()
            .filter(|(key, _)| key.starts_with(RENDERER_KEY_PREFIX))
            .map(|(key, value)| (key.as_str(), value.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, body: &str) {
        std::fs::write(dir.join(name), body).expect("write the fixture");
    }

    /// The exact bytes the bridge produces, from
    /// `apps/desktop/src/main/app/v2-bridge/handoff.ts`.
    #[test]
    fn the_handoff_descriptor_the_bridge_writes_is_read_field_for_field() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            HANDOFF_FILE,
            r#"{
  "schemaVersion": 1,
  "capturedAt": "2026-08-01T09:14:22.531Z",
  "v1Version": "1.0.0",
  "platform": "darwin",
  "userDataPath": "/Users/someone/Library/Application Support/Shiranami",
  "databasePath": "/Users/someone/Library/Application Support/Shiranami/shiranami.db",
  "downloadsLocation": "/Users/someone/Music/Shiranami Downloads"
}
"#,
        );

        let handoff = Handoff::read(dir.path()).expect("the descriptor parses");
        assert_eq!(handoff.schema_version, Some(1));
        assert_eq!(handoff.v1_version.as_deref(), Some("1.0.0"));
        assert_eq!(handoff.platform.as_deref(), Some("darwin"));
        assert_eq!(
            handoff.downloads_location.as_deref(),
            Some("/Users/someone/Music/Shiranami Downloads")
        );
    }

    /// The bridge writes `null` when the user never chose a download folder.
    #[test]
    fn a_null_download_location_reads_as_absent_rather_than_failing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            HANDOFF_FILE,
            r#"{"schemaVersion":1,"v1Version":"1.0.0","downloadsLocation":null}"#,
        );

        let handoff = Handoff::read(dir.path()).expect("the descriptor parses");
        assert_eq!(handoff.downloads_location, None);
        assert_eq!(handoff.v1_version.as_deref(), Some("1.0.0"));
    }

    /// A field this build has never heard of must not cost us the rest of the
    /// file — the writer is a shipped binary that can gain fields without us.
    #[test]
    fn an_unknown_field_from_a_later_bridge_does_not_lose_the_known_ones() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            HANDOFF_FILE,
            r#"{"schemaVersion":2,"v1Version":"1.2.0","somethingNew":{"a":1}}"#,
        );

        let handoff = Handoff::read(dir.path()).expect("the descriptor parses");
        assert_eq!(handoff.v1_version.as_deref(), Some("1.2.0"));
    }

    #[test]
    fn an_absent_or_malformed_descriptor_is_none_rather_than_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        assert_eq!(Handoff::read(dir.path()), None, "absent");

        write(dir.path(), HANDOFF_FILE, "{ not json");
        assert_eq!(Handoff::read(dir.path()), None, "malformed");
    }

    /// Values stay the strings `localStorage` held. A zustand slice arrives
    /// double-encoded and must come back out that way.
    #[test]
    fn the_dump_keeps_its_values_as_the_strings_local_storage_held() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            RENDERER_STATE_FILE,
            r#"{
  "schemaVersion": 1,
  "capturedAt": "2026-08-01T09:14:22.531Z",
  "keys": {
    "shiranami.theme": "\"dark\"",
    "shiranami.app-store": "{\"state\":{\"uiScale\":115},\"version\":0}",
    "shiranami.ui-scale": "115"
  }
}
"#,
        );

        let state = RendererState::read(dir.path()).expect("the dump parses");
        assert_eq!(
            state.keys.get("shiranami.theme").map(String::as_str),
            Some("\"dark\"")
        );
        assert_eq!(
            state.keys.get("shiranami.app-store").map(String::as_str),
            Some("{\"state\":{\"uiScale\":115},\"version\":0}"),
            "a zustand slice stays double-encoded"
        );
    }

    /// The prefix re-check. The seed runs before page script, so a key it writes
    /// is indistinguishable from one the app stored itself.
    #[test]
    fn only_shiranami_prefixed_keys_are_seedable() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            RENDERER_STATE_FILE,
            r#"{"keys":{"shiranami.theme":"\"dark\"","token":"secret","other.app":"x"}}"#,
        );

        let state = RendererState::read(dir.path()).expect("the dump parses");
        let seedable: Vec<_> = state.seedable().map(|(key, _)| key).collect();
        assert_eq!(seedable, vec!["shiranami.theme"]);
    }

    /// A bridge that failed to read `localStorage` writes `keys: {}` rather than
    /// omitting the file, and that is a successful read of nothing.
    #[test]
    fn an_empty_dump_parses_and_seeds_nothing() {
        let dir = tempfile::tempdir().expect("a temp dir");
        write(
            dir.path(),
            RENDERER_STATE_FILE,
            r#"{"schemaVersion":1,"keys":{}}"#,
        );

        let state = RendererState::read(dir.path()).expect("the dump parses");
        assert_eq!(state.seedable().count(), 0);
    }
}
