//! The share wire contract, mirrored from the hand-written zod schemas.
//!
//! Ported from `packages/contracts/src/share/dto.ts`. Those schemas stay
//! TypeScript and stay hand-written — decision **D25**, because the NestJS
//! server validates inbound requests with them and the paused Expo app imports
//! them. This module is the *second* implementation of the same contract, not a
//! generated one, so the bounds below are copied deliberately and pinned by
//! tests rather than derived.
//!
//! None of these types derive `specta::Type`. They are an HTTP wire contract
//! with `apps/server`, not an IPC contract with the renderer; putting them in
//! the generated bindings would make a server-side DTO change regenerate the
//! renderer's types, which is exactly the coupling D25 avoids.
//!
//! # Why validate an outbound body at all
//!
//! [`CreateShareRequest::validate`] runs before the request leaves. If the
//! desktop body shape ever drifts from the server's schema, the failure surfaces
//! locally as a structured `BAD_REQUEST` naming the offending field, rather than
//! as a 400 from the server carrying a flattened zod error nobody reads.

use serde::{Deserialize, Serialize};

pub use crate::share::validate::FieldIssue;
use crate::share::validate::{check_length, check_string, is_iso_datetime};

/// Bounds from `trackPayloadSchema`.
const TITLE_MAX: usize = 500;
const ARTIST_MAX: usize = 500;
const YT_ID_MAX: usize = 20;
/// Bounds from `playlistPayloadSchema`.
const PLAYLIST_NAME_MAX: usize = 200;
const PLAYLIST_TRACKS_MAX: usize = 500;

/// One shared track.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackPayload {
    /// Track title.
    pub title: String,
    /// Track artist.
    pub artist: String,
    /// The YouTube video id the recipient plays.
    #[serde(rename = "ytId")]
    pub yt_id: String,
}

/// A shared playlist.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaylistPayload {
    /// Playlist name.
    pub name: String,
    /// Its tracks, in order.
    pub tracks: Vec<TrackPayload>,
}

/// The `POST /api/share` body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CreateShareRequest {
    /// A single track.
    #[serde(rename = "TRACK")]
    Track {
        /// The track.
        payload: TrackPayload,
    },
    /// A playlist.
    #[serde(rename = "PLAYLIST")]
    Playlist {
        /// The playlist.
        payload: PlaylistPayload,
    },
}

/// The `GET /api/share/:code` response: a stored share plus its server-assigned
/// code and expiry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ShareImportResponse {
    /// A shared track.
    #[serde(rename = "TRACK")]
    Track {
        /// The track.
        payload: TrackPayload,
        /// The share code.
        code: String,
        /// ISO-8601 expiry.
        #[serde(rename = "expiresAt")]
        expires_at: String,
    },
    /// A shared playlist.
    #[serde(rename = "PLAYLIST")]
    Playlist {
        /// The playlist.
        payload: PlaylistPayload,
        /// The share code.
        code: String,
        /// ISO-8601 expiry.
        #[serde(rename = "expiresAt")]
        expires_at: String,
    },
}

impl TrackPayload {
    fn validate_at(&self, prefix: &str, issues: &mut Vec<FieldIssue>) {
        check_string(issues, &format!("{prefix}title"), &self.title, TITLE_MAX);
        check_string(issues, &format!("{prefix}artist"), &self.artist, ARTIST_MAX);
        check_string(issues, &format!("{prefix}ytId"), &self.yt_id, YT_ID_MAX);
    }
}

impl CreateShareRequest {
    /// Check the body against the contract before it is sent.
    ///
    /// # Errors
    ///
    /// Every failing field, rather than the first — a caller fixing a drifted
    /// body wants the whole list, which is what zod's `issues` array gave.
    pub fn validate(&self) -> Result<(), Vec<FieldIssue>> {
        let mut issues = Vec::new();

        match self {
            Self::Track { payload } => payload.validate_at("payload.", &mut issues),
            Self::Playlist { payload } => {
                check_string(
                    &mut issues,
                    "payload.name",
                    &payload.name,
                    PLAYLIST_NAME_MAX,
                );

                check_length(
                    &mut issues,
                    "payload.tracks",
                    payload.tracks.len(),
                    PLAYLIST_TRACKS_MAX,
                );

                for (index, track) in payload.tracks.iter().enumerate() {
                    track.validate_at(&format!("payload.tracks.{index}."), &mut issues);
                }
            }
        }

        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}

impl ShareImportResponse {
    /// The share code the server assigned.
    pub fn code(&self) -> &str {
        match self {
            Self::Track { code, .. } | Self::Playlist { code, .. } => code,
        }
    }

