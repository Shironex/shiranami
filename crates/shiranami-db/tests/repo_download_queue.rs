//! The download-queue persistence repository, against real databases.
//!
//! Ported from the cases `apps/desktop/src/main/downloads/download-queue.test.ts`
//! covers for the persistence seam. The interesting behaviour is not the CRUD —
//! it is what [`load`](shiranami_db::repo::download_queue::load) *changes* on
//! the way out, because a restart cannot resume a transfer mid-flight.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::models::{DownloadQueueItem, DownloadQueueStatus};
use shiranami_db::repo::download_queue;

use activity::{Fixture, count_rows, exec, fresh};

/// A minimal queue item; tests override the fields they are about.
fn item(id: &str, status: DownloadQueueStatus, enqueued_at: i64) -> DownloadQueueItem {
    DownloadQueueItem {
        id: id.to_owned(),
        url: format!("https://y.example/watch?v={id}"),
        youtube_id: None,
        title: format!("Track {id}"),
        thumbnail: None,
        status,
        progress: 0.0,
        file_path: None,
        error: None,
        batch_id: None,
        batch_index: None,
        batch_source_title: None,
        batch_create_playlist: None,
        enqueued_at,
        started_at: None,
        finished_at: None,
    }
}

async fn with_queue(items: &[DownloadQueueItem]) -> Fixture {
    let mut fixture = fresh().await;
    for entry in items {
        download_queue::upsert(fixture.conn(), entry)
            .await
            .expect("the item must persist");
    }
    fixture
}

#[tokio::test]
async fn items_load_in_enqueue_order() {
    let mut fixture = with_queue(&[
        item("c", DownloadQueueStatus::Queued, 300),
        item("a", DownloadQueueStatus::Queued, 100),
        item("b", DownloadQueueStatus::Queued, 200),
    ])
    .await;

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    let ids: Vec<_> = loaded.iter().map(|entry| entry.id.as_str()).collect();
    assert_eq!(
        ids,
        ["a", "b", "c"],
        "enqueue order is the queue's order, and it is restored not re-derived"
    );
}

#[tokio::test]
async fn an_interrupted_download_restores_as_queued_with_no_progress() {
    let mut fixture = with_queue(&[
        item("active", DownloadQueueStatus::Active, 100),
        item("converting", DownloadQueueStatus::Converting, 200),
        item("queued", DownloadQueueStatus::Queued, 300),
    ])
    .await;

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    // There is no mid-download resume protocol: an item that was transferring
    // or post-processing when the app closed has to start over, so it comes
    // back as `queued` at 0%.
    assert!(
        loaded
            .iter()
            .all(|entry| entry.status == DownloadQueueStatus::Queued),
        "nothing but `done` survives a restart with its status intact"
    );
    assert!(
        loaded.iter().all(|entry| entry.progress == 0.0),
        "progress is transient and is synthesised on load, never stored"
    );
}

#[tokio::test]
async fn a_finished_download_restores_as_done_and_complete() {
    let mut fixture = fresh().await;
    let mut finished = item("d1", DownloadQueueStatus::Done, 100);
    finished.file_path = Some("/music/out.mp3".to_owned());
    finished.progress = 42.0; // never persisted; must not come back
    finished.finished_at = Some(1_767_225_600);
    download_queue::upsert(fixture.conn(), &finished)
        .await
        .expect("the item must persist");

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    assert_eq!(loaded[0].status, DownloadQueueStatus::Done);
    assert_eq!(
        loaded[0].progress, 100.0,
        "a `done` row is complete by definition, whatever was in memory"
    );
    assert_eq!(loaded[0].file_path.as_deref(), Some("/music/out.mp3"));
    assert_eq!(loaded[0].finished_at, Some(1_767_225_600));
}

#[tokio::test]
async fn an_unrecognised_status_restores_as_queued_rather_than_done() {
    let mut fixture = fresh().await;
    exec(
        fixture.conn(),
        "INSERT INTO download_queue (id, url, title, status, enqueued_at) \
         VALUES ('d1', 'https://y.example/x', 'Odd', 'pending', 100)",
    )
    .await;

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    // v1's own seed data uses the status `pending`, which is not in the union
    // any build has shipped. Anything that is not exactly `done` restores as
    // `queued`: a re-download costs bandwidth, whereas a phantom `done` points
    // the importer at a file that was never written.
    assert_eq!(loaded[0].status, DownloadQueueStatus::Queued);
    assert_eq!(loaded[0].progress, 0.0);
}

