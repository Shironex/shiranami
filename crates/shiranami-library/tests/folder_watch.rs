//! The folder watcher's lifecycle: start, update, stop.
//!
//! Two halves. The fake-backend tests pin the rules that must not depend on how
//! fast an OS delivers events: which folders are watched and unwatched as the
//! root set changes, that a folder which fails to watch is retried, that a
//! lost-events signal is scoped, that stop is clean and bounded. The real-backend test proves the whole chain against `notify` in a
//! temp dir, with generous deadlines so a slow CI machine waits rather than
//! fails.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use shiranami_library::watch::{
    EventSender, FolderWatcher, RawEvent, RawKind, STOP_TIMEOUT, Timing, WatchBackend, WatchRoot,
};

/// Short enough that a test finishes in well under a second of waiting.
const FAST: Timing = Timing {
    quiet: Duration::from_millis(100),
    stable_for: Duration::from_millis(100),
    give_up_after: Duration::from_secs(30),
    tick: Duration::from_millis(20),
    rearm: None,
};

/// Generous, because a missed deadline here is a flaky test, not a finding.
const DEADLINE: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Eq)]
enum Call {
    Watch(PathBuf),
    Unwatch(PathBuf),
}

/// Records every call, fails to watch any path in `refuse`, and hands the test
/// the sender so it can inject events as though from the OS.
#[derive(Clone, Default)]
struct Fake {
    calls: Arc<Mutex<Vec<Call>>>,
    refuse: Arc<Mutex<Vec<PathBuf>>>,
    events: Arc<Mutex<Option<EventSender>>>,
}

impl Fake {
    fn calls(&self) -> Vec<Call> {
        self.calls.lock().expect("calls").clone()
    }

    fn sender(&self) -> EventSender {
        self.events
            .lock()
            .expect("sender")
            .clone()
            .expect("the watcher has started")
    }

    fn send(&self, kind: RawKind, path: &Path) {
        self.sender().event(RawEvent {
            kind,
            paths: vec![path.to_path_buf()],
        });
    }
}

impl WatchBackend for Fake {
    fn watch(&mut self, path: &Path) -> Result<(), String> {
        self.calls
            .lock()
            .expect("calls")
            .push(Call::Watch(path.to_path_buf()));
        if self
            .refuse
            .lock()
            .expect("refuse")
            .iter()
            .any(|p| p == path)
        {
            return Err("refused".to_owned());
        }
        Ok(())
    }

    fn unwatch(&mut self, path: &Path) {
        self.calls
            .lock()
            .expect("calls")
            .push(Call::Unwatch(path.to_path_buf()));
    }
}

fn start_fake(fake: &Fake) -> (FolderWatcher, mpsc::Receiver<Vec<String>>) {
    start_fake_with(fake, FAST)
}

fn start_fake_with(fake: &Fake, timing: Timing) -> (FolderWatcher, mpsc::Receiver<Vec<String>>) {
    let (batches, received) = mpsc::channel();
    let handle = fake.clone();
    let watcher = FolderWatcher::start(
        timing,
        Box::new(move |ids| {
            let _ = batches.send(ids);
        }),
        move |events| {
            *handle.events.lock().expect("sender") = Some(events);
            Ok(handle)
        },
    )
    .expect("the watcher starts");
    (watcher, received)
}

fn root(id: &str, path: &Path) -> WatchRoot {
    WatchRoot {
        id: id.to_owned(),
        path: path.to_path_buf(),
    }
}

