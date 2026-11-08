//! `POST /v1/sync/pair`: prove the QR, wait for Allow, mint a device.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::response::Response;
use bytes::Bytes;
use shiranami_core::sync::lock_or_recover;
use shiranami_db::repo::sync::{SyncPeer, insert_peer};
use tokio::sync::oneshot;

use crate::auth::{PAIR_PROOF_CONTEXT, b64, device_secret, hmac_verify, unb64};
use crate::error::SyncError;
use crate::pairing::{APPROVAL_TIMEOUT, MAX_PAIR_FAILURES};
use crate::routes::json;
use crate::server::{Pending, Shared, unix_now};
use crate::wire::{PROTOCOL_VERSION, PairRequest, PairResponse};

/// Longest accepted device name, in characters.
const MAX_NAME_CHARS: usize = 64;
/// Longest accepted platform string.
const MAX_PLATFORM_CHARS: usize = 32;

/// Clears the window's `busy` flag and the pending entry however the handler
/// ends, including the client hanging up mid-wait.
struct Waiting<'a> {
    shared: &'a Shared,
    nonce: String,
    request_id: Option<String>,
}

impl Drop for Waiting<'_> {
    fn drop(&mut self) {
        if let Some(id) = self.request_id.take() {
            lock_or_recover(&self.shared.pending).remove(&id);
        }
        if let Some(window) = lock_or_recover(&self.shared.pairing).as_mut()
            && window.nonce_matches(&self.nonce)
        {
            window.busy = false;
        }
        self.shared.notify();
    }
}

pub(super) async fn pair(
    State(shared): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    body: Bytes,
) -> Result<Response, SyncError> {
    if !shared.pair_attempts.allow(&peer.ip()) {
        return Err(SyncError::RateLimited { retry_after: 60 });
    }
    let request: PairRequest =
        serde_json::from_slice(&body).map_err(|_| SyncError::BadRequest("unreadable body"))?;
    let name = request.device_name.trim().to_owned();
    let platform = request.platform.trim().to_owned();
    if name.is_empty()
        || name.chars().count() > MAX_NAME_CHARS
        || platform.is_empty()
        || platform.chars().count() > MAX_PLATFORM_CHARS
    {
        return Err(SyncError::BadRequest(
            "device name or platform out of range",
        ));
    }

    let secret = prove(&shared, &request)?;
    let mut waiting = Waiting {
        shared: &shared,
        nonce: request.nonce.clone(),
        request_id: None,
    };

    if shared.require_approval {
        let (sender, receiver) = oneshot::channel();
        let request_id = uuid::Uuid::new_v4().to_string();
        lock_or_recover(&shared.pending).insert(
            request_id.clone(),
            Pending {
                device_name: name.clone(),
                platform: platform.clone(),
                responder: Some(sender),
            },
        );
        waiting.request_id = Some(request_id);
        shared.notify();

        let answer = tokio::select! {
            answer = tokio::time::timeout(APPROVAL_TIMEOUT, receiver) => answer,
            () = shared.shutdown.cancelled() => Ok(Ok(false)),
        };
        match answer {
            Ok(Ok(true)) => {}
            Ok(Ok(false) | Err(_)) => {
                close_window_if(&shared, &request.nonce);
                tracing::info!("sync: a pairing request was denied");
                return Err(SyncError::PairingDenied);
            }
            Err(_) => return Err(SyncError::PairingTimeout),
        }
    }

    let device_id = uuid::Uuid::new_v4().to_string();
    let peer_row = SyncPeer {
        device_id: device_id.clone(),
        name,
        platform,
        secret: b64(&device_secret(&secret, &device_id)),
        created_at: iso_now(),
        last_seen_at: None,
    };
    {
        let pool = (shared.pool)();
        let mut conn = pool.acquire().await.map_err(|error| {
            tracing::warn!(%error, "sync: could not acquire the database");
            SyncError::Internal
        })?;
        insert_peer(&mut conn, &peer_row).await?;
    }
    close_window_if(&shared, &request.nonce);
    drop(waiting);
    tracing::info!("sync: a phone was paired");

    Ok(json(
        StatusCode::OK,
        &PairResponse {
            device_id,
            desktop_id: shared.desktop_id.clone(),
            desktop_name: shared.desktop_name.clone(),
            library_id: shared.library_id.clone(),
            protocol_version: PROTOCOL_VERSION,
            server_time: unix_now(),
        },
    ))
}

/// Check the request against the open window and return its secret, marking
/// the window busy.
fn prove(shared: &Shared, request: &PairRequest) -> Result<[u8; 32], SyncError> {
    let mut slot = lock_or_recover(&shared.pairing);
    if slot
        .as_ref()
        .is_some_and(crate::pairing::PairingWindow::is_expired)
    {
        *slot = None;
    }
    let Some(window) = slot.as_mut() else {
        return Err(SyncError::PairingClosed);
    };
    if !window.nonce_matches(&request.nonce) {
        // A stale QR: the user re-opened the window since it was scanned.
        return Err(SyncError::PairingClosed);
    }
    if window.busy {
        return Err(SyncError::PairingBusy);
    }
    let message = format!(
        "{PAIR_PROOF_CONTEXT}\n{}\n{}\n{}",
        request.nonce, request.device_name, request.platform
    );
    let proven = unb64(&request.proof)
        .is_some_and(|tag| hmac_verify(&window.secret, message.as_bytes(), &tag));
    if !proven {
        window.failures += 1;
        if window.failures >= MAX_PAIR_FAILURES {
            *slot = None;
            drop(slot);
            tracing::warn!("sync: too many bad pairing proofs, closed the window");
            shared.notify();
        }
        return Err(SyncError::NotFound);
    }
    window.busy = true;
    Ok(window.secret)
}

/// Close the window, but only if it is still the one this request proved.
fn close_window_if(shared: &Shared, nonce: &str) {
    let mut slot = lock_or_recover(&shared.pairing);
    if slot
        .as_ref()
        .is_some_and(|window| window.nonce_matches(nonce))
    {
        *slot = None;
    }
}

/// ISO-8601 UTC with milliseconds, the format `play_history` uses.
fn iso_now() -> String {
    let ms = crate::server::unix_now_ms();
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's
/// `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn civil_dates_are_right_across_leap_years() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
        assert_eq!(civil_from_days(20_765), (2026, 11, 8));
    }
}
