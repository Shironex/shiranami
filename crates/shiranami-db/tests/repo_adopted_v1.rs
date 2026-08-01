//! The activity repositories, run against a database that came from v1.
//!
//! Every other repository test starts from a fresh v2 install, which proves the
//! queries agree with the baseline migration. That is not the case that ships:
//! the database a real user hands v2 was built by drizzle, migrated across nine
//! steps, populated by the Electron app, and then adopted. This file builds
//! exactly that — with Phase 6's own fixture machinery, so the input is v1's SQL
//! rather than something retyped — adopts it through the real boot path, and
//! then reads it back through the repositories.
//!
//! What it is really checking is that adoption's "the schema is equivalent"
//! claim holds *for named-column queries*, which is the form the claim actually
//! has to take (Phase 6's amendment on legacy schema text).

#[path = "support/activity.rs"]
mod activity;
#[path = "support/v1.rs"]
mod v1;

use shiranami_core::models::DownloadQueueStatus;
use shiranami_db::repo::{download_queue, history, radio};

use activity::{database_path, open_at};
use v1::{build_v1_database, connect, seed_rows};

/// Build a current-v1 database, populate it, and adopt it.
async fn adopted_v1() -> activity::Fixture {
    let dir = tempfile::tempdir().expect("a temp dir");

    {
        let mut conn = connect(&database_path(dir.path())).await;
        // All nine migrations — a user on the current v1 release.
        build_v1_database(&mut conn, 9).await;
        seed_rows(&mut conn).await;
    }

    // The real boot path: adopt, migrate, stamp.
    open_at(dir).await
}

#[tokio::test]
async fn the_history_reads_work_against_an_adopted_database() {
    let mut fixture = adopted_v1().await;

    let recent = history::recent(fixture.conn(), None, None)
        .await
        .expect("the history must read");

    // v1's seed writes three plays across two tracks, and — unlike the app —
    // leaves `played_at` to the column default, so these rows carry SQLite's
    // space-separated format. The queries are format-agnostic; only the
    // *ordering* would suffer from a database holding both forms, which is why
    // record_play never defaults.
    assert_eq!(recent.len(), 3);
    assert!(
        recent.iter().all(|entry| !entry.title.is_empty()),
        "the join to `tracks` must resolve on an adopted schema"
    );

    let summary = history::summary(fixture.conn(), None, None)
        .await
        .expect("the summary must read");
    assert_eq!(summary.total_plays, 3);
    assert_eq!(
        summary.unique_tracks, 2,
        "the seed plays t1 twice and t2 once"
    );
    assert_eq!(summary.completed_plays, 2);

    // `album_artist` arrived as an ALTER TABLE in v1's migration 001, so on an
    // adopted database it is the second-to-last column rather than mid-table.
    // The weekly-insights query names it, which is the whole reason column
    // *order* is allowed to differ between a fresh and an adopted file.
    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");
    assert!(
        !insights.top_albums.is_empty(),
        "the album chart must survive the adopted column order"
    );
    assert!(insights.session_count >= 1);
}

#[tokio::test]
async fn the_radio_favourites_survive_adoption() {
    let mut fixture = adopted_v1().await;

    let saved = radio::all(fixture.conn())
        .await
        .expect("the favourites must read");

    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].station_uuid, "uuid-1");
    assert_eq!(saved[0].name, "Lofi Girl");
    assert!(
        radio::is_favorite(fixture.conn(), "uuid-1")
            .await
            .expect("the check must run")
    );
}

#[tokio::test]
async fn a_v1_download_queue_row_restores_as_queued() {
    let mut fixture = adopted_v1().await;

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "d1");
    // v1's own seed row carries the status `pending`, which is not in any
    // shipped status union. Restoring it as `queued` rather than guessing is
    // what keeps an adopted queue resumable instead of pointing the importer at
    // a file that was never downloaded.
    assert_eq!(loaded[0].status, DownloadQueueStatus::Queued);
    assert_eq!(loaded[0].progress, 0.0);
    assert_eq!(loaded[0].enqueued_at, 1_767_225_600);
}

#[tokio::test]
async fn recording_a_play_into_an_adopted_database_bumps_the_v1_play_count() {
    let mut fixture = adopted_v1().await;

    // v1 seeded `t1` with a play count of 7. A play recorded by v2 has to
    // continue that number, not restart it — the counter is the user's history
    // and nothing recomputes it.
    let recorded = history::record_play(
        fixture.conn(),
        "h-v2",
        "2026-08-01T12:00:00.000Z",
        &shiranami_core::models::RecordPlayInput {
            track_id: "t1".to_owned(),
            played_seconds: 201.5,
            duration: Some(201.5),
            source: None,
        },
    )
    .await
    .expect("the play must record");

    assert!(recorded.entry.completed);
    assert_eq!(
        activity::play_count(fixture.conn(), "t1").await,
        Some(8),
        "the lifetime counter continues from v1's value"
    );
}
