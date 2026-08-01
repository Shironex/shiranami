//! The real [`ProcessRunner`], over `tokio::process`.
//!
//! Four hardening decisions live here, three of them ported and one new:
//!
//! - **No shell, ever.** `Command` takes an argv array, so there is no quoting
//!   layer for a video title with a `;` in it to escape from.
//! - **`kill_on_drop(true)` on every child** (architecture §2.3, R20). Windows
//!   does not clean up orphans the way a Unix process group does, and a yt-dlp
//!   left running after the app quits keeps writing into the downloads folder.
//! - **`stdin` is `/dev/null`.** v1 inherited it. A child that decides to prompt
//!   — yt-dlp does, for some extractor logins — then blocks forever on a
//!   terminal nobody is watching. Nightcore's known "implicit stdin-EOF
//!   shutdown" gap, closed explicitly here.
//! - **Both pipes are drained concurrently.** Reading stdout to completion
//!   before touching stderr deadlocks the moment the child fills the stderr
//!   pipe buffer, which is exactly what a verbose failure does.

use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio_util::sync::CancellationToken;

use crate::spawn::runner::{
    Capture, LineSink, ProcessError, ProcessOutput, ProcessRunner, ProcessSpec, accumulate,
};

/// A single line this long with no terminator is not a line, it is a stream
/// that forgot to end one. Flushed as-is so nothing is lost, then the buffer
/// resets — the alternative is holding a child's entire output in memory while
/// waiting for a `\n` that is never coming.
const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Runs children with `tokio::process`.
#[derive(Debug, Clone, Copy, Default)]
pub struct TokioRunner;