/// Wait until the worker has processed every message sent so far, by sending a
/// root update and waiting for the fake to see its watch call.
fn settle(fake: &Fake, expected_calls: usize) {
    let started = std::time::Instant::now();
    while fake.calls().len() < expected_calls {
        assert!(started.elapsed() < DEADLINE, "the worker never caught up");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn roots_are_watched_updated_rearmed_and_released() {
    let a = tempfile::tempdir().expect("a");
    let b = tempfile::tempdir().expect("b");
    let fake = Fake::default();
    let (watcher, _batches) = start_fake(&fake);

    watcher.set_roots(vec![root("a", a.path()), root("b", b.path())]);
    settle(&fake, 2);
    watcher.set_roots(vec![root("b", b.path())]);
    settle(&fake, 5);
    watcher.stop();

    let (a, b) = (a.path().to_path_buf(), b.path().to_path_buf());
    assert_eq!(
        fake.calls(),
        [
            Call::Watch(a.clone()),
            Call::Watch(b.clone()),
            Call::Unwatch(a),
            // A kept root is re-armed on every refresh, in case the OS dropped
            // its watch without saying so.
            Call::Unwatch(b.clone()),
            Call::Watch(b.clone()),
            Call::Unwatch(b),
        ],
        "a removed root is released, a kept one re-armed, and stop releases the rest"
    );
}

#[test]
fn a_folder_that_cannot_be_watched_is_retried_on_the_next_update() {
    let a = tempfile::tempdir().expect("a");
    let fake = Fake::default();
    fake.refuse
        .lock()
        .expect("refuse")
        .push(a.path().to_path_buf());
    let (watcher, _batches) = start_fake(&fake);

    watcher.set_roots(vec![root("a", a.path())]);
    settle(&fake, 1);
    fake.refuse.lock().expect("refuse").clear();
    watcher.set_roots(vec![root("a", a.path())]);
    settle(&fake, 2);
    watcher.stop();

    assert_eq!(
        fake.calls(),
        [
            Call::Watch(a.path().to_path_buf()),
            Call::Watch(a.path().to_path_buf()),
            Call::Unwatch(a.path().to_path_buf()),
        ],
        "the failed watch did not count as watched, so it was tried again, and only the success is released"
    );
}

#[test]
fn a_change_is_reported_once_for_its_folder_and_not_after_the_folder_is_dropped() {
    let a = tempfile::tempdir().expect("a");
    let b = tempfile::tempdir().expect("b");
    let fake = Fake::default();
    let (watcher, batches) = start_fake(&fake);
    watcher.set_roots(vec![root("a", a.path()), root("b", b.path())]);
    settle(&fake, 2);

    // A removed track: settled at once, so only the quiet window applies.
    fake.send(RawKind::Remove, &a.path().join("gone.mp3"));
    fake.send(RawKind::Remove, &a.path().join("also-gone.flac"));
    fake.send(RawKind::Modify, &b.path().join("cover.jpg"));
    assert_eq!(
        batches.recv_timeout(DEADLINE).expect("a batch"),
        ["a"],
        "two removals are one batch, and cover art is not a change"
    );

    fake.send(RawKind::Remove, &b.path().join("gone.mp3"));
    watcher.set_roots(vec![root("a", a.path())]);
    assert!(
        batches.recv_timeout(Duration::from_millis(500)).is_err(),
        "a pending batch for a folder that stopped being watched is dropped"
    );
    watcher.stop();
}

#[test]
fn a_folder_that_has_gone_missing_is_not_reported() {
    let a = tempfile::tempdir().expect("a");
    let missing = a.path().join("unplugged");
    std::fs::create_dir(&missing).expect("mkdir");
    let fake = Fake::default();
    let (watcher, batches) = start_fake(&fake);
    watcher.set_roots(vec![root("drive", &missing)]);
    settle(&fake, 1);

    std::fs::remove_dir(&missing).expect("unplug");
    fake.send(RawKind::Remove, &missing.join("song.mp3"));

    assert!(
        batches.recv_timeout(Duration::from_millis(500)).is_err(),
        "rescanning an absent folder would delete its tracks from the library"
    );
    watcher.stop();
}

#[test]
fn stop_is_idempotent_and_drop_after_stop_is_fine() {
    let fake = Fake::default();
    let (watcher, _batches) = start_fake(&fake);
    watcher.stop();
    watcher.stop();
    drop(watcher);
}

/// The real chain: `notify`, the OS, the size gate, the sink.
#[test]
fn a_file_written_into_a_real_watched_folder_is_reported() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let (batches, received) = mpsc::channel();
    let watcher = FolderWatcher::start_native(
        FAST,
        Box::new(move |ids| {
            let _ = batches.send(ids);
        }),
    )
    .expect("the native watcher starts");
    watcher.set_roots(vec![root("music", dir.path())]);

    // FSEvents starts delivering a moment after the stream is created; a file
    // written before that is not seen. Keep writing until something arrives.
    let started = std::time::Instant::now();
    let mut attempt = 0;
    let batch = loop {
        attempt += 1;
        std::fs::write(dir.path().join(format!("track-{attempt}.mp3")), b"ID3")
            .expect("write a track");
        if let Ok(batch) = received.recv_timeout(Duration::from_secs(1)) {
            break batch;
        }
        assert!(started.elapsed() < DEADLINE, "no batch arrived");
    };
    assert_eq!(batch, ["music"]);

    watcher.stop();
    // Drain anything already in flight, then prove nothing more arrives.
    while received.recv_timeout(Duration::from_millis(300)).is_ok() {}
    std::fs::write(dir.path().join("after-stop.mp3"), b"ID3").expect("write");
    assert!(
        received.recv_timeout(Duration::from_millis(500)).is_err(),
        "a stopped watcher reports nothing"
    );
}

#[test]
fn a_lost_events_signal_covers_only_the_watched_folder_it_names() {
    let a = tempfile::tempdir().expect("a");
    let b = tempfile::tempdir().expect("b");
    let refused = tempfile::tempdir().expect("refused");
    let fake = Fake::default();
    fake.refuse
        .lock()
        .expect("refuse")
        .push(refused.path().to_path_buf());
    let (watcher, batches) = start_fake(&fake);
    watcher.set_roots(vec![
        root("a", a.path()),
        root("b", b.path()),
        root("refused", refused.path()),
    ]);
    settle(&fake, 3);

    fake.sender().rescan(vec![a.path().join("deep")]);
    assert_eq!(batches.recv_timeout(DEADLINE).expect("a batch"), ["a"]);

    fake.sender().rescan(Vec::new());
    assert_eq!(
        batches.recv_timeout(DEADLINE).expect("a batch"),
        ["a", "b"],
        "with no path, every watched folder, and never the one that failed to watch"
    );
    watcher.stop();
}

#[test]
fn existing_roots_are_rearmed_periodically_when_asked() {
    let a = tempfile::tempdir().expect("a");
    let fake = Fake::default();
    let (watcher, _batches) = start_fake_with(
        &fake,
        Timing {
            rearm: Some(Duration::from_millis(30)),
            ..FAST
        },
    );
    watcher.set_roots(vec![root("a", a.path())]);

    // One watch from the refresh, then at least two more from re-arming.
    settle(&fake, 5);
    watcher.stop();
    let watches = fake
        .calls()
        .iter()
        .filter(|call| matches!(call, Call::Watch(_)))
        .count();
    assert!(watches >= 3, "{:?}", fake.calls());
}

#[test]
fn stop_does_not_wait_forever_for_a_stuck_thread() {
    let a = tempfile::tempdir().expect("a");
    let fake = Fake::default();
    let handle = fake.clone();
    let (entered, stuck) = mpsc::channel();
    let watcher = FolderWatcher::start(
        FAST,
        // A sink that never returns stands in for a filesystem call on a dead
        // network share.
        Box::new(move |_| {
            let _ = entered.send(());
            std::thread::sleep(Duration::from_secs(30));
        }),
        move |events| {
            *handle.events.lock().expect("sender") = Some(events);
            Ok(handle)
        },
    )
    .expect("the watcher starts");
    watcher.set_roots(vec![root("a", a.path())]);
    settle(&fake, 1);
    fake.send(RawKind::Remove, &a.path().join("gone.mp3"));
    stuck.recv_timeout(DEADLINE).expect("the thread is stuck");

    let started = std::time::Instant::now();
    watcher.stop();
    assert!(
        started.elapsed() < STOP_TIMEOUT + Duration::from_secs(1),
        "stop returned after {:?}",
        started.elapsed()
    );
}
