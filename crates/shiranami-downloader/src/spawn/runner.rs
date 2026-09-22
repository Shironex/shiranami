//! The child-process seam: what a run is, and what running one can do to you.
//!
//! Everything this crate learns from yt-dlp, ffmpeg and `xattr` comes through
//! [`ProcessRunner`]. It is a trait rather than a free function for one reason
//! that pays for itself immediately: the download queue's state machine has to
//! be tested against `done`, `error` and `canceled` transitions, and none of
//! those tests should need a real yt-dlp on the machine running them.
//!
//! # Bounded capture, and why the two streams disagree
//!
//! v1 accumulated both streams into unbounded strings (`stdout += data`), which
//! is fine until the day a playlist page or a `--list-formats` run decides
//! otherwise. v2 bounds both — but *differently*, because the consumers want
//! different halves:
//!
//! - **stdout keeps its head.** Its readers are `--dump-json` (parsed from the
//!   first line onward) and `--get-url` (reads line one). Dropping the tail of
//!   an implausibly large dump loses entries; dropping the head loses
//!   everything.
//! - **stderr keeps its tail.** Its only reader is the failure classifier,
//!   which itself calls [`crate::spawn::classify::tail_output`]. The last lines
//!   are the error; the first lines are `[debug]` noise.
//!
//! Truncation is recorded rather than hidden, so a caller that genuinely needs
//! the whole stream can say so instead of silently parsing a fragment.

use std::path::PathBuf;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

/// How much of one stream to keep, and which end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capture {
    /// Keep the first `limit` bytes; discard what follows.
    Head {
        /// Byte ceiling.
        limit: usize,
    },
    /// Keep the last `limit` bytes; discard what precedes.
    Tail {
        /// Byte ceiling.
        limit: usize,
    },
    /// Read the stream and keep none of it.
    ///
    /// For a run whose output is only ever an exit status — `xattr -d`, or a
    /// probe for a system ffmpeg. Still *read*, never merely closed: a child
    /// writing to a closed pipe takes `SIGPIPE` instead of exiting cleanly.
    Discard,
}

/// A dump of yt-dlp JSON is the one output that can legitimately be large: a
/// 5,000-entry `--flat-playlist` run is a few megabytes of newline JSON.
///
/// 64 MiB is roughly two orders of magnitude above the largest plausible one,
/// which is the point — the cap exists to bound a pathological case, not to
/// trim a realistic one.
pub const STDOUT_LIMIT: usize = 64 * 1024 * 1024;

/// Diagnostics are read through a 20-line / 2 KiB tail, so a megabyte is
/// already far more than any consumer looks at.
pub const STDERR_LIMIT: usize = 1024 * 1024;

/// One child process to run.
#[derive(Debug, Clone)]
pub struct ProcessSpec {
    /// Absolute path to the executable. Never a bare name resolved through a
    /// shell, and never a shell.
    pub program: PathBuf,
    /// Arguments, already built. Each element is one argv entry — the
    /// separation is what makes argument injection a *parsing* question this
    /// crate answers in [`crate::spawn::args`] rather than a quoting question
    /// nobody answers correctly.
    pub args: Vec<String>,
    /// Kill the child if it has not exited by then.
    ///
    /// `None` where v1 set no timeout: a playlist extraction over a slow link
    /// legitimately takes minutes, and a deadline there would surface as a
    /// mysterious failure on exactly the connections that need it most.
    pub timeout: Option<Duration>,
    /// How much stdout to keep.
    pub stdout: Capture,
    /// How much stderr to keep.
    pub stderr: Capture,
}

impl ProcessSpec {
    /// A run whose output is parsed: large head on stdout, tail on stderr.
    pub fn capturing(program: PathBuf, args: Vec<String>) -> Self {
        Self {
            program,
            args,
            timeout: None,
            stdout: Capture::Head {
                limit: STDOUT_LIMIT,
            },
            stderr: Capture::Tail {
                limit: STDERR_LIMIT,
            },
        }
    }

    /// A run whose output is only ever an exit status.
    pub fn silent(program: PathBuf, args: Vec<String>) -> Self {
        Self {
            program,
            args,
            timeout: None,
            stdout: Capture::Discard,
            stderr: Capture::Discard,
        }
    }

    /// Kill the child after `timeout`.
    #[must_use]
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }
}

/// What a finished child left behind.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ProcessOutput {
    /// Captured stdout, per the spec's [`Capture`].
    pub stdout: String,
    /// Captured stderr, per the spec's [`Capture`].
    pub stderr: String,
    /// Exit status.
    ///
    /// v1 defaulted a signal-terminated child (`code === null`) to `1`, and so
    /// does this — every consumer branches on `code != 0`, and a killed child
    /// did not succeed.
    pub code: i32,
    /// Whether either stream hit its capture ceiling.
    pub truncated: bool,
}

