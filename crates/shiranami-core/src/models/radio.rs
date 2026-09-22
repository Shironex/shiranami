//! Saved internet-radio stations, ported from
//! `packages/contracts/src/domain/radio.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// The station fields the renderer sends when saving a favourite.
///
/// Optional fields are omitted when the source station carries no value.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioStationInput {
    /// The radio-browser directory's stable station id.
    pub station_uuid: String,
    /// Station name.
    pub name: String,
    /// Advertised stream URL.
    pub url: String,
    /// Stream URL after the directory resolved redirects.
    pub url_resolved: String,
    /// Station homepage.
    #[specta(optional)]
    pub homepage: Option<String>,
    /// Favicon URL.
    #[specta(optional)]
    pub favicon: Option<String>,
    /// Country name.
    #[specta(optional)]
    pub country: Option<String>,
    /// ISO country code.
    #[specta(optional)]
    pub country_code: Option<String>,
    /// Broadcast language.
    #[specta(optional)]
    pub language: Option<String>,
    /// Stream codec ("MP3", "AAC", …).
    #[specta(optional)]
    pub codec: Option<String>,
    /// Stream bitrate in kbps.
    #[specta(optional)]
    pub bitrate: Option<u32>,
    /// Comma-separated tag list.
    #[specta(optional)]
    pub tags: Option<String>,
}

/// A persisted radio favourite, mirroring the `radio_favorites` row.
///
/// The nullable columns come back as `null` rather than absent, which is why
/// every optional field here is nullable instead of optional — the opposite of
/// [`RadioStationInput`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioFavorite {
    /// Primary key (UUID v4).
    pub id: String,
    /// The radio-browser directory's stable station id.
    pub station_uuid: String,
    /// Station name.
    pub name: String,
    /// Advertised stream URL.
    pub url: String,
    /// Stream URL after the directory resolved redirects.
    pub url_resolved: String,
    /// Station homepage.
    pub homepage: Option<String>,
    /// Favicon URL.
    pub favicon: Option<String>,
    /// Country name.
    pub country: Option<String>,
    /// ISO country code.
    pub country_code: Option<String>,
    /// Broadcast language.
    pub language: Option<String>,
    /// Stream codec.
    pub codec: Option<String>,
    /// Stream bitrate in kbps.
    pub bitrate: Option<u32>,
    /// Comma-separated tag list.
    pub tags: Option<String>,
    /// ISO-8601 creation timestamp.
    pub created_at: String,
}

/// What a station said it is playing, as one ICY `StreamTitle` arrived.
///
/// The raw string is the value; the split is a guess. `Artist - Title` is a
/// convention stations mostly follow and nothing enforces — a station
/// broadcasting `Now on Air: the breakfast show`, a sponsor read or a bare
/// track name is not malformed. So `raw` is what arrived, byte for byte after
/// decoding, and it is what the UI renders; `artist` and `title` are a
/// best-effort derivation for consumers that want the pieces, and are absent
/// whenever the string does not carry the separator.
///
/// `streamUrl` rides along because the renderer can have more than one station
/// in flight: the previous one's proxy connection drains for a moment after the
/// user switches, and without it that station's last title would overwrite the
/// new one's first. It is the URL **as the renderer asked for it**, not the
/// post-redirect one, because the renderer only knows the former — it is what
/// its `filePath` encodes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioNowPlaying {
    /// The station URL the renderer requested, before any redirect hop.
    pub stream_url: String,
    /// The `StreamTitle` value exactly as it decoded. The source of truth.
    pub raw: String,
    /// The part before the first ` - `, when there is one.
    pub artist: Option<String>,
    /// The part after the first ` - `, when there is one.
    pub title: Option<String>,
}

/// The separator the `Artist - Title` convention uses.
///
/// Spaces on both sides deliberately: a hyphen with none is far more often part
/// of a name (`Jay-Z`, `Blink-182`, `re-entry`) than a separator, and splitting
/// on it would corrupt more titles than it parsed.
const ARTIST_TITLE_SEPARATOR: &str = " - ";

impl RadioNowPlaying {
    /// Derive the split from a raw `StreamTitle`.
    ///
    /// Splits on the **first** separator, so `Artist - Title - Remix` keeps the
    /// remix with the title rather than inventing a third field. A split that
    /// would leave either side empty is discarded whole: `" - Title"` names no
    /// artist, and half a guess is worse than none.
    #[must_use]
    pub fn new(stream_url: impl Into<String>, raw: impl Into<String>) -> Self {
        let raw = raw.into();
        let (artist, title) = split_artist_title(&raw);
        Self {
            stream_url: stream_url.into(),
            raw,
            artist,
            title,
        }
    }
}

