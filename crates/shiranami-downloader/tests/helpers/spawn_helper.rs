//! The child process the spawn-runner tests drive.
//!
//! It exists because those tests used to spawn `/bin/sh` and `/bin/echo`, which
//! made them silently Unix-only: every one of them failed the moment the suite
//! was finally run on Windows. Reaching for `cmd /C` instead would have traded
//! one platform's shell for two, and the tests would then be asserting against
//! `cmd`'s quoting rules — which is precisely the thing one of them exists to
//! prove the runner never depends on.
//!
//! A purpose-built child sidesteps the question. No shell, no quoting rules, no
//! `\r\n` from someone else's `echo`: Rust's `println!` writes `\n` on every
//! platform, so the expected bytes are the same everywhere.
//!
//! Each mode is one behaviour a test needs from a real subprocess. Keep them
//! boring — a helper with logic of its own is a second thing that can be wrong.

use std::io::Write as _;

fn main() {
    let mut args = std::env::args().skip(1);
    let mode = args.next().unwrap_or_default();

    match mode.as_str() {
        // Both pipes and a non-zero status, for the capture test.
        "streams" => {
            println!("out");
            eprintln!("err");
            std::process::exit(3);
        }
        // Lines that arrive over time, each flushed, so a test can observe them
        // reaching the sink *before* the child exits. Unflushed writes would
        // sit in the child's buffer and all land at once on exit, which would
        // let a runner that only reads at exit pass a streaming test.
        "lines" => {
            for index in 0..3 {
                println!("line {index}");
                let _ = std::io::stdout().flush();
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
        // Writes and then outlives any timeout the tests set, for the kill and
        // cancellation paths. The write comes first so the parent can be sure
        // the child really started before it tries to stop it.
        "sleep" => {
            println!("started");
            let _ = std::io::stdout().flush();
            std::thread::sleep(std::time::Duration::from_secs(120));
        }
        // Echoes argv[2] verbatim. The argv-not-a-command-string test passes a
        // value full of shell metacharacters through here; a parent that built
        // a command line would deliver something else, or several somethings.
        "echo" => {
            println!("{}", args.next().unwrap_or_default());
        }
        other => {
            eprintln!("unknown helper mode: {other}");
            std::process::exit(9);
        }
    }
}
