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

/// Which field failed the contract, and how.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldIssue {
    /// Dotted path to the offending field, as zod would report it.
    pub path: String,
    /// What was wrong.
    pub message: String,
}

impl FieldIssue {
    fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

/// Length in UTF-16 code units, which is what a zod `.max()` on a string counts.
///
/// The two measures diverge past the BMP: a title of 300 emoji is 300 `char`s
/// and 600 units, and only the second is the number the server will apply.
fn length(value: &str) -> usize {
    value.encode_utf16().count()
}

fn check_string(issues: &mut Vec<FieldIssue>, path: &str, value: &str, max: usize) {
    if value.is_empty() {
        issues.push(FieldIssue::new(path, "must not be empty"));
    } else if length(value) > max {
        issues.push(FieldIssue::new(
            path,
            format!("must be at most {max} characters"),
        ));
    }
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

                if payload.tracks.is_empty() {
                    issues.push(FieldIssue::new(
                        "payload.tracks",
                        "must contain at least one track",
                    ));
                } else if payload.tracks.len() > PLAYLIST_TRACKS_MAX {
                    issues.push(FieldIssue::new(
                        "payload.tracks",
                        format!("must contain at most {PLAYLIST_TRACKS_MAX} tracks"),
                    ));
                }

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
                if payload.tracks.is_empty() {
                    issues.push(FieldIssue::new(
                        "payload.tracks",
                        "must contain at least one track",
                    ));
                } else if payload.tracks.len() > PLAYLIST_TRACKS_MAX {
                    issues.push(FieldIssue::new(
                        "payload.tracks",
                        format!("must contain at most {PLAYLIST_TRACKS_MAX} tracks"),
                    ));
                }
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

/// Whether `value` matches `z.iso.datetime({ offset: true })`.
///
/// Shape only. The desktop side never did arithmetic on this string — it
/// validated it and passed it to the renderer — so a structural check is the
/// faithful port, not a shortcut.
///
/// The workspace's real ISO-8601 parser lives in
/// `shiranami-recommendation::core::instant`, which sits *above* this crate in
/// the dependency spine and so cannot be reached from here. Its own Phase 4
/// note says it should move down to `shiranami-core` once a second consumer
/// appears; this is that second consumer, and the move is left to the
/// coordinator.
fn is_iso_datetime(value: &str) -> bool {
    let bytes = value.as_bytes();
    // `YYYY-MM-DDTHH:MM:SS` is the fixed head; anything shorter cannot match.
    if bytes.len() < 19 {
        return false;
    }

    let digits = |range: std::ops::Range<usize>| {
        bytes
            .get(range)
            .is_some_and(|slice| slice.iter().all(u8::is_ascii_digit))
    };
    let at = |index: usize, expected: u8| bytes.get(index) == Some(&expected);

    if !(digits(0..4)
        && at(4, b'-')
        && digits(5..7)
        && at(7, b'-')
        && digits(8..10)
        && at(10, b'T')
        && digits(11..13)
        && at(13, b':')
        && digits(14..16)
        && at(16, b':')
        && digits(17..19))
    {
        return false;
    }

    let mut rest = &value[19..];

    // Optional fractional seconds.
    if let Some(fraction) = rest.strip_prefix('.') {
        let taken = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if taken == 0 {
            return false;
        }
        rest = &fraction[taken..];
    }

    // Zulu, or a `±HH:MM` offset — `offset: true` permits either.
    if rest == "Z" {
        return true;
    }
    let Some(offset) = rest.strip_prefix(['+', '-']) else {
        return false;
    };
    let offset = offset.as_bytes();
    offset.len() == 5
        && offset[..2].iter().all(u8::is_ascii_digit)
        && offset[2] == b':'
        && offset[3..].iter().all(u8::is_ascii_digit)
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
    fn length_is_measured_in_utf16_code_units() {
        assert_eq!(length("abc"), 3);
        assert_eq!(length("é"), 1);
        assert_eq!(length("🎵"), 2);

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

    #[test]
    fn accepts_the_iso_datetimes_zod_accepts() {
        for value in [
            "2026-08-01T12:00:00Z",
            "2026-08-01T12:00:00.000Z",
            "2026-08-01T12:00:00.123456Z",
            "2026-08-01T12:00:00+02:00",
            "2026-08-01T12:00:00-05:00",
            "2026-08-01T12:00:00.5+02:00",
        ] {
            assert!(is_iso_datetime(value), "{value} should be accepted");
        }
    }

    #[test]
    fn rejects_malformed_and_hostile_datetimes() {
        for value in [
            "",
            "2026-08-01",
            "2026-08-01T12:00:00",
            "2026-08-01 12:00:00Z",
            "2026-8-01T12:00:00Z",
            "2026-08-01T12:00:00.Z",
            "2026-08-01T12:00:00+2:00",
            "2026-08-01T12:00:00+0200",
            "2026-08-01T12:00:00Zjunk",
            "not a date at all",
            "<script>alert(1)</script>",
        ] {
            assert!(!is_iso_datetime(value), "{value} should be rejected");
        }
    }
}
