//! What [`TokioRunner`] does with a real child process, on every platform.
//!
//! These were unit tests in `src/spawn/tokio_runner.rs` and spawned `/bin/sh`.
//! That made them Unix-only without saying so: all six failed the first time
//! the Rust suite was run on Windows, which was months after they were written,
//! because CI only ever ran `cargo test` on Linux.
//!
//! They live here rather than back in the module because the fix is a helper
//! binary, and `CARGO_BIN_EXE_<name>` is only set for integration tests. What
//! they lose by moving is access to private items — nothing they used was
//! private — and what they gain is running on the platform the downloader
//! actually spawns `yt-dlp` on, where process kill and pipe draining are not
//! the same syscalls at all.
//!
//! The unit tests that need no child (a token cancelled before the spawn, the
//! capture-limit arithmetic) stayed where they were.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use shiranami_downloader::spawn::runner::{
    LineSink, ProcessError, ProcessRunner as _, ProcessSpec,
};
use shiranami_downloader::spawn::tokio_runner::TokioRunner;
use tokio_util::sync::CancellationToken;

/// The portable child. See `tests/helpers/spawn_helper.rs`.
fn helper(mode: &str, args: &[&str]) -> ProcessSpec {
    let mut argv = vec![mode.to_owned()];
    argv.extend(args.iter().map(|arg| (*arg).to_owned()));
    ProcessSpec::capturing(PathBuf::from(env!("CARGO_BIN_EXE_spawn_helper")), argv)
}

/// A sink that remembers every line, so a test can assert on what the progress
/// parser would have seen.
#[derive(Default)]
struct Recorder {
    lines: Mutex<Vec<String>>,
}

impl Recorder {
    fn lines(&self) -> Vec<String> {
        self.lines
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

impl LineSink for Recorder {
    fn line(&self, line: &str) {
        self.lines
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(line.to_owned());
    }
}

#[tokio::test]
async fn captures_both_streams_and_the_exit_code() {
    let output = TokioRunner::new()
        .run(helper("streams", &[]), None, &CancellationToken::new())
        .await
        .expect("the child runs");

    // `\n` and not `\r\n` on Windows too: the helper writes through Rust's
    // `println!`, which does no line-ending translation. Borrowing someone
    // else's `echo` is what would have made this platform-dependent.
    assert_eq!(output.stdout, "out\n");
    assert_eq!(output.stderr, "err\n");
    assert_eq!(output.code, 3);
    assert!(!output.truncated);
}

#[tokio::test]
async fn streams_stdout_lines_to_the_sink_as_they_arrive() {
    let recorder = Recorder::default();

    let output = TokioRunner::new()
        .run(
            helper("lines", &[]),
            Some(&recorder),
            &CancellationToken::new(),
        )
        .await
        .expect("the child runs");

    assert_eq!(
        recorder.lines(),
        vec!["line 0", "line 1", "line 2"],
        "the download runner parses progress from lines while the child is \
         still running, so the sink must see them split and terminator-free"
    );
    assert_eq!(output.code, 0);
}

#[tokio::test]
async fn a_child_that_outlives_its_timeout_is_killed() {
    let error = TokioRunner::new()
        .run(
            helper("sleep", &[]).with_timeout(Duration::from_millis(50)),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect_err("the deadline fires");

    assert!(matches!(error, ProcessError::Timeout { .. }));
    assert!(
        !error.is_cancelled(),
        "a timeout must not be mistaken for the user's own cancel"
    );
}

#[tokio::test]
async fn cancelling_mid_run_kills_the_child_and_reports_cancellation() {
    let cancel = CancellationToken::new();
    let token = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        token.cancel();
    });

    let error = TokioRunner::new()
        .run(helper("sleep", &[]), None, &cancel)
        .await
        .expect_err("cancellation wins");

    assert!(error.is_cancelled());
}

#[tokio::test]
async fn a_discarding_spec_keeps_nothing_but_still_drains_the_pipe() {
    let mut spec = ProcessSpec::silent(
        PathBuf::from(env!("CARGO_BIN_EXE_spawn_helper")),
        vec!["lines".to_owned()],
    );
    spec = spec.with_timeout(Duration::from_secs(30));

    let output = TokioRunner::new()
        .run(spec, None, &CancellationToken::new())
        .await
        .expect("the child runs");

    assert!(output.stdout.is_empty());
    assert_eq!(output.code, 0, "the child still exited cleanly");
}

#[tokio::test]
async fn arguments_reach_the_child_as_argv_entries_not_as_a_command_string() {
    // A single argument containing shell metacharacters. If anything on the way
    // built a command string, `;` would start a second command and the output
    // would not be this one literal line.
    //
    // Worth more on Windows than anywhere: there is no `argv` at the OS level,
    // only a command line the child re-parses, so "we never build a command
    // string" is a claim about std's quoting as much as about this crate's.
    let output = TokioRunner::new()
        .run(
            helper("echo", &["a; rm -rf /; echo b"]),
            None,
            &CancellationToken::new(),
        )
        .await
        .expect("the child runs");

    assert_eq!(output.stdout, "a; rm -rf /; echo b\n");
}
