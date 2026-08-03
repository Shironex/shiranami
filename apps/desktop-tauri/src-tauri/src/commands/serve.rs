//! Where the loopback media server is, and the credential to address it with.
//!
//! §2.4 decides that audio, album art and the radio proxy are served over a
//! loopback HTTP server rather than a custom URI scheme, and that the session
//! token is "generated at boot, handed to the webview by a command". This is
//! that command. Without it the renderer knows neither the port — which is
//! ephemeral, so it cannot be compiled in — nor the token, and every media URL
//! it builds is unroutable: covers render as placeholders and nothing plays.
//!
//! **Not a v1 channel.** v1 needed no equivalent because a custom scheme is a
//! constant: `shiranami-art://art/<hash>.jpg` was the same string in every
//! session on every machine. A loopback origin is not, which is the cost §2.4
//! accepts in exchange for surviving wry#1778.
//!
//! # The origin and the token are returned apart
//!
//! [`ServeHandle::base_url`](shiranami_serve::ServeHandle::base_url) already
//! joins them, and returning that one string would be marginally less work on
//! the renderer's side. They are kept apart because only one of the two is a
//! secret: the port is discoverable with `lsof` and is logged at boot, while the
//! token is a capability granting read access to every file the containment
//! guard allows. Handing the renderer two fields lets its URL builder hold the
//! credential in one place and keep it out of anything that is not a URL —
//! notably error messages, which quote the origin of a failed request.
//! `the_origin_and_token_rejoin_into_the_base_url` in `shiranami-serve` pins the
//! two halves against `base_url` so the join cannot drift from what the routes
//! actually expect.

use serde::Serialize;
use specta::Type;
use tauri::State;

use crate::error::{CommandResult, not_booted};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::serve::serve_info,
            ]
        }
    };
}
pub(crate) use commands;

/// How the webview addresses the loopback media server this session.
///
/// `Debug` is hand-written rather than derived. `SessionToken` redacts itself
/// precisely so a token cannot reach a log line by being interpolated into a
/// struct dump, and reading it out into a plain `String` here would reopen that
/// hole one type further out.
#[derive(Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServeInfo {
    /// Scheme and authority, `http://127.0.0.1:<port>`. Not a secret.
    pub origin: String,
    /// This session's path token, the first segment of every media URL.
    ///
    /// A capability, not an identifier: anything holding it can read every file
    /// the containment guard allows. Never logged, never persisted, and dead the
    /// moment the process exits.
    pub token: String,
}

impl std::fmt::Debug for ServeInfo {
    /// The origin prints; the token does not. Same rule as `SessionToken`, and
    /// the origin is the half that is already logged at boot.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ServeInfo")
            .field("origin", &self.origin)
            .field("token", &"<redacted>")
            .finish()
    }
}

/// Reports the loopback media server's origin and session token.
///
/// # Errors
///
/// [`not_booted`] when the server is absent, which means `setup()` did not get
/// as far as starting it. Refusing is the only honest answer — a fabricated
/// origin would turn every cover and every track into a silent 404 that looks
/// like a missing file rather than a failed boot.
#[tauri::command]
#[specta::specta]
pub async fn serve_info(state: State<'_, AppState>) -> CommandResult<ServeInfo> {
    // Borrowed rather than cloned — no longer load-bearing, but still the right
    // shape. `crate::stop_media_server` used to unwrap this `Arc` and so was
    // broken by any clone that outlived a command; it takes `&ServeHandle` now,
    // and an escaping clone costs nothing. Kept because a command has no reason
    // to hold the server past its own return.
    let deferred = state.deferred();
    let serve = deferred
        .serve
        .as_ref()
        .ok_or_else(|| not_booted("the media server"))?;

    Ok(ServeInfo {
        origin: serve.origin(),
        token: serve.token().as_str().to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::ServeInfo;

    /// The wire shape the bridge's URL builder destructures.
    #[test]
    fn serializes_to_the_camel_case_wire_shape() {
        let json = serde_json::to_value(ServeInfo {
            origin: "http://127.0.0.1:52341".to_owned(),
            token: "abc123".to_owned(),
        })
        .expect("the info is serializable");

        assert_eq!(json["origin"], "http://127.0.0.1:52341");
        assert_eq!(json["token"], "abc123");
    }

    /// The credential must not survive a struct dump, which is the property
    /// `SessionToken` exists to hold and this type could quietly have broken.
    #[test]
    fn the_token_never_prints_itself() {
        let printed = format!(
            "{:?}",
            ServeInfo {
                origin: "http://127.0.0.1:52341".to_owned(),
                token: "s3cr3t-token-value".to_owned(),
            }
        );

        assert!(!printed.contains("s3cr3t-token-value"));
        assert!(printed.contains("<redacted>"));
        assert!(
            printed.contains("127.0.0.1:52341"),
            "the origin is not a secret and is the half worth logging"
        );
    }

    /// The two fields join with exactly one slash, and neither carries one of
    /// its own. `shiranami-serve`'s own test proves the join equals `base_url`
    /// for a real handle; this one guards the shape the renderer relies on.
    #[test]
    fn the_halves_carry_no_slash_of_their_own() {
        let info = ServeInfo {
            origin: "http://127.0.0.1:52341".to_owned(),
            token: "abc123".to_owned(),
        };

        assert!(!info.origin.ends_with('/'));
        assert!(!info.token.starts_with('/'));
        assert_eq!(
            format!("{}/{}", info.origin, info.token),
            "http://127.0.0.1:52341/abc123"
        );
    }
}
