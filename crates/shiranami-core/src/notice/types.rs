//! System-notice wire types, ported from
//! `packages/contracts/src/ipc/system.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Which subsystem raised a notice.
///
/// A closed set, not a free-form string: the renderer maps `source:code` pairs
/// onto i18n keys, so a source it has never heard of has nothing to display.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SystemNoticeSource {
    /// Discord Rich Presence.
    Discord,
    /// The album-art cache.
    AlbumArt,
}

/// How loudly the renderer should surface a notice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SystemNoticeLevel {
    /// Rendered as an error toast.
    Error,
    /// Rendered as a warning toast. Every notice v1 emitted was this.
    Warn,
    /// Rendered as an info toast.
    Info,
}

/// An interpolation value for the notice's i18n message.
///
/// Untagged, so it serializes as a bare string or number exactly as v1's
/// `Record<string, string | number>` did.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum NoticeMetaValue {
    /// A string value.
    Text(String),
    /// A numeric value.
    Number(#[specta(type = Number)] f64),
}

/// A one-off notice from a background subsystem.
///
/// `code` is a stable identifier the renderer maps to a translated string; it is
/// a free-form `String` on the wire because the producing subsystem owns its own
/// code vocabulary. Unknown codes fall back to a generic message rather than
/// being dropped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemNotice {
    /// Which subsystem raised it.
    pub source: SystemNoticeSource,
    /// How loudly to surface it.
    pub level: SystemNoticeLevel,
    /// Stable identifier; the renderer maps this to an i18n key.
    pub code: String,
    /// Interpolation values for the translated message.
    ///
    /// A `BTreeMap` rather than a `HashMap` so the serialized key order is
    /// stable — a payload that reorders itself between emissions would defeat
    /// any downstream de-duplication that hashes it.
    #[specta(optional)]
    pub meta: Option<BTreeMap<String, NoticeMetaValue>>,
}

impl SystemNotice {
    /// Build a `warn`-level notice, which is what every v1 emitter produced.
    pub fn warn(source: SystemNoticeSource, code: impl Into<String>) -> Self {
        Self {
            source,
            level: SystemNoticeLevel::Warn,
            code: code.into(),
            meta: None,
        }
    }

    /// The de-duplication key: `source:code`, exactly as v1 composed it.
    ///
    /// The level is deliberately not part of it. The same failure re-reported at
    /// a different level is still the same failure, and would otherwise slip
    /// past the cooldown.
    pub fn dedup_key(&self) -> String {
        let source = match self.source {
            SystemNoticeSource::Discord => "discord",
            SystemNoticeSource::AlbumArt => "album-art",
        };
        format!("{source}:{}", self.code)
    }
}

/// Stable notice codes v1 emitted. The renderer has translations for these.
pub mod codes {
    /// Discord login failed; the reconnect loop is backing off.
    pub const DISCORD_LOGIN_FAILED: &str = "discordLoginFailed";
    /// Pruning orphaned album art failed.
    pub const ALBUM_ART_PRUNE_FAILED: &str = "albumArtPruneFailed";
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bindings::repo_file;

    #[test]
    fn the_dedup_key_is_source_colon_code() {
        let notice =
            SystemNotice::warn(SystemNoticeSource::AlbumArt, codes::ALBUM_ART_PRUNE_FAILED);
        assert_eq!(notice.dedup_key(), "album-art:albumArtPruneFailed");
    }

    /// The serialized source strings are what the renderer's toast id is built
    /// from, so a kebab-case slip would silently stop matching.
    #[test]
    fn sources_serialize_to_the_strings_the_renderer_expects() {
        assert_eq!(
            serde_json::to_string(&SystemNoticeSource::AlbumArt).expect("serialize"),
            "\"album-art\""
        );
        assert_eq!(
            serde_json::to_string(&SystemNoticeSource::Discord).expect("serialize"),
            "\"discord\""
        );
    }

    #[test]
    fn meta_values_serialize_as_bare_strings_and_numbers() {
        let mut meta = BTreeMap::new();
        meta.insert("name".to_owned(), NoticeMetaValue::Text("art".to_owned()));
        meta.insert("count".to_owned(), NoticeMetaValue::Number(3.0));

        let json = serde_json::to_value(SystemNotice {
            meta: Some(meta),
            ..SystemNotice::warn(SystemNoticeSource::Discord, "x")
        })
        .expect("serialize the notice");

        assert_eq!(json["meta"]["name"], serde_json::json!("art"));
        assert_eq!(json["meta"]["count"], serde_json::json!(3.0));
    }

    /// The codes are only useful if the renderer still translates them.
    #[test]
    fn the_codes_still_have_renderer_translations() {
        let hook = repo_file("apps/web/src/hooks/useSystemNotices.ts");
        for code in [codes::DISCORD_LOGIN_FAILED, codes::ALBUM_ART_PRUNE_FAILED] {
            assert!(
                hook.contains(code),
                "{code} is no longer mapped in useSystemNotices.ts"
            );
        }
    }
}