/// The best-effort half of [`RadioNowPlaying::new`].
fn split_artist_title(raw: &str) -> (Option<String>, Option<String>) {
    let Some((artist, title)) = raw.split_once(ARTIST_TITLE_SEPARATOR) else {
        return (None, None);
    };

    let artist = artist.trim();
    let title = title.trim();
    if artist.is_empty() || title.is_empty() {
        return (None, None);
    }

    (Some(artist.to_owned()), Some(title.to_owned()))
}

#[cfg(test)]
mod now_playing_tests {
    use super::RadioNowPlaying;

    #[test]
    fn the_conventional_shape_splits() {
        let playing = RadioNowPlaying::new("http://s/live", "Cornelius - Drop");
        assert_eq!(playing.raw, "Cornelius - Drop");
        assert_eq!(playing.artist.as_deref(), Some("Cornelius"));
        assert_eq!(playing.title.as_deref(), Some("Drop"));
    }

    /// A station ident is not malformed, and must survive as itself.
    #[test]
    fn a_string_with_no_separator_keeps_only_the_raw() {
        let playing = RadioNowPlaying::new("http://s/live", "SomaFM Groove Salad");
        assert_eq!(playing.raw, "SomaFM Groove Salad");
        assert_eq!(playing.artist, None);
        assert_eq!(playing.title, None);
    }

    /// The hyphen inside a name is not a separator, which is the whole reason
    /// the separator carries its spaces.
    #[test]
    fn a_hyphenated_name_is_not_split() {
        let playing = RadioNowPlaying::new("http://s/live", "Blink-182");
        assert_eq!(playing.artist, None);
        assert_eq!(playing.title, None);
    }

    #[test]
    fn only_the_first_separator_splits() {
        let playing = RadioNowPlaying::new("http://s/live", "Artist - Title - Remix");
        assert_eq!(playing.artist.as_deref(), Some("Artist"));
        assert_eq!(playing.title.as_deref(), Some("Title - Remix"));
    }

    #[test]
    fn a_half_empty_split_is_discarded() {
        for raw in [" - Title", "Artist - ", " - "] {
            let playing = RadioNowPlaying::new("http://s/live", raw);
            assert_eq!(playing.artist, None, "{raw}");
            assert_eq!(playing.title, None, "{raw}");
        }
    }

    /// The event is `#[serde(transparent)]` over this type, so its keys are the
    /// renderer's contract rather than an internal detail.
    #[test]
    fn the_payload_keys_are_camel_case() {
        let json = serde_json::to_value(RadioNowPlaying::new("http://s/live", "A - B"))
            .expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "streamUrl": "http://s/live",
                "raw": "A - B",
                "artist": "A",
                "title": "B",
            })
        );
    }
}

/// One line of the radio diary: a title a station sent, as it was stored.
///
/// The mirror of a `radio_log` row (migration `0008`). It is the *kept* form of
/// a [`RadioNowPlaying`] — same `raw`, same best-effort split — minus the
/// stream URL, which exists on the event only so a late title from a station
/// the user already left can be discarded, and is meaningless once the row is
/// filed under a station.
///
/// `raw` stays the field the UI renders and the field "get this track" searches
/// on. The split is a guess, and a guess the user must be able to see past.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RadioLogEntry {
    /// Primary key — a rowid alias, so it is also the insertion order. See the
    /// migration for why this table's id is an integer and not a UUID.
    ///
    /// `Number` for the same reason [`super::SearchResult::view_count`] carries
    /// it: specta refuses to emit a bare `i64` rather than silently promise a
    /// precision JavaScript does not have. A rowid is nowhere near `2^53`, so
    /// the annotation is the honest one and not a papering-over.
    #[specta(type = Number)]
    pub id: i64,
    /// The Radio Browser station id the title was heard on.
    pub station_uuid: String,
    /// The `StreamTitle` value exactly as it decoded. The source of truth.
    pub raw: String,
    /// The part before the first ` - `, when there was one.
    pub artist: Option<String>,
    /// The part after the first ` - `, when there was one.
    pub title: Option<String>,
    /// ISO-8601 instant the title was recorded.
    pub heard_at: String,
}
