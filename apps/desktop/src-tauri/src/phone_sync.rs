//! The shell's half of LAN sync: owning the listener and telling the webview.
//!
//! `shiranami-sync` holds every rule; this module only decides **when** the
//! listener runs (while the user has "Sync with phone" switched on, never at
//! boot), hands it a pool getter that follows `db:backup:import`, and turns its
//! change callback into the `sync:status` event.

use std::path::PathBuf;
use std::sync::Arc;

use shiranami_core::paths::FoldersCache;
use shiranami_sync::auth::NonceCache;
use shiranami_sync::{SyncConfig, SyncPairingTicket, SyncServer, SyncStatus};
use tauri::{AppHandle, Manager as _};
use tokio::sync::Mutex;

use crate::state::AppState;

/// The listener, when it runs, and what it needs to start.
pub struct PhoneSync {
    app: AppHandle,
    folders: Arc<FoldersCache>,
    art_dir: PathBuf,
    /// Replay protection that outlives every listener this process starts:
    /// switching sync off and on must not make a captured request valid
    /// again. Created at boot, so it also refuses anything signed before
    /// this process existed.
    nonces: Arc<NonceCache>,
    server: Mutex<Option<Arc<SyncServer>>>,
}

impl std::fmt::Debug for PhoneSync {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("PhoneSync").finish_non_exhaustive()
    }
}

impl PhoneSync {
    /// Idle until [`Self::set_enabled`].
    pub fn new(app: AppHandle, folders: Arc<FoldersCache>, art_dir: PathBuf) -> Self {
        Self {
            app,
            folders,
            art_dir,
            nonces: Arc::new(NonceCache::default()),
            server: Mutex::new(None),
        }
    }

    /// The current state, or [`SyncStatus::stopped`] while off.
    pub async fn status(&self) -> SyncStatus {
        self.running()
            .await
            .map_or_else(SyncStatus::stopped, |server| server.status())
    }

    /// The running server, if any.
    pub async fn running(&self) -> Option<Arc<SyncServer>> {
        self.server.lock().await.clone()
    }

    /// Start or stop the listener. Idempotent either way.
    ///
    /// # Errors
    ///
    /// The start failure (no private interface, a bind error) as text.
    pub async fn set_enabled(&self, enabled: bool) -> Result<SyncStatus, String> {
        let mut slot = self.server.lock().await;
        if enabled && slot.is_none() {
            let server = shiranami_sync::start(self.config())
                .await
                .map_err(|error| error.to_string())?;
            *slot = Some(Arc::new(server));
        } else if !enabled && let Some(server) = slot.take() {
            server.shutdown().await;
        }
        let status = slot
            .as_ref()
            .map_or_else(SyncStatus::stopped, |server| server.status());
        drop(slot);
        emit(&self.app, status.clone());
        Ok(status)
    }

    /// Open a pairing window, starting the listener first if needed.
    ///
    /// # Errors
    ///
    /// The start failure, as for [`Self::set_enabled`].
    pub async fn start_pairing(&self) -> Result<SyncPairingTicket, String> {
        self.set_enabled(true).await?;
        let server = self
            .running()
            .await
            .ok_or_else(|| "the sync listener stopped".to_owned())?;
        Ok(server.start_pairing(shiranami_sync::PAIRING_TTL))
    }

    /// Stop on quit. Bounded by `shiranami_sync::server::SHUTDOWN_GRACE`.
    pub async fn shutdown(&self) {
        if let Some(server) = self.server.lock().await.take() {
            server.shutdown().await;
        }
    }

    fn config(&self) -> SyncConfig {
        let pool_app = self.app.clone();
        let event_app = self.app.clone();
        let mut config = SyncConfig::new(
            // Read the pool per request: an import replaces it.
            Arc::new(move || pool_app.state::<AppState>().pool()),
            Arc::clone(&self.folders),
            self.art_dir.clone(),
            desktop_name(),
            self.app.package_info().version.to_string(),
        );
        config.on_change = Arc::new(move |status| emit(&event_app, status));
        config.nonces = Arc::clone(&self.nonces);
        config
    }
}

/// The name a phone shows for this desktop: the OS host name, or a fallback.
fn desktop_name() -> String {
    sysinfo::System::host_name()
        .map(|name| name.trim_end_matches(".local").to_owned())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Shiranami Desktop".to_owned())
}

fn emit(app: &AppHandle, status: SyncStatus) {
    use tauri_specta::Event as _;
    // A failed emit means the window is gone; nothing to tell.
    let _ = crate::events::SyncStatusChanged(status).emit(app);
}
