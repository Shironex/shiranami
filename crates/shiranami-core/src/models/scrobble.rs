//! Scrobbling contracts, ported from
//! `packages/contracts/src/domain/scrobble.ts`.
//!
//! The renderer never sees the raw Last.fm session key or ListenBrainz token —
//! those stay main-only, in [`crate::store`]. It reads back only the connection
//! status here and writes credentials in through dedicated commands.
//!
//! # The deferred connect-result types (Phase 2 → Phase 12)
//!
//! Phase 2 left `LastfmConnectResult` / `ListenBrainzConnectResult` unported.
//! Both are `{ ok: true; … } | { ok: false; error }` unions discriminated on a
//! **boolean literal**, which neither `serde`'s tagged-enum representations nor
//! `specta` 2.0.0-rc.25 can express — the latter's `datatype::Literal` exists in
//! the source but its re-export is commented out (`// pub use literal::Literal;`
//! in `specta/src/datatype.rs`), with a module header saying it "isn't being
//! shipped for now".
//!
//! Phase 12 resolves them here rather than in `shiranami-integrations`, because
//! the export harness CI diffs ([`crate::bindings`]) lives in this crate and a
//! second generated file would be a second thing to keep honest. The deferral
//! was about *representation*, and the representation is:
//!
//! - **Rust side: a real enum.** [`ScrobbleConnectResult`] cannot hold a
//!   username and an error at once, so `{ ok: true, error: "network" }` is
//!   unconstructible rather than merely unwritten.
//! - **Wire side: hand-written `serde`.** The bytes are v1's, exactly — the
//!   success arm emits `{"ok":true,"username":…}` and the failure arm
//!   `{"ok":false,"error":…}`, each with the other key **absent**, not present
//!   and null. A derived flat struct would have emitted `"error":null` on
//!   success, and byte-compatibility was the constraint.
//! - **TypeScript side: a flat mirror.** [`Type`] delegates to a private shape
//!   whose optional keys (`username?`, `error?`) describe those two byte
//!   layouts honestly. It is a widening of v1's union, and it is what the
//!   renderer's call sites already compile against: they read `.ok`, then
//!   `.username ?? ''`, and never read `.error` at all.
//!
//! v1's two connect-result types are structurally identical and neither is
//! imported by `apps/web`, so they collapse into one. `beginLastfmAuth`'s
//! result was *already* a flat `{ ok: boolean; token?: string; error?: string }`
//! in v1 — see [`LastfmAuthStart`] — so all three results in this flow now
//! share one shape.

use serde::de::Deserializer;
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};
use specta::datatype::DataType;
use specta::{Type, Types};

/// The scrobbling connection status the Settings UI renders.
///
/// Carries booleans and the display username only — never the secrets behind
/// them.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleStatus {
    /// Master opt-in switch. When false, nothing is submitted.
    pub enabled: bool,
    /// True when a Last.fm session key is stored.
    pub lastfm_connected: bool,
    /// Last.fm display name, when connected.
    pub lastfm_username: Option<String>,
    /// True when a ListenBrainz user token is stored.
    pub listen_brainz_connected: bool,
    /// Plays parked in the retry queue after a failed submission.
    pub pending_count: u32,
}

/// Why connecting a scrobbling backend failed.
///
/// v1 typed this as a bare `string` and documented it as "a short reason key for
/// the UI toast". The keys are frozen here because they are the wire values; the
/// renderer currently shows one generic toast for every one of them, so the
/// exported TypeScript stays `string` rather than narrowing to this union —
/// narrowing a value nobody reads would only be a contract we could break later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScrobbleConnectError {
    /// This build has no Last.fm API key/secret, so Last.fm is unavailable.
    NotConfigured,
    /// Last.fm did not return a request token.
    NoToken,
    /// Last.fm did not return a session for the approved token.
    NoSession,
    /// ListenBrainz rejected the user token.
    InvalidToken,
    /// The request never completed: transport failure, timeout, bad JSON.
    Network,
}

