//! `db:history:*` — the listening record, and the five cards built on it.
//!
//! Six channels, ported from `apps/desktop/src/main/ipc/database/history.ts`.
//! Five are aggregate reads that delegate straight into
//! `shiranami_db::repo::history`; the sixth is the one write in the namespace
//! and is the only command here with anything to decide.
//!
//! # `record-play` supplies the two ambient inputs, and that is the whole shape
//!
//! [`record_play`](shiranami_db::repo::history::record_play) takes `id` and
//! `now` as arguments rather than reading a clock or a UUID generator, because
//! `played_at`'s **format** is load-bearing: the column defaults to SQLite's
//! `datetime('now')` (`2026-08-01 12:34:56`) while every row v1 ever wrote came
//! from `new Date().toISOString()` (`2026-08-01T12:34:56.789Z`), and the column
//! is ordered and compared as text. A single row falling back to the default
//! would sort below every real row for the next thousand years, because `' '`
//! is below `'T'`.
//!
//! So this command mints the id and reads the clock, once, and passes both
//! down. v1 called `new Date()` twice microseconds apart for the same two
//! fields; one value for both is the same thing said once.
//!
//! # The scrobble is fired after the connection is released
//!
//! v1 submitted the play to Last.fm and ListenBrainz from inside the handler,
//! fire-and-forget, in a `try/catch` that swallowed everything. The submission
//! is preserved — the repository returns the track's tags from the same
//! transaction as the insert precisely so it costs no second round-trip — but
//! **the connection is dropped first**.
//!
//! That is not tidiness. `Scrobbler::submit_play` awaits two HTTP endpoints and
//! then acquires a connection of its own to park anything that failed. With a
//! single-connection pool, holding this command's connection across that await
//! would deadlock the app against itself: the scrobbler waits for a connection
//! only this command holds, and this command waits for the scrobbler. Acquire
//! late, release early — the rule `shiranami_db::repo` states and the Phase 12
//! scrobbler already follows for its background flush.
//!
//! The task is spawned with [`tauri::async_runtime::spawn`] and never
//! `tokio::spawn` (R16): this command can be reached from a thread with no
//! reactor entered, where the bare form panics across an `extern "C"` boundary
//! and aborts the process rather than unwinding.
//!
//! # Only `library` plays scrobble
//!
//! v1 guarded on `source === 'library'`, and the guard is the feature: a radio
//! stream's "track" is whatever the station put in its metadata, and submitting
//! those would fill a user's profile with stream titles. `source` defaults to
//! `library` in the repository when the renderer sends none.

use shiranami_core::models::{
    ListeningActivityPoint, ListeningHistoryEntry, ListeningHourlyActivityPoint,
    ListeningStatsSummary, PlayHistoryRecord, RecordPlayInput, WeeklyInsights,
};
use shiranami_core::time::{instant, iso8601};
use shiranami_db::repo::history;
use shiranami_integrations::scrobble::{ScrobblePlay, play_start_timestamp};
use specta_typescript::Number;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::db_history::db_history_record_play,
                crate::commands::db_history::db_history_get_recent,
                crate::commands::db_history::db_history_get_summary,
                crate::commands::db_history::db_history_get_activity,
                crate::commands::db_history::db_history_get_hourly_activity,
                crate::commands::db_history::db_history_get_weekly_insights,
            ]
        }
    };
}
pub(crate) use commands;

/// The playback origin that scrobbles. See the module docs.
const SCROBBLED_SOURCE: &str = "library";

