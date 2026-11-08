//! The LAN sync repository (migration `0010`), against real databases.

#[path = "support/activity.rs"]
mod activity;

use shiranami_db::repo::{backup, sync};

use activity::{exec, fresh};

fn peer(id: &str) -> sync::SyncPeer {
    sync::SyncPeer {
        device_id: id.to_owned(),
        name: format!("Phone {id}"),
        platform: "android".to_owned(),
        secret: "c2VjcmV0".to_owned(),
        created_at: format!("2026-11-08T10:00:0{id}.000Z"),
        last_seen_at: None,
    }
}

#[tokio::test]
async fn peers_are_stored_listed_touched_and_revoked() {
    let mut fixture = fresh().await;
    let conn = fixture.conn();
    sync::insert_peer(conn, &peer("1")).await.expect("insert");
    sync::insert_peer(conn, &peer("2")).await.expect("insert");
    assert!(
        sync::insert_peer(conn, &peer("1")).await.is_err(),
        "ids are unique"
    );

    let listed = sync::list_peers(conn).await.expect("list");
    assert_eq!(
        listed
            .iter()
            .map(|p| p.device_id.as_str())
            .collect::<Vec<_>>(),
        ["1", "2"]
    );

    sync::touch_peer(conn, "1").await.expect("touch");
    let touched = sync::get_peer(conn, "1")
        .await
        .expect("get")
        .expect("present");
    assert!(touched.last_seen_at.is_some());
    assert!(
        !format!("{touched:?}").contains("c2VjcmV0"),
        "a peer never prints its secret"
    );

    assert!(sync::delete_peer(conn, "1").await.expect("delete"));
    assert!(!sync::delete_peer(conn, "1").await.expect("delete again"));
    assert!(sync::get_peer(conn, "1").await.expect("get").is_none());
}

#[tokio::test]
async fn the_identity_is_minted_once() {
    let mut fixture = fresh().await;
    let conn = fixture.conn();
    let first = sync::meta_get_or_insert(conn, "desktop_id", "a")
        .await
        .expect("mint");
    let second = sync::meta_get_or_insert(conn, "desktop_id", "b")
        .await
        .expect("read");
    assert_eq!(first, "a");
    assert_eq!(second, "a", "the first candidate wins for good");
}

#[tokio::test]
async fn an_exported_copy_carries_no_sync_secrets() {
    let mut fixture = fresh().await;
    sync::insert_peer(fixture.conn(), &peer("1"))
        .await
        .expect("insert");
    exec(
        fixture.conn(),
        "INSERT INTO tracks (id, file_path, title) VALUES ('t', '/m/a.mp3', 'A')",
    )
    .await;

    let copy = fixture.sibling("export.db");
    backup::snapshot_to(fixture.conn(), &copy)
        .await
        .expect("snapshot");
    sync::strip_credentials(&copy).await.expect("strip");

    let live = sync::list_peers(fixture.conn()).await.expect("live peers");
    assert_eq!(live.len(), 1, "the live database keeps its devices");

    let mut exported = sqlx::SqliteConnection::connect_with(
        &sqlx::sqlite::SqliteConnectOptions::new().filename(&copy),
    )
    .await
    .expect("open the copy");
    use sqlx::Connection as _;
    let peers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_peers")
        .fetch_one(&mut exported)
        .await
        .expect("count");
    let tracks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tracks")
        .fetch_one(&mut exported)
        .await
        .expect("count");
    assert_eq!(peers, 0);
    assert_eq!(tracks, 1, "everything else survives");
    assert!(
        !copy.with_extension("db-wal").exists(),
        "stripping leaves no WAL beside the export"
    );
}
