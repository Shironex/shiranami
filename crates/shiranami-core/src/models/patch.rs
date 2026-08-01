//! Three-state patch fields for update payloads.
//!
//! The v1 update handlers hand the renderer's payload straight to drizzle's
//! `.set(data)`, which distinguishes an **absent** key (leave the column alone)
//! from a key set to **`null`** (write SQL `NULL`). A plain `Option<T>` collapses
//! both onto `None` and would silently turn "don't touch the artist" into
//! "clear the artist" the first time a renderer sent a partial patch.
//!
//! [`Patch<T>`] keeps the two apart. It is `Option<Option<T>>` rather than a
//! bespoke enum so that `serde` and `specta` treat it as an ordinary nullable
//! field: the generated TypeScript is `foo?: T | null`, byte-identical to the
//! `Partial<…>` shape the renderer already sends.

use serde::{Deserialize, Deserializer};

/// A field in an update payload, in the three states the wire can express.
///
/// | Wire            | Value            | Meaning                  |
/// | --------------- | ---------------- | ------------------------ |
/// | key absent      | `None`           | leave the column alone   |
/// | `"foo": null`   | `Some(None)`     | write SQL `NULL`         |
/// | `"foo": <val>`  | `Some(Some(v))`  | write `v`                |
///
/// Always pair with `#[serde(default, deserialize_with = "…patch::double_option")]`
/// — without the custom deserializer, `serde` folds an explicit `null` back onto
/// the outer `None` and the distinction is lost again.
pub type Patch<T> = Option<Option<T>>;

/// Deserialize a [`Patch`] so an explicit `null` stays distinguishable from an
/// absent key.
///
/// `serde` reaches this function only when the key is **present**, so wrapping
/// the inner `Option<T>` in `Some` is what records "the renderer said something
/// about this field". An absent key never calls it and falls to the field's
/// `#[serde(default)]`, which is `None`.
///
/// # Errors
///
/// Propagates the deserializer's own error when the present value is neither
/// `null` nor a valid `T`.
pub fn double_option<'de, T, D>(deserializer: D) -> Result<Patch<T>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Serialize;

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct Probe {
        #[serde(default, deserialize_with = "double_option")]
        artist: Patch<String>,
    }

    /// The whole reason this module exists: drizzle's `.set()` writes `NULL` for
    /// a present-and-null key and skips an absent one, so the two must not fold
    /// together on the way in.
    #[test]
    fn distinguishes_an_absent_key_from_an_explicit_null() {
        let absent: Probe = serde_json::from_str("{}").expect("parse an absent key");
        assert_eq!(absent.artist, None, "an absent key leaves the column alone");

        let cleared: Probe =
            serde_json::from_str(r#"{"artist":null}"#).expect("parse an explicit null");
        assert_eq!(
            cleared.artist,
            Some(None),
            "an explicit null clears the column"
        );

        let set: Probe = serde_json::from_str(r#"{"artist":"Nujabes"}"#).expect("parse a value");
        assert_eq!(set.artist, Some(Some("Nujabes".to_owned())));
    }

    /// A plain `Option<String>` cannot express the distinction — pinned here so
    /// that anyone "simplifying" [`Patch`] back to `Option` sees why it isn't.
    #[test]
    fn a_plain_option_would_collapse_the_two_states() {
        #[derive(Deserialize)]
        struct Naive {
            #[serde(default)]
            artist: Option<String>,
        }

        let absent: Naive = serde_json::from_str("{}").expect("parse an absent key");
        let cleared: Naive = serde_json::from_str(r#"{"artist":null}"#).expect("parse a null");
        assert_eq!(absent.artist, cleared.artist, "both collapse onto None");
    }
}