/// The optional `{ limit, since }` argument of `db:history:get-recent`.
///
/// v1's `z.object({ limit: z.number().int().optional(), since:
/// z.string().nullable().optional() }).optional()`. Both fields accept absent
/// *and* explicit `null`, which is why they are `Option` with a serde default:
/// the renderer builds this object conditionally and sends `{ since: null }`
/// for "all time".
#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentQuery {
    /// Page size. Clamped to `1..=100` by the repository, defaulting to 30.
    ///
    /// Signed, and exported as a plain `number` rather than left as an `i64`
    /// that specta would refuse. `u32` would be the tidier type and is wrong:
    /// v1's clamp was `Math.max(1, …)`, so a renderer sending `0` or a negative
    /// page size got `1` back, where an unsigned field would reject the call
    /// outright. The clamp lives in the repository; this only has to be able to
    /// carry what the clamp was written to absorb.
    #[serde(default)]
    #[specta(optional, type = Number)]
    pub limit: Option<i64>,
    /// Inclusive ISO-8601 lower bound. `None` reads the whole history.
    #[serde(default)]
    #[specta(optional)]
    pub since: Option<String>,
}

/// The optional `{ since, until }` argument of `db:history:get-summary`.
///
/// The only history channel with an upper bound, and it is **exclusive** — that
/// is what lets the renderer ask for "the seven days before the current seven"
/// to compute a week-over-week trend without the two windows sharing a boundary
/// play.
#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryQuery {
    /// Inclusive ISO-8601 lower bound.
    #[serde(default)]
    #[specta(optional)]
    pub since: Option<String>,
    /// Exclusive ISO-8601 upper bound.
    #[serde(default)]
    #[specta(optional)]
    pub until: Option<String>,
}

/// The optional `{ since }` argument the three activity channels share.
#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SinceQuery {
    /// Inclusive ISO-8601 lower bound. `None` reads the whole history.
    #[serde(default)]
    #[specta(optional)]
    pub since: Option<String>,
}

/// `db:history:record-play` — record a finished play and bump the play count.
///
/// Returns the inserted `play_history` row, as v1 did. The scrobble it fires
/// afterwards is deliberately invisible in the return value: it is
/// best-effort, it retries out of a persisted queue, and the renderer has never
/// waited on it.
#[tauri::command]
#[specta::specta]
pub async fn db_history_record_play(
    state: State<'_, AppState>,
    data: RecordPlayInput,
) -> CommandResult<PlayHistoryRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let now_ms = instant::now_ms();
    let now = iso8601::from_epoch_millis(now_ms);

    let recorded = {
        let mut conn = state.conn().await?;
        history::record_play(&mut conn, &id, &now, &data)
            .await
            .wire()?
    };

    scrobble(&state, &data, &recorded, now_ms);

    Ok(recorded.entry)
}

/// Hand the play to the scrobbler, if there is one and the play qualifies.
///
/// Extracted so [`db_history_record_play`] reads as "write the row, then
/// scrobble it", and so the three conditions v1 applied are in one place rather
/// than nested inside the command. The connection is **already released** by
/// the time this is called — see the module docs for why that is structural and
/// not stylistic.
fn scrobble(
    state: &AppState,
    input: &RecordPlayInput,
    recorded: &shiranami_db::repo::history::RecordedPlay,
    now_ms: i64,
) {
    if input.source.as_deref().unwrap_or(SCROBBLED_SOURCE) != SCROBBLED_SOURCE {
        return;
    }
    let (Some(scrobbler), Some(track)) =
        (state.deferred().scrobbler.clone(), recorded.track.as_ref())
    else {
        return;
    };

    let play = ScrobblePlay {
        // v1's `artist ?? ''`. An untagged track produces a blank artist, which
        // `is_submittable` then refuses — the refusal lives there rather than
        // here so the queue and this path agree about what is worth sending.
        artist: track.artist.clone().unwrap_or_default(),
        track: track.title.clone(),
        album: track.album.clone(),
        // The tagged length wins over the renderer's, as it did in v1: the
        // renderer reports the decoder's idea of the duration, which for a VBR
        // file can differ from the tag both backends will be matching against.
        duration_seconds: track.duration.or(input.duration),
        started_at: play_start_timestamp(now_ms, recorded.entry.played_seconds),
    };

    let pool = state.pool().clone();
    // `tauri::async_runtime::spawn`, never `tokio::spawn` — see the module docs.
    tauri::async_runtime::spawn(async move {
        if let Err(error) = scrobbler.submit_play(&pool, &play).await {
            // Swallowed, as v1 swallowed it: anything that failed is already
            // parked in the retry queue, and a scrobble is not something the
            // user asked for at this moment.
            tracing::warn!(%error, "scrobble submission failed");
        }
    });
}

