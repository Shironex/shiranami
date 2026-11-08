//! Binding the LAN listener, the shared state, and the handle the shell holds.
//!
//! This is a separate listener from `shiranami-serve` on purpose. That server's
//! security model is "loopback only, path token"; this one is "private LAN
//! interfaces only, signed requests, paired devices", and the two must never
//! share a socket or a router. Nothing here starts on its own: the shell calls
//! [`start`] when the user turns sync on and [`SyncServer::shutdown`] when they
//! turn it off or quit.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use shiranami_core::paths::FoldersCache;
use shiranami_core::sync::lock_or_recover;
use sqlx::SqlitePool;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::auth::NonceCache;
use crate::mdns::Advertisement;
use crate::pairing::PairingWindow;
use crate::rate::{TokenBuckets, WindowCounter};
use crate::status::{SyncPairingTicket, SyncPendingPair, SyncStatus, SyncTransfer};

/// How long [`SyncServer::shutdown`] waits for open responses.
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);

/// Signed requests a device may make per second, sustained.
pub const DEVICE_RATE_PER_SEC: f64 = 50.0;
/// And in a burst.
pub const DEVICE_BURST: f64 = 100.0;
/// Concurrent audio downloads per device.
pub const MAX_STREAMS_PER_DEVICE: usize = 4;
/// Pairing attempts per peer address per minute.
pub const PAIR_ATTEMPTS_PER_MINUTE: u32 = 5;
/// Failed authentications per peer address per minute before it is refused
/// outright.
pub const AUTH_FAILURES_PER_MINUTE: u32 = 30;

/// Where the listener gets a database pool from, per request.
///
/// A function rather than a pool because `db:backup:import` replaces the
/// app's pool; a pool captured at start would keep reading the old file.
pub type PoolSource = Arc<dyn Fn() -> SqlitePool + Send + Sync>;

/// Called with the new status whenever [`SyncServer::status`] would answer
/// differently (a pairing request arrived, a transfer started or ended, a
/// device paired). The shell turns it into the `sync:status` event. Called
/// with no lock held, from whichever task made the change, so it must only
/// hand the value on.
pub type ChangeObserver = Arc<dyn Fn(SyncStatus) + Send + Sync>;

/// Which addresses to bind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BindPolicy {
    /// Every private IPv4 interface address (the app's setting).
    PrivateLan,
    /// Exactly these addresses (tests bind loopback).
    Addresses(Vec<Ipv4Addr>),
}

/// Everything [`start`] needs.
pub struct SyncConfig {
    /// The database.
    pub pool: PoolSource,
    /// The containment guard the audio route re-runs on every resolved path.
    pub folders: Arc<FoldersCache>,
    /// The album-art cache directory.
    pub art_dir: PathBuf,
    /// Shown on the phone and advertised over mDNS.
    pub desktop_name: String,
    /// Reported in `hello`.
    pub app_version: String,
    /// Which addresses to bind.
    pub bind: BindPolicy,
    /// 0 for an ephemeral port.
    pub port: u16,
    /// Whether to advertise over mDNS (only honoured for
    /// [`BindPolicy::PrivateLan`]).
    pub advertise: bool,
    /// Whether a proven pairing still needs the desktop user's Allow. Always
    /// `true` in the app; tests turn it off to exercise the rest.
    pub require_approval: bool,
    /// See [`ChangeObserver`].
    pub on_change: ChangeObserver,
    /// The replay cache. The app passes one that outlives every listener it
    /// starts, so a restart of the listener does not reopen the window for a
    /// captured request; see [`NonceCache`].
    pub nonces: Arc<NonceCache>,
}

