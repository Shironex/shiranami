//! Where every crate's typed error becomes the one thing the renderer sees.
//!
//! Each domain crate keeps its own `thiserror` enum and states how that enum
//! projects onto [`ErrorPayload`] by implementing [`WireError`]
//! (`shiranami_core::error`). This module is the single place that projection
//! is applied: a command returns [`CommandResult`], and [`WireResultExt::wire`]
//! is how a crate result becomes one.
//!
//! # The `__IPC_ERROR__` sentinel is not here, and that is the decision
//!
//! v1 could not return a structured rejection. Electron's `invoke` serialises
//! only an `Error`'s `name` and `message`, so `ipc/with-ipc-handler.ts` re-packed
//! every `IpcError` as `new Error("__IPC_ERROR__" + JSON.stringify({code, message,
//! details}))` and the preload's `rehydrateInvokeError` searched the message for
//! that marker and rebuilt the fields.
//!
//! Tauri rejects with a real serialized payload, so **decision D9 deletes the
//! sentinel server-side**. The encoding half has no port. The *decoding* half
//! does not disappear, it moves: architecture §2.6 assigns the Phase 15 shim the
//! job of reconstructing an `IpcError`-shaped `Error` from the rejection, so
//! `isIpcError(e)`, `e.code` and `e.details` keep working in the renderer with no
//! call-site change. Nothing in this crate writes, reads or knows about that
//! string, and [`the_wire_form_never_carries_the_v1_sentinel`] pins it —
//! reintroducing it here would give the shim a doubly-encoded message to unwrap.
//!
//! [`the_wire_form_never_carries_the_v1_sentinel`]: tests::the_wire_form_never_carries_the_v1_sentinel
//!
//! # Why every rejection is code-bearing
//!
//! v1 let an unclassified failure cross as a plain `Error` with no `code`, so
//! `isIpcError(e)` was false for it and the renderer's `switch (err.code)` fell
//! through to `undefined`. Every path here produces a payload, and
//! `WireError::code` defaults unclassified failures to
//! [`codes::INTERNAL`](shiranami_core::error::codes::INTERNAL), so the switch
//! stays exhaustive.
//!
//! # Validation
//!
//! v1 guarded each handler with a `z.tuple([...])` and raised
//! `IpcError('BAD_REQUEST', …, issues)` before the handler ran. serde does the
//! structural half here for free — a malformed argument is rejected by the
//! deserializer and the command body never runs — so what remains for this layer
//! is the semantic half zod also carried: the renderer store-key allowlist,
//! range checks on coordinates, and non-empty strings. Those are raised as
//! [`bad_request`] so they reach the renderer under the same `BAD_REQUEST` code
//! the four frozen registries already contain.

use shiranami_core::error::{CoreError, ErrorPayload, WireError};

/// What every command in this crate returns.
///
/// The error half is [`ErrorPayload`] rather than a crate-local newtype so there
/// is exactly one error shape in the generated bindings. `tauri-specta` runs in
/// [`ErrorHandlingMode::Throw`](tauri_specta::ErrorHandlingMode::Throw), so this
/// arrives renderer-side as a **rejection** carrying the payload — the same
/// control flow v1's `invoke` had, which is what lets the shim rehydrate rather
/// than re-plumb every call site.
pub type CommandResult<T> = Result<T, ErrorPayload>;

/// Project a crate result onto the wire.
///
/// Deliberately explicit rather than a blanket `From` behind `?`. Two reasons,
/// and the second is the load-bearing one:
///
/// - A blanket `impl<E: WireError> From<E> for ErrorPayload` collides with the
///   standard library's reflexive `impl<T> From<T> for T` under coherence, so it
///   is not available anyway.
/// - `.wire()?` is greppable. "Which failures can this command return, and did
///   any of them cross without a registry code?" is a question this layer has to
///   be able to answer by reading, and an invisible conversion hides exactly the
///   line where a `shiranami-net` transport failure quietly becomes `INTERNAL`.
pub trait WireResultExt<T> {
    /// Convert `Err(E)` into the `{ code, message, details }` wire shape.
    fn wire(self) -> CommandResult<T>;
}

