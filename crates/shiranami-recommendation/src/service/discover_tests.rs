//! `service::discover`'s unit tests, over a scripted process runner.
//!
//! Split from `discover.rs` and included with `#[path]` rather than left in it:
//! the two together run past lint:meta's module-shape cap, and of the two
//! halves the tests are the one that can move without splitting the fetch
//! across files. `tests/discover.rs` covers the same seam end to end against a
//! real capture; what lives here is the argv and the failure paths.

use super::*;
use shiranami_downloader::spawn::{ProcessError, ProcessOutput};

/// A runner that answers every run with the same output, and records the
/// argv it was handed.
struct Scripted {
    output: ProcessOutput,
    calls: std::sync::Mutex<Vec<Vec<String>>>,
}

impl Scripted {
    fn new(stdout: &str, code: i32) -> Self {
        Self {
            output: ProcessOutput {
                stdout: stdout.to_owned(),
                stderr: String::new(),
                code,
                truncated: false,
            },
            calls: std::sync::Mutex::new(Vec::new()),
        }
    }

    fn argv(&self) -> Vec<String> {
        self.calls
            .lock()
            .expect("the recorded argv")
            .first()
            .cloned()
            .unwrap_or_default()
    }
}

#[async_trait::async_trait]
impl ProcessRunner for Scripted {
    async fn run(
        &self,
        spec: ProcessSpec,
        _lines: Option<&(dyn shiranami_downloader::spawn::LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> std::result::Result<ProcessOutput, ProcessError> {
        self.calls.lock().expect("record the argv").push(spec.args);
        Ok(self.output.clone())
    }
}

/// A runner that refuses to start, as an absent or quarantined binary does.
struct Unstartable;

#[async_trait::async_trait]
impl ProcessRunner for Unstartable {
    async fn run(
        &self,
        spec: ProcessSpec,
        _lines: Option<&(dyn shiranami_downloader::spawn::LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> std::result::Result<ProcessOutput, ProcessError> {
        Err(ProcessError::Spawn {
            program: spec.program,
            source: std::io::Error::from(std::io::ErrorKind::NotFound),
        })
    }
}

/// A runner that reports the run as cancelled.
struct Cancels;

#[async_trait::async_trait]
impl ProcessRunner for Cancels {
    async fn run(
        &self,
        _spec: ProcessSpec,
        _lines: Option<&(dyn shiranami_downloader::spawn::LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> std::result::Result<ProcessOutput, ProcessError> {
        Err(ProcessError::Cancelled)
    }
}

fn fetcher_over(runner: Arc<dyn ProcessRunner>) -> DiscoverFetcher {
    DiscoverFetcher::new(runner, PathBuf::from("/data/bin/yt-dlp"))
}

async fn mix_of(runner: Arc<dyn ProcessRunner>, seed: &str) -> (Vec<DiscoverRecommendation>, bool) {
    let cancelled = AtomicBool::new(false);
    let items = fetcher_over(runner)
        .fetch_mix(seed, &CancellationToken::new(), &cancelled)
        .await;

    (items, cancelled.load(Ordering::Relaxed))
}

#[test]
fn the_mix_url_is_v1s_watch_url_with_the_rd_playlist() {
    assert_eq!(
        rd_mix_url("abc123"),
        "https://www.youtube.com/watch?v=abc123&list=RDabc123",
        "the bare `playlist?list=RD…` URL is unviewable, which is why v1 \
         built the watch form"
    );
}

/// The argv, spelled out. This is the fidelity claim the port rests on: v1
/// built `['--flat-playlist','--dump-json','--no-warnings']` inline and its
/// spawner added `--ignore-config` first and `--` before the URL.
#[tokio::test]
async fn the_argv_matches_v1s_rd_mix_invocation_exactly() {
    let runner = Arc::new(Scripted::new("", 0));
    let cancelled = AtomicBool::new(false);

    fetcher_over(Arc::clone(&runner) as Arc<dyn ProcessRunner>)
        .fetch_mix("abc123", &CancellationToken::new(), &cancelled)
        .await;

    assert_eq!(
        runner.argv(),
        vec![
            "--ignore-config",
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
            "--",
            "https://www.youtube.com/watch?v=abc123&list=RDabc123",
        ]
    );
}

/// The downloader crate's playlist argv and this one must stay the same
/// argv, because they are the same yt-dlp operation reached from two
/// callers.
#[test]
fn the_argv_is_the_downloader_crates_playlist_argv() {
    let url = rd_mix_url("abc123");

    assert_eq!(
        args::playlist(&url).expect("an http URL"),
        vec![
            "--ignore-config",
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
            "--",
            url.as_str(),
        ]
    );
}

#[tokio::test]
async fn a_non_zero_exit_yields_an_empty_mix_rather_than_an_error() {
    let runner = Arc::new(Scripted::new("", 1));

    let (items, cancelled) = mix_of(runner, "seed").await;

    assert!(items.is_empty());
    assert!(!cancelled, "a failure is not a cancellation");
}

#[tokio::test]
async fn a_binary_that_will_not_start_yields_an_empty_mix() {
    let (items, cancelled) = mix_of(Arc::new(Unstartable), "seed").await;

    assert!(items.is_empty());
    assert!(!cancelled);
}

#[tokio::test]
async fn a_cancelled_run_is_reported_apart_from_a_failed_one() {
    let (items, cancelled) = mix_of(Arc::new(Cancels), "seed").await;

    assert!(items.is_empty());
    assert!(
        cancelled,
        "an abandoned fan-out must not be cached as an empty shelf"
    );
}

#[tokio::test]
async fn an_unparseable_line_costs_only_that_line() {
    let stdout = concat!(
        r#"{"id":"a","title":"A","channel":"Chan","webpage_url":"https://youtu.be/a"}"#,
        "\n",
        "not json at all\n",
        r#"{"id":"b","title":"B","channel":"Chan","webpage_url":"https://youtu.be/b"}"#,
        "\n",
    );

    let (items, _) = mix_of(Arc::new(Scripted::new(stdout, 0)), "seed").await;

    assert_eq!(
        items
            .iter()
            .map(|item| &item.youtube_id)
            .collect::<Vec<_>>(),
        vec!["a", "b"]
    );
}

#[tokio::test]
async fn the_seed_and_id_less_entries_are_dropped() {
    let stdout = concat!(
        r#"{"id":"seed","title":"The seed"}"#,
        "\n",
        r#"{"title":"No id at all"}"#,
        "\n",
        r#"{"id":"keep","title":"Keep"}"#,
        "\n",
    );

    let (items, _) = mix_of(Arc::new(Scripted::new(stdout, 0)), "seed").await;

    assert_eq!(items.len(), 1);
    assert_eq!(items[0].youtube_id, "keep");
}

/// v1's `webpage_url || url` is a truthiness fallback: an empty
/// `webpage_url` falls through, where `??` would have kept it.
#[tokio::test]
async fn an_empty_webpage_url_falls_through_to_url() {
    let stdout = concat!(
        r#"{"id":"a","webpage_url":"","url":"https://youtu.be/a-direct"}"#,
        "\n",
        r#"{"id":"b","webpage_url":"https://youtu.be/b-watch","url":"https://youtu.be/b-direct"}"#,
        "\n",
    );

    let (items, _) = mix_of(Arc::new(Scripted::new(stdout, 0)), "seed").await;

    assert_eq!(items[0].url, "https://youtu.be/a-direct");
    assert_eq!(items[1].url, "https://youtu.be/b-watch");
}

/// The merge rules, over shapes the fetch cannot produce on its own: two
/// mixes offering the same video, a seed offered back, and a video the
/// library already has.
#[test]
fn the_merge_keeps_the_strongest_seeds_copy_and_drops_the_rest() {
    let item = |id: &str, title: &str| DiscoverRecommendation {
        youtube_id: id.to_owned(),
        title: title.to_owned(),
        uploader: "Chan".to_owned(),
        thumbnail: String::new(),
        url: format!("https://youtu.be/{id}"),
    };

    let merged = merge(
        vec![
            vec![
                item("shared", "from the strongest seed"),
                item("only-a", "A"),
            ],
            vec![
                item("shared", "from the weaker seed"),
                item("seed-2", "a seed offered back"),
                item("owned", "already in the library"),
                item("only-b", "B"),
            ],
        ],
        &["seed-1".to_owned(), "seed-2".to_owned()],
        &std::collections::HashSet::from(["owned".to_owned()]),
    );

    assert_eq!(
        merged
            .iter()
            .map(|item| item.youtube_id.as_str())
            .collect::<Vec<_>>(),
        vec!["shared", "only-a", "only-b"]
    );
    assert_eq!(
        merged[0].title, "from the strongest seed",
        "seed order is what decides which mix's copy of a shared video wins"
    );
}

#[test]
fn the_merge_stops_at_v1s_cap_across_every_mix() {
    let mix: Vec<DiscoverRecommendation> = (0..20)
        .map(|index| DiscoverRecommendation {
            youtube_id: format!("v{index}"),
            title: String::new(),
            uploader: String::new(),
            thumbnail: String::new(),
            url: String::new(),
        })
        .collect();
    let second: Vec<DiscoverRecommendation> = (20..40)
        .map(|index| DiscoverRecommendation {
            youtube_id: format!("v{index}"),
            title: String::new(),
            uploader: String::new(),
            thumbnail: String::new(),
            url: String::new(),
        })
        .collect();

    let merged = merge(vec![mix, second], &[], &std::collections::HashSet::new());

    assert_eq!(merged.len(), DISCOVER_MAX_ITEMS);
    assert_eq!(merged[DISCOVER_MAX_ITEMS - 1].youtube_id, "v23");
}

#[test]
fn the_two_caps_are_v1s() {
    assert_eq!(DISCOVER_MAX_ITEMS, 24);
    assert_eq!(DISCOVER_CONCURRENCY, 4);
}
