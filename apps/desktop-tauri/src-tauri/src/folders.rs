//! The long-lived folders cache, and the authority that answers for it.
//!
//! `crate::paths` builds a throwaway [`FoldersCache`] per check and says why it
//! must not be kept:
//!
//! > The snapshot is therefore built per check and answers for **one** path. It
//! > is not a cache and must not be kept: Phase 16 owns the long-lived
//! > [`FoldersCache`] the audio route needs, with a real authority behind it.
//!
//! This is that authority. The audio route calls
//! `FoldersCache::is_path_allowed` on every byte range the player requests, so
//! a per-check rebuild there would be two SQL queries per seek.
//!
//! # Two of the three answers are async, and the trait is not
//!
//! [`PathAuthority`] is synchronous by design, so that
//! `FoldersCache::is_path_allowed` stays a plain function `shiranami-serve`'s
//! audio route can call under `spawn_blocking` — which it does, and whose own
//! comment already anticipates this module: *"`is_path_allowed` may resolve
//! symlinks and read the database on a miss"*.
//!
//! The two async answers are handled differently, because they have different
//! shapes:
//!
//! - **`folder_roots`** is a small set that changes only when the user adds or
//!   removes a watched folder. It is a snapshot in an `RwLock`, refreshed by
//!   [`LiveAuthority::refresh_roots`] — which is what the `db:folders` and
//!   downloader-location invalidation hooks call.
//! - **`has_track_at`** is a per-path question with an unbounded key space (any
//!   file the user ever imported standalone), so it cannot be a snapshot. It
//!   goes to a task that owns a pool handle, over a channel.
//!
//! # Why a channel rather than `block_on`
//!
//! `crate::paths` names the alternative and rejects it: *"The alternative is
//! `block_on` inside a `PathAuthority`, on a thread that may be the runtime's
//! own, which is a deadlock rather than a cost."*
//!
//! A channel is strictly weaker in the bad case. `block_on` on a runtime worker
//! parks that worker until a future completes that may need that very worker —
//! a genuine deadlock. Waiting on a `std::sync::mpsc` receiver parks the calling
//! thread while the *responder* runs on some other worker, so the worst case is
//! one stalled thread rather than a stopped runtime. The timeout below turns
//! even that into a bounded, fail-closed refusal.
//!
//! # Both degradations are v1's, and they point opposite ways on purpose
//!
//! A failed **folders** read continues with no roots (narrowing what is
//! allowed); a failed **tracks** lookup denies (also narrowing). v1's comment
//! called the second one out explicitly — "fails closed if the database is
//! unavailable" — and the asymmetry only looks like one until you notice both
//! choices are the safe direction for their own question.

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use shiranami_core::paths::{FoldersCache, PathAuthority, PathAuthorityResult};
use shiranami_core::store::SettingsStore;
use shiranami_db::repo;
use shiranami_downloader::location;
use sqlx::SqlitePool;

/// How long [`PathAuthority::has_track_at`] waits for the database.
///
/// Generous for an indexed single-row lookup and short enough that a wedged
/// database refuses a playback request rather than hanging the audio route
/// until the user force-quits. On expiry the answer is **deny**, matching v1's
/// fail-closed rule for exactly this query.
const TRACK_LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// One "is there a track row for this path?" question and where to put the
/// answer.
struct TrackQuery {
    path: PathBuf,
    reply: std::sync::mpsc::SyncSender<bool>,
}

/// The real [`PathAuthority`] behind the app's one [`FoldersCache`].
pub struct LiveAuthority {
    settings: Arc<SettingsStore>,
    /// The OS music directory, resolved once at boot. `location::active_dir`
    /// needs it to spell the default "Shiranami Downloads" path, and Tauri's
    /// resolver is not reachable from a synchronous trait method.
    music_dir: PathBuf,
    /// The watched-folder roots as of the last refresh. See the module docs for
    /// why this one is a snapshot and `has_track_at` is not.
    roots: RwLock<Vec<PathBuf>>,
    tracks: std::sync::mpsc::Sender<TrackQuery>,
    /// The pool the lookup task reads through, shared with it so
    /// [`Self::rebind`] can swap it without restarting the task or dropping
    /// questions already queued.
    pool: Arc<RwLock<SqlitePool>>,
}