impl ScrobbleConnectError {
    /// The reason key as it goes over the wire, exactly as v1 spelled it.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotConfigured => "not_configured",
            Self::NoToken => "no_token",
            Self::NoSession => "no_session",
            Self::InvalidToken => "invalid_token",
            Self::Network => "network",
        }
    }

    /// Parse a wire reason key back, for the deserialize half of the round trip.
    fn from_str(value: &str) -> Option<Self> {
        match value {
            "not_configured" => Some(Self::NotConfigured),
            "no_token" => Some(Self::NoToken),
            "no_session" => Some(Self::NoSession),
            "invalid_token" => Some(Self::InvalidToken),
            "network" => Some(Self::Network),
            _ => None,
        }
    }
}

/// The result of connecting Last.fm or ListenBrainz.
///
/// See the module docs for why this is an enum with hand-written `serde` rather
/// than a derived struct or a `#[serde(tag)]` enum.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScrobbleConnectResult {
    /// The backend accepted the credentials. `username` is its display name,
    /// which both APIs may omit.
    Connected {
        /// Display name reported by the backend, when it reported one.
        username: Option<String>,
    },
    /// The backend refused, or was unreachable.
    Failed {
        /// Short reason key for the UI toast.
        error: ScrobbleConnectError,
    },
}

impl ScrobbleConnectResult {
    /// A successful connection under `username`.
    pub fn connected(username: Option<String>) -> Self {
        Self::Connected { username }
    }

    /// A failed connection with a reason key.
    pub fn failed(error: ScrobbleConnectError) -> Self {
        Self::Failed { error }
    }

    /// Whether the connection succeeded — the `ok` the renderer branches on.
    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Connected { .. })
    }
}

/// The result of starting the Last.fm desktop-auth handshake.
///
/// v1 returned an inline `{ ok: boolean; token?: string; error?: string }` here
/// rather than a union, so this arm was never blocked on the literal-discriminant
/// problem. It is modelled as an enum anyway so the three results in the flow
/// behave alike, and so a token can never accompany a failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LastfmAuthStart {
    /// The browser was opened; hold `token` for the completion call.
    Started {
        /// Single-use Last.fm request token the user is approving.
        token: String,
    },
    /// The handshake could not be started.
    Failed {
        /// Short reason key for the UI toast.
        error: ScrobbleConnectError,
    },
}

impl LastfmAuthStart {
    /// A started handshake awaiting approval of `token`.
    pub fn started(token: impl Into<String>) -> Self {
        Self::Started {
            token: token.into(),
        }
    }

    /// A handshake that could not be started.
    pub fn failed(error: ScrobbleConnectError) -> Self {
        Self::Failed { error }
    }
}

/// Write `{ "ok": <ok>, <key>: <value> }` — two keys, never a third.
///
/// Both results serialize through this: the whole point of the hand-written
/// `serde` is that the key belonging to the *other* arm is absent rather than
/// present and null, which is what a derived struct would have emitted.
fn serialize_ok_pair<S, T>(
    serializer: S,
    ok: bool,
    key: &'static str,
    value: &T,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
    T: Serialize + ?Sized,
{
    let mut map = serializer.serialize_map(Some(2))?;
    map.serialize_entry("ok", &ok)?;
    map.serialize_entry(key, value)?;
    map.end()
}

impl Serialize for ScrobbleConnectResult {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Connected { username } => {
                serialize_ok_pair(serializer, true, "username", username)
            }
            Self::Failed { error } => serialize_ok_pair(serializer, false, "error", error.as_str()),
        }
    }
}

impl Serialize for LastfmAuthStart {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Started { token } => serialize_ok_pair(serializer, true, "token", token.as_str()),
            Self::Failed { error } => serialize_ok_pair(serializer, false, "error", error.as_str()),
        }
    }
}