impl SyncConfig {
    /// The config the app runs with: private interfaces, ephemeral port,
    /// mDNS on, approval required, no observer.
    pub fn new(
        pool: PoolSource,
        folders: Arc<FoldersCache>,
        art_dir: PathBuf,
        desktop_name: String,
        app_version: String,
    ) -> Self {
        Self {
            pool,
            folders,
            art_dir,
            desktop_name,
            app_version,
            bind: BindPolicy::PrivateLan,
            port: 0,
            advertise: true,
            require_approval: true,
            on_change: Arc::new(|_| {}),
            nonces: Arc::new(NonceCache::default()),
        }
    }
}

/// Why [`start`] failed.
#[derive(Debug, thiserror::Error)]
pub enum StartError {
    /// No private IPv4 address to bind; the machine is not on a LAN.
    #[error("no private network interface to listen on")]
    NoPrivateInterface,
    /// The socket could not be bound or the interfaces not listed.
    #[error("could not open the sync listener: {0}")]
    Io(#[from] std::io::Error),
    /// The sync identity could not be read.
    #[error("could not read the sync identity: {0}")]
    Db(#[from] shiranami_db::DbError),
}

/// A phone waiting for Allow / Deny.
pub(crate) struct Pending {
    pub(crate) device_name: String,
    pub(crate) platform: String,
    pub(crate) responder: Option<oneshot::Sender<bool>>,
}

/// State every route reaches.
pub(crate) struct Shared {
    pub(crate) pool: PoolSource,
    pub(crate) folders: Arc<FoldersCache>,
    pub(crate) art_dir: PathBuf,
    pub(crate) desktop_name: String,
    pub(crate) app_version: String,
    pub(crate) require_approval: bool,
    pub(crate) on_change: ChangeObserver,
    pub(crate) desktop_id: String,
    pub(crate) library_id: String,
    pub(crate) addresses: Vec<SocketAddr>,
    pub(crate) port: u16,
    pub(crate) advertising: std::sync::atomic::AtomicBool,
    pub(crate) pairing: Mutex<Option<PairingWindow>>,
    pub(crate) pending: Mutex<HashMap<String, Pending>>,
    pub(crate) nonces: Arc<NonceCache>,
    pub(crate) device_rate: TokenBuckets<String>,
    pub(crate) pair_attempts: WindowCounter<IpAddr>,
    pub(crate) auth_failures: WindowCounter<IpAddr>,
    pub(crate) transfers: Mutex<HashMap<u64, SyncTransfer>>,
    pub(crate) next_transfer: AtomicU64,
    pub(crate) touched: Mutex<HashMap<String, Instant>>,
    pub(crate) shutdown: CancellationToken,
}

impl Shared {
    pub(crate) fn notify(&self) {
        (self.on_change)(self.status());
    }

    pub(crate) fn hosts(&self) -> Vec<String> {
        self.addresses.iter().map(|a| a.ip().to_string()).collect()
    }

    pub(crate) fn status(&self) -> SyncStatus {
        let pairing = {
            let mut slot = lock_or_recover(&self.pairing);
            if slot.as_ref().is_some_and(PairingWindow::is_expired) {
                *slot = None;
            }
            slot.as_ref().map(|window| window.ticket.clone())
        };
        let mut pending_pairs: Vec<SyncPendingPair> = lock_or_recover(&self.pending)
            .iter()
            .map(|(id, pending)| SyncPendingPair {
                request_id: id.clone(),
                device_name: pending.device_name.clone(),
                platform: pending.platform.clone(),
            })
            .collect();
        pending_pairs.sort_by(|a, b| a.request_id.cmp(&b.request_id));
        let mut transfers: Vec<(u64, SyncTransfer)> = lock_or_recover(&self.transfers)
            .iter()
            .map(|(id, transfer)| (*id, transfer.clone()))
            .collect();
        transfers.sort_by_key(|(id, _)| *id);
        SyncStatus {
            running: !self.shutdown.is_cancelled(),
            addresses: self.addresses.iter().map(ToString::to_string).collect(),
            advertising: self.advertising.load(Ordering::Relaxed),
            pairing,
            pending_pairs,
            transfers: transfers.into_iter().map(|(_, t)| t).collect(),
        }
    }
}

/// The current unix time in seconds.
pub(crate) fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// The current unix time in milliseconds.
pub(crate) fn unix_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// Read (minting on first use) the desktop id and library id.
///
/// # Errors
///
/// The database error when either read fails.
pub async fn identity(conn: &mut sqlx::SqliteConnection) -> shiranami_db::Result<(String, String)> {
    use shiranami_db::repo::sync::meta_get_or_insert;
    let desktop = meta_get_or_insert(conn, "desktop_id", &uuid::Uuid::new_v4().to_string()).await?;
    let library = meta_get_or_insert(conn, "library_id", &uuid::Uuid::new_v4().to_string()).await?;
    Ok((desktop, library))
}

/// A running listener.
pub struct SyncServer {
    shared: Arc<Shared>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
    advertisement: Mutex<Option<Advertisement>>,
}

impl std::fmt::Debug for SyncServer {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SyncServer")
            .field("addresses", &self.shared.addresses)
            .finish_non_exhaustive()
    }
}

/// Bind the listener, resolve the identity, advertise, and start serving.
///
/// # Errors
///
/// [`StartError`] when nothing could be bound or the identity not read.
pub async fn start(config: SyncConfig) -> Result<SyncServer, StartError> {
    let (desktop_id, library_id) = {
        let pool = (config.pool)();
        let mut conn = pool
            .acquire()
            .await
            .map_err(|source| shiranami_db::DbError::Query {
                operation: "acquire the database connection",
                source,
            })?;
        identity(&mut conn).await?
    };

    let candidates = match &config.bind {
        BindPolicy::PrivateLan => crate::net::private_ipv4_addresses()?,
        BindPolicy::Addresses(addresses) => addresses.clone(),
    };
    let Some((first, rest)) = candidates.split_first() else {
        return Err(StartError::NoPrivateInterface);
    };

    let first_listener = TcpListener::bind((*first, config.port)).await?;
    let port = first_listener.local_addr()?.port();
    let mut listeners = vec![first_listener];
    for ip in rest {
        match TcpListener::bind((*ip, port)).await {
            Ok(listener) => listeners.push(listener),
            Err(error) => tracing::warn!(%error, "sync: skipped an interface that would not bind"),
        }
    }
    let addresses: Vec<SocketAddr> = listeners
        .iter()
        .filter_map(|listener| listener.local_addr().ok())
        .collect();
    let bound_ips: Vec<Ipv4Addr> = addresses
        .iter()
        .filter_map(|address| match address.ip() {
            IpAddr::V4(ip) => Some(ip),
            IpAddr::V6(_) => None,
        })
        .collect();

    let shared = Arc::new(Shared {
        pool: config.pool,
        folders: config.folders,
        art_dir: config.art_dir,
        desktop_name: config.desktop_name,
        app_version: config.app_version,
        require_approval: config.require_approval,
        on_change: config.on_change,
        desktop_id,
        library_id,
        addresses,
        port,
        advertising: std::sync::atomic::AtomicBool::new(false),
        pairing: Mutex::new(None),
        pending: Mutex::new(HashMap::new()),
        nonces: config.nonces,
        device_rate: TokenBuckets::new(DEVICE_RATE_PER_SEC, DEVICE_BURST),
        pair_attempts: WindowCounter::new(PAIR_ATTEMPTS_PER_MINUTE, Duration::from_secs(60)),
        auth_failures: WindowCounter::new(AUTH_FAILURES_PER_MINUTE, Duration::from_secs(60)),
        transfers: Mutex::new(HashMap::new()),
        next_transfer: AtomicU64::new(1),
        touched: Mutex::new(HashMap::new()),
        shutdown: CancellationToken::new(),
    });

    let router = crate::listen::limited(crate::routes::router(Arc::clone(&shared)));
    let tasks = listeners
        .into_iter()
        .map(|listener| {
            tokio::spawn(crate::listen::serve(
                listener,
                router.clone(),
                shared.shutdown.clone(),
            ))
        })
        .collect();

    let advertisement = (config.advertise && config.bind == BindPolicy::PrivateLan)
        .then(|| Advertisement::start(&shared.desktop_name, &shared.desktop_id, &bound_ips, port))
        .flatten();
    shared
        .advertising
        .store(advertisement.is_some(), Ordering::Relaxed);

    tracing::info!(
        interfaces = shared.addresses.len(),
        port,
        "sync: LAN listener started"
    );

    Ok(SyncServer {
        shared,
        tasks: Mutex::new(tasks),
        advertisement: Mutex::new(advertisement),
    })
}

impl SyncServer {
    /// What the settings section shows.
    pub fn status(&self) -> SyncStatus {
        self.shared.status()
    }