/// `db:history:get-recent` — the most recent plays, newest first.
#[tauri::command]
#[specta::specta]
pub async fn db_history_get_recent(
    state: State<'_, AppState>,
    options: Option<RecentQuery>,
) -> CommandResult<Vec<ListeningHistoryEntry>> {
    let options = options.unwrap_or_default();

    let mut conn = state.conn().await?;
    history::recent(&mut conn, options.limit, options.since.as_deref())
        .await
        .wire()
}

/// `db:history:get-summary` — totals and the top-five leaderboards.
#[tauri::command]
#[specta::specta]
pub async fn db_history_get_summary(
    state: State<'_, AppState>,
    options: Option<SummaryQuery>,
) -> CommandResult<ListeningStatsSummary> {
    let options = options.unwrap_or_default();

    let mut conn = state.conn().await?;
    history::summary(
        &mut conn,
        options.since.as_deref(),
        options.until.as_deref(),
    )
    .await
    .wire()
}

/// `db:history:get-activity` — plays and minutes per calendar day.
#[tauri::command]
#[specta::specta]
pub async fn db_history_get_activity(
    state: State<'_, AppState>,
    options: Option<SinceQuery>,
) -> CommandResult<Vec<ListeningActivityPoint>> {
    let options = options.unwrap_or_default();

    let mut conn = state.conn().await?;
    history::activity(&mut conn, options.since.as_deref())
        .await
        .wire()
}

/// `db:history:get-hourly-activity` — plays bucketed by local weekday and hour.
#[tauri::command]
#[specta::specta]
pub async fn db_history_get_hourly_activity(
    state: State<'_, AppState>,
    options: Option<SinceQuery>,
) -> CommandResult<Vec<ListeningHourlyActivityPoint>> {
    let options = options.unwrap_or_default();

    let mut conn = state.conn().await?;
    history::hourly_activity(&mut conn, options.since.as_deref())
        .await
        .wire()
}

