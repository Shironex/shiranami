//! Playlist extraction for YouTube and Spotify (architecture §2.2 #21).
//!
//! [`detect`] decides which provider a URL names, [`youtube`] reads yt-dlp's
//! JSON, [`spotify`] and [`spotify_fallback`] scrape the embed page, [`matcher`]
//! scores YouTube candidates against Spotify metadata, and [`service`] composes
//! them.

pub mod detect;
pub mod matcher;
pub mod service;
pub mod spotify;
pub mod spotify_fallback;
pub mod youtube;

pub use detect::{PlaylistProvider, detect_provider, spotify_playlist_id};
pub use matcher::{CONFIDENCE_THRESHOLD, MatchResult, pick_best_match, score_candidate};
pub use service::{ExtractProgressSink, NoProgress, PlaylistExtractor};
pub use spotify::{SpotifyTrack, parse_embed_html, parse_playlist_name};
pub use youtube::{parse_json_lines, playlist_title};