impl TokioRunner {
    /// A runner over the real operating system.
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl ProcessRunner for TokioRunner {
    async fn run(
        &self,
        spec: ProcessSpec,
        lines: Option<&(dyn LineSink + '_)>,
        cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        // A token already cancelled must not spawn. v1 checked `signal.aborted`
        // before every spawn for the same reason: the window between a user's
        // cancel and the scheduler reaching this task is where a process gets
        // started that nobody will ever look at.
        if cancel.is_cancelled() {
            return Err(ProcessError::Cancelled);
        }

        let mut child = Command::new(&spec.program)
            .args(&spec.args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|source| ProcessError::Spawn {
                program: spec.program.clone(),
                source,
            })?;

        tracing::debug!(
            program = %spec.program.display(),
            argc = spec.args.len(),
            "spawned child process"
        );

        let outcome = wait_for(&mut child, &spec, lines, cancel).await;

        if outcome.as_ref().err().is_some_and(|error| {
            matches!(
                error,
                ProcessError::Cancelled | ProcessError::Timeout { .. }
            )
        }) {
            // `kill_on_drop` would do this when `child` falls out of scope, but
            // doing it here makes the kill part of the call rather than part of
            // the caller's stack unwinding, and reaps the zombie before we
            // return instead of on a background task.
            let _ = child.start_kill();
            let _ = child.wait().await;
        }

        outcome
    }
}

/// Drain both pipes, wait for the child, and race that against the deadline and
/// the cancellation token.
async fn wait_for(
    child: &mut Child,
    spec: &ProcessSpec,
    lines: Option<&(dyn LineSink + '_)>,
    cancel: &CancellationToken,
) -> Result<ProcessOutput, ProcessError> {
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    let collect = async {
        // Joined, not sequenced: a child that fills the stderr pipe while we
        // are still reading stdout blocks on the write and never exits.
        let (stdout, stderr) = tokio::join!(
            pump(&mut stdout_pipe, spec.stdout, lines),
            pump(&mut stderr_pipe, spec.stderr, None),
        );
        let (stdout, stdout_truncated) = stdout?;
        let (stderr, stderr_truncated) = stderr?;
        let status = child.wait().await?;

        Ok::<_, std::io::Error>(ProcessOutput {
            stdout,
            stderr,
            // v1's `code ?? 1`: a child killed by a signal reports no code, and
            // every consumer branches on `code != 0`. A signalled child did not
            // succeed.
            code: status.code().unwrap_or(1),
            truncated: stdout_truncated || stderr_truncated,
        })
    };

    let deadline = spec.timeout;
    let result = tokio::select! {
        biased;
        () = cancel.cancelled() => return Err(ProcessError::Cancelled),
        () = sleep_for(deadline) => {
            return Err(ProcessError::Timeout {
                program: spec.program.clone(),
                // Only reachable when a deadline was set, so the `unwrap_or`
                // names a duration that cannot be observed.
                timeout: deadline.unwrap_or_default(),
            });
        }
        result = collect => result,
    };

    result.map_err(|source| ProcessError::Io {
        program: spec.program.clone(),
        source,
    })
}

/// Complete after `timeout`, or never when there is none.
///
/// A branch that never resolves is how `select!` expresses "this arm is not in
/// play", without a second `select!` for the timeout-less case.
async fn sleep_for(timeout: Option<Duration>) {
    match timeout {
        Some(timeout) => tokio::time::sleep(timeout).await,
        None => std::future::pending().await,
    }
}

/// Read one pipe to EOF, capturing under `capture` and notifying `lines`.
///
/// Lines are decoded whole. Decoding each 8 KiB read instead would mangle any
/// multi-byte character unlucky enough to straddle a read boundary — which is
/// not hypothetical here, because the strings this parses out of yt-dlp's
/// stdout are file paths built from video titles.
async fn pump<R>(
    pipe: &mut Option<R>,
    capture: Capture,
    lines: Option<&(dyn LineSink + '_)>,
) -> std::io::Result<(String, bool)>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut captured = String::new();
    let mut truncated = false;

    let Some(pipe) = pipe.as_mut() else {
        return Ok((captured, truncated));
    };

    let mut chunk = [0_u8; 8192];
    let mut pending: Vec<u8> = Vec::new();

    loop {
        let read = pipe.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        pending.extend_from_slice(&chunk[..read]);

        while let Some(at) = pending.iter().position(|byte| *byte == b'\n') {
            let raw: Vec<u8> = pending.drain(..=at).collect();
            let line = decode_line(&raw);
            emit(&mut captured, &mut truncated, capture, lines, &line);
        }

        if pending.len() > MAX_LINE_BYTES {
            let raw = std::mem::take(&mut pending);
            let line = decode_line(&raw);
            emit(&mut captured, &mut truncated, capture, lines, &line);
            truncated = true;
        }
    }

    // Whatever the child wrote without a final newline.
    if !pending.is_empty() {
        let line = decode_line(&pending);
        emit(&mut captured, &mut truncated, capture, lines, &line);
    }

    Ok((captured, truncated))
}

/// Decode one raw line, dropping its terminator.
///
/// Lossy because a child's output is not ours to validate: yt-dlp forwards
/// filesystem bytes, and on Linux those need not be UTF-8 at all. Refusing to
/// decode would turn a downloaded file with an odd name into a failed download.
fn decode_line(raw: &[u8]) -> String {
    let mut text = String::from_utf8_lossy(raw).into_owned();
    while text.ends_with('\n') || text.ends_with('\r') {
        text.pop();
    }
    text
}

/// Record one line in the capture buffer and hand it to the sink.
fn emit(
    captured: &mut String,
    truncated: &mut bool,
    capture: Capture,
    lines: Option<&(dyn LineSink + '_)>,
    line: &str,
) {
    if let Some(sink) = lines {
        sink.line(line);
    }
    *truncated |= accumulate(captured, line, capture);
    *truncated |= accumulate(captured, "\n", capture);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Mutex;

    /// A sink that remembers every line, so a test can assert on what the
    /// progress parser would have seen.
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

    /// `/bin/sh` is not the shell we refuse to spawn *through* — it is just a
    /// convenient program that exists on both CI runners and writes what it is
    /// told. The point of the refusal is that a URL never becomes part of a
    /// command string, and these tests never make one.
    fn shell(script: &str) -> ProcessSpec {
        ProcessSpec::capturing(
            PathBuf::from("/bin/sh"),
            vec!["-c".to_owned(), script.to_owned()],
        )
    }

    #[tokio::test]
    async fn captures_both_streams_and_the_exit_code() {
        let output = TokioRunner::new()
            .run(
                shell("echo out; echo err 1>&2; exit 3"),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect("the child runs");

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
                shell("printf '[download]  12.3%%\\n[download] 100.0%%\\n'"),
                Some(&recorder),
                &CancellationToken::new(),
            )
            .await
            .expect("the child runs");

        assert_eq!(
            recorder.lines(),
            vec!["[download]  12.3%", "[download] 100.0%"],
            "the download runner parses progress from lines while the child is \
             still running, so the sink must see them split and terminator-free"
        );
        assert_eq!(output.code, 0);
    }

    #[tokio::test]
    async fn a_child_that_outlives_its_timeout_is_killed() {
        let error = TokioRunner::new()
            .run(
                shell("sleep 30").with_timeout(Duration::from_millis(50)),
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
            .run(shell("sleep 30"), None, &cancel)
            .await
            .expect_err("cancellation wins");

        assert!(error.is_cancelled());
    }

    #[tokio::test]
    async fn a_token_cancelled_up_front_never_spawns_anything() {
        let cancel = CancellationToken::new();
        cancel.cancel();

        let error = TokioRunner::new()
            .run(
                // A path that cannot be spawned: reaching the spawn at all
                // would surface as `Spawn`, not `Cancelled`.
                ProcessSpec::capturing(PathBuf::from("/nonexistent/binary"), Vec::new()),
                None,
                &cancel,
            )
            .await
            .expect_err("an already-cancelled run refuses");

        assert!(error.is_cancelled());
    }

    #[tokio::test]
    async fn a_missing_executable_fails_as_a_spawn_error() {
        let error = TokioRunner::new()
            .run(
                ProcessSpec::capturing(PathBuf::from("/nonexistent/binary"), Vec::new()),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect_err("nothing to run");

        assert!(matches!(error, ProcessError::Spawn { .. }));
    }

    #[tokio::test]
    async fn a_discarding_spec_keeps_nothing_but_still_drains_the_pipe() {
        let output = TokioRunner::new()
            .run(
                ProcessSpec::silent(
                    PathBuf::from("/bin/sh"),
                    vec!["-c".to_owned(), "echo noisy; exit 0".to_owned()],
                ),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect("the child runs");

        assert!(output.stdout.is_empty());
        assert_eq!(output.code, 0, "the child still exited cleanly");
    }

    #[tokio::test]
    async fn arguments_reach_the_child_as_argv_entries_not_as_a_command_string() {
        // A single argument containing shell metacharacters. If anything on the
        // way built a command string, `;` would start a second command and the
        // output would not be this one literal line.
        let output = TokioRunner::new()
            .run(
                ProcessSpec::capturing(
                    PathBuf::from("/bin/echo"),
                    vec!["a; rm -rf /; echo b".to_owned()],
                ),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect("the child runs");

        assert_eq!(output.stdout, "a; rm -rf /; echo b\n");
    }
}