/// `db:history:get-weekly-insights` — session count and the top-five albums.
#[tauri::command]
#[specta::specta]
pub async fn db_history_get_weekly_insights(
    state: State<'_, AppState>,
    options: Option<SinceQuery>,
) -> CommandResult<WeeklyInsights> {
    let options = options.unwrap_or_default();

    let mut conn = state.conn().await?;
    history::weekly_insights(&mut conn, options.since.as_deref())
        .await
        .wire()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::models::TrackCreateInput;
    use shiranami_db::repo::tracks;
    use std::time::Duration;

    /// Seed one track and return its id.
    async fn seeded_track(state: &AppState) -> String {
        let mut conn = state.conn().await.expect("acquire");
        tracks::add(
            &mut conn,
            &TrackCreateInput {
                file_path: "/music/a.mp3".to_owned(),
                title: "A".to_owned(),
                artist: Some("Aoi".to_owned()),
                album: Some("Nocturne".to_owned()),
                duration: Some(200.0),
                ..TrackCreateInput::default()
            },
        )
        .await
        .expect("insert")
        .expect("a row")
        .id
    }

    /// The six channels back to back over one `AppState`. A command that leaked
    /// the pool's single connection would not fail here, it would **hang**, so
    /// the body runs under a timeout and a hang is reported as a named failure.
    ///
    /// `record-play` is the one that could genuinely leak: it releases the
    /// connection before handing the play to the scrobbler, and doing that in
    /// the other order deadlocks the app against itself.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let track_id = seeded_track(&state).await;

        let exercise = async {
            {
                let id = uuid::Uuid::new_v4().to_string();
                let now = iso8601::now();
                let mut conn = state.conn().await.expect("acquire");
                history::record_play(
                    &mut conn,
                    &id,
                    &now,
                    &RecordPlayInput {
                        track_id: track_id.clone(),
                        played_seconds: 200.0,
                        duration: Some(200.0),
                        source: None,
                    },
                )
                .await
                .expect("record");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                history::recent(&mut conn, None, None).await.expect("read");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                history::summary(&mut conn, None, None).await.expect("read");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                history::activity(&mut conn, None).await.expect("read");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                history::hourly_activity(&mut conn, None)
                    .await
                    .expect("read");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                history::weekly_insights(&mut conn, None)
                    .await
                    .expect("read");
            }
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// `played_at` must carry v1's `toISOString()` shape and never the column's
    /// `datetime('now')` default. The column is ordered as text, so one row in
    /// the other format sorts below every real row for the next thousand years.
    #[tokio::test]
    async fn a_recorded_play_is_stamped_in_v1s_timestamp_format() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let track_id = seeded_track(&state).await;

        let now = iso8601::now();
        let mut conn = state.conn().await.expect("acquire");
        let recorded = history::record_play(
            &mut conn,
            &uuid::Uuid::new_v4().to_string(),
            &now,
            &RecordPlayInput {
                track_id,
                played_seconds: 200.0,
                duration: Some(200.0),
                source: None,
            },
        )
        .await
        .expect("record");

        let stamped = recorded.entry.played_at;
        assert_eq!(stamped.len(), 24, "{stamped}");
        assert_eq!(stamped.as_bytes()[10], b'T', "{stamped}");
        assert!(stamped.ends_with('Z'), "{stamped}");
        assert!(
            !stamped.contains(' '),
            "`{stamped}` is SQLite's `datetime('now')` format, which sorts below \
             every row v1 wrote"
        );
    }

    /// The argument shapes v1's zod tuples accepted. The shim forwards the
    /// renderer's object straight through, so a rename or a missing serde
    /// default is a silently ignored window.
    #[test]
    fn the_query_arguments_keep_v1s_shapes() {
        let recent: RecentQuery =
            serde_json::from_str(r#"{"limit":10,"since":"2026-06-01T00:00:00.000Z"}"#)
                .expect("v1's shape parses");
        assert_eq!(recent.limit, Some(10));
        assert_eq!(recent.since.as_deref(), Some("2026-06-01T00:00:00.000Z"));

        // `since: null` is "all time" and is a shape the renderer really sends.
        let nulled: RecentQuery =
            serde_json::from_str(r#"{"since":null}"#).expect("an explicit null parses");
        assert_eq!(nulled.limit, None);
        assert_eq!(nulled.since, None);

        // Every field absent — the object is built conditionally.
        let empty: RecentQuery = serde_json::from_str("{}").expect("an empty object parses");
        assert_eq!(empty.limit, None);

        let summary: SummaryQuery =
            serde_json::from_str(r#"{"since":"a","until":"b"}"#).expect("v1's shape parses");
        assert_eq!(summary.since.as_deref(), Some("a"));
        assert_eq!(summary.until.as_deref(), Some("b"));

        let since: SinceQuery =
            serde_json::from_str(r#"{"since":"a"}"#).expect("v1's shape parses");
        assert_eq!(since.since.as_deref(), Some("a"));
    }

    /// v1's schemas make the whole options object optional, and the renderer
    /// calls `invoke(channel, undefined)` for "no window". A missing default
    /// here would turn that into a deserialization rejection.
    #[test]
    fn an_absent_options_object_is_the_whole_history() {
        let absent: Option<RecentQuery> = serde_json::from_str("null").expect("null parses");
        let options = absent.unwrap_or_default();

        assert_eq!(options.limit, None);
        assert_eq!(options.since, None);
    }
}