/// The wire form both results deserialize through.
#[derive(Deserialize)]
struct ConnectWire {
    ok: bool,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

impl ConnectWire {
    /// The failure reason, defaulting to `network` for an unrecognised key.
    ///
    /// Unrecognised is treated as a transport failure rather than rejected: this
    /// half of the round trip exists for tests and the mock path, and refusing a
    /// reason key we merely have not heard of would make a future v2.0.x that
    /// adds one un-mockable by an older build.
    fn error(&self) -> ScrobbleConnectError {
        self.error
            .as_deref()
            .and_then(ScrobbleConnectError::from_str)
            .unwrap_or(ScrobbleConnectError::Network)
    }
}

impl<'de> Deserialize<'de> for ScrobbleConnectResult {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let wire = ConnectWire::deserialize(deserializer)?;
        Ok(if wire.ok {
            Self::Connected {
                username: wire.username,
            }
        } else {
            Self::Failed {
                error: wire.error(),
            }
        })
    }
}

impl<'de> Deserialize<'de> for LastfmAuthStart {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let wire = ConnectWire::deserialize(deserializer)?;
        Ok(match (wire.ok, wire.token.clone()) {
            (true, Some(token)) => Self::Started { token },
            // `ok` without a token is v1's `{ ok: true }` with nothing to hold,
            // which the renderer already treats as a failure (`!begun.token`).
            (true, None) => Self::Failed {
                error: ScrobbleConnectError::NoToken,
            },
            (false, _) => Self::Failed {
                error: wire.error(),
            },
        })
    }
}

/// The exported shapes, which the [`Type`] impls below delegate to.
///
/// They live in their own module so each can carry the exact name the binding
/// must export without colliding with the enum it describes: `specta` rc.25
/// dropped `#[specta(rename)]` on containers, and its `#[serde(rename)]`
/// replacement needs a `serde` derive these types have no other use for.
mod shape {
    use serde::{Deserialize, Serialize};
    use specta::Type;

    /// The result of connecting Last.fm or ListenBrainz.
    ///
    /// Exactly one of `username` / `error` is present, selected by `ok`.
    #[derive(Serialize, Deserialize, Type)]
    pub(super) struct ScrobbleConnectResult {
        /// Whether the backend accepted the credentials.
        pub ok: bool,
        /// Present on success; the backend's display name, which may be null.
        #[specta(optional)]
        pub username: Option<String>,
        /// Present on failure; a short reason key for the UI toast.
        #[specta(optional)]
        pub error: Option<String>,
    }

    /// The result of starting the Last.fm desktop-auth handshake.
    ///
    /// Exactly one of `token` / `error` is present, selected by `ok`.
    #[derive(Serialize, Deserialize, Type)]
    pub(super) struct LastfmAuthStart {
        /// Whether the browser handshake was started.
        pub ok: bool,
        /// Present on success; the single-use token to complete auth with.
        #[specta(optional)]
        pub token: Option<String>,
        /// Present on failure; a short reason key for the UI toast.
        #[specta(optional)]
        pub error: Option<String>,
    }
}

impl Type for ScrobbleConnectResult {
    fn definition(types: &mut Types) -> DataType {
        shape::ScrobbleConnectResult::definition(types)
    }
}

