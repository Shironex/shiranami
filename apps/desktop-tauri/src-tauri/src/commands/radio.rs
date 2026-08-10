//! `radio:favorites:*` — the saved internet-radio stations — and `radio:log:*`,
//! the diary of what they played.
//!
//! Four ported channels, from `apps/desktop/src/main/ipc/radio.ts`, plus two
//! born in v2. The only namespace here whose table lives in `shiranami-db` but
//! whose channels sit outside `db:*`, because v1 grouped them with the rest of
//! the radio feature.
//!
//! # The two v2 channels port nothing, because there was nothing
//!
//! v1's stream proxy declined ICY metadata outright, so no title ever reached
//! the app and there was nothing to keep. `radio:log:record` and `radio:log:get`
//! are the write and read halves of the table migration `0008` adds; the
//! validation below is shared with the favourites, since both address a station
//! by the same directory UUID.
//!
//! # What the argument type refuses to carry
//!
//! v1's zod object listed twelve fields and **deliberately omitted two** the
//! row has: `id` and `createdAt`. Its comment says why — accepting either from
//! the renderer would let a tampered caller spoof a row's identity or back-date
//! it, and `createdAt` is what [`all`](shiranami_db::repo::radio::all) sorts on.
//!
//! `RadioStationInput` is that same twelve-field shape, so the omission is a
//! **type** here rather than a validation step: there is no field to send. The
//! id is minted by this command and `created_at` is left to the column default.
//!
//! # `created_at` is the column default, and that is load-bearing
//!
//! Unlike `db:history:record-play`, which must write v1's `toISOString()`
//! format, this one must **not**. v1 never set the column, so every saved
//! station on disk carries SQLite's `datetime('now')` spelling
//! (`2026-08-01 12:34:56`), and `all` orders by that column as text. Writing an
//! ISO-8601 string here would sort every new favourite *below* every old one
//! forever, since `'T'` is above `' '` — the newest station would appear at the
//! bottom of a newest-first list. The two repositories disagree about the
//! format on purpose.
//!
//! # A duplicate is an error, and the renderer already knows
//!
//! `station_uuid` is `UNIQUE` and [`radio_favorites_add`] does not upsert, so
//! saving a station twice rejects. v1 behaved identically: the renderer guards
//! with [`radio_favorites_is_favorite`] before offering the action, rather than
//! relying on the insert to be idempotent. Making it idempotent here would be a
//! silent behaviour change in the direction of hiding a renderer bug.
//!
//! # Validation
//!
//! serde accepts the shape; what v1's zod also carried past shape is a UUID
//! check on `stationUuid` and non-empty `name` / `url` / `urlResolved`. Those
//! are re-raised as `BAD_REQUEST`, the code v1's zod failure produced.
//!
//! `url` and `urlResolved` are **not** URL-validated, as they were not in v1:
//! the Radio Browser directory serves entries whose stream URLs are frequently
//! not parseable as absolute URLs, and refusing them here would make stations
//! unsaveable that the player can still open.

use shiranami_core::models::{RadioFavorite, RadioLogEntry, RadioNowPlaying, RadioStationInput};
use shiranami_db::repo::{radio, radio_log};
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::radio::radio_favorites_get_all,
                crate::commands::radio::radio_favorites_add,
                crate::commands::radio::radio_favorites_remove,
                crate::commands::radio::radio_favorites_is_favorite,
                crate::commands::radio::radio_log_record,
                crate::commands::radio::radio_log_get,
            ]
        }
    };
}
pub(crate) use commands;

/// Length of the hyphenated UUID form, the only one v1's `z.string().uuid()`
/// accepted.
const HYPHENATED_UUID_LEN: usize = 36;

/// `radio:favorites:get-all` — every saved station, newest first.
#[tauri::command]
#[specta::specta]
pub async fn radio_favorites_get_all(
    state: State<'_, AppState>,
) -> CommandResult<Vec<RadioFavorite>> {
    let mut conn = state.conn().await?;
    radio::all(&mut conn).await.wire()
}

/// `radio:favorites:add` — save a station and return the stored row.
///
/// Rejects when the station is already saved; see the module docs.
#[tauri::command]
#[specta::specta]
pub async fn radio_favorites_add(
    state: State<'_, AppState>,
    station: RadioStationInput,
) -> CommandResult<RadioFavorite> {
    validate_station(&station)?;
    let id = uuid::Uuid::new_v4().to_string();

    let mut conn = state.conn().await?;
    radio::add(&mut conn, &id, &station).await.wire()
}

/// `radio:favorites:remove` — forget a station, by directory id.
///
/// Keyed on `station_uuid` rather than the row id, because that is the id the
/// renderer holds while browsing the directory. Removing a station that was
/// never saved is not an error, as it was not in v1.
#[tauri::command]
#[specta::specta]
pub async fn radio_favorites_remove(
    state: State<'_, AppState>,
    station_uuid: String,
) -> CommandResult<()> {
    validate_station_uuid(&station_uuid)?;

    let mut conn = state.conn().await?;
    radio::remove(&mut conn, &station_uuid).await.wire()
}

