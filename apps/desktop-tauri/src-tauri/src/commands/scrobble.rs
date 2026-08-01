//! `scrobble:*` — connecting Last.fm and ListenBrainz, and reading the status.
//!
//! Seven channels, ported from `apps/desktop/src/main/ipc/scrobble.ts`. The
//! submission path is **not** here: a finished play is submitted by the
//! playback pipeline and the retry queue is flushed on the composition root's
//! timer, neither of which the renderer can invoke. What the renderer gets is
//! the Settings pane — a status to render, a master switch, and two connect /
//! disconnect pairs.
//!
//! # The secrets do not cross this boundary, and they cannot
//!
//! The Last.fm session key and the ListenBrainz token live in the blob behind
//! `scrobble.settings`, which is a
//! [`MainStoreKey`](shiranami_core::store::MainStoreKey) — there is no
//! `RendererStoreKey` spelling of it, so `store:get("scrobble.settings")` does
//! not fail a check inside a command, it **fails to deserialize into the
//! parameter type** and the command body never runs. That is the property the
//! `store` reference namespace pinned, and this namespace is the reason it
//! matters.
//!
//! Nothing here returns a credential either. Both directions are asserted:
//! credentials go *in* as bare `String` arguments and come back only as the
//! booleans and display name of
//! [`ScrobbleStatus`](shiranami_core::models::ScrobbleStatus). The one value
//! that does travel out is Last.fm's single-use **request token**, which is not
//! a credential — it is worthless until the user approves it in a browser, and
//! v1 returned it for exactly the same reason: the renderer holds it between
//! `lastfm-begin-auth` and `lastfm-complete-auth`.
//!
//! # The three result shapes are one shape now
//!
//! v1 declared `LastfmConnectResult` and `ListenBrainzConnectResult`, which are
//! structurally identical, and inlined `beginLastfmAuth`'s
//! `{ ok, token?, error? }`. Phase 12B collapsed the first two into
//! [`ScrobbleConnectResult`](shiranami_core::models::ScrobbleConnectResult) and
//! gave the third [`LastfmAuthStart`](shiranami_core::models::LastfmAuthStart);
//! both are enums Rust-side with hand-written `serde`, so the arm that does not
//! apply is **absent** rather than present and null. Those bytes are v1's
//! exactly, and this module pins them at the boundary the renderer reads.
//!
//! # A refused connection is `Ok`, not a rejection
//!
//! Every connect flow answers `{ ok: false, error: "<reason>" }` rather than
//! rejecting, because the renderer shows one toast for all five reason keys and
//! a rejection would route it through `isIpcError` instead. The only rejections
//! this namespace can produce are an unreadable pending count and an absent
//! scrobbler.

use shiranami_core::models::{LastfmAuthStart, ScrobbleConnectResult, ScrobbleStatus};
use shiranami_integrations::scrobble::Scrobbler;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request, not_booted};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::scrobble::scrobble_get_status,
                crate::commands::scrobble::scrobble_set_enabled,
                crate::commands::scrobble::scrobble_lastfm_begin_auth,
                crate::commands::scrobble::scrobble_lastfm_complete_auth,
                crate::commands::scrobble::scrobble_lastfm_disconnect,
                crate::commands::scrobble::scrobble_listenbrainz_connect,
                crate::commands::scrobble::scrobble_listenbrainz_disconnect,
            ]
        }
    };
}
pub(crate) use commands;

/// `scrobble:get-status` — what the Settings pane renders.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_get_status(state: State<'_, AppState>) -> CommandResult<ScrobbleStatus> {
    let scrobbler = scrobbler(&state)?;
    scrobbler.status(&state.pool()).await.wire()
}

/// `scrobble:set-enabled` — flip the master switch, returning the new status.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_set_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<ScrobbleStatus> {
    let scrobbler = scrobbler(&state)?;
    scrobbler.set_enabled(&state.pool(), enabled).await.wire()
}

/// `scrobble:lastfm-begin-auth` — start the desktop-auth handshake.
///
/// Returns the request token the renderer holds until the user has approved it.
/// The browser trip is the side effect described on [`open_auth_page`].
#[tauri::command]
#[specta::specta]
pub async fn scrobble_lastfm_begin_auth(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<LastfmAuthStart> {
    let scrobbler = scrobbler(&state)?;
    let (started, authorize_url) = scrobbler.begin_lastfm_auth().await;

    if let Some(url) = authorize_url {
        open_auth_page(&app, &url);
    }

    Ok(started)
}

/// `scrobble:lastfm-complete-auth` — exchange an approved token for a session.
///
/// The token is single-use and is spent by this call whether or not it
/// succeeds, which is why a failure answers `{ ok: false, error }` rather than
/// something the renderer might retry with the same value.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_lastfm_complete_auth(
    state: State<'_, AppState>,
    token: String,
) -> CommandResult<ScrobbleConnectResult> {
    non_empty_token(&token)?;

    let scrobbler = scrobbler(&state)?;
    Ok(scrobbler.complete_lastfm_auth(&token).await)
}

