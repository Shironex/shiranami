//! Route errors and how each reaches the wire.

use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::wire::{SyncErrorBody, SyncErrorCode};

/// Why a request was refused.
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    /// Unknown device, bad signature, stale timestamp, reused nonce, unknown
    /// route or unknown resource. 404 with no body, like `shiranami-serve`.
    #[error("not found")]
    NotFound,
    /// A malformed request.
    #[error("bad request: {0}")]
    BadRequest(&'static str),
    /// No pairing window open.
    #[error("no pairing window is open")]
    PairingClosed,
    /// Another phone is waiting for an answer.
    #[error("another pairing is waiting for an answer")]
    PairingBusy,
    /// The user pressed Deny.
    #[error("the desktop user denied the pairing")]
    PairingDenied,
    /// Nobody answered.
    #[error("the desktop user did not answer in time")]
    PairingTimeout,
    /// Over a rate limit; `retry_after` seconds.
    #[error("rate limited")]
    RateLimited {
        /// Seconds until a retry can succeed.
        retry_after: u64,
    },
    /// Too many concurrent audio streams for one device.
    #[error("too many concurrent downloads")]
    TooManyStreams,
    /// 416.
    #[error("range not satisfiable")]
    RangeNotSatisfiable {
        /// The entity length, for `Content-Range: bytes */total`.
        total: u64,
    },
    /// Anything else. Logged where it happens; the wire gets no detail.
    #[error("internal error")]
    Internal,
}

impl From<shiranami_db::DbError> for SyncError {
    fn from(error: shiranami_db::DbError) -> Self {
        tracing::warn!(%error, "sync: a database read failed");
        Self::Internal
    }
}

impl SyncError {
    fn parts(&self) -> (StatusCode, SyncErrorCode) {
        match self {
            Self::NotFound => (StatusCode::NOT_FOUND, SyncErrorCode::Internal),
            Self::BadRequest(_) => (StatusCode::BAD_REQUEST, SyncErrorCode::BadRequest),
            Self::PairingClosed => (StatusCode::GONE, SyncErrorCode::PairingClosed),
            Self::PairingBusy => (StatusCode::CONFLICT, SyncErrorCode::PairingBusy),
            Self::PairingDenied => (StatusCode::FORBIDDEN, SyncErrorCode::PairingDenied),
            Self::PairingTimeout => (StatusCode::REQUEST_TIMEOUT, SyncErrorCode::PairingTimeout),
            Self::RateLimited { .. } => (StatusCode::TOO_MANY_REQUESTS, SyncErrorCode::RateLimited),
            Self::TooManyStreams => (StatusCode::TOO_MANY_REQUESTS, SyncErrorCode::TooManyStreams),
            Self::RangeNotSatisfiable { .. } => (
                StatusCode::RANGE_NOT_SATISFIABLE,
                SyncErrorCode::RangeNotSatisfiable,
            ),
            Self::Internal => (StatusCode::INTERNAL_SERVER_ERROR, SyncErrorCode::Internal),
        }
    }
}

impl IntoResponse for SyncError {
    fn into_response(self) -> Response {
        if matches!(self, Self::NotFound) {
            return StatusCode::NOT_FOUND.into_response();
        }
        let (status, code) = self.parts();
        let body = SyncErrorBody {
            error: code,
            message: self.to_string(),
        };
        let mut response = crate::routes::json(status, &body);
        match self {
            Self::RateLimited { retry_after } => {
                if let Ok(value) = HeaderValue::from_str(&retry_after.to_string()) {
                    response.headers_mut().insert(header::RETRY_AFTER, value);
                }
            }
            Self::RangeNotSatisfiable { total } => {
                if let Ok(value) = HeaderValue::from_str(&format!("bytes */{total}")) {
                    response.headers_mut().insert(header::CONTENT_RANGE, value);
                }
            }
            _ => {}
        }
        response
    }
}
