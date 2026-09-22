//! Dot-path access over the settings document.
//!
//! electron-store ships `accessPropertiesByDotNotation` on by default and v1
//! never turned it off, so the on-disk `config.json` is **nested**: the key
//! `player.volume` lives at `{"player":{"volume":0.8}}`, while `music-folders`
//! — which contains no dot — is a flat top-level key. Reading a v1 file in place
//! (§3.4) means reproducing that rule exactly rather than treating every key as
//! a literal string.
//!
//! The document is held as raw JSON rather than a typed struct on purpose.
//! Four of the renderer-writable keys (`settings`, `music-folders`,
//! `player-state`, `window-bounds`) are opaque renderer blobs that v1 typed as
//! `unknown`, and a v1 file may hold keys this version has never heard of.
//! Round-tripping the document verbatim is what stops an upgrade from silently
//! dropping them.

use serde_json::{Map, Value};

/// Read the value at a dot path, or `None` when any segment is missing.
pub fn get_path<'doc>(document: &'doc Map<String, Value>, path: &str) -> Option<&'doc Value> {
    let mut segments = path.split('.');
    let first = segments.next()?;
    let mut current = document.get(first)?;
    for segment in segments {
        current = current.as_object()?.get(segment)?;
    }
    Some(current)
}

/// Write `value` at a dot path, creating intermediate objects as needed.
///
/// A non-object sitting where an intermediate object is needed is replaced,
/// matching `dot-prop`'s behaviour: the write always lands.
pub fn set_path(document: &mut Map<String, Value>, path: &str, value: Value) {
    let segments: Vec<&str> = path.split('.').collect();
    let Some((leaf, parents)) = segments.split_last() else {
        return;
    };

    let mut current = document;
    for segment in parents {
        let entry = current
            .entry((*segment).to_owned())
            .or_insert_with(|| Value::Object(Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(Map::new());
        }
        current = match entry.as_object_mut() {
            Some(object) => object,
            // Unreachable: the branch above guarantees an object.
            None => return,
        };
    }
    current.insert((*leaf).to_owned(), value);
}

/// Remove the value at a dot path, returning it when it was present.
///
/// Empty parent objects are left behind, as `dot-prop`'s `delete` leaves them —
/// pruning them would rewrite parts of a v1 document the user never touched.
pub fn delete_path(document: &mut Map<String, Value>, path: &str) -> Option<Value> {
    let segments: Vec<&str> = path.split('.').collect();
    let (leaf, parents) = segments.split_last()?;

    let mut current = document;
    for segment in parents {
        current = current.get_mut(*segment)?.as_object_mut()?;
    }
    current.remove(*leaf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn document(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            _ => unreachable!("test fixtures are objects"),
        }
    }

    /// The distinction the whole module exists for: a key with a dot nests, a
    /// key without one does not.
    #[test]
    fn reads_a_nested_key_and_a_flat_key_from_the_same_document() {
        let doc = document(json!({
            "player": { "volume": 0.8, "isMuted": false },
            "music-folders": ["/a", "/b"],
        }));
        assert_eq!(get_path(&doc, "player.volume"), Some(&json!(0.8)));
        assert_eq!(get_path(&doc, "music-folders"), Some(&json!(["/a", "/b"])));
    }

    #[test]
    fn returns_none_for_a_missing_segment() {
        let doc = document(json!({ "player": { "volume": 0.8 } }));
        assert_eq!(get_path(&doc, "player.isMuted"), None);
        assert_eq!(get_path(&doc, "scrobble.settings"), None);
        assert_eq!(get_path(&doc, "nothing"), None);
    }

    /// A key whose *name* contains a dash but no dot must not be split.
    #[test]
    fn does_not_split_a_dashed_key() {
        let doc = document(json!({ "metadata-enrich": { "skippedIds": ["x"] } }));
        assert_eq!(
            get_path(&doc, "metadata-enrich.skippedIds"),
            Some(&json!(["x"]))
        );
    }

    #[test]
    fn creates_intermediate_objects_on_write() {
        let mut doc = Map::new();
        set_path(&mut doc, "scrobble.settings", json!({ "enabled": true }));
        assert_eq!(
            Value::Object(doc),
            json!({ "scrobble": { "settings": { "enabled": true } } })
        );
    }

    #[test]
    fn writing_one_nested_key_leaves_its_siblings_alone() {
        let mut doc = document(json!({ "app": { "language": "pl", "telemetryEnabled": true } }));
        set_path(&mut doc, "app.language", json!("en"));
        assert_eq!(get_path(&doc, "app.language"), Some(&json!("en")));
        assert_eq!(get_path(&doc, "app.telemetryEnabled"), Some(&json!(true)));
    }

    #[test]
    fn deletes_the_leaf_and_leaves_the_parent_in_place() {
        let mut doc = document(json!({ "player": { "volume": 0.8 } }));
        assert_eq!(delete_path(&mut doc, "player.volume"), Some(json!(0.8)));
        assert_eq!(
            Value::Object(doc),
            json!({ "player": {} }),
            "an emptied parent stays, exactly as dot-prop leaves it"
        );
    }

    #[test]
    fn deleting_a_missing_path_is_a_no_op() {
        let mut doc = document(json!({ "player": {} }));
        assert_eq!(delete_path(&mut doc, "player.volume"), None);
        assert_eq!(delete_path(&mut doc, "nothing.at.all"), None);
    }
}