#[tokio::test]
async fn every_optional_field_survives_a_round_trip() {
    let mut fixture = fresh().await;
    let full = DownloadQueueItem {
        id: "d1".to_owned(),
        url: "https://y.example/watch?v=abc".to_owned(),
        youtube_id: Some("abc".to_owned()),
        title: "Full".to_owned(),
        thumbnail: Some("https://i.example/t.jpg".to_owned()),
        status: DownloadQueueStatus::Done,
        progress: 100.0,
        file_path: Some("/music/full.mp3".to_owned()),
        error: None,
        batch_id: Some("batch-1".to_owned()),
        batch_index: Some(3),
        batch_source_title: Some("A playlist".to_owned()),
        batch_create_playlist: Some(true),
        enqueued_at: 1_767_225_600,
        started_at: Some(1_767_225_700),
        finished_at: Some(1_767_225_800),
    };
    download_queue::upsert(fixture.conn(), &full)
        .await
        .expect("the item must persist");

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");

    // The batch fields in particular are denormalised onto every item for
    // exactly this moment: they are how a batch coordinator is reconstructed
    // after a restart, and they live nowhere else on disk.
    assert_eq!(loaded[0], full);
}

#[tokio::test]
async fn upserting_the_same_id_updates_rather_than_duplicates() {
    let mut fixture = with_queue(&[item("d1", DownloadQueueStatus::Queued, 100)]).await;

    let mut done = item("d1", DownloadQueueStatus::Done, 100);
    done.file_path = Some("/music/out.mp3".to_owned());
    download_queue::upsert(fixture.conn(), &done)
        .await
        .expect("the item must persist");

    // The queue calls upsert on enqueue and again on `done`, so the conflict
    // path is the common one rather than the exception.
    assert_eq!(count_rows(fixture.conn(), "download_queue").await, 1);
    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");
    assert_eq!(loaded[0].status, DownloadQueueStatus::Done);
    assert_eq!(loaded[0].file_path.as_deref(), Some("/music/out.mp3"));
}

#[tokio::test]
async fn removing_one_item_leaves_the_rest() {
    let mut fixture = with_queue(&[
        item("a", DownloadQueueStatus::Queued, 100),
        item("b", DownloadQueueStatus::Queued, 200),
    ])
    .await;

    download_queue::remove(fixture.conn(), "a")
        .await
        .expect("the item must be removed");

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");
    let ids: Vec<_> = loaded.iter().map(|entry| entry.id.as_str()).collect();
    assert_eq!(ids, ["b"]);
}

#[tokio::test]
async fn removing_an_absent_item_is_not_an_error() {
    let mut fixture = with_queue(&[item("a", DownloadQueueStatus::Queued, 100)]).await;

    download_queue::remove(fixture.conn(), "never-existed")
        .await
        .expect("removing nothing is a no-op, as it was in v1");

    assert_eq!(count_rows(fixture.conn(), "download_queue").await, 1);
}

#[tokio::test]
async fn remove_many_handles_an_empty_slice() {
    let mut fixture = with_queue(&[item("a", DownloadQueueStatus::Queued, 100)]).await;

    // `DELETE … IN ()` is not valid SQL, so the empty case has to short-circuit
    // rather than build a statement with no placeholders.
    download_queue::remove_many(fixture.conn(), &[])
        .await
        .expect("an empty removal is a no-op");

    assert_eq!(count_rows(fixture.conn(), "download_queue").await, 1);
}

#[tokio::test]
async fn remove_many_deletes_across_more_than_one_chunk() {
    let mut fixture = fresh().await;
    // 1200 rows crosses the 500-id chunk boundary twice, so a bug in the
    // chunking loop leaves survivors instead of silently working.
    let ids: Vec<String> = (0..1_200).map(|index| format!("d{index:04}")).collect();
    for (index, id) in ids.iter().enumerate() {
        let entry = item(
            id,
            DownloadQueueStatus::Queued,
            i64::try_from(index).expect("the index fits"),
        );
        download_queue::upsert(fixture.conn(), &entry)
            .await
            .expect("the item must persist");
    }
    // Keep one id back so the test proves a targeted delete, not a truncate.
    let doomed = &ids[..1_199];

    download_queue::remove_many(fixture.conn(), doomed)
        .await
        .expect("the items must be removed");

    let loaded = download_queue::load(fixture.conn())
        .await
        .expect("the queue must load");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "d1199");
}

#[tokio::test]
async fn clearing_empties_the_table() {
    let mut fixture = with_queue(&[
        item("a", DownloadQueueStatus::Queued, 100),
        item("b", DownloadQueueStatus::Done, 200),
    ])
    .await;

    download_queue::clear(fixture.conn())
        .await
        .expect("the queue must clear");

    assert_eq!(count_rows(fixture.conn(), "download_queue").await, 0);
}