/// `radio:favorites:is-favorite` — whether a station is saved.
#[tauri::command]
#[specta::specta]
pub async fn radio_favorites_is_favorite(
    state: State<'_, AppState>,
    station_uuid: String,
) -> CommandResult<bool> {
    validate_station_uuid(&station_uuid)?;

    let mut conn = state.conn().await?;
    radio::is_favorite(&mut conn, &station_uuid).await.wire()
}

/// How many diary rows a caller gets when it does not say.
///
/// A screenful with room to scroll, not an export. The repository clamps the
/// asked-for value to its own ceiling; this is only the absent-value default.
const DEFAULT_LOG_PAGE: u32 = 100;

/// `radio:log:record` — file one title against a station's diary.
///
/// Called by the renderer when the `radio:now-playing` event reports a change,
/// which is the only thing that ever calls it: there is no timer and no poll.
/// The write does not happen in the proxy that de-frames the title because that
/// callback runs on the task polling the station's body — the audio the
/// listener is hearing is behind it in the same stream, and
/// [`shiranami_serve::NowPlayingSink`] says so in as many words.
///
/// The payload is the event's own, forwarded: `raw` plus the split the Rust
/// side already derived. Re-deriving it here would be a second implementation
/// of the same guess, free to disagree with the one the player is showing.
/// `streamUrl` rides along on the event and is deliberately not stored — it
/// exists so a title from a station the user already left can be discarded, and
/// says nothing once the row is filed under a station.
///
/// Answers `null` when the title is a consecutive repeat of the station's most
/// recent row, which is what a reconnect mid-song produces.
#[tauri::command]
#[specta::specta]
pub async fn radio_log_record(
    state: State<'_, AppState>,
    station_uuid: String,
    playing: RadioNowPlaying,
) -> CommandResult<Option<RadioLogEntry>> {
    validate_station_uuid(&station_uuid)?;
    validate_title(&playing)?;

    let mut conn = state.conn().await?;
    radio_log::record(&mut conn, &station_uuid, &playing)
        .await
        .wire()
}

/// `radio:log:get` — one station's diary, newest first.
#[tauri::command]
#[specta::specta]
pub async fn radio_log_get(
    state: State<'_, AppState>,
    station_uuid: String,
    limit: Option<u32>,
) -> CommandResult<Vec<RadioLogEntry>> {
    validate_station_uuid(&station_uuid)?;
    let limit = i64::from(limit.unwrap_or(DEFAULT_LOG_PAGE));

    let mut conn = state.conn().await?;
    radio_log::for_station(&mut conn, &station_uuid, limit)
        .await
        .wire()
}

/// v1's `z.string().uuid()`.
///
/// The length check is what pins this to the **hyphenated** form. `Uuid` also
/// parses the simple, braced and URN spellings, all of which zod refused, and
/// accepting one here would put a differently-spelled duplicate of an existing
/// station past the `UNIQUE` constraint that is supposed to stop exactly that.
fn validate_station_uuid(station_uuid: &str) -> CommandResult<()> {
    if station_uuid.len() != HYPHENATED_UUID_LEN || uuid::Uuid::parse_str(station_uuid).is_err() {
        return Err(bad_request("the station id must be a UUID"));
    }
    Ok(())
}

/// A title worth keeping.
///
/// The de-framer never reports an empty `StreamTitle` — it reads one as "the
/// station said nothing" and stays quiet — so an empty one here did not come
/// from a station, and a blank diary line is a line nobody can read or act on.
/// Nothing else is checked: idents, sponsor reads and titles that split badly
/// are all things stations really broadcast, and refusing them would be the
/// heuristic filtering this feature deliberately does not do.
fn validate_title(playing: &RadioNowPlaying) -> CommandResult<()> {
    if playing.raw.trim().is_empty() {
        return Err(bad_request("the title must not be empty"));
    }
    Ok(())
}