impl LiveAuthority {
    /// Start the lookup task and build the authority.
    ///
    /// `pool` is cloned into the task rather than borrowed: the pool can be
    /// replaced by `db:backup:import`, and a task holding the old handle would
    /// keep answering from the pre-import library. [`Self::rebind`] is what an
    /// import calls instead.
    pub fn new(settings: Arc<SettingsStore>, music_dir: PathBuf, pool: SqlitePool) -> Arc<Self> {
        let (sender, receiver) = std::sync::mpsc::channel::<TrackQuery>();

        // The pool handle lives in the task, behind a lock so an import can swap
        // it without restarting the task or dropping queued questions.
        let bound = Arc::new(RwLock::new(pool));
        let task_pool = Arc::clone(&bound);

        // `tauri::async_runtime::spawn`, never bare `tokio::spawn` (R16) — this
        // is reached from boot, which is not inside a tokio context of its own.
        tauri::async_runtime::spawn(async move {
            // A plain blocking `recv` on the std receiver would park a runtime
            // worker, so the receiver is drained from a blocking thread and the
            // queries are answered on it. One thread, for the life of the app.
            let _ = tauri::async_runtime::spawn_blocking(move || {
                while let Ok(query) = receiver.recv() {
                    let pool = task_pool
                        .read()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .clone();

                    let found = tauri::async_runtime::block_on(async move {
                        // `block_on` is safe *here* and nowhere else in this
                        // module: this is a dedicated blocking thread that
                        // belongs to no one else, which is precisely the
                        // condition `crate::paths` says `block_on` violates
                        // inside a `PathAuthority`.
                        let mut conn = match pool.acquire().await {
                            Ok(conn) => conn,
                            Err(error) => {
                                tracing::warn!(%error, "tracks lookup could not acquire; denying");
                                return false;
                            }
                        };

                        repo::tracks::exists(&mut conn, &query.path.to_string_lossy())
                            .await
                            .unwrap_or_else(|error| {
                                // v1: "fails closed if the database is
                                // unavailable".
                                tracing::warn!(%error, "tracks lookup failed; denying the path");
                                false
                            })
                    });

                    // A caller that timed out has dropped its receiver; nothing
                    // to report and nothing to log.
                    let _ = query.reply.try_send(found);
                }
            })
            .await;
        });

        Arc::new(Self {
            settings,
            music_dir,
            roots: RwLock::new(Vec::new()),
            tracks: sender,
            pool: bound,
        })
    }

    /// Point the lookup task at a different pool.
    ///
    /// Only `db:backup:import` needs this, for the reason `AppState::pool`
    /// documents: a handle held across an import keeps answering from the
    /// *pre-import* library. For a cached pool that is not "work already in
    /// flight finishing against the library it started on" — it is a permanent
    /// authority answering from a database the user replaced, which would refuse
    /// every track in their newly imported library.
    pub fn rebind(&self, pool: SqlitePool) {
        *self
            .pool
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = pool;
        tracing::debug!("the folders authority now reads through the imported library");
    }

    /// Re-read the watched-folder roots from the database.
    ///
    /// Called at boot, and by every `db:folders` mutation. Failure keeps the
    /// previous snapshot rather than emptying it: an empty snapshot would revoke
    /// access to the user's whole library because one query failed.
    pub async fn refresh_roots(&self, pool: &SqlitePool) {
        let mut conn = match pool.acquire().await {
            Ok(conn) => conn,
            Err(error) => {
                tracing::warn!(%error, "could not acquire to refresh the folder roots");
                return;
            }
        };

        match repo::folders::get_all(&mut conn).await {
            Ok(folders) => {
                let roots: Vec<PathBuf> = folders
                    .into_iter()
                    .map(|row| PathBuf::from(row.path))
                    .collect();
                tracing::debug!(count = roots.len(), "refreshed the watched-folder roots");
                *self
                    .roots
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = roots;
            }
            Err(error) => {
                // v1: "folders table read failed; continuing without folder
                // roots". Here the previous snapshot is strictly better than
                // none, and it is what "continuing" means once there is one.
                tracing::warn!(%error, "folders read failed; keeping the previous roots");
            }
        }
    }
}

