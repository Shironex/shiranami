//! How an enrich run behaves: concurrency, ordering, cancellation, failure
//! isolation, and the shape of the progress it reports.
//!
//! What each track *decides* lives in `enrich_fields.rs`; this file is about
//! the run around it. Split because the workspace caps a module at 400 code
//! lines, and the two halves fail for genuinely different reasons.
//!
//! v1's 730-line suite covered this ground against a mocked lookup. These run
//! against a real loopback socket, so the request the batch would actually
//! issue is part of what is asserted — `a_cancelled_run_issues_no_requests`
//! could not be written at all against a mock.

#[path = "support/enrich.rs"]
mod support;

use shiranami_metadata::enrich::{ENRICH_CONCURRENCY, EnrichOptions, EnrichStatus};
use shiranami_metadata::lookup::LookupSource;
use support::{NO_RESULTS, Reply, matching, run, track};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn a_cancelled_run_returns_fewer_results_than_it_was_given() {
    // v1 filters cancelled slots out entirely rather than reporting them as
    // failures, so the array is genuinely shorter than its input.
    let tracks: Vec<_> = (0..ENRICH_CONCURRENCY + 4)
        .map(|index| track(index, "Song"))
        .collect();

    let cancel = CancellationToken::new();
    cancel.cancel();

    let (results, recorder, _server) = run(
        vec![Reply::ok(NO_RESULTS)],
        &tracks,
        EnrichOptions::default(),
        &cancel,
    )
    .await;

    assert!(results.is_empty(), "a pre-cancelled run does no work");
    assert!(results.len() < tracks.len());
    assert_eq!(
        recorder.count(EnrichStatus::Cancelled),
        1,
        "the cancelled event is emitted once per run, not once per abandoned track"
    );
}

#[tokio::test]
async fn a_cancelled_run_issues_no_requests() {
    let tracks: Vec<_> = (0..4).map(|index| track(index, "Song")).collect();
    let cancel = CancellationToken::new();
    cancel.cancel();

    let (_results, _recorder, server) = run(
        vec![Reply::ok(NO_RESULTS)],
        &tracks,
        EnrichOptions::default(),
        &cancel,
    )
    .await;

    assert_eq!(
        server.received(),
        0,
        "a queued track whose turn arrives after the cancel must do no work"
    );
}

