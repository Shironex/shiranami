//! The listener under test and a fake phone that talks to it.
//!
//! The fake phone does exactly what the Android client will: it starts from
//! the QR payload string, parses it, proves the pairing, derives its device
//! secret, and signs every request. Nothing here reaches into the server's
//! state except the desktop-side calls a real user would make through the UI
//! (open a pairing window, answer Allow / Deny, revoke a device).

#![allow(dead_code, unreachable_pub, clippy::unwrap_used)]

use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use shiranami_core::paths::FoldersCache;
use shiranami_core::paths::authority::{PathAuthority, PathAuthorityResult};
use shiranami_sync::auth::{
    NonceCache, authorization_header, b64, device_secret, pair_proof, random_bytes, unb64,
};
use shiranami_sync::wire::PairResponse;
use shiranami_sync::{BindPolicy, PairingLink, SyncConfig, SyncServer};
use sqlx::SqlitePool;
use tempfile::TempDir;

struct TestAuthority {
    downloads: PathBuf,
    folders: Vec<PathBuf>,
}

impl PathAuthority for TestAuthority {
    fn download_location(&self) -> PathBuf {
        self.downloads.clone()
    }
    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(self.folders.clone())
    }
    fn has_track_at(&self, _path: &Path) -> PathAuthorityResult<bool> {
        Ok(false)
    }
}

fn config(
    pool: &SqlitePool,
    folders: &Arc<FoldersCache>,
    art: &Path,
    nonces: &Arc<NonceCache>,
    require_approval: bool,
) -> SyncConfig {
    let source = pool.clone();
    let mut config = SyncConfig::new(
        Arc::new(move || source.clone()),
        Arc::clone(folders),
        art.to_owned(),
        "Test Desktop".to_owned(),
        "0.0.0-test".to_owned(),
    );
    config.bind = BindPolicy::Addresses(vec![Ipv4Addr::LOCALHOST]);
    config.advertise = false;
    config.require_approval = require_approval;
    config.nonces = Arc::clone(nonces);
    config
}

/// A running listener over a fresh database and temp folders.
pub struct Harness {
    pub server: SyncServer,
    pub pool: SqlitePool,
    pub base: String,
    /// The allowed music root.
    pub music: TempDir,
    /// Not an allowed root.
    pub outside: TempDir,
    pub art: TempDir,
    /// Outlives a [`Harness::restart`], as the app's does.
    pub nonces: Arc<NonceCache>,
    folders: Arc<FoldersCache>,
    require_approval: bool,
    _data: TempDir,
}

impl Harness {
    pub async fn start() -> Self {
        Self::start_with(false).await
    }

    pub async fn start_with(require_approval: bool) -> Self {
        let data = TempDir::new().unwrap();
        let music = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let art = TempDir::new().unwrap();
        let opened = shiranami_db::open(&data.path().join("shiranami.db"))
            .await
            .unwrap();
        let pool = opened.pool;

        let folders = Arc::new(FoldersCache::new(
            data.path().to_owned(),
            Arc::new(TestAuthority {
                downloads: data.path().join("downloads"),
                folders: vec![music.path().to_owned()],
            }),
        ));
        let nonces = Arc::new(NonceCache::default());
        let server = shiranami_sync::start(config(
            &pool,
            &folders,
            art.path(),
            &nonces,
            require_approval,
        ))
        .await
        .unwrap();
        let base = format!("http://127.0.0.1:{}", server.port());
        Self {
            server,
            pool,
            base,
            music,
            outside,
            art,
            nonces,
            folders,
            require_approval,
            _data: data,
        }
    }

    /// Stop the listener and start a new one over the same database and the
    /// same replay cache, as switching sync off and on does in the app. The
    /// port changes; point phones at the new [`Harness::base`].
    pub async fn restart(&mut self) {
        self.server.shutdown().await;
        self.server = shiranami_sync::start(config(
            &self.pool,
            &self.folders,
            self.art.path(),
            &self.nonces,
            self.require_approval,
        ))
        .await
        .unwrap();
        self.base = format!("http://127.0.0.1:{}", self.server.port());
    }

    /// Open a pairing window and return the QR payload.
    pub fn qr(&self) -> String {
        self.server
            .start_pairing(Duration::from_secs(300))
            .deep_link
    }