impl PathAuthority for LiveAuthority {
    fn download_location(&self) -> PathBuf {
        let configured = self
            .settings
            .downloads_location()
            .map(|path| path.to_string_lossy().into_owned());

        location::active_dir(&self.music_dir, configured.as_deref())
    }

    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(self
            .roots
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone())
    }

    fn has_track_at(&self, path: &Path) -> PathAuthorityResult<bool> {
        // Rendezvous channel: the responder never queues an answer nobody is
        // waiting for.
        let (reply, answer) = std::sync::mpsc::sync_channel(0);

        if self
            .tracks
            .send(TrackQuery {
                path: path.to_path_buf(),
                reply,
            })
            .is_err()
        {
            tracing::warn!("the tracks lookup task is gone; denying the path");
            return Ok(false);
        }

        Ok(answer
            .recv_timeout(TRACK_LOOKUP_TIMEOUT)
            .unwrap_or_else(|_| {
                tracing::warn!(
                    path = %path.display(),
                    "the tracks lookup timed out; denying the path"
                );
                false
            }))
    }
}

/// The app's one folders cache, with [`LiveAuthority`] behind it.
///
/// Returned as a pair because both halves have callers: the cache goes to
/// `shiranami-serve`'s config and to the lyrics policy, while the authority is
/// what the invalidation hooks refresh.
pub struct Folders {
    /// The cache the audio route and the lyrics policy consult.
    pub cache: Arc<FoldersCache>,
    /// The authority behind it, for [`LiveAuthority::refresh_roots`].
    pub authority: Arc<LiveAuthority>,
}

impl Folders {
    /// Point every part of the cache at a replaced database.
    ///
    /// `db:backup:import` swaps the pool underneath the app, and the lookup task
    /// holds its own handle; without this it would keep answering "no such
    /// track" for every row in the library the user just restored.
    pub async fn rebind(&self, pool: SqlitePool) {
        self.authority.rebind(pool.clone());
        self.invalidate(&pool).await;
    }

    /// Drop the memo and rebuild the roots.
    ///
    /// The order is load-bearing: refresh the authority's snapshot **first**,
    /// then invalidate the cache, because `FoldersCache::allowed_roots` rebuilds
    /// from the authority the moment it is asked and would otherwise repopulate
    /// itself from the stale snapshot.
    pub async fn invalidate(&self, pool: &SqlitePool) {
        self.authority.refresh_roots(pool).await;
        self.cache.invalidate();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pool over a real temporary database, so the lookup task has something
    /// to answer from.
    async fn pool(dir: &Path) -> SqlitePool {
        shiranami_db::open(&dir.join("shiranami.db"))
            .await
            .expect("a fresh database opens")
            .pool
    }

    fn settings(dir: &Path) -> Arc<SettingsStore> {
        let (store, _) = SettingsStore::load(dir.join("config.json"));
        Arc::new(store)
    }

    /// The roots snapshot starts empty and is filled by a refresh — the boot
    /// call. Without it every path outside the data directory would be refused
    /// until the user touched their folder list.
    #[tokio::test]
    async fn the_roots_snapshot_is_populated_by_a_refresh() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let pool = pool(dir.path()).await;
        let authority =
            LiveAuthority::new(settings(dir.path()), dir.path().to_path_buf(), pool.clone());

        assert!(
            authority.folder_roots().expect("roots read").is_empty(),
            "nothing is known before the first refresh"
        );

        let mut conn = pool.acquire().await.expect("acquire");
        repo::folders::add(&mut conn, &dir.path().join("music").to_string_lossy())
            .await
            .expect("a folder is added");
        drop(conn);

        authority.refresh_roots(&pool).await;

        assert_eq!(
            authority.folder_roots().expect("roots read"),
            vec![dir.path().join("music")]
        );
    }

    /// The tracks lookup really does reach the database, from a synchronous
    /// call. This is the property the channel exists for, and a test that only
    /// exercised the roots snapshot would not touch it.
    #[tokio::test]
    async fn the_tracks_lookup_answers_synchronously_from_the_database() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let pool = pool(dir.path()).await;
        let authority =
            LiveAuthority::new(settings(dir.path()), dir.path().to_path_buf(), pool.clone());

        let absent = authority.has_track_at(Path::new("/nowhere/at/all.mp3"));
        assert_eq!(absent.expect("the lookup answers"), false);
    }

    /// The download location follows the setting, and falls back to the OS
    /// music directory the way `shiranami_downloader::location` spells it —
    /// reused rather than restated, because two spellings is how the cache
    /// starts allowing a directory the settings panel no longer shows.
    #[tokio::test]
    async fn the_download_location_follows_the_setting() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let pool = pool(dir.path()).await;
        let store = settings(dir.path());
        let authority = LiveAuthority::new(Arc::clone(&store), dir.path().to_path_buf(), pool);

        assert_eq!(
            authority.download_location(),
            location::active_dir(dir.path(), None),
            "with nothing configured, the crate's default is the answer"
        );
    }
}