/// v1's `newRadioFavoriteInput`, past what serde already checked.
fn validate_station(station: &RadioStationInput) -> CommandResult<()> {
    validate_station_uuid(&station.station_uuid)?;

    for (field, value) in [
        ("name", &station.name),
        ("url", &station.url),
        ("urlResolved", &station.url_resolved),
    ] {
        if value.is_empty() {
            return Err(bad_request(format!("{field} must not be empty")));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;
    use std::time::Duration;

    const STATION: &str = "11111111-1111-4111-8111-111111111111";

    fn station(station_uuid: &str, name: &str) -> RadioStationInput {
        RadioStationInput {
            station_uuid: station_uuid.to_owned(),
            name: name.to_owned(),
            url: "http://example.test/stream".to_owned(),
            url_resolved: "http://example.test/stream.mp3".to_owned(),
            homepage: None,
            favicon: None,
            country: None,
            country_code: None,
            language: None,
            codec: None,
            bitrate: None,
            tags: None,
        }
    }

    /// The six channels back to back over one `AppState`. A leaked connection
    /// would hang rather than fail, so the body runs under a timeout.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let exercise = async {
            {
                let mut conn = state.conn().await.expect("acquire");
                radio::add(&mut conn, "row-1", &station(STATION, "One"))
                    .await
                    .expect("save");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                radio::all(&mut conn).await.expect("read");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                assert!(radio::is_favorite(&mut conn, STATION).await.expect("check"));
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                radio::remove(&mut conn, STATION).await.expect("forget");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                radio_log::record(
                    &mut conn,
                    STATION,
                    &RadioNowPlaying::new("https://s.example/live", "Cornelius - Drop"),
                )
                .await
                .expect("log");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                radio_log::for_station(&mut conn, STATION, 10)
                    .await
                    .expect("read the diary");
            }
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// `created_at` must keep SQLite's `datetime('now')` spelling. `all` orders
    /// by that column as text, so an ISO-8601 string here would sort every new
    /// favourite below every old one forever.
    #[tokio::test]
    async fn a_saved_station_keeps_v1s_column_default_timestamp_format() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        let saved = radio::add(&mut conn, "row-1", &station(STATION, "One"))
            .await
            .expect("save");

        assert!(
            saved.created_at.contains(' ') && !saved.created_at.contains('T'),
            "`{}` is the ISO-8601 spelling — it would sort above every station \
             already on disk",
            saved.created_at
        );
    }

    /// v1 let the `UNIQUE` violation surface rather than upserting; the
    /// renderer guards with `is-favorite` first.
    #[tokio::test]
    async fn saving_the_same_station_twice_is_refused() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        radio::add(&mut conn, "row-1", &station(STATION, "One"))
            .await
            .expect("save");

        let again = radio::add(&mut conn, "row-2", &station(STATION, "Renamed")).await;

        assert!(
            again.is_err(),
            "the UNIQUE constraint must not be upserted away"
        );
    }

    #[tokio::test]
    async fn forgetting_a_station_that_was_never_saved_is_not_an_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;

        let mut conn = state.conn().await.expect("acquire");
        radio::remove(&mut conn, STATION)
            .await
            .expect("a no-op delete succeeds, as it did in v1");
    }

    #[test]
    fn a_hyphenated_uuid_passes() {
        assert!(validate_station_uuid(STATION).is_ok());
    }

    /// The spellings `Uuid` accepts and zod did not. A simple-form duplicate of
    /// a saved station would slip past the `UNIQUE` constraint that exists to
    /// stop exactly that.
    #[test]
    fn the_other_uuid_spellings_are_refused_the_way_zod_refused_them() {
        for spelling in [
            "11111111111141118111111111111111",
            "{11111111-1111-4111-8111-111111111111}",
            "urn:uuid:11111111-1111-4111-8111-111111111111",
            "not-a-uuid",
            "",
        ] {
            let error = validate_station_uuid(spelling).expect_err("`{spelling}` must be refused");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }
    }

    #[test]
    fn an_empty_required_string_is_a_bad_request() {
        for mutate in [
            |station: &mut RadioStationInput| station.name.clear(),
            |station: &mut RadioStationInput| station.url.clear(),
            |station: &mut RadioStationInput| station.url_resolved.clear(),
        ] {
            let mut input = station(STATION, "One");
            mutate(&mut input);

            let error = validate_station(&input).expect_err("an empty field is refused");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }
    }

    /// v1 checked `min(1)` and nothing else on the two URL fields. The Radio
    /// Browser directory serves stream URLs that do not parse as absolute URLs,
    /// and refusing them would make stations unsaveable the player can open.
    #[test]
    fn a_stream_url_is_not_required_to_parse_as_a_url() {
        let mut input = station(STATION, "One");
        input.url = "not://a real url at all".to_owned();
        input.url_resolved = "/relative/stream".to_owned();

        assert!(validate_station(&input).is_ok());
    }

    /// A station ident, a sponsor read and a title that splits badly are all
    /// things stations really broadcast. Only "the station said nothing" is
    /// refused.
    #[test]
    fn only_an_empty_title_is_refused() {
        for raw in ["SomaFM Groove Salad", "Blink-182", " - Title", "Artist - "] {
            let playing = RadioNowPlaying::new("https://s.example/live", raw);
            assert!(validate_title(&playing).is_ok(), "`{raw}` must be storable");
        }

        for raw in ["", "   "] {
            let playing = RadioNowPlaying::new("https://s.example/live", raw);
            let error = validate_title(&playing).expect_err("an empty title is refused");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }
    }

    /// The row's identity columns are absent from the argument type, so a
    /// tampered caller cannot spoof an id or back-date a station. Pinned as a
    /// deserialization fact rather than a validation one: serde must ignore
    /// them, and adding either field to the struct would silently accept them.
    #[test]
    fn the_argument_cannot_carry_a_row_id_or_a_creation_time() {
        let parsed: RadioStationInput = serde_json::from_str(
            r#"{"stationUuid":"11111111-1111-4111-8111-111111111111","name":"One",
                "url":"u","urlResolved":"r","id":"spoofed","createdAt":"1970-01-01"}"#,
        )
        .expect("the extra keys are ignored, not rejected");

        assert_eq!(parsed.station_uuid, STATION);
        assert_eq!(parsed.name, "One");
    }
}
