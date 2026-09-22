//! Last.fm: the desktop-auth handshake and the two submission calls.
//!
//! Ported from the Last.fm half of
//! `apps/desktop/src/main/scrobble/scrobbler.ts` plus its parameter builders in
//! `scrobble-payload.ts`. Signing lives next door in [`super::sign`].
//!
//! # Credentials are baked in at build time, as v1's were
//!
//! The api key and shared secret are a *per-application* credential, not a user
//! secret: Last.fm's desktop-auth model expects them to ship inside the client.
//! v1 read them through `process.env.SHIRANAMI_LASTFM_*`, which esbuild's
//! `define` replaced at compile time precisely because "the packaged main
//! process has no access to these env vars at runtime on a user's machine".
//! [`LastfmCredentials::from_build_env`] is `option_env!` for the same reason —
//! a `std::env::var` here would compile fine and leave every shipped build
//! permanently unconfigured.
//!
//! Absent credentials are a complete, supported configuration: Last.fm shows as
//! unavailable and ListenBrainz, which needs only a user token, keeps working.
//! That is why this is an `Option` rather than a pair of empty strings.

use std::time::Duration;

use shiranami_net::{HttpClient, RequestOptions};

use crate::scrobble::error::{Result, ScrobbleError};
use crate::scrobble::play::ScrobblePlay;
use crate::scrobble::sign::{LastfmParams, signed_query};

/// The Last.fm API root every call goes to.
pub const LASTFM_ENDPOINT: &str = "https://ws.audioscrobbler.com/2.0/";

/// Where the user approves a request token.
const LASTFM_AUTHORIZE: &str = "https://www.last.fm/api/auth/";

/// Per-request timeout for the background submissions.
///
/// Without it a hung connection would hold the request — and its retry slot —
/// open forever; with it the submission fails fast and requeues for the next
/// flush.
pub const SUBMIT_TIMEOUT: Duration = Duration::from_secs(10);

/// Per-request timeout for the auth calls the settings UI waits on.
///
/// A stalled connection would otherwise pin the renderer in a loading state
/// with no way out.
pub const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

/// The application credential Last.fm signs against.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastfmCredentials {
    api_key: String,
    secret: String,
}

impl LastfmCredentials {
    /// The credential baked into this build, when there is one.
    ///
    /// `None` whenever either half is missing or blank — v1's
    /// `Boolean(LASTFM_API_KEY && LASTFM_SECRET)`, made unrepresentable rather
    /// than re-checked at each use.
    pub fn from_build_env() -> Option<Self> {
        Self::new(
            option_env!("SHIRANAMI_LASTFM_API_KEY").unwrap_or_default(),
            option_env!("SHIRANAMI_LASTFM_SECRET").unwrap_or_default(),
        )
    }

    /// A credential from an explicit key and secret, or `None` if either is
    /// blank.
    pub fn new(api_key: &str, secret: &str) -> Option<Self> {
        (!api_key.is_empty() && !secret.is_empty()).then(|| Self {
            api_key: api_key.to_owned(),
            secret: secret.to_owned(),
        })
    }

    /// The api key, which is a request parameter rather than a secret.
    pub fn api_key(&self) -> &str {
        &self.api_key
    }
}

/// A started desktop-auth handshake.
///
/// v1's `beginLastfmAuth` opened the browser itself, through Electron's
/// `shell.openExternal`. Opening a browser is a platform capability that lives
/// at the composition root in v2 (`tauri-plugin-opener`), and this crate is
/// rank 3, so the URL is returned instead of being opened here. The command
/// layer opens it and maps the rest onto `LastfmAuthStart`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastfmAuthStarted {
    /// The single-use request token to complete auth with.
    pub token: String,
    /// The page the user has to approve that token on.
    pub authorize_url: String,
}

/// The Last.fm side of the scrobbler.
#[derive(Debug, Clone)]
pub struct LastfmClient {
    http: HttpClient,
    credentials: LastfmCredentials,
    endpoint: String,
}

impl LastfmClient {
    /// A client for `credentials`, calling the real Last.fm API.
    pub fn new(http: HttpClient, credentials: LastfmCredentials) -> Self {
        Self {
            http,
            credentials,
            endpoint: LASTFM_ENDPOINT.to_owned(),
        }
    }

