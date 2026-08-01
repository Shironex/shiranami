//! Which provider a playlist URL belongs to.

use url::Url;

/// The providers playlist extraction can handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PlaylistProvider {
    /// YouTube, including `youtu.be` and YouTube Music.
    YouTube,
    /// A public Spotify playlist.
    Spotify,
    /// Neither.
    Unknown,
}

/// Classify `url`.
///
/// # The YouTube test is a substring test, as v1's was
///
/// `host.includes('youtube.com')` matches `youtube.com.example.net` too. That
/// is kept rather than tightened to a suffix match, and the reason is that the
/// looseness is bounded to *routing*: a URL classified as YouTube is handed to
/// yt-dlp, and yt-dlp is a tool whose entire job is extracting from arbitrary
/// sites — the `downloader:download` channel already points it at any http(s)
/// URL the renderer asks for. The URL still passes
/// [`crate::spawn::append_url_arg`], so it cannot become an option, and it is
/// still refused if it is not http(s).
///
/// Tightening it would also risk refusing a legitimate YouTube host form that
/// has not come up yet, in exchange for closing nothing.
pub fn detect_provider(url: &str) -> PlaylistProvider {
    let Ok(parsed) = Url::parse(url) else {
        return PlaylistProvider::Unknown;
    };

    let Some(host) = parsed.host_str() else {
        return PlaylistProvider::Unknown;
    };
    let host = host.to_lowercase();

    if host.contains("youtube.com") || host.contains("youtu.be") {
        return PlaylistProvider::YouTube;
    }

    if host == "open.spotify.com" && parsed.path().starts_with("/playlist/") {
        return PlaylistProvider::Spotify;
    }

    PlaylistProvider::Unknown
}

/// The playlist id out of a Spotify URL.
///
/// Matches the first `/playlist/<id>` segment, where the id is alphanumeric.
/// Query parameters — Spotify appends `?si=…` to every shared link — are not
/// part of the path and so never reach this.
pub fn spotify_playlist_id(url: &str) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let path = parsed.path();

    let rest = path.split_once("/playlist/")?.1;
    let id: String = rest
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();

    (!id.is_empty()).then_some(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_youtube_urls() {
        for url in [
            "https://www.youtube.com/playlist?list=PLxyz",
            "https://youtu.be/abc123",
            "https://music.youtube.com/playlist?list=PLxyz",
        ] {
            assert_eq!(
                detect_provider(url),
                PlaylistProvider::YouTube,
                "unexpected classification for {url}"
            );
        }
    }

    #[test]
    fn detects_spotify_playlist_urls() {
        assert_eq!(
            detect_provider("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"),
            PlaylistProvider::Spotify
        );
    }

    #[test]
    fn a_non_playlist_spotify_url_is_unknown() {
        assert_eq!(
            detect_provider("https://open.spotify.com/track/abc"),
            PlaylistProvider::Unknown,
            "only playlists can be extracted — a track URL has nothing to \
             enumerate"
        );
    }

    #[test]
    fn an_unrecognised_or_invalid_url_is_unknown() {
        assert_eq!(
            detect_provider("https://example.com/playlist"),
            PlaylistProvider::Unknown
        );
        assert_eq!(detect_provider("not-a-url"), PlaylistProvider::Unknown);
    }

    #[test]
    fn the_youtube_test_stays_a_substring_test() {
        // Recorded, not endorsed: see the function's docs for why the looseness
        // is bounded and why closing it would buy nothing.
        assert_eq!(
            detect_provider("https://youtube.com.example.net/playlist?list=PL1"),
            PlaylistProvider::YouTube
        );
    }

    #[test]
    fn extracts_a_spotify_playlist_id() {
        assert_eq!(
            spotify_playlist_id("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"),
            Some("37i9dQZF1DXcBWIGoYBM5M".to_owned())
        );
    }

    #[test]
    fn extracts_a_spotify_playlist_id_past_query_parameters() {
        assert_eq!(
            spotify_playlist_id(
                "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123"
            ),
            Some("37i9dQZF1DXcBWIGoYBM5M".to_owned()),
            "every shared Spotify link carries `?si=` — it is a query \
             parameter and never part of the path"
        );
    }

    #[test]
    fn extracts_a_spotify_playlist_id_before_a_trailing_segment() {
        assert_eq!(
            spotify_playlist_id("https://open.spotify.com/playlist/abc123/tracks"),
            Some("abc123".to_owned())
        );
    }

    #[test]
    fn a_non_playlist_or_invalid_url_yields_no_id() {
        assert_eq!(spotify_playlist_id("not-a-url"), None);
        assert_eq!(
            spotify_playlist_id("https://open.spotify.com/track/abc"),
            None
        );
    }
}