    /// The ISO-8601 expiry.
    pub fn expires_at(&self) -> &str {
        match self {
            Self::Track { expires_at, .. } | Self::Playlist { expires_at, .. } => expires_at,
        }
    }

    /// Check a response received from the server.
    ///
    /// This is **untrusted network input** that the renderer reads field by
    /// field, so it is validated before it is handed on — v1's reason, kept
    /// verbatim: "a malformed or hostile response cannot propagate as a lying
    /// type into the import UI".
    ///
    /// # Errors
    ///
    /// Every failing field.
    pub fn validate(&self) -> Result<(), Vec<FieldIssue>> {
        let mut issues = Vec::new();

        match self {
            Self::Track { payload, .. } => payload.validate_at("payload.", &mut issues),
            Self::Playlist { payload, .. } => {
                check_string(
                    &mut issues,
                    "payload.name",
                    &payload.name,
                    PLAYLIST_NAME_MAX,
                );
                check_length(
                    &mut issues,
                    "payload.tracks",
                    payload.tracks.len(),
                    PLAYLIST_TRACKS_MAX,
                );
                for (index, track) in payload.tracks.iter().enumerate() {
                    track.validate_at(&format!("payload.tracks.{index}."), &mut issues);
                }
            }
        }

        if self.code().is_empty() {
            issues.push(FieldIssue::new("code", "must not be empty"));
        }
        if !is_iso_datetime(self.expires_at()) {
            issues.push(FieldIssue::new("expiresAt", "must be an ISO-8601 datetime"));
        }

        if issues.is_empty() {
            Ok(())
        } else {
            Err(issues)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(title: &str, artist: &str, yt_id: &str) -> TrackPayload {
        TrackPayload {
            title: title.to_owned(),
            artist: artist.to_owned(),
            yt_id: yt_id.to_owned(),
        }
    }

    fn valid_track() -> TrackPayload {
        track("Song", "Artist", "dQw4w9WgXcQ")
    }

    #[test]
    fn a_track_share_serialises_to_the_discriminated_wire_shape() {
        let body = CreateShareRequest::Track {
            payload: valid_track(),
        };
        let json = serde_json::to_value(&body).expect("serialises");

        assert_eq!(json["type"], "TRACK");
        assert_eq!(json["payload"]["title"], "Song");
        assert_eq!(
            json["payload"]["ytId"], "dQw4w9WgXcQ",
            "the wire field is camelCase"
        );
    }

    #[test]
    fn a_playlist_share_serialises_to_the_discriminated_wire_shape() {
        let body = CreateShareRequest::Playlist {
            payload: PlaylistPayload {
                name: "Mix".to_owned(),
                tracks: vec![valid_track()],
            },
        };
        let json = serde_json::to_value(&body).expect("serialises");

        assert_eq!(json["type"], "PLAYLIST");
        assert_eq!(json["payload"]["name"], "Mix");
        assert_eq!(json["payload"]["tracks"][0]["artist"], "Artist");
    }

    #[test]
    fn a_valid_body_passes() {
        assert!(
            CreateShareRequest::Track {
                payload: valid_track()
            }
            .validate()
            .is_ok()
        );
    }

    #[test]
    fn empty_track_fields_are_rejected_by_path() {
        let issues = CreateShareRequest::Track {
            payload: track("", "", ""),
        }
        .validate()
        .expect_err("empty fields fail");

        let paths: Vec<&str> = issues.iter().map(|issue| issue.path.as_str()).collect();
        assert_eq!(
            paths,
            vec!["payload.title", "payload.artist", "payload.ytId"],
            "every failing field is reported, not just the first"
        );
    }

    #[test]
    fn over_long_fields_are_rejected_at_the_ported_bounds() {
        let long_title = "x".repeat(TITLE_MAX + 1);
        let issues = CreateShareRequest::Track {
            payload: track(&long_title, "Artist", "id"),
        }
        .validate()
        .expect_err("an over-long title fails");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].path, "payload.title");

        // Exactly at the bound is fine.
        assert!(
            CreateShareRequest::Track {
                payload: track(&"x".repeat(TITLE_MAX), "Artist", "id"),
            }
            .validate()
            .is_ok()
        );
    }