    /// Pair a fake phone through the QR, with approval off.
    pub async fn paired_phone(&self) -> Phone {
        let link = self.qr();
        Phone::pair(&link, "Pixel 8").await.unwrap()
    }

    pub async fn exec(&self, sql: &str) {
        sqlx::query(sqlx::AssertSqlSafe(sql.to_owned()))
            .execute(&self.pool)
            .await
            .unwrap();
    }

    /// Write an audio fixture under the music root and register it as a track.
    pub async fn add_track(&self, id: &str, file: &str, bytes: &[u8], extra: &str) -> PathBuf {
        let path = self.music.path().join(file);
        std::fs::write(&path, bytes).unwrap();
        self.insert_track(id, &path, extra).await;
        path
    }

    pub async fn insert_track(&self, id: &str, path: &Path, extra: &str) {
        let (columns, values) = extra.split_once('|').unwrap_or(("", ""));
        let sql = format!(
            "INSERT INTO tracks (id, file_path, title{columns}) VALUES ('{id}', '{}', 'Title {id}'{values})",
            path.display().to_string().replace('\'', "''")
        );
        self.exec(&sql).await;
    }
}

/// What a phone gets back from a request.
#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub headers: reqwest::header::HeaderMap,
    pub body: Vec<u8>,
}

impl Reply {
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_slice(&self.body).unwrap()
    }
}

/// A paired fake phone.
pub struct Phone {
    pub base: String,
    pub device_id: String,
    pub secret: [u8; 32],
    pub client: reqwest::Client,
    pub paired: PairResponse,
}

/// Send the pairing request for `link` and return the raw response.
pub async fn send_pair(link: &str, name: &str, proof_override: Option<&str>) -> Reply {
    let parsed = PairingLink::parse(link).expect("the QR parses");
    let secret = unb64(&parsed.secret).unwrap();
    let proof = proof_override.map_or_else(
        || pair_proof(&secret, &parsed.nonce, name, "android"),
        str::to_owned,
    );
    let body = serde_json::json!({
        "nonce": parsed.nonce,
        "deviceName": name,
        "platform": "android",
        "proof": proof,
    });
    let url = format!("http://{}:{}/v1/sync/pair", parsed.hosts[0], parsed.port);
    let response = reqwest::Client::new()
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    Reply {
        status,
        headers,
        body: response.bytes().await.unwrap().to_vec(),
    }
}

impl Phone {
    /// Pair from a QR payload. `Err` carries the refusing status.
    pub async fn pair(link: &str, name: &str) -> Result<Self, Reply> {
        let parsed = PairingLink::parse(link).expect("the QR parses");
        let pairing_secret = unb64(&parsed.secret).unwrap();
        let reply = send_pair(link, name, None).await;
        if reply.status != 200 {
            return Err(reply);
        }
        let paired: PairResponse = serde_json::from_slice(&reply.body).unwrap();
        Ok(Self {
            base: format!("http://{}:{}", parsed.hosts[0], parsed.port),
            secret: device_secret(&pairing_secret, &paired.device_id),
            device_id: paired.device_id.clone(),
            client: reqwest::Client::new(),
            paired,
        })
    }

    pub fn now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    pub fn nonce() -> String {
        b64(&random_bytes::<16>())
    }

    /// The signed header for `method path`.
    pub fn auth(&self, method: &str, path: &str) -> String {
        authorization_header(
            &self.device_id,
            &self.secret,
            method,
            path,
            Self::now(),
            &Self::nonce(),
            b"",
        )
    }

    pub async fn send(
        &self,
        method: &str,
        path: &str,
        auth: Option<String>,
        extra: &[(&str, &str)],
    ) -> Reply {
        let method_value = reqwest::Method::from_bytes(method.as_bytes()).unwrap();
        let mut request = self
            .client
            .request(method_value, format!("{}{path}", self.base));
        if let Some(auth) = auth {
            request = request.header("authorization", auth);
        }
        for (name, value) in extra {
            request = request.header(*name, *value);
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        Reply {
            status,
            headers,
            body: response.bytes().await.unwrap().to_vec(),
        }
    }

    pub async fn get(&self, path: &str) -> Reply {
        self.send("GET", path, Some(self.auth("GET", path)), &[])
            .await
    }

    pub async fn get_with(&self, path: &str, extra: &[(&str, &str)]) -> Reply {
        self.send("GET", path, Some(self.auth("GET", path)), extra)
            .await
    }
}