impl<T, E: WireError> WireResultExt<T> for Result<T, E> {
    fn wire(self) -> CommandResult<T> {
        self.map_err(|error| ErrorPayload::of(&error))
    }
}

/// A `BAD_REQUEST` for an argument serde accepted but the domain refuses.
///
/// serde rejects the wrong *shape*; this covers the checks v1's zod tuples also
/// carried past shape — a latitude outside ±90, an empty query string, a
/// settings key outside the renderer allowlist. `message` is technical English,
/// exactly as v1's `Invalid payload for <channel>` was: the renderer prefers its
/// own translation of the code and falls back to this.
pub fn bad_request(message: impl Into<String>) -> ErrorPayload {
    ErrorPayload::of(&CoreError::BadRequest(message.into()))
}

/// An `INTERNAL` for a [`crate::state::Deferred`] piece that is absent.
///
/// Every field of `Deferred` is an `Option`, because "absent" is a real runtime
/// state and not merely unfinished work: `SHIRANAMI_E2E=1` deliberately runs
/// with no Discord and no media controls (§2.8 step 7), and until Phase 16
/// boots, none of them is present. A command that needs one has to say so
/// rather than fabricate an answer — a `scrobble:get-status` that invented
/// `{ enabled: false }` would tell a connected user they are disconnected.
///
/// [`codes::INTERNAL`](shiranami_core::error::codes::INTERNAL) rather than a
/// new code, because v1 had no equivalent state and therefore no code for one;
/// inventing a registry entry would hand the renderer a string it has no
/// translation for. The message names the piece so a log says which.
pub fn not_booted(service: &str) -> ErrorPayload {
    ErrorPayload {
        code: shiranami_core::error::codes::INTERNAL.to_owned(),
        message: format!("{service} is not available in this session"),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::codes;

    /// The marker v1 stuffed into an `Error` message. Spelled out here rather
    /// than imported, because there is deliberately nothing to import: if a
    /// constant for it ever appears in this crate, this test should be the thing
    /// that has to be deleted to make that compile.
    const V1_SENTINEL: &str = "__IPC_ERROR__";

    #[test]
    fn the_wire_form_never_carries_the_v1_sentinel() {
        let payload = bad_request("latitude is out of range");
        let json = serde_json::to_string(&payload).expect("serialize the payload");

        assert!(
            !json.contains(V1_SENTINEL),
            "decision D9 deletes the sentinel server-side — the Phase 15 shim \
             rebuilds the IpcError shape from the rejection, and a sentinel here \
             would give it a doubly-encoded message to unwrap"
        );
        assert_eq!(payload.code, codes::validation::BAD_REQUEST);
    }

    #[test]
    fn a_crate_error_keeps_its_registry_code_through_wire() {
        let failed: Result<(), _> = Err(
            shiranami_integrations::weather::WeatherError::unavailable("HTTP 503"),
        );

        let payload = failed.wire().expect_err("the failure survives");

        assert_eq!(payload.code, codes::WEATHER_UNAVAILABLE);
        assert!(payload.message.contains("HTTP 503"));
    }

    /// The property that keeps the renderer's `switch (err.code)` exhaustive:
    /// a failure with no registry entry is still code-bearing.
    #[test]
    fn an_unclassified_crate_error_still_carries_a_code() {
        let failed: Result<(), _> = Err(shiranami_core::CoreError::PathNotAllowed {
            path: "/etc/passwd".into(),
        });

        let payload = failed.wire().expect_err("the failure survives");

        assert_eq!(payload.code, codes::validation::FORBIDDEN);
        assert!(!payload.code.is_empty());
    }

    #[test]
    fn an_ok_result_passes_through_untouched() {
        let ok: Result<u8, shiranami_core::CoreError> = Ok(7);

        assert_eq!(ok.wire().expect("ok survives"), 7);
    }

    /// An absent `Deferred` piece is code-bearing like everything else, and
    /// names the piece so the log says which one was missing.
    #[test]
    fn an_absent_deferred_piece_is_an_internal_naming_the_piece() {
        let payload = not_booted("the scrobbler");

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("the scrobbler"));
        assert_eq!(payload.details, None);
    }
}
