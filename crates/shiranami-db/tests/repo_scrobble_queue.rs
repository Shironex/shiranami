//! The scrobble retry queue's state machine, against a real database.
//!
//! v1's equivalent (`scrobble-queue.test.ts`) tested a pure function over an
//! array. The transitions are identical here; what the array could not be tested
//! for, and what these tests add, is that a parked play survives the process
//! that parked it.

#[path = "support/activity.rs"]
mod activity;

use shiranami_db::repo::scrobble_queue::{
    self, MAX_ATTEMPTS, MAX_QUEUE_SIZE, QueuedScrobble, ScrobbleTargets, backoff_ms,
};

use activity::{Fixture, open_at};

/// A minute, in milliseconds — the unit `next_attempt_at` is measured in.
const MINUTE_MS: i64 = 60_000;

/// A parked scrobble due immediately, as the enqueue path creates one.
fn parked(id: &str, started_at: i64, targets: ScrobbleTargets) -> QueuedScrobble {
    QueuedScrobble {
        id: id.to_owned(),
        artist: "Kaze".to_owned(),
        track: format!("Track {id}"),
        album: Some("Nagare".to_owned()),
        duration_seconds: Some(210),
        started_at,
        targets,
        attempts: 0,
        next_attempt_at: 0,
        enqueued_at: started_at * 1_000,
    }
}

async fn queue_with(items: &[QueuedScrobble]) -> Fixture {
    let mut fixture = activity::fresh().await;
    for item in items {
        scrobble_queue::enqueue(fixture.conn(), item)
            .await
            .expect("park the scrobble");
    }
    fixture
}

#[tokio::test]
async fn a_parked_scrobble_reads_back_field_for_field() {
    let item = parked("a", 1_700_000_000, ScrobbleTargets::BOTH);
    let mut fixture = queue_with(std::slice::from_ref(&item)).await;

    let loaded = scrobble_queue::load(fixture.conn())
        .await
        .expect("load the queue");

    assert_eq!(loaded, vec![item]);
}

/// The whole point of migration `0002`. v1 kept this array in process memory, so
/// quitting the app while offline threw away every play that had not landed.
#[tokio::test]
async fn a_parked_scrobble_survives_closing_the_database() {
    let item = parked("a", 1_700_000_000, ScrobbleTargets::LASTFM);
    let fixture = queue_with(std::slice::from_ref(&item)).await;

    let dir = fixture.close().await;
    let mut reopened = open_at(dir).await;

    assert_eq!(
        scrobble_queue::load(reopened.conn())
            .await
            .expect("load after reopening"),
        vec![item]
    );
}

/// v1's `enqueue` appended unconditionally, so re-parking a play the queue
/// already held — same content, hence the same id — put two copies in the array
/// and submitted it twice on the next flush.
#[tokio::test]
async fn re_parking_the_same_play_updates_it_rather_than_duplicating_it() {
    let first = parked("a", 1_700_000_000, ScrobbleTargets::BOTH);
    let mut fixture = queue_with(std::slice::from_ref(&first)).await;

    let second = QueuedScrobble {
        targets: ScrobbleTargets::LISTENBRAINZ,
        enqueued_at: first.enqueued_at + 5_000,
        ..first.clone()
    };
    scrobble_queue::enqueue(fixture.conn(), &second)
        .await
        .expect("re-park the scrobble");

    let loaded = scrobble_queue::load(fixture.conn())
        .await
        .expect("load the queue");
    assert_eq!(loaded.len(), 1, "one play, one row");
    assert_eq!(loaded[0].targets, ScrobbleTargets::LISTENBRAINZ);
    assert_eq!(
        loaded[0].enqueued_at, first.enqueued_at,
        "a re-parked play keeps its place in the eviction order"
    );
}

#[tokio::test]
async fn only_due_scrobbles_come_back_and_the_oldest_play_comes_first() {
    let mut later = parked("later", 2_000, ScrobbleTargets::BOTH);
    let mut earlier = parked("earlier", 1_000, ScrobbleTargets::BOTH);
    let mut pending = parked("pending", 500, ScrobbleTargets::BOTH);
    later.next_attempt_at = 10_000;
    earlier.next_attempt_at = 10_000;
    pending.next_attempt_at = 90_000;

    let mut fixture = queue_with(&[later, earlier, pending]).await;

    let due = scrobble_queue::due(fixture.conn(), 10_000)
        .await
        .expect("read the due scrobbles");

    let ids: Vec<&str> = due.iter().map(|item| item.id.as_str()).collect();
    assert_eq!(
        ids,
        vec!["earlier", "later"],
        "a scrobble not yet due stays parked, and the rest replay in play order"
    );
}

#[tokio::test]
async fn a_failed_retry_narrows_the_targets_and_backs_off() {
    let mut fixture = queue_with(&[parked("a", 1_000, ScrobbleTargets::BOTH)]).await;

    let kept = scrobble_queue::mark_retried(fixture.conn(), "a", ScrobbleTargets::LASTFM, 500_000)
        .await
        .expect("record the failed retry");
    assert!(kept, "the row survives a first failure");

    let loaded = scrobble_queue::load(fixture.conn())
        .await
        .expect("load the queue");
    assert_eq!(loaded[0].attempts, 1);
    assert_eq!(
        loaded[0].targets,
        ScrobbleTargets::LASTFM,
        "a backend that succeeded stops owing the scrobble"
    );
    assert_eq!(
        loaded[0].next_attempt_at,
        500_000 + 2 * MINUTE_MS,
        "the first retry waits two minutes — `backoff_ms` sees the incremented count"
    );
}