/// `scrobble:lastfm-disconnect` — forget the stored session.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_lastfm_disconnect(
    state: State<'_, AppState>,
) -> CommandResult<ScrobbleStatus> {
    let scrobbler = scrobbler(&state)?;
    scrobbler.disconnect_lastfm(&state.pool()).await.wire()
}

/// `scrobble:listenbrainz-connect` — validate and store a user token.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_listenbrainz_connect(
    state: State<'_, AppState>,
    token: String,
) -> CommandResult<ScrobbleConnectResult> {
    non_empty_token(&token)?;

    let scrobbler = scrobbler(&state)?;
    Ok(scrobbler.connect_listenbrainz(&token).await)
}

/// `scrobble:listenbrainz-disconnect` — forget the stored token.
#[tauri::command]
#[specta::specta]
pub async fn scrobble_listenbrainz_disconnect(
    state: State<'_, AppState>,
) -> CommandResult<ScrobbleStatus> {
    let scrobbler = scrobbler(&state)?;
    scrobbler
        .disconnect_listenbrainz(&state.pool())
        .await
        .wire()
}

/// The scrobbler, or an `INTERNAL` naming it.
///
/// Every channel here needs one and none of them can invent an answer: a
/// `get-status` that fabricated `{ enabled: false }` would tell a connected user
/// they are disconnected, and a `set-enabled` that pretended to succeed would
/// lose the setting silently.
fn scrobbler<'state>(state: &'state State<'_, AppState>) -> CommandResult<&'state Scrobbler> {
    state
        .deferred()
        .scrobbler
        .as_deref()
        .ok_or_else(|| not_booted("the scrobbler"))
}

/// v1's `z.string().min(1)` on both token arguments.
///
/// Non-empty so a blank submit is refused before any network call — v1's own
/// wording. Extracted so it is reachable from a test with no Tauri runtime.
fn non_empty_token(token: &str) -> CommandResult<()> {
    if token.is_empty() {
        return Err(bad_request("the token must not be empty"));
    }
    Ok(())
}