    /// The bound addresses.
    pub fn addresses(&self) -> &[SocketAddr] {
        &self.shared.addresses
    }

    /// The listener port.
    pub fn port(&self) -> u16 {
        self.shared.port
    }

    /// This desktop's sync id.
    pub fn desktop_id(&self) -> &str {
        &self.shared.desktop_id
    }

    /// The served library's id.
    pub fn library_id(&self) -> &str {
        &self.shared.library_id
    }

    /// Open (or replace) the pairing window and return the QR ticket.
    pub fn start_pairing(&self, ttl: Duration) -> SyncPairingTicket {
        let window = PairingWindow::open(
            &self.shared.hosts(),
            self.shared.port,
            &self.shared.desktop_id,
            &self.shared.desktop_name,
            ttl,
            unix_now_ms(),
        );
        let ticket = window.ticket.clone();
        *lock_or_recover(&self.shared.pairing) = Some(window);
        // A replaced window ends any wait on the old one.
        deny_all(&self.shared);
        self.shared.notify();
        ticket
    }

    /// Close the pairing window and deny anyone waiting.
    pub fn cancel_pairing(&self) {
        *lock_or_recover(&self.shared.pairing) = None;
        deny_all(&self.shared);
        self.shared.notify();
    }

    /// Answer a waiting phone. `false` when no such request is waiting.
    pub fn respond_pairing(&self, request_id: &str, allow: bool) -> bool {
        let responder = lock_or_recover(&self.shared.pending)
            .get_mut(request_id)
            .and_then(|pending| pending.responder.take());
        responder.is_some_and(|responder| responder.send(allow).is_ok())
    }