    /// A YouTube id is 11 characters; the 20-unit cap is what stops an
    /// arbitrary string being smuggled into the field.
    #[test]
    fn the_youtube_id_bound_is_twenty_units() {
        assert!(
            CreateShareRequest::Track {
                payload: track("Song", "Artist", &"x".repeat(YT_ID_MAX)),
            }
            .validate()
            .is_ok()
        );
        assert!(
            CreateShareRequest::Track {
                payload: track("Song", "Artist", &"x".repeat(YT_ID_MAX + 1)),
            }
            .validate()
            .is_err()
        );
    }

    /// zod counts UTF-16 code units, so an astral character costs two. A title
    /// that passes here must pass on the server.
    #[test]
    fn a_title_bound_is_measured_in_utf16_code_units() {
        // Half as many emoji as the cap, because each costs two units. One
        // more and the server would refuse a body this side had accepted.
        let emoji_title = "🎵".repeat(TITLE_MAX / 2);
        assert!(
            CreateShareRequest::Track {
                payload: track(&emoji_title, "Artist", "id"),
            }
            .validate()
            .is_ok()
        );
        assert!(
            CreateShareRequest::Track {
                payload: track(&format!("{emoji_title}x"), "Artist", "id"),
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn an_empty_playlist_is_rejected() {
        let issues = CreateShareRequest::Playlist {
            payload: PlaylistPayload {
                name: "Mix".to_owned(),
                tracks: Vec::new(),
            },
        }
        .validate()
        .expect_err("an empty playlist fails");
        assert_eq!(issues[0].path, "payload.tracks");
    }

    #[test]
    fn an_over_long_playlist_is_rejected() {
        let issues = CreateShareRequest::Playlist {
            payload: PlaylistPayload {
                name: "Mix".to_owned(),
                tracks: vec![valid_track(); PLAYLIST_TRACKS_MAX + 1],
            },
        }
        .validate()
        .expect_err("an over-long playlist fails");
        assert!(issues.iter().any(|issue| issue.path == "payload.tracks"));
    }

    /// A bad track inside a playlist is reported at its index, so the caller
    /// can find it.
    #[test]
    fn a_bad_track_inside_a_playlist_is_reported_by_index() {
        let issues = CreateShareRequest::Playlist {
            payload: PlaylistPayload {
                name: "Mix".to_owned(),
                tracks: vec![valid_track(), track("", "Artist", "id")],
            },
        }
        .validate()
        .expect_err("a bad nested track fails");

        assert_eq!(issues[0].path, "payload.tracks.1.title");
    }

    #[test]
    fn an_import_response_round_trips_through_the_wire_shape() {
        let json = serde_json::json!({
            "type": "TRACK",
            "payload": { "title": "Song", "artist": "Artist", "ytId": "abc" },
            "code": "AbC12345",
            "expiresAt": "2026-08-01T12:00:00.000Z",
        });

        let parsed: ShareImportResponse = serde_json::from_value(json).expect("parses");
        assert_eq!(parsed.code(), "AbC12345");
        assert!(parsed.validate().is_ok());
    }

    #[test]
    fn an_import_response_with_an_unknown_type_is_refused() {
        let json = serde_json::json!({
            "type": "ALBUM",
            "payload": { "title": "Song", "artist": "Artist", "ytId": "abc" },
            "code": "AbC12345",
            "expiresAt": "2026-08-01T12:00:00.000Z",
        });
        assert!(serde_json::from_value::<ShareImportResponse>(json).is_err());
    }

    #[test]
    fn an_import_response_missing_its_code_or_expiry_is_refused() {
        let response = ShareImportResponse::Track {
            payload: valid_track(),
            code: String::new(),
            expires_at: "not a date".to_owned(),
        };
        let issues = response.validate().expect_err("both fields fail");

        let paths: Vec<&str> = issues.iter().map(|issue| issue.path.as_str()).collect();
        assert_eq!(paths, vec!["code", "expiresAt"]);
    }
}
