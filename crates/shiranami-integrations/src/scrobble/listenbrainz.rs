//! ListenBrainz: token validation and the two submission calls.
//!
//! Ported from the ListenBrainz half of
//! `apps/desktop/src/main/scrobble/scrobbler.ts` and `listenBrainzBody` in
//! `scrobble-payload.ts`.
//!
//! Simpler than Last.fm in every respect: no application credential, no
//! signature, no handshake. The user pastes a token from their profile, it goes
//! in an `Authorization: Token …` header, and that is the whole auth model —
//! which is why ListenBrainz keeps working in a build with no Last.fm keys.

use serde::Serialize;
use shiranami_net::{HttpClient, RequestOptions};

use crate::scrobble::error::{Result, ScrobbleError};
use crate::scrobble::lastfm::{AUTH_TIMEOUT, SUBMIT_TIMEOUT};
use crate::scrobble::play::ScrobblePlay;

/// Where finished plays and now-playing pings are submitted.
pub const LISTENBRAINZ_SUBMIT: &str = "https://api.listenbrainz.org/1/submit-listens";

/// Where a user token is checked before it is stored.
pub const LISTENBRAINZ_VALIDATE: &str = "https://api.listenbrainz.org/1/validate-token";

/// Which kind of listen a submission is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ListenType {
    /// A finished play. Carries `listened_at`.
    Single,
    /// A transient "currently listening" ping. Must **not** carry
    /// `listened_at` — the server rejects a `playing_now` listen that does.
    PlayingNow,
}

/// The `submit-listens` request body.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ListenBrainzBody {
    /// Which kind of listen this is.
    pub listen_type: ListenType,
    /// Always exactly one listen: v1 submitted plays one at a time.
    pub payload: Vec<Listen>,
}

/// One listen inside a submission.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Listen {
    /// Unix seconds the play started. Omitted entirely for `playing_now`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listened_at: Option<i64>,
    /// What was played.
    pub track_metadata: TrackMetadata,
}

/// The track description ListenBrainz stores.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrackMetadata {
    /// Track artist.
    pub artist_name: String,
    /// Track title.
    pub track_name: String,
    /// Album, omitted when the play had none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_name: Option<String>,
    /// Extra fields, omitted when there are none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_info: Option<AdditionalInfo>,
}

/// The one extra field v1 sent.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AdditionalInfo {
    /// Track length in whole seconds.
    pub duration: i64,
}

/// Build the `submit-listens` body for `play`.
///
/// The `listened_at` rule is load-bearing in both directions: a `single` listen
/// must carry it, and a `playing_now` listen must not — the server rejects the
/// latter outright rather than ignoring the field.
pub fn listen_body(play: &ScrobblePlay, listen_type: ListenType) -> ListenBrainzBody {
    ListenBrainzBody {
        listen_type,
        payload: vec![Listen {
            listened_at: match listen_type {
                ListenType::Single => Some(play.started_at),
                ListenType::PlayingNow => None,
            },
            track_metadata: TrackMetadata {
                artist_name: play.artist.clone(),
                track_name: play.track.clone(),
                release_name: play.album.clone().filter(|album| !album.is_empty()),
                additional_info: play
                    .whole_duration()
                    .map(|duration| AdditionalInfo { duration }),
            },
        }],
    }
}

/// The ListenBrainz side of the scrobbler.
#[derive(Debug, Clone)]
pub struct ListenBrainzClient {
    http: HttpClient,
    submit_endpoint: String,
    validate_endpoint: String,
}

impl ListenBrainzClient {
    /// A client calling the real ListenBrainz API.
    pub fn new(http: HttpClient) -> Self {
        Self {
            http,
            submit_endpoint: LISTENBRAINZ_SUBMIT.to_owned(),
            validate_endpoint: LISTENBRAINZ_VALIDATE.to_owned(),
        }
    }

    /// Point both routes at a different host, for tests.
    #[must_use]
    pub fn with_endpoints(
        mut self,
        submit: impl Into<String>,
        validate: impl Into<String>,
    ) -> Self {
        self.submit_endpoint = submit.into();
        self.validate_endpoint = validate.into();
        self
    }

    /// Check a user token and return the name it belongs to.
    ///
    /// # Errors
    ///
    /// Returns [`ScrobbleError::InvalidToken`] when ListenBrainz says the token
    /// is not valid, or the transport failure underneath.
    pub async fn validate(&self, token: &str) -> Result<Option<String>> {
        let options = RequestOptions::default()
            .with_timeout(AUTH_TIMEOUT)
            .with_header(
                reqwest::header::AUTHORIZATION,
                authorization(token).map_err(|_| ScrobbleError::InvalidToken)?,
            );

        let response: ValidateResponse = self.http.json(&self.validate_endpoint, options).await?;
        if !response.valid.unwrap_or(false) {
            return Err(ScrobbleError::InvalidToken);
        }

        Ok(response.user_name.filter(|name| !name.is_empty()))
    }