impl Type for LastfmAuthStart {
    fn definition(types: &mut Types) -> DataType {
        shape::LastfmAuthStart::definition(types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(value: &impl Serialize) -> String {
        serde_json::to_string(value).expect("serialize")
    }

    /// The reason the `serde` impls are hand-written. A derived struct with
    /// three optional fields would emit `"error":null` here, and the constraint
    /// on this port was byte-compatibility with what the renderer sees today.
    #[test]
    fn a_successful_connection_emits_v1s_bytes_exactly() {
        assert_eq!(
            json(&ScrobbleConnectResult::connected(Some("alice".to_owned()))),
            r#"{"ok":true,"username":"alice"}"#
        );
    }

    /// v1 wrote `username: json.session.name ?? null`, so the key is present
    /// with an explicit null rather than omitted. Ported as such.
    #[test]
    fn a_connection_without_a_display_name_keeps_the_null_username() {
        assert_eq!(
            json(&ScrobbleConnectResult::connected(None)),
            r#"{"ok":true,"username":null}"#
        );
    }

    #[test]
    fn a_failed_connection_emits_only_ok_and_error() {
        assert_eq!(
            json(&ScrobbleConnectResult::failed(
                ScrobbleConnectError::InvalidToken
            )),
            r#"{"ok":false,"error":"invalid_token"}"#
        );
    }

    #[test]
    fn the_auth_start_emits_v1s_inline_shape() {
        assert_eq!(
            json(&LastfmAuthStart::started("tok")),
            r#"{"ok":true,"token":"tok"}"#
        );
        assert_eq!(
            json(&LastfmAuthStart::failed(
                ScrobbleConnectError::NotConfigured
            )),
            r#"{"ok":false,"error":"not_configured"}"#
        );
    }

    /// Every reason key v1 could return, pinned as a set. These strings are the
    /// wire contract; a rename would silently change what a future renderer
    /// could branch on.
    #[test]
    fn the_reason_keys_are_the_ones_v1_returned() {
        let keys: Vec<&str> = [
            ScrobbleConnectError::NotConfigured,
            ScrobbleConnectError::NoToken,
            ScrobbleConnectError::NoSession,
            ScrobbleConnectError::InvalidToken,
            ScrobbleConnectError::Network,
        ]
        .into_iter()
        .map(ScrobbleConnectError::as_str)
        .collect();

        assert_eq!(
            keys,
            vec![
                "not_configured",
                "no_token",
                "no_session",
                "invalid_token",
                "network"
            ]
        );
    }

    #[test]
    fn results_round_trip_through_their_wire_form() {
        for value in [
            ScrobbleConnectResult::connected(Some("bob".to_owned())),
            ScrobbleConnectResult::connected(None),
            ScrobbleConnectResult::failed(ScrobbleConnectError::Network),
        ] {
            let parsed: ScrobbleConnectResult =
                serde_json::from_str(&json(&value)).expect("round trip");
            assert_eq!(parsed, value);
        }

        for value in [
            LastfmAuthStart::started("t"),
            LastfmAuthStart::failed(ScrobbleConnectError::NoToken),
        ] {
            let parsed: LastfmAuthStart = serde_json::from_str(&json(&value)).expect("round trip");
            assert_eq!(parsed, value);
        }
    }

    /// An unrecognised reason key degrades to `network` rather than failing to
    /// parse, so an older build can still mock a newer one's response.
    #[test]
    fn an_unknown_reason_key_reads_as_a_network_failure() {
        let parsed: ScrobbleConnectResult =
            serde_json::from_str(r#"{"ok":false,"error":"teapot"}"#).expect("parse");
        assert_eq!(
            parsed,
            ScrobbleConnectResult::failed(ScrobbleConnectError::Network)
        );
    }

    /// v1's `{ ok: true }` with no token was already treated as a failure by the
    /// renderer (`!begun.ok || !begun.token`); the enum makes that explicit.
    #[test]
    fn an_ok_auth_start_without_a_token_is_a_failure() {
        let parsed: LastfmAuthStart = serde_json::from_str(r#"{"ok":true}"#).expect("parse");
        assert_eq!(
            parsed,
            LastfmAuthStart::failed(ScrobbleConnectError::NoToken)
        );
    }

    #[test]
    fn is_ok_matches_the_serialized_flag() {
        assert!(ScrobbleConnectResult::connected(None).is_ok());
        assert!(!ScrobbleConnectResult::failed(ScrobbleConnectError::Network).is_ok());
    }
}
