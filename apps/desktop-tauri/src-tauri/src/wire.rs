//! Wire helpers the command layer needs and no domain crate should own.
//!
//! One type so far. It exists because of a trap worth naming.
//!
//! # Never name `serde_json::Value` in a command or event signature
//!
//! `specta` can give `serde_json::Value` a `Type` impl behind its `serde_json`
//! feature, and that impl is marked *inline*. `Value` is recursive — an array
//! holds `Value`s and an object holds `Value`s — so inlining it never
//! terminates: the exporter **overflows the stack** rather than emitting
//! anything. The failure arrives as `fatal runtime error: stack overflow` from a
//! test that looks like it is only writing a file, with no mention of the type
//! that caused it.
//!
//! The feature is therefore deliberately **off** in the workspace manifest, so a
//! lane that reaches for `serde_json::Value` in a signature gets
//! `the trait bound `Value: Type` is not satisfied` — a compile error naming the
//! line — instead of a stack overflow naming nothing. [`Json`] is what to use
//! instead.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Unknown;

/// An opaque JSON value: `unknown` on the TypeScript side.
///
/// The same treatment `shiranami_core::error::ErrorPayload` gives its `details`
/// field, generalised. Use it wherever v1's contract was genuinely untyped:
///
/// - `store:get` / `store:set`, whose zod tuple was
///   `[rendererStoreKey, z.unknown()]` because the renderer owns the shape of
///   its own persisted slices;
/// - an event payload whose model belongs to a namespace lane that has not
///   landed yet — replacing [`Json`] with the real type there is a
///   binding-visible change and therefore a reviewable one.
///
/// Transparent, so the bytes are the value itself and adding or removing the
/// wrapper never changes what crosses the boundary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct Json(#[specta(type = Unknown)] pub serde_json::Value);

impl From<serde_json::Value> for Json {
    fn from(value: serde_json::Value) -> Self {
        Self(value)
    }
}

impl From<Json> for serde_json::Value {
    fn from(json: Json) -> Self {
        json.0
    }
}

impl Json {
    /// JSON `null` — what an unset settings key reads as.
    pub fn null() -> Self {
        Self(serde_json::Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The wrapper must be invisible on the wire, or adding it to a command
    /// would change that command's payload.
    #[test]
    fn the_wrapper_serializes_as_the_bare_value() {
        let nested = json!({ "a": [1, { "b": null }] });

        assert_eq!(
            serde_json::to_value(Json(nested.clone())).expect("serialize"),
            nested
        );
    }

    #[test]
    fn a_bare_value_deserializes_into_the_wrapper() {
        let parsed: Json = serde_json::from_str(r#"{"sidebar":{"width":240}}"#).expect("parse");

        assert_eq!(parsed.0["sidebar"]["width"], 240);
    }

    #[test]
    fn null_round_trips_rather_than_becoming_absent() {
        assert_eq!(
            serde_json::to_value(Json::null()).expect("serialize"),
            serde_json::Value::Null
        );
    }
}
