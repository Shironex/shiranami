//! Paired-device management for the desktop UI. Works whether or not the
//! listener is running: a device can be revoked while sync is off.

use sqlx::SqliteConnection;

use crate::status::SyncDevice;

/// Every paired device, without secrets, oldest first.
///
/// # Errors
///
/// The database error when the read fails.
pub async fn list(conn: &mut SqliteConnection) -> shiranami_db::Result<Vec<SyncDevice>> {
    Ok(shiranami_db::repo::sync::list_peers(conn)
        .await?
        .into_iter()
        .map(SyncDevice::from)
        .collect())
}

/// Revoke a device: its row and secret are deleted, so its next request gets
/// a 404. Returns whether anything was deleted.
///
/// # Errors
///
/// The database error when the delete fails.
pub async fn revoke(conn: &mut SqliteConnection, device_id: &str) -> shiranami_db::Result<bool> {
    let deleted = shiranami_db::repo::sync::delete_peer(conn, device_id).await?;
    if deleted {
        tracing::info!("sync: a paired device was revoked");
    }
    Ok(deleted)
}