    /// Submit one finished play: a `playing_now` ping, then the `single`.
    ///
    /// # Errors
    ///
    /// Returns the `single` submission's failure. The ping's is discarded, as
    /// v1 discarded it — see [`super::lastfm::LastfmClient::submit`] for why the
    /// two run concurrently rather than detached.
    pub async fn submit(&self, play: &ScrobblePlay, token: &str) -> Result<()> {
        let ping = self.send(play, token, ListenType::PlayingNow);
        let single = self.send(play, token, ListenType::Single);

        let (_ping, single) = futures::future::join(ping, single).await;
        single
    }

    async fn send(&self, play: &ScrobblePlay, token: &str, listen_type: ListenType) -> Result<()> {
        let body = serde_json::to_string(&listen_body(play, listen_type))
            .map_err(|_| ScrobbleError::MissingAuth { what: "listen" })?;

        let options = RequestOptions::post(body)
            .with_timeout(SUBMIT_TIMEOUT)
            .with_header(
                reqwest::header::AUTHORIZATION,
                authorization(token).map_err(|_| ScrobbleError::InvalidToken)?,
            )
            .with_header(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json"),
            );

        // The response body carries nothing either version reads; a non-2xx is
        // already an error from the client.
        self.http.bytes(&self.submit_endpoint, options).await?;
        Ok(())
    }
}

/// The `Authorization` header value for `token`.
///
/// A token with a newline or a non-ASCII byte in it cannot become a header at
/// all. v1 would have thrown at `fetch`; here it is refused as an invalid token,
/// which is both truer and what the settings UI already knows how to show.
fn authorization(token: &str) -> std::result::Result<reqwest::header::HeaderValue, ()> {
    reqwest::header::HeaderValue::from_str(&format!("Token {token}")).map_err(|_| ())
}

/// `validate-token`'s response.
#[derive(serde::Deserialize)]
struct ValidateResponse {
    valid: Option<bool>,
    user_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play() -> ScrobblePlay {
        ScrobblePlay {
            artist: "Nujabes".to_owned(),
            track: "Aruarian Dance".to_owned(),
            album: Some("Modal Soul".to_owned()),
            duration_seconds: Some(247.0),
            started_at: 1_700_000_000,
        }
    }

    fn json(play: &ScrobblePlay, listen_type: ListenType) -> serde_json::Value {
        serde_json::to_value(listen_body(play, listen_type)).expect("serialize the body")
    }

    /// v1's `listenBrainzBody` case, field for field.
    #[test]
    fn a_single_listen_carries_the_start_time_and_the_metadata() {
        let body = json(&play(), ListenType::Single);

        assert_eq!(body["listen_type"], serde_json::json!("single"));
        assert_eq!(
            body["payload"][0]["listened_at"],
            serde_json::json!(1_700_000_000)
        );

        let metadata = &body["payload"][0]["track_metadata"];
        assert_eq!(metadata["artist_name"], serde_json::json!("Nujabes"));
        assert_eq!(metadata["track_name"], serde_json::json!("Aruarian Dance"));
        assert_eq!(metadata["release_name"], serde_json::json!("Modal Soul"));
        assert_eq!(
            metadata["additional_info"]["duration"],
            serde_json::json!(247)
        );
    }

    /// The server rejects a `playing_now` listen that carries `listened_at`, so
    /// the key must be **absent** rather than null.
    #[test]
    fn a_playing_now_listen_omits_the_start_time_entirely() {
        let body = json(&play(), ListenType::PlayingNow);

        assert_eq!(body["listen_type"], serde_json::json!("playing_now"));
        assert!(
            body["payload"][0].get("listened_at").is_none(),
            "`listened_at` must not appear at all on a playing_now listen"
        );
    }

    /// v1 omitted the optional keys rather than sending nulls.
    #[test]
    fn a_play_without_an_album_or_duration_omits_both_keys() {
        let bare = ScrobblePlay {
            album: None,
            duration_seconds: None,
            ..play()
        };
        let metadata = json(&bare, ListenType::Single)["payload"][0]["track_metadata"].clone();

        assert!(metadata.get("release_name").is_none());
        assert!(metadata.get("additional_info").is_none());
        assert_eq!(metadata["artist_name"], serde_json::json!("Nujabes"));
    }

    /// A zero duration is not a duration — v1's `durationSeconds > 0` guard.
    #[test]
    fn a_zero_duration_does_not_produce_additional_info() {
        let zero = ScrobblePlay {
            duration_seconds: Some(0.0),
            ..play()
        };
        assert!(
            json(&zero, ListenType::Single)["payload"][0]["track_metadata"]
                .get("additional_info")
                .is_none()
        );
    }

    #[test]
    fn a_submission_always_carries_exactly_one_listen() {
        assert_eq!(listen_body(&play(), ListenType::Single).payload.len(), 1);
    }

    /// A token that cannot become a header is refused rather than panicking at
    /// send time.
    #[test]
    fn a_token_with_a_newline_cannot_become_a_header() {
        assert!(authorization("good-token").is_ok());
        assert!(authorization("bad\ntoken").is_err());
    }
}