    /// Drop the replay state of a revoked device. The revocation itself is a
    /// row delete ([`crate::devices::revoke`]); this only frees memory early.
    pub fn forget_device(&self, device_id: &str) {
        self.shared.nonces.forget(device_id);
        lock_or_recover(&self.shared.touched).remove(device_id);
    }

    /// Stop advertising, close every listener and wait (bounded) for open
    /// responses. Idempotent.
    pub async fn shutdown(&self) {
        self.shared.shutdown.cancel();
        *lock_or_recover(&self.shared.pairing) = None;
        deny_all(&self.shared);
        if let Some(advertisement) = lock_or_recover(&self.advertisement).take() {
            advertisement.stop();
        }
        self.shared.advertising.store(false, Ordering::Relaxed);
        let tasks: Vec<JoinHandle<()>> = std::mem::take(&mut *lock_or_recover(&self.tasks));
        for mut task in tasks {
            if tokio::time::timeout(SHUTDOWN_GRACE, &mut task)
                .await
                .is_err()
            {
                task.abort();
            }
        }
        tracing::info!("sync: LAN listener stopped");
    }
}

/// Drop every waiting responder, which the waiting handler reads as Deny.
fn deny_all(shared: &Shared) {
    for pending in lock_or_recover(&shared.pending).values_mut() {
        pending.responder.take();
    }
}
