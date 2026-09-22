//! A scripted Discord socket, and the service wired to it.
//!
//! The fake records every call it was asked to make and fails on demand, which
//! is what turns "Discord is not running" and "the socket dropped mid-session"
//! into ordinary test inputs rather than states nobody can arrange.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::sync::{Arc, Mutex};

use shiranami_core::models::{DiscordMusicPresenceActivity, DiscordRpcSettings};
use shiranami_core::notice::{NoticeGate, NoticeSink, SystemNotice};
use shiranami_core::store::SettingsStore;
use shiranami_core::sync::lock_or_recover;
use shiranami_integrations::discord::{
    DiscordPresence, PresencePayload, PresenceSocket, Pump, SocketError,
    settings as discord_settings,
};

/// What the fake socket was asked to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Call {
    Connect,
    SetActivity(Box<PresencePayload>),
    ClearActivity,
    Close,
}

#[derive(Default)]
pub(crate) struct SocketLog {
    calls: Vec<Call>,
    /// How many more `connect` calls should fail.
    failing_connects: usize,
    /// How many more `set_activity` calls should fail.
    failing_updates: usize,
}

/// A socket that records what it was asked and fails on demand.
#[derive(Clone)]
pub(crate) struct FakeSocket(Arc<Mutex<SocketLog>>);

impl FakeSocket {
    pub(crate) fn new() -> Self {
        Self(Arc::new(Mutex::new(SocketLog::default())))
    }

    fn log(&self) -> std::sync::MutexGuard<'_, SocketLog> {
        lock_or_recover(&self.0)
    }

    pub(crate) fn calls(&self) -> Vec<Call> {
        self.log().calls.clone()
    }

    pub(crate) fn fail_next_connects(&self, count: usize) {
        self.log().failing_connects = count;
    }

    pub(crate) fn fail_next_updates(&self, count: usize) {
        self.log().failing_updates = count;
    }

    pub(crate) fn activities(&self) -> Vec<PresencePayload> {
        self.calls()
            .into_iter()
            .filter_map(|call| match call {
                Call::SetActivity(payload) => Some(*payload),
                _ => None,
            })
            .collect()
    }
}

impl PresenceSocket for FakeSocket {
    fn connect(&mut self) -> Result<(), SocketError> {
        let mut log = self.log();
        log.calls.push(Call::Connect);
        if log.failing_connects > 0 {
            log.failing_connects -= 1;
            return Err(SocketError("discord is not running".to_owned()));
        }
        Ok(())
    }

    fn set_activity(&mut self, payload: &PresencePayload) -> Result<(), SocketError> {
        let mut log = self.log();
        log.calls.push(Call::SetActivity(Box::new(payload.clone())));
        if log.failing_updates > 0 {
            log.failing_updates -= 1;
            return Err(SocketError("broken pipe".to_owned()));
        }
        Ok(())
    }

    fn clear_activity(&mut self) -> Result<(), SocketError> {
        self.log().calls.push(Call::ClearActivity);
        Ok(())
    }

    fn close(&mut self) -> Result<(), SocketError> {
        self.log().calls.push(Call::Close);
        Ok(())
    }
}

/// Records the notices the gate lets through.
#[derive(Clone, Default)]
pub(crate) struct Notices(Arc<Mutex<Vec<SystemNotice>>>);

impl NoticeSink for Notices {
    fn deliver(&self, notice: &SystemNotice) {
        lock_or_recover(&self.0).push(notice.clone());
    }
}

impl Notices {
    pub(crate) fn count(&self) -> usize {
        lock_or_recover(&self.0).len()
    }
}

pub(crate) struct Harness {
    pub(crate) presence: DiscordPresence<FakeSocket, Notices>,
    pub(crate) socket: FakeSocket,
    pub(crate) notices: Notices,
    _dir: tempfile::TempDir,
}

/// A service with Rich Presence already switched on.
pub(crate) fn harness(enabled: bool) -> Harness {
    let dir = tempfile::tempdir().expect("a temp dir");
    let (store, _quarantined) = SettingsStore::load(dir.path().join("config.json"));
    let store = Arc::new(store);

    discord_settings::save(
        &store,
        &DiscordRpcSettings {
            enabled,
            ..DiscordRpcSettings::default()
        },
    )
    .expect("write the settings");

    let socket = FakeSocket::new();
    let notices = Notices::default();
    let gate = Arc::new(NoticeGate::new(notices.clone()));

    Harness {
        presence: DiscordPresence::new(store, socket.clone(), gate),
        socket,
        notices,
        _dir: dir,
    }
}

pub(crate) fn playing() -> DiscordMusicPresenceActivity {
    DiscordMusicPresenceActivity {
        is_playing: true,
        title: "Idol".to_owned(),
        artist: "Yoasobi".to_owned(),
        album: "THE BOOK 3".to_owned(),
        duration: 222.0,
        current_time: 60.0,
    }
}

/// A fixed instant. The pump takes its clock as an argument, so a test crosses
/// Discord's fifteen-second rate-limit window by adding to this rather than by
/// waiting fifteen seconds.
pub(crate) const NOW: i64 = 1_700_000_000_000;

/// One rate-limit window later.
pub(crate) const AFTER_WINDOW: i64 = NOW + 15_000;

/// Drive the pump at `now` until it goes idle, or `limit` steps have run.
pub(crate) async fn settle(harness: &Harness, now: i64, limit: usize) -> Pump {
    let mut last = Pump::Idle;
    for _ in 0..limit {
        last = harness.presence.pump(now).await;
        if last == Pump::Idle {
            break;
        }
    }
    last
}
