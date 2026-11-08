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

use x25519_dalek::{EphemeralSecret, PublicKey};

use crate::auth::{
    b64, device_secret, hmac_verify, pair_proof_message, pair_response_proof, parse_public_key,
    unb64,
};
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

    let Some(phone_key) = parse_public_key(&request.public_key) else {
        return Err(SyncError::BadRequest(
            "public key is not 32 bytes of base64url",
        ));
    };
    let pairing_secret = prove(&shared, &request)?;
    // Ephemeral on this side too: a fresh key per pairing, gone once the
    // device secret is derived. A low-order phone key would make the shared
    // secret predictable, so a non-contributory exchange is refused.
    let desktop_key = EphemeralSecret::random();
    let desktop_public = b64(PublicKey::from(&desktop_key).as_bytes());
    let shared_secret = desktop_key.diffie_hellman(&PublicKey::from(phone_key));
    if !shared_secret.was_contributory() {
        close_window_if(&shared, &request.nonce);
        return Err(SyncError::BadRequest("unusable public key"));
    }
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
        secret: b64(&device_secret(
            shared_secret.as_bytes(),
            &device_id,
            &b64(&pairing_secret),
            &request.public_key,
            &desktop_public,
        )),
        created_at: shiranami_core::time::iso8601::now(),
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
            key_proof: pair_response_proof(
                &pairing_secret,
                &device_id,
                &request.public_key,
                &desktop_public,
            ),
            device_id,
            public_key: desktop_public,
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
    let message = pair_proof_message(
        &request.nonce,
        &request.device_name,
        &request.platform,
        &request.public_key,
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
