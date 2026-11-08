//! `sync:*`: the "Sync with phone" settings section (LAN sync v0).
//!
//! Ports no v1 channel; v1 had no phone sync of any kind. The rules live in
//! `shiranami-sync` and the lifecycle in `crate::phone_sync`; every command
//! here is a one-line delegation plus the error mapping.

use shiranami_sync::{SyncDevice, SyncPairingTicket, SyncStatus};
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request, not_booted};
use crate::phone_sync::PhoneSync;
use crate::state::AppState;

macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::sync::sync_get_status,
                crate::commands::sync::sync_set_enabled,
                crate::commands::sync::sync_start_pairing,
                crate::commands::sync::sync_cancel_pairing,
                crate::commands::sync::sync_respond_pairing,
                crate::commands::sync::sync_list_devices,
                crate::commands::sync::sync_revoke_device,
            ]
        }
    };
}
pub(crate) use commands;

fn service(state: &AppState) -> CommandResult<&PhoneSync> {
    state
        .deferred()
        .phone_sync
        .as_deref()
        .ok_or_else(|| not_booted("phone sync"))
}

/// `sync:get-status`: listener, pairing window, waiting phones, transfers.
#[tauri::command]
#[specta::specta]
pub async fn sync_get_status(state: State<'_, AppState>) -> CommandResult<SyncStatus> {
    Ok(service(&state)?.status().await)
}

/// `sync:set-enabled`: start or stop the LAN listener and mDNS.
///
/// Not persisted: sync runs only while the user has it switched on in this
/// session. A start failure (no private network interface, a bind error) is a
/// `BAD_REQUEST` carrying the reason, which the section shows.
#[tauri::command]
#[specta::specta]
pub async fn sync_set_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<SyncStatus> {
    service(&state)?
        .set_enabled(enabled)
        .await
        .map_err(bad_request)
}

/// `sync:start-pairing`: open a 5 minute pairing window and return the QR
/// payload. Starts the listener when it is off.
#[tauri::command]
#[specta::specta]
pub async fn sync_start_pairing(state: State<'_, AppState>) -> CommandResult<SyncPairingTicket> {
    service(&state)?.start_pairing().await.map_err(bad_request)
}

/// `sync:cancel-pairing`: close the window and deny anyone waiting.
#[tauri::command]
#[specta::specta]
pub async fn sync_cancel_pairing(state: State<'_, AppState>) -> CommandResult<SyncStatus> {
    let sync = service(&state)?;
    if let Some(server) = sync.running().await {
        server.cancel_pairing();
    }
    Ok(sync.status().await)
}

/// `sync:respond-pairing`: Allow or Deny a waiting phone. Resolves `false`
/// when the request is no longer waiting (it timed out or the phone left).
#[tauri::command]
#[specta::specta]
pub async fn sync_respond_pairing(
    state: State<'_, AppState>,
    request_id: String,
    allow: bool,
) -> CommandResult<bool> {
    let sync = service(&state)?;
    Ok(sync
        .running()
        .await
        .is_some_and(|server| server.respond_pairing(&request_id, allow)))
}

/// `sync:list-devices`: paired phones, without their secrets.
#[tauri::command]
#[specta::specta]
pub async fn sync_list_devices(state: State<'_, AppState>) -> CommandResult<Vec<SyncDevice>> {
    let mut conn = state.conn().await?;
    shiranami_sync::devices::list(&mut conn).await.wire()
}

/// `sync:revoke-device`: forget a phone. Its next request gets a 404. Works
/// while sync is off. Returns the remaining devices.
#[tauri::command]
#[specta::specta]
pub async fn sync_revoke_device(
    state: State<'_, AppState>,
    device_id: String,
) -> CommandResult<Vec<SyncDevice>> {
    let remaining = {
        let mut conn = state.conn().await?;
        shiranami_sync::devices::revoke(&mut conn, &device_id)
            .await
            .wire()?;
        shiranami_sync::devices::list(&mut conn).await.wire()?
    };
    if let Some(server) = service(&state)?.running().await {
        server.forget_device(&device_id);
    }
    Ok(remaining)
}
