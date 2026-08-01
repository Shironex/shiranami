//! A yt-dlp that answers whatever the test says, and records what it was asked.
//!
//! `SearchService` is a concrete struct rather than a trait, and it does not
//! need to be one: its dependency on the outside world is
//! [`ProcessRunner`](shiranami_downloader::spawn::ProcessRunner), which *is* a
//! trait and is public. So the share path is exercised end to end — argument
//! construction, the `ytsearch` prefix, the JSON-line parsing, the miss
//! handling — with no yt-dlp installed and no network, which is what keeps CI
//! hermetic.
//!
//! Recording the query rather than only the call count is what lets the
//! assembly tests assert *which* track searched. "One search ran" and "the
//! uncached track searched" are different claims, and only the second one
//! catches a loop that resolved the wrong row.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use shiranami_downloader::search::SearchService;
use shiranami_downloader::spawn::{LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec};
use shiranami_net::HttpClient;
use tokio_util::sync::CancellationToken;

/// What a scripted run answers with.
enum Answer {
    /// Exit 0 with one JSON line carrying this id.
    Found(String),
    /// Exit 0 with no output — a query yt-dlp matched nothing for.
    Empty,
    /// Exit 1, the shape `classify_failure` reads.
    Failed,
}

/// A [`ProcessRunner`] that never spawns anything.
pub(crate) struct ScriptedYtDlp {
    answer: Answer,
    queries: Mutex<Vec<String>>,
}

impl ScriptedYtDlp {
    /// Answers with one result carrying `youtube_id`.
    ///
    /// An empty `youtube_id` is a legitimate script: yt-dlp's parser defaults an
    /// absent `id` to `""`, and that is the case v1's falsy `!youtubeId` test
    /// was for.
    pub(crate) fn finding(youtube_id: &str) -> Self {
        Self::with(Answer::Found(youtube_id.to_owned()))
    }

    /// Answers with no results.
    pub(crate) fn finding_nothing() -> Self {
        Self::with(Answer::Empty)
    }

    /// Exits non-zero, as an absent or broken yt-dlp does.
    pub(crate) fn failing() -> Self {
        Self::with(Answer::Failed)
    }

    /// A script for a path that must not search.
    ///
    /// Answers "nothing found" rather than panicking, deliberately: a violated
    /// expectation then surfaces as `queries()` being non-empty — an assertion
    /// naming what happened — instead of a panic inside an `await` whose
    /// backtrace points at the runner.
    pub(crate) fn never_called() -> Self {
        Self::with(Answer::Empty)
    }

    fn with(answer: Answer) -> Self {
        Self {
            answer,
            queries: Mutex::new(Vec::new()),
        }
    }

    /// Every query yt-dlp was asked for, in order, with the `ytsearch<n>:`
    /// prefix stripped.
    pub(crate) fn queries(&self) -> Vec<String> {
        self.queries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
}

#[async_trait::async_trait]
impl ProcessRunner for ScriptedYtDlp {
    async fn run(
        &self,
        spec: ProcessSpec,
        _lines: Option<&(dyn LineSink + '_)>,
        _cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        if let Some(query) = spec.args.last().and_then(|arg| arg.split_once(':')) {
            self.queries
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .push(query.1.to_owned());
        }

        Ok(match &self.answer {
            Answer::Found(id) => ProcessOutput {
                stdout: serde_json::json!({ "id": id, "title": "Result" }).to_string(),
                code: 0,
                ..ProcessOutput::default()
            },
            Answer::Empty => ProcessOutput::default(),
            Answer::Failed => ProcessOutput {
                stderr: "ERROR: yt-dlp is not installed".to_owned(),
                code: 1,
                ..ProcessOutput::default()
            },
        })
    }
}

/// A [`SearchService`] over `script`, plus a handle on the script.
///
/// The yt-dlp path is a placeholder that is never opened, because the scripted
/// runner is what would have opened it.
pub(crate) fn scripted_search(script: ScriptedYtDlp) -> (SearchService, Arc<ScriptedYtDlp>) {
    let script = Arc::new(script);
    let service = SearchService::new(
        Arc::clone(&script) as Arc<dyn ProcessRunner>,
        Arc::new(HttpClient::new().expect("the shared client builds")),
        PathBuf::from("/nonexistent/yt-dlp"),
    );
    (service, script)
}