/// Send the user to Last.fm's approval page.
///
/// **This is the lane's one functional gap, and it is deliberate rather than
/// missed.** v1 called `shell.openExternal` inside `beginLastfmAuth`; Phase 12
/// moved that out of the crate on the grounds that opening a URL is the
/// composition root's job, and named `tauri-plugin-opener` as the mechanism.
/// Phase 16 registered that plugin, so this is now the open rather than the
/// note explaining why it could not happen — the launch blocker lane 5 flagged
/// is closed.
///
/// The wire contract never changed: `{ ok, token? }` is what the renderer
/// reads and it was already exact. What changed is that the handshake can
/// complete, because the user now reaches the page they have to approve on.
///
/// A failure to open is logged and swallowed, not propagated. v1's
/// `shell.openExternal` result was ignored for the same reason: the token in
/// the return value is still valid, the renderer is already showing "waiting
/// for approval", and a user whose browser refused to launch can still be told
/// the URL. Rejecting here would discard a token that was just spent.
fn open_auth_page(app: &tauri::AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt as _;

    if let Err(error) = app.opener().open_url(url, None::<&str>) {
        tracing::warn!(%error, url, "could not open the last.fm authorization page");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;
    use shiranami_core::models::ScrobbleConnectError;
    use shiranami_core::store::{MainStoreKey, RendererStoreKey, ScrobbleSettings};

    fn json(value: &impl serde::Serialize) -> String {
        serde_json::to_string(value).expect("serialize")
    }

    #[test]
    fn a_blank_token_is_refused_before_any_network_call() {
        assert_eq!(
            non_empty_token("").expect_err("v1's min(1)").code,
            codes::validation::BAD_REQUEST
        );
        assert!(non_empty_token("a").is_ok());
    }

    /// **The lane's security property.** The blob holding the Last.fm session
    /// key and the ListenBrainz token has no renderer spelling, so it is not
    /// rejected inside a command — it is unrepresentable as an argument to one.
    #[test]
    fn the_credential_blob_cannot_be_named_as_a_store_command_argument() {
        let parsed: Result<RendererStoreKey, _> =
            serde_json::from_value(serde_json::json!("scrobble.settings"));
        assert!(
            parsed.is_err(),
            "`scrobble.settings` deserialized into a renderer key — the session \
             key and the ListenBrainz token would be readable through `store:get`"
        );

        assert_eq!(
            serde_json::to_value(MainStoreKey::ScrobbleSettings).expect("serialize"),
            serde_json::json!("scrobble.settings"),
            "…and that is the key this namespace's credentials live behind"
        );
    }

    /// The other direction: what these channels *return* carries no credential.
    /// Asserted on the serialized bytes rather than on the type, because the
    /// type is what a future field would be added to.
    #[test]
    fn the_status_that_crosses_the_boundary_carries_no_credential() {
        let settings = ScrobbleSettings {
            enabled: true,
            lastfm_session_key: Some("SESSION-KEY".to_owned()),
            lastfm_username: Some("alice".to_owned()),
            listen_brainz_token: Some("LB-TOKEN".to_owned()),
        };
        let wire = json(&shiranami_integrations::scrobble::status(&settings, 2));

        assert!(!wire.contains("SESSION-KEY"), "the session key leaked");
        assert!(!wire.contains("LB-TOKEN"), "the ListenBrainz token leaked");
        assert!(
            wire.contains("alice"),
            "the display name is meant to be there"
        );
        assert!(wire.contains("\"pendingCount\":2"));
    }

    /// v1's bytes for a successful connection, at the boundary the renderer
    /// reads. A derived struct would have emitted `"error":null` beside these
    /// two keys, and byte-compatibility is the constraint on this port.
    #[test]
    fn a_successful_connect_emits_v1s_two_keys_and_no_third() {
        assert_eq!(
            json(&ScrobbleConnectResult::connected(Some("alice".to_owned()))),
            r#"{"ok":true,"username":"alice"}"#
        );
        // v1 wrote `username: json.session.name ?? null`, so the key is present
        // with an explicit null rather than omitted when the API reports none.
        assert_eq!(
            json(&ScrobbleConnectResult::connected(None)),
            r#"{"ok":true,"username":null}"#
        );
    }

    #[test]
    fn a_refused_connect_emits_only_ok_and_the_reason_key() {
        assert_eq!(
            json(&ScrobbleConnectResult::failed(
                ScrobbleConnectError::InvalidToken
            )),
            r#"{"ok":false,"error":"invalid_token"}"#
        );
        assert_eq!(
            json(&ScrobbleConnectResult::failed(
                ScrobbleConnectError::NotConfigured
            )),
            r#"{"ok":false,"error":"not_configured"}"#
        );
    }

    /// `beginLastfmAuth` was already a flat `{ ok, token?, error? }` in v1 — it
    /// never hit the boolean-literal-discriminant problem the other two did —
    /// so its bytes are pinned separately.
    #[test]
    fn the_auth_start_emits_v1s_inline_shape() {
        assert_eq!(
            json(&LastfmAuthStart::started("tok")),
            r#"{"ok":true,"token":"tok"}"#
        );
        assert_eq!(
            json(&LastfmAuthStart::failed(ScrobbleConnectError::Network)),
            r#"{"ok":false,"error":"network"}"#
        );
    }

    /// Every reason key the renderer can receive, as a set. These strings are
    /// the wire contract; the renderer shows one toast for all of them today,
    /// which is exactly why a silent rename would go unnoticed.
    #[test]
    fn the_five_reason_keys_are_the_ones_v1_returned() {
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

    /// The status shape the Settings pane destructures, pinned by key name.
    #[test]
    fn the_status_keeps_v1s_camel_case_keys() {
        let wire = json(&ScrobbleStatus {
            enabled: true,
            lastfm_connected: true,
            lastfm_username: Some("alice".to_owned()),
            listen_brainz_connected: false,
            pending_count: 0,
        });

        for key in [
            "\"enabled\"",
            "\"lastfmConnected\"",
            "\"lastfmUsername\"",
            "\"listenBrainzConnected\"",
            "\"pendingCount\"",
        ] {
            assert!(wire.contains(key), "the status lost {key}");
        }
    }

    // ── the connect flow, over a real socket and a real database ────────────

    use crate::commands::share::loopback::{Reply, TestServer};
    use shiranami_integrations::scrobble::ListenBrainzClient;
    use shiranami_net::HttpClient;
    use std::sync::Arc;

    /// A scrobbler with no Last.fm credential — this build has none unless
    /// `option_env!` found one at compile time — and a ListenBrainz client
    /// pointed at `server`.
    fn scrobbler_over(state: &crate::state::AppState, server: &TestServer) -> Scrobbler {
        let http = HttpClient::new().expect("the shared client builds");
        Scrobbler::new(Arc::clone(state.settings()), http.clone(), None).with_clients(
            None,
            ListenBrainzClient::new(http).with_endpoints(
                server.url("/1/submit-listens"),
                server.url("/1/validate-token"),
            ),
        )
    }

    /// The whole ListenBrainz connect flow: validate the token, store it, and
    /// answer with v1's bytes. Asserted end to end because the three parts fail
    /// independently — a token that validates but is not stored looks identical
    /// on the wire until the next `get-status`.
    #[tokio::test]
    async fn connecting_listenbrainz_stores_the_token_and_answers_with_v1s_bytes() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![Reply::ok(
            r#"{"code":200,"message":"Token valid.","valid":true,"user_name":"alice"}"#,
        )])
        .await;

        let result = scrobbler_over(&state, &server)
            .connect_listenbrainz("LB-TOKEN")
            .await;

        assert_eq!(json(&result), r#"{"ok":true,"username":"alice"}"#);

        // Connecting a backend also switches scrobbling on, which is v1's
        // behaviour: a user who never touched the master switch expects the
        // backend they just connected to actually receive plays.
        let status = scrobbler_over(&state, &server)
            .status(&state.pool())
            .await
            .expect("a status");
        assert!(status.enabled);
        assert!(status.listen_brainz_connected);
        assert_eq!(status.pending_count, 0);

        // …and the token itself is nowhere in what the renderer receives.
        assert!(!json(&status).contains("LB-TOKEN"));
    }

    /// A refused token is `Ok` carrying a reason key, not a rejection: the
    /// renderer branches on `ok` and shows one toast.
    #[tokio::test]
    async fn a_rejected_token_is_a_value_rather_than_a_rejection() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![Reply::ok(
            r#"{"code":200,"message":"Token invalid.","valid":false}"#,
        )])
        .await;

        let result = scrobbler_over(&state, &server)
            .connect_listenbrainz("WRONG")
            .await;

        assert_eq!(json(&result), r#"{"ok":false,"error":"invalid_token"}"#);
        assert!(
            !scrobbler_over(&state, &server)
                .status(&state.pool())
                .await
                .expect("a status")
                .listen_brainz_connected,
            "a refused token is not stored"
        );
    }

    /// An unreachable backend collapses to `network`, which is what v1's single
    /// `catch` produced for every transport failure.
    #[tokio::test]
    async fn an_unreachable_backend_is_a_network_reason_key() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![Reply::failing(500, "nope")]).await;

        let result = scrobbler_over(&state, &server)
            .connect_listenbrainz("LB-TOKEN")
            .await;

        assert_eq!(json(&result), r#"{"ok":false,"error":"network"}"#);
    }

    /// Disconnecting forgets the credential and says so in the status.
    #[tokio::test]
    async fn disconnecting_forgets_the_token() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![Reply::ok(
            r#"{"code":200,"message":"Token valid.","valid":true,"user_name":"alice"}"#,
        )])
        .await;

        scrobbler_over(&state, &server)
            .connect_listenbrainz("LB-TOKEN")
            .await;
        let status = scrobbler_over(&state, &server)
            .disconnect_listenbrainz(&state.pool())
            .await
            .expect("a status");

        assert!(!status.listen_brainz_connected);
        assert!(status.enabled, "the master switch is a separate decision");
    }

    /// The master switch, through the channel that owns it.
    #[tokio::test]
    async fn the_master_switch_round_trips_through_the_settings_file() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![]).await;

        let enabled = scrobbler_over(&state, &server)
            .set_enabled(&state.pool(), true)
            .await
            .expect("a status");
        assert!(enabled.enabled);

        let disabled = scrobbler_over(&state, &server)
            .set_enabled(&state.pool(), false)
            .await
            .expect("a status");
        assert!(!disabled.enabled);
    }

    /// A build with no Last.fm application credential refuses the handshake
    /// with `not_configured` rather than reaching the network — and, crucially,
    /// without an unopened browser tab having been the user's only clue.
    #[tokio::test]
    async fn a_build_without_a_lastfm_credential_refuses_the_handshake() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let server = TestServer::start(vec![]).await;
        let scrobbler = scrobbler_over(&state, &server);

        assert!(!scrobbler.is_lastfm_configured());

        let (started, authorize_url) = scrobbler.begin_lastfm_auth().await;
        assert_eq!(json(&started), r#"{"ok":false,"error":"not_configured"}"#);
        assert_eq!(authorize_url, None, "and there is no page to open");

        let completed = scrobbler.complete_lastfm_auth("token").await;
        assert_eq!(json(&completed), r#"{"ok":false,"error":"not_configured"}"#);
        assert_eq!(server.received(), 0, "nothing was sent");
    }

    /// A run with no scrobbler answers with a code rather than a default
    /// status — see [`scrobbler`] for why a fabricated one would be worse.
    #[tokio::test]
    async fn an_absent_scrobbler_is_an_error_rather_than_a_default_status() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        assert!(state.deferred().scrobbler.is_none());
        let error = state
            .deferred()
            .scrobbler
            .as_deref()
            .ok_or_else(|| not_booted("the scrobbler"))
            .err()
            .expect("no scrobbler is installed");
        assert_eq!(error.code, codes::INTERNAL);
    }
}
