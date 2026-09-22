//! Wire helpers the command layer needs and no domain crate should own.
//!
//! [`Json`] is here because of a trap worth naming; [`off_thread`],
//! [`data_dir`] and [`require_path`] are here because four namespaces and the
//! boot sequence share them and none of those is their owner.
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

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use shiranami_core::error::{ErrorPayload, codes};
use specta::Type;
use specta_typescript::Unknown;
use tauri::{AppHandle, Manager as _};

use crate::error::{CommandResult, bad_request};

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

// ── helpers the command layer shares ─────────────────────────────────────────
//
// These three arrived in `commands/library.rs` because `commands/mod.rs` is
// driven by the shared namespace list, so a Phase 14 lane could not add a
// non-namespace sibling module without editing a file every other lane also
// edited. That made the media-pipeline lane's first module their accidental
// home, and its own comment said so: they belong here, "the module already
// documented as wire helpers the command layer needs and no domain crate should
// own", and should move "the moment a shared-file edit is cheaper than a
// cross-lane conflict". Phase 16 is that moment — the fan-out is over and this
// phase edits the shared files anyway.
//
// `loudness`, `metadata`, `waveform` and `library` all reach for `off_thread`;
// the boot sequence reaches for `data_dir`.

/// Run CPU-bound or blocking work off the webview's thread (§2.3, R15).
///
/// The join failure is a panic inside `work`, which is a bug rather than a
/// runtime condition — but it must still cross as a code-bearing rejection, or
/// the renderer's `switch (err.code)` sees `undefined` for the one case where
/// something has genuinely gone wrong.
///
/// `tauri::async_runtime::spawn_blocking`, never tokio's directly: from a thread
/// Tauri entered through an OS callback there is no reactor, and the resulting
/// panic crosses an `extern "C"` boundary as a `SIGABRT` (R16).
pub async fn off_thread<T, F>(operation: &'static str, work: F) -> CommandResult<T>
where
    F: FnOnce() -> CommandResult<T> + Send + 'static,
    T: Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(outcome) => outcome,
        Err(error) => Err(ErrorPayload {
            code: codes::INTERNAL.to_owned(),
            message: format!("could not {operation}: {error}"),
            details: None,
        }),
    }
}

/// The app data directory, or `None` when the platform will not name one.
///
/// `None` is a real, survivable state rather than a failure: it is where the
/// album-art cache lives, and every consumer in this lane takes
/// `Option<&Path>` and simply skips cover extraction without it. v1 dropped a
/// cover that would not write while keeping the track, and this is the same
/// trade one level up — a scan that refused to run because a directory could
/// not be resolved would lose the user the tags as well as the artwork.
pub fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    match app.path().app_data_dir() {
        Ok(dir) => Some(dir),
        Err(error) => {
            tracing::warn!(%error, "no app data directory; cover art will not be cached");
            None
        }
    }
}

/// v1's `z.string().min(1)`, which guards a path argument on every channel in
/// this lane.
///
/// serde accepts any string, including the empty one, and an empty path resolves
/// to the process's working directory — so an unguarded scan would walk it and
/// an unguarded disk-usage call would report bytes from somewhere the user never
/// added to their library. Refused under the same `BAD_REQUEST` code v1's zod
/// failure produced.
pub fn require_path(path: &Path) -> CommandResult<()> {
    if path.as_os_str().is_empty() {
        return Err(bad_request("the path must not be empty"));
    }
    Ok(())
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

    // ── the shared helpers, whose tests travelled with them from
    // `commands/tests/library.rs`: they were always tests of `off_thread`
    // and `require_path` rather than of the library namespace that
    // happened to host them.

    #[test]
    fn an_empty_path_is_a_bad_request_rather_than_a_walk_of_the_root() {
        let error = require_path(Path::new("")).expect_err("empty is refused");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    #[test]
    fn a_real_path_passes_validation() {
        assert!(require_path(Path::new("/music")).is_ok());
    }

    // ── the off-thread helper ────────────────────────────────────────────────

    #[tokio::test]
    async fn off_thread_carries_the_result_back() {
        let value: usize = off_thread("do the thing", || Ok(7)).await.expect("ok");

        assert_eq!(value, 7);
    }

    #[tokio::test]
    async fn off_thread_carries_a_failure_back_unchanged() {
        let error = off_thread::<(), _>("do the thing", || Err(bad_request("nope")))
            .await
            .expect_err("the failure survives");

        assert_eq!(error.code, codes::validation::BAD_REQUEST);
        assert_eq!(error.message, "nope");
    }

    /// A panic in the blocking half must still cross as a code-bearing
    /// rejection, or the renderer's `switch (err.code)` falls through to
    /// `undefined` for the one case where something has genuinely broken.
    #[tokio::test]
    async fn a_panic_off_thread_becomes_a_coded_rejection() {
        let error = off_thread::<(), _>("scan the folder", || panic!("boom"))
            .await
            .expect_err("the panic is reported rather than swallowed");

        assert_eq!(error.code, codes::INTERNAL);
        assert!(error.message.contains("scan the folder"));
    }
}