/// v1 dropped an item whose remaining-target list came back empty, which is the
/// success path: every backend took it.
#[tokio::test]
async fn a_retry_that_leaves_no_backend_owing_drops_the_row() {
    let mut fixture = queue_with(&[parked("a", 1_000, ScrobbleTargets::BOTH)]).await;

    let kept = scrobble_queue::mark_retried(fixture.conn(), "a", ScrobbleTargets::NONE, 0)
        .await
        .expect("record the retry");

    assert!(!kept);
    assert_eq!(
        scrobble_queue::count(fixture.conn()).await.expect("count"),
        0
    );
}

/// The full ladder, so the drop lands on the attempt v1 dropped on rather than
/// one either side of it.
#[tokio::test]
async fn a_scrobble_is_dropped_once_it_exhausts_its_attempts() {
    let mut fixture = queue_with(&[parked("a", 1_000, ScrobbleTargets::LASTFM)]).await;

    for attempt in 1..MAX_ATTEMPTS {
        let kept =
            scrobble_queue::mark_retried(fixture.conn(), "a", ScrobbleTargets::LASTFM, 1_000_000)
                .await
                .expect("record the failed retry");
        assert!(kept, "attempt {attempt} should still be retried later");

        let loaded = scrobble_queue::load(fixture.conn())
            .await
            .expect("load the queue");
        assert_eq!(loaded[0].attempts, attempt);
        assert_eq!(
            loaded[0].next_attempt_at,
            1_000_000 + backoff_ms(attempt),
            "attempt {attempt} is rescheduled on the ported curve"
        );
    }

    let kept =
        scrobble_queue::mark_retried(fixture.conn(), "a", ScrobbleTargets::LASTFM, 1_000_000)
            .await
            .expect("record the final failed retry");
    assert!(!kept, "the {MAX_ATTEMPTS}th failure gives up");
    assert_eq!(
        scrobble_queue::count(fixture.conn()).await.expect("count"),
        0
    );
}

/// A flush can race an eviction, so the id it reports on may already be gone.
/// v1's `flatMap` over a missing id was a no-op; so is this.
#[tokio::test]
async fn retrying_a_scrobble_that_is_already_gone_is_a_no_op() {
    let mut fixture = queue_with(&[parked("a", 1_000, ScrobbleTargets::BOTH)]).await;

    let kept = scrobble_queue::mark_retried(fixture.conn(), "ghost", ScrobbleTargets::BOTH, 0)
        .await
        .expect("record the retry");

    assert!(!kept);
    assert_eq!(
        scrobble_queue::count(fixture.conn()).await.expect("count"),
        1,
        "the real row is untouched"
    );
}

#[tokio::test]
async fn a_landed_scrobble_is_removed_and_stops_being_counted() {
    let mut fixture = queue_with(&[
        parked("a", 1_000, ScrobbleTargets::BOTH),
        parked("b", 2_000, ScrobbleTargets::BOTH),
    ])
    .await;

    scrobble_queue::remove(fixture.conn(), "a")
        .await
        .expect("drop the landed scrobble");

    assert_eq!(
        scrobble_queue::count(fixture.conn()).await.expect("count"),
        1
    );
    assert_eq!(
        scrobble_queue::load(fixture.conn())
            .await
            .expect("load the queue")[0]
            .id,
        "b"
    );
}

/// v1 spliced the front of the array once it passed the cap. The oldest parked
/// play is the one most likely to be stale, and the cap is what stops a long
/// offline stretch from growing the table without bound.
#[tokio::test]
async fn passing_the_cap_evicts_the_oldest_parked_scrobbles() {
    let mut fixture = activity::fresh().await;

    for index in 0..MAX_QUEUE_SIZE + 3 {
        let position = i64::try_from(index).expect("a small index");
        let mut item = parked(
            &format!("s{index:04}"),
            1_000 + position,
            ScrobbleTargets::BOTH,
        );
        item.enqueued_at = position;
        scrobble_queue::enqueue(fixture.conn(), &item)
            .await
            .expect("park the scrobble");
    }

    let loaded = scrobble_queue::load(fixture.conn())
        .await
        .expect("load the queue");

    assert_eq!(loaded.len(), MAX_QUEUE_SIZE);
    assert_eq!(
        loaded.first().map(|item| item.id.as_str()),
        Some("s0003"),
        "the three oldest were evicted"
    );
    assert_eq!(
        loaded.last().map(|item| item.id.as_str()),
        Some(&format!("s{:04}", MAX_QUEUE_SIZE + 2)[..]),
        "the newest is kept"
    );
}

#[tokio::test]
async fn clearing_empties_the_queue() {
    let mut fixture = queue_with(&[
        parked("a", 1_000, ScrobbleTargets::BOTH),
        parked("b", 2_000, ScrobbleTargets::LASTFM),
    ])
    .await;

    scrobble_queue::clear(fixture.conn())
        .await
        .expect("clear the queue");

    assert_eq!(
        scrobble_queue::count(fixture.conn()).await.expect("count"),
        0
    );
    assert!(
        scrobble_queue::load(fixture.conn())
            .await
            .expect("load the queue")
            .is_empty()
    );
}

/// The optional columns are genuinely optional: a radio play has no album and
/// often no duration, and both APIs accept a submission without them.
#[tokio::test]
async fn a_play_without_an_album_or_a_duration_round_trips() {
    let item = QueuedScrobble {
        album: None,
        duration_seconds: None,
        ..parked("a", 1_000, ScrobbleTargets::LISTENBRAINZ)
    };
    let mut fixture = queue_with(std::slice::from_ref(&item)).await;

    assert_eq!(
        scrobble_queue::load(fixture.conn())
            .await
            .expect("load the queue"),
        vec![item]
    );
}