/// Why a run did not produce a [`ProcessOutput`].
#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    /// The executable could not be started at all — missing, not executable,
    /// or quarantined by Gatekeeper.
    #[error("could not start {}: {source}", program.display())]
    Spawn {
        /// The executable that would not start.
        program: PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// Reading a pipe or waiting on the child failed mid-run.
    #[error("{} failed while running: {source}", program.display())]
    Io {
        /// The executable involved.
        program: PathBuf,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },

    /// The child outlived its timeout and was killed.
    #[error("{} did not finish within {}ms", program.display(), timeout.as_millis())]
    Timeout {
        /// The executable involved.
        program: PathBuf,
        /// The deadline it missed.
        timeout: Duration,
    },

    /// The run was cancelled and the child killed.
    ///
    /// Distinct from every other variant on purpose: the queue maps this to
    /// `canceled` and everything else to `error`, and collapsing the two would
    /// show a user a failure they caused deliberately.
    #[error("cancelled")]
    Cancelled,
}

impl ProcessError {
    /// Whether this failure was the caller's own cancellation.
    pub fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }
}

/// Notified for each line the child writes to stdout, as it is written.
///
/// The download runner's progress parsing needs lines *while* the child runs,
/// not after it exits, so this cannot be folded into [`ProcessOutput`].
pub trait LineSink: Send + Sync {
    /// One complete line of stdout, without its terminator.
    fn line(&self, line: &str);
}

/// Runs child processes.
///
/// Implemented once for real (`TokioRunner`) and once per test that wants to
/// decide what yt-dlp said without installing it.
#[async_trait::async_trait]
pub trait ProcessRunner: Send + Sync {
    /// Run `spec` to completion.
    ///
    /// `lines` is notified for each stdout line as it arrives. `cancel` kills
    /// the child and returns [`ProcessError::Cancelled`]; a token cancelled
    /// before the call must never spawn anything at all.
    async fn run(
        &self,
        spec: ProcessSpec,
        lines: Option<&(dyn LineSink + '_)>,
        cancel: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError>;
}

/// Append `chunk` to `buffer` under `capture`, reporting whether anything was
/// dropped.
///
/// Split out so the head/tail policy is testable without a child process, and
/// so both the streaming reader and any future consumer share one implementation
/// of the rule rather than two that drift.
pub(crate) fn accumulate(buffer: &mut String, chunk: &str, capture: Capture) -> bool {
    match capture {
        Capture::Discard => false,
        Capture::Head { limit } => {
            if buffer.len() >= limit {
                return !chunk.is_empty();
            }
            let room = limit - buffer.len();
            if chunk.len() <= room {
                buffer.push_str(chunk);
                false
            } else {
                // Never split a UTF-8 sequence: walk back to a boundary rather
                // than slicing at the byte the ceiling happens to land on.
                let mut cut = room;
                while cut > 0 && !chunk.is_char_boundary(cut) {
                    cut -= 1;
                }
                buffer.push_str(&chunk[..cut]);
                true
            }
        }
        Capture::Tail { limit } => {
            buffer.push_str(chunk);
            if buffer.len() <= limit {
                return false;
            }
            let mut cut = buffer.len() - limit;
            while cut < buffer.len() && !buffer.is_char_boundary(cut) {
                cut += 1;
            }
            buffer.replace_range(..cut, "");
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_head_capture_keeps_the_beginning_and_reports_the_loss() {
        let mut buffer = String::new();

        assert!(!accumulate(&mut buffer, "abcd", Capture::Head { limit: 6 }));
        assert!(accumulate(&mut buffer, "efgh", Capture::Head { limit: 6 }));

        assert_eq!(
            buffer, "abcdef",
            "the head is what `--dump-json` and `--get-url` read; losing it \
             would lose every entry rather than the last few"
        );
    }

    #[test]
    fn a_head_capture_that_is_already_full_still_reports_further_loss() {
        let mut buffer = "abcdef".to_owned();

        assert!(accumulate(&mut buffer, "g", Capture::Head { limit: 6 }));
        assert_eq!(buffer, "abcdef");
    }

    #[test]
    fn a_tail_capture_keeps_the_end_and_reports_the_loss() {
        let mut buffer = String::new();

        assert!(!accumulate(&mut buffer, "abcd", Capture::Tail { limit: 6 }));
        assert!(accumulate(&mut buffer, "efgh", Capture::Tail { limit: 6 }));

        assert_eq!(
            buffer, "cdefgh",
            "the classifier reads the tail — the first lines of a yt-dlp run \
             are `[debug]` noise and the last ones are the failure"
        );
    }

    #[test]
    fn neither_capture_ever_splits_a_multi_byte_character() {
        // "é" is two bytes, so a limit of 3 lands inside the second one.
        let mut head = String::new();
        accumulate(&mut head, "aéb", Capture::Head { limit: 3 });
        assert_eq!(head, "aé", "a head cut walks back to a char boundary");

        let mut tail = String::new();
        accumulate(&mut tail, "aéb", Capture::Tail { limit: 3 });
        assert_eq!(tail, "éb", "a tail cut walks forward to a char boundary");
    }

    #[test]
    fn a_discard_capture_keeps_nothing_and_reports_nothing() {
        let mut buffer = String::new();

        assert!(!accumulate(&mut buffer, "noise", Capture::Discard));
        assert!(buffer.is_empty());
    }

    #[test]
    fn only_cancellation_reads_as_cancelled() {
        assert!(ProcessError::Cancelled.is_cancelled());
        assert!(
            !ProcessError::Timeout {
                program: PathBuf::from("/bin/yt-dlp"),
                timeout: Duration::from_secs(1),
            }
            .is_cancelled(),
            "a timeout is a failure the user did not ask for — the queue must \
             show it as `error`, not `canceled`"
        );
    }
}
