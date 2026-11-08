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

#[tokio::test]
async fn an_exported_copy_keeps_no_secret_bytes_in_free_pages() {
    let mut fixture = fresh().await;
    let mut marked = peer("1");
    marked.device_id = "device-id-marker-6f1c".to_owned();
    marked.secret = "secret-marker-9b2e4d7a".to_owned();
    sync::insert_peer(fixture.conn(), &marked)
        .await
        .expect("insert");

    let copy = fixture.sibling("raw.db");
    backup::snapshot_to(fixture.conn(), &copy)
        .await
        .expect("snapshot");
    let before = std::fs::read(&copy).expect("read the copy");
    assert!(
        contains(&before, b"secret-marker-9b2e4d7a"),
        "the fixture really puts the secret in the copy"
    );

    sync::strip_credentials(&copy).await.expect("strip");

    let after = std::fs::read(&copy).expect("read the stripped copy");
    assert!(
        !contains(&after, b"secret-marker-9b2e4d7a"),
        "secret bytes remain"
    );
    assert!(
        !contains(&after, b"device-id-marker-6f1c"),
        "device id bytes remain"
    );
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

/// Snapshot the fixture to `name` and run `sql` against the copy, standing in
/// for a backup file someone crafted.
async fn crafted(fixture: &mut activity::Fixture, name: &str, sql: &str) -> std::path::PathBuf {
    use sqlx::Connection as _;
    let copy = fixture.sibling(name);
    backup::snapshot_to(fixture.conn(), &copy)
        .await
        .expect("snapshot");
    let mut raw = sqlx::SqliteConnection::connect_with(
        &sqlx::sqlite::SqliteConnectOptions::new().filename(&copy),
    )
    .await
    .expect("open the copy");
    sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_owned()))
        .execute(&mut raw)
        .await
        .expect("craft the copy");
    raw.close().await.expect("close");
    copy
}

async fn scalar(path: &std::path::Path, sql: &'static str) -> i64 {
    use sqlx::Connection as _;
    let mut raw = sqlx::SqliteConnection::connect_with(
        &sqlx::sqlite::SqliteConnectOptions::new().filename(path),
    )
    .await
    .expect("open");
    sqlx::query_scalar(sql)
        .fetch_one(&mut raw)
        .await
        .expect("query")
}

#[tokio::test]
async fn a_trigger_that_reinserts_deleted_peers_is_dropped() {
    let mut fixture = fresh().await;
    sync::insert_peer(fixture.conn(), &peer("1"))
        .await
        .expect("insert");
    let copy = crafted(
        &mut fixture,
        "reinsert.db",
        "CREATE TRIGGER keep_alive AFTER DELETE ON sync_peers BEGIN \
           INSERT INTO sync_peers VALUES \
             (old.device_id, old.name, old.platform, old.secret, old.created_at, NULL); \
         END;",
    )
    .await;

    sync::strip_credentials(&copy).await.expect("strip");

    assert_eq!(scalar(&copy, "SELECT COUNT(*) FROM sync_peers").await, 0);
    assert_eq!(
        scalar(
            &copy,
            "SELECT COUNT(*) FROM sqlite_master WHERE name = 'keep_alive'"
        )
        .await,
        0,
        "the trigger is gone"
    );
}

#[tokio::test]
async fn a_view_named_sync_peers_is_refused() {
    let mut fixture = fresh().await;
    let copy = crafted(
        &mut fixture,
        "view.db",
        "DROP TABLE sync_peers; \
         CREATE VIEW sync_peers AS SELECT 'smuggled' AS device_id, 'Phone' AS name, \
           'android' AS platform, 'c2VjcmV0' AS secret, '2026-01-01' AS created_at, \
           NULL AS last_seen_at;",
    )
    .await;

    let refused = sync::strip_credentials(&copy).await;
    assert!(
        matches!(refused, Err(shiranami_db::DbError::UnsafeBackup { .. })),
        "{refused:?}"
    );
}

#[tokio::test]
async fn a_trigger_elsewhere_that_writes_peers_later_is_dropped() {
    let mut fixture = fresh().await;
    let copy = crafted(
        &mut fixture,
        "later.db",
        "CREATE TRIGGER plant AFTER INSERT ON tracks BEGIN \
           INSERT INTO Sync_Peers VALUES \
             ('smuggled', 'Phone', 'android', 'c2VjcmV0', '2026-01-01', NULL); \
         END;",
    )
    .await;
    let app_triggers = scalar(
        &copy,
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name != 'plant'",
    )
    .await;
    assert!(app_triggers > 0, "the app schema has triggers of its own");

    sync::strip_credentials(&copy).await.expect("strip");

    // What the import does next: open it as the library and keep using it.
    let opened = shiranami_db::open(&copy).await.expect("open");
    {
        let mut conn = opened.pool.acquire().await.expect("acquire");
        exec(
            &mut conn,
            "INSERT INTO tracks (id, file_path, title) VALUES ('t', '/m/a.mp3', 'A')",
        )
        .await;
        assert!(sync::list_peers(&mut conn).await.expect("list").is_empty());
    }
    opened.pool.close().await;
    assert_eq!(
        scalar(
            &copy,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'"
        )
        .await,
        app_triggers,
        "only the planted trigger was dropped"
    );
}