#[tokio::test]
async fn results_come_back_in_input_order() {
    // Four tracks are in flight at once, so completion order is not input
    // order, and the caller matches results to rows by position.
    let tracks = vec![track(1, "First"), track(2, "Second"), track(3, "Third")];

    let (results, _recorder, _server) = run(
        vec![
            Reply::ok(NO_RESULTS),
            Reply::ok(NO_RESULTS),
            Reply::ok(NO_RESULTS),
        ],
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    let ids: Vec<_> = results.iter().map(|result| result.id.as_str()).collect();
    let expected: Vec<_> = tracks.iter().map(|track| track.id.as_str()).collect();
    assert_eq!(ids, expected);
}

#[tokio::test]
async fn one_failure_does_not_abort_the_batch() {
    // The property that makes a 2,000-track run survivable.
    let tracks = vec![track(1, "Fails"), track(2, "Succeeds")];

    let (results, recorder, _server) = run(
        vec![Reply::failing(500, "boom"), Reply::ok(NO_RESULTS)],
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert_eq!(results.len(), 2, "both tracks produced a result");
    assert!(!results[0].success);
    assert!(results[0].error.is_some());
    assert!(recorder.count(EnrichStatus::Error) >= 1);
}

#[tokio::test]
async fn a_track_with_no_match_reports_v1s_message() {
    let (results, _recorder, _server) = run(
        vec![Reply::ok(NO_RESULTS)],
        &[track(1, "Nothing Matches This")],
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    let result = &results[0];
    assert!(!result.success);
    assert_eq!(result.source, LookupSource::None);
    assert_eq!(result.error.as_deref(), Some("No metadata found"));
    assert!(result.updated_fields.is_empty());
}

#[tokio::test]
async fn every_track_gets_a_searching_event_and_one_terminal_event() {
    let tracks = vec![track(1, "One"), track(2, "Two")];

    let (_results, recorder, _server) = run(
        vec![Reply::ok(NO_RESULTS), Reply::ok(NO_RESULTS)],
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert_eq!(recorder.count(EnrichStatus::Searching), 2);
    assert_eq!(
        recorder.count(EnrichStatus::Done) + recorder.count(EnrichStatus::Error),
        2,
        "each track ends exactly once"
    );
}

#[tokio::test]
async fn the_first_progress_event_has_v1s_shape() {
    // v1's test deep-equals exactly these four fields, so `confidence` and
    // `source` must be absent on anything that is not a `done` event.
    let tracks = vec![track(1, "Song 1"), track(2, "Song 2")];

    let (_results, recorder, _server) = run(
        vec![Reply::ok(NO_RESULTS), Reply::ok(NO_RESULTS)],
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    let first = recorder.events().into_iter().next().expect("an event");
    assert_eq!(first.status, EnrichStatus::Searching);
    assert_eq!(first.current, 1);
    assert_eq!(first.total, 2);
    assert_eq!(first.track_name, "Song 1");
    assert_eq!(first.confidence, None);
    assert_eq!(first.source, None);
}

#[tokio::test]
async fn a_done_event_carries_the_confidence_and_source() {
    let (_results, recorder, _server) = run(
        vec![Reply::ok(&matching("Song"))],
        &[track(1, "Song")],
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    let done = recorder
        .events()
        .into_iter()
        .find(|event| event.status == EnrichStatus::Done)
        .expect("a done event");

    assert!(done.confidence.is_some(), "v1 populates this on done only");
    assert_eq!(done.source, Some(LookupSource::Itunes));
}

#[tokio::test]
async fn the_completed_counter_never_goes_backwards() {
    // Several tracks finish concurrently, and the renderer's progress bar
    // reads `current` directly — a counter that stuttered would make it jump.
    let tracks: Vec<_> = (0..6).map(|index| track(index, "Song")).collect();
    let replies: Vec<_> = (0..6).map(|_| Reply::ok(NO_RESULTS)).collect();

    let (_results, recorder, _server) = run(
        replies,
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    let terminal: Vec<usize> = recorder
        .events()
        .into_iter()
        .filter(|event| matches!(event.status, EnrichStatus::Done | EnrichStatus::Error))
        .map(|event| event.current)
        .collect();

    let mut sorted = terminal.clone();
    sorted.sort_unstable();
    assert_eq!(terminal, sorted, "terminal `current` must be monotonic");
    assert_eq!(terminal.last().copied(), Some(6));
}

#[tokio::test]
async fn an_in_flight_current_never_exceeds_the_total() {
    let tracks: Vec<_> = (0..3).map(|index| track(index, "Song")).collect();
    let replies: Vec<_> = (0..3).map(|_| Reply::ok(NO_RESULTS)).collect();

    let (_results, recorder, _server) = run(
        replies,
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    for event in recorder.events() {
        // `downloading` is emitted without counters, as in v1.
        if event.status == EnrichStatus::Downloading {
            continue;
        }
        assert!(
            event.current <= event.total,
            "current {} exceeded total {}",
            event.current,
            event.total
        );
    }
}

#[tokio::test]
async fn an_empty_input_is_an_empty_run() {
    let (results, recorder, server) = run(
        vec![],
        &[],
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert!(results.is_empty());
    assert!(recorder.events().is_empty());
    assert_eq!(server.received(), 0);
}

#[tokio::test]
async fn more_tracks_than_the_concurrency_limit_all_complete() {
    // Not a timing assertion. A broken `buffered` bound shows up here as a
    // deadlock or as a result count that does not match the input.
    let tracks: Vec<_> = (0..ENRICH_CONCURRENCY * 3)
        .map(|index| track(index, "Song"))
        .collect();
    let replies: Vec<_> = tracks.iter().map(|_| Reply::ok(NO_RESULTS)).collect();

    let (results, _recorder, server) = run(
        replies,
        &tracks,
        EnrichOptions::default(),
        &CancellationToken::new(),
    )
    .await;

    assert_eq!(results.len(), tracks.len());
    assert_eq!(server.received(), tracks.len());
}