    /// Point the client at a different API root.
    ///
    /// For tests, which drive the whole flow against a loopback server rather
    /// than mocking the client — the same seam Phase 9 gave the iTunes lookup.
    #[must_use]
    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }

    /// Mint a request token and return the page the user must approve it on.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::MissingAuth`] when Last.fm answers without a
    /// token, or the transport failure underneath.
    pub async fn begin_auth(&self) -> Result<LastfmAuthStarted> {
        let params = params([("method", "auth.getToken"), ("api_key", self.api_key())]);

        let response: TokenResponse = self.get(&params).await?;
        let token = response
            .token
            .filter(|token| !token.is_empty())
            .ok_or(ScrobbleError::MissingAuth { what: "token" })?;

        let authorize_url = format!(
            "{LASTFM_AUTHORIZE}?api_key={}&token={token}",
            self.api_key()
        );

        Ok(LastfmAuthStarted {
            token,
            authorize_url,
        })
    }

    /// Exchange an approved token for a session key and the display name.
    ///
    /// The token is single-use, so a second call with the same one fails.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::MissingAuth`] when Last.fm answers without a
    /// session, or the transport failure underneath.
    pub async fn complete_auth(&self, token: &str) -> Result<LastfmSession> {
        let params = params([
            ("method", "auth.getSession"),
            ("api_key", self.api_key()),
            ("token", token),
        ]);

        let response: SessionResponse = self.get(&params).await?;
        let session = response
            .session
            .filter(|session| !session.key.is_empty())
            .ok_or(ScrobbleError::MissingAuth { what: "session" })?;

        Ok(LastfmSession {
            key: session.key,
            username: session.name.filter(|name| !name.is_empty()),
        })
    }

    /// Submit one finished play: a now-playing ping, then the scrobble.
    ///
    /// # Errors
    ///
    /// Returns the scrobble's failure. The now-playing ping's is deliberately
    /// discarded — see the body.
    pub async fn submit(&self, play: &ScrobblePlay, session_key: &str) -> Result<()> {
        let ping_params = now_playing_params(play, self.api_key(), session_key);
        let scrobble_params = scrobble_params(play, self.api_key(), session_key);

        let now_playing = self.post(&ping_params);
        let scrobble = self.post(&scrobble_params);

        // v1 fired the now-playing ping without awaiting it and swallowed its
        // rejection: it is a transient "currently listening" hint, and letting
        // it fail the scrobble would park a play over a ping nobody can see.
        // Running the two concurrently reproduces that without detaching a task
        // — a spawned future here would need a runtime handle this crate has no
        // business holding, and could outlive shutdown.
        let (_ping, scrobble): (Result<ApiResponse>, Result<ApiResponse>) =
            futures::future::join(now_playing, scrobble).await;

        scrobble.map(|_| ())
    }

    fn api_key(&self) -> &str {
        self.credentials.api_key()
    }

    /// GET a signed call, as v1 did for both auth steps.
    async fn get<T: serde::de::DeserializeOwned>(&self, params: &LastfmParams) -> Result<T> {
        let url = format!(
            "{}?{}",
            self.endpoint,
            signed_query(params, &self.credentials.secret)
        );
        let options = RequestOptions::default().with_timeout(AUTH_TIMEOUT);
        Ok(self.http.json(&url, options).await?)
    }

    /// POST a signed call, as v1 did for both submissions.
    ///
    /// Last.fm answers HTTP 200 with an error code in the body for API-level
    /// failures, so a successful status is not a successful call.
    async fn post(&self, params: &LastfmParams) -> Result<ApiResponse> {
        let body = signed_query(params, &self.credentials.secret);
        let options = RequestOptions::post(body)
            .with_timeout(SUBMIT_TIMEOUT)
            .with_header(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/x-www-form-urlencoded"),
            );

        let response: ApiResponse = self.http.json(&self.endpoint, options).await?;
        if let Some(code) = response.error {
            return Err(ScrobbleError::Api { code });
        }

        Ok(response)
    }
}

/// A Last.fm session: the infinite key, and the name to show for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastfmSession {
    /// The session key, which never expires and never leaves the main process.
    pub key: String,
    /// The display name, when Last.fm reported one.
    pub username: Option<String>,
}

/// The signed parameters for `track.scrobble`.
///
/// `api_sig` and `format` are added by [`signed_query`]; empty optional fields
/// are omitted so they are neither sent nor signed.
pub fn scrobble_params(play: &ScrobblePlay, api_key: &str, session_key: &str) -> LastfmParams {
    let mut params = common_params(play, api_key, session_key);
    params.insert("method", "track.scrobble".to_owned());
    params.insert("timestamp", play.started_at.to_string());
    params
}

/// The signed parameters for `track.updateNowPlaying`.
///
/// No timestamp: it is a transient "currently listening" ping, not a play.
pub fn now_playing_params(play: &ScrobblePlay, api_key: &str, session_key: &str) -> LastfmParams {
    let mut params = common_params(play, api_key, session_key);
    params.insert("method", "track.updateNowPlaying".to_owned());
    params
}

/// The parameters both submissions share.
fn common_params(play: &ScrobblePlay, api_key: &str, session_key: &str) -> LastfmParams {
    let mut params = params([
        ("api_key", api_key),
        ("sk", session_key),
        ("artist", play.artist.as_str()),
        ("track", play.track.as_str()),
    ]);

    if let Some(album) = play.album.as_deref().filter(|album| !album.is_empty()) {
        params.insert("album", album.to_owned());
    }
    if let Some(duration) = play.whole_duration() {
        params.insert("duration", duration.to_string());
    }

    params
}

/// Build a parameter map from string pairs.
fn params<const N: usize>(pairs: [(&'static str, &str); N]) -> LastfmParams {
    pairs
        .into_iter()
        .map(|(name, value)| (name, value.to_owned()))
        .collect()
}

/// `auth.getToken`'s response.
#[derive(serde::Deserialize)]
struct TokenResponse {
    token: Option<String>,
}

/// `auth.getSession`'s response.
#[derive(serde::Deserialize)]
struct SessionResponse {
    session: Option<SessionBody>,
}

#[derive(serde::Deserialize)]
struct SessionBody {
    key: String,
    name: Option<String>,
}

/// Any Last.fm response, read only for the error code it may carry.
#[derive(serde::Deserialize)]
struct ApiResponse {
    error: Option<i64>,
}
