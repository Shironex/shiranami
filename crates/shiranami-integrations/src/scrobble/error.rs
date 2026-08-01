//! What can go wrong while scrobbling.
//!
//! v1 threw bare `Error`s with interpolated messages and caught every one of
//! them at the same place, so the taxonomy is new; what is ported is the
//! *policy* those catches implemented, which is that nothing here ever reaches
//! the user as a failed operation. A submission that fails is parked and
//! retried, and an auth call that fails becomes a reason key.

use shiranami_core::models::ScrobbleConnectError;
use shiranami_db::DbError;
use shiranami_net::HttpError;

/// A scrobbling failure.
#[derive(Debug, thiserror::Error)]
pub enum ScrobbleError {
    /// The request never produced a usable response.
    #[error("the scrobbling request failed: {source}")]
    Http {
        /// The transport, status or decode failure underneath.
        #[from]
        source: HttpError,
    },

    /// Last.fm answered HTTP 200 with an error code in the body.
    ///
    /// The case that makes a bare status check insufficient: a bad session key
    /// and a rate limit both arrive as a perfectly successful HTTP response
    /// whose JSON says otherwise. v1 inspected the body for exactly this reason,
    /// and a play that hits it must requeue rather than be counted as sent.
    #[error("last.fm rejected the request with error {code}")]
    Api {
        /// Last.fm's numeric error code.
        code: i64,
    },

    /// The auth handshake produced no token or no session.
    #[error("last.fm returned no {what}")]
    MissingAuth {
        /// Which half of the handshake came back empty.
        what: &'static str,
    },

    /// ListenBrainz reported the user token as invalid.
    #[error("listenbrainz rejected the token")]
    InvalidToken,

    /// The retry queue could not be read or written.
    #[error("the scrobble queue failed: {source}")]
    Queue {
        /// The database failure underneath.
        #[from]
        source: DbError,
    },
}

impl ScrobbleError {
    /// The reason key the Settings UI shows for this failure.
    ///
    /// Everything that is not a specific, nameable refusal collapses into
    /// `network`, which is what v1's single `catch` produced.
    pub fn connect_reason(&self) -> ScrobbleConnectError {
        match self {
            Self::MissingAuth { what: "token" } => ScrobbleConnectError::NoToken,
            Self::MissingAuth { .. } => ScrobbleConnectError::NoSession,
            Self::InvalidToken => ScrobbleConnectError::InvalidToken,
            Self::Http { .. } | Self::Api { .. } | Self::Queue { .. } => {
                ScrobbleConnectError::Network
            }
        }
    }
}

/// A scrobbling result.
pub type Result<T, E = ScrobbleError> = std::result::Result<T, E>;

impl shiranami_core::error::WireError for ScrobbleError {
    fn code(&self) -> std::borrow::Cow<'static, str> {
        // Every variant is `INTERNAL`, and the reason is the policy above rather
        // than laziness: the failures a *user* can cause — a rejected token, a
        // handshake that produced nothing — never reach the command boundary as
        // errors at all. They are absorbed by [`Self::connect_reason`] into the
        // `{ ok: false, error }` value the connect channels return, because the
        // renderer branches on `ok` and shows one toast.
        //
        // What is left is the residue: a queue read that failed, or a transport
        // failure on a path that had no reason key to fall back on. v1 threw a
        // bare `Error` for both, so neither had a registry code, and minting one
        // here would hand the renderer a string it has no translation for.
        std::borrow::Cow::Borrowed(shiranami_core::error::codes::INTERNAL)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_token_and_a_missing_session_are_distinguishable() {
        assert_eq!(
            ScrobbleError::MissingAuth { what: "token" }.connect_reason(),
            ScrobbleConnectError::NoToken
        );
        assert_eq!(
            ScrobbleError::MissingAuth { what: "session" }.connect_reason(),
            ScrobbleConnectError::NoSession
        );
    }

    /// v1's single `catch (err)` produced one reason key for everything that was
    /// not a named refusal, and the renderer shows one toast for all of them.
    #[test]
    fn every_unnamed_failure_reads_as_a_network_failure() {
        assert_eq!(
            ScrobbleError::Api { code: 9 }.connect_reason(),
            ScrobbleConnectError::Network
        );
    }

    #[test]
    fn an_invalid_token_keeps_its_own_reason() {
        assert_eq!(
            ScrobbleError::InvalidToken.connect_reason(),
            ScrobbleConnectError::InvalidToken
        );
    }
}
