//! Source-grep guards over this crate, for the two rules a type cannot express.
//!
//! Nightcore keeps its equivalent in `src/arch_guards.rs`; this is the same idea
//! scoped to the composition root, which is where both failure modes live.
//! Neither rule is checkable by the compiler and both produce symptoms that
//! point somewhere other than the cause, so they are pinned by reading the
//! source at test time.
//!
//! **These exist now, before the fan-out.** Twenty-one namespace lanes are about
//! to write commands against this skeleton. A rule that arrives after them is a
//! rule that arrives as a twenty-one-file cleanup.
//!
//! # R15 — a synchronous command freezes the UI
//!
//! A command attribute applied to a function that is not `async` puts that
//! function on the webview's main thread.
//! On WKWebView that thread is also the one painting the window, so a command
//! that touches disk, the database, the network or a child process freezes the
//! app for as long as it takes. The symptom is "the app hangs sometimes",
//! reported weeks later against a screen that has nothing to do with the command.
//!
//! The rule is therefore **every command is `async`**, with
//! [`SYNC_COMMAND_ALLOWLIST`] as a ratchet: the list is currently empty, and an
//! addition to it has to be argued for in review rather than slipped in.
//! `async` costs nothing for the genuinely cheap in-memory cases, so "it does
//! not need to be async" is not a reason to be on the list — "it must not be"
//! would be, and nothing has claimed that yet.
//!
//! # R16 — a bare `tokio::spawn` aborts the process
//!
//! `tokio::spawn` panics when no reactor is entered, and on a thread Tauri
//! called into from an OS callback there is none. The panic then crosses an
//! `extern "C"` boundary, which is not an unwind Rust may perform, so the
//! process **aborts**: `SIGABRT`, no backtrace worth reading, no error the user
//! or a crash reporter can attribute to anything. Nightcore shipped exactly this
//! to users.
//!
//! `tauri::async_runtime::spawn` resolves the runtime Tauri owns and works from
//! any thread. It is a drop-in replacement, which is why the rule is absolute
//! rather than case-by-case.

/// Commands allowed to be synchronous.
///
/// **Empty, and a ratchet.** See the module docs for what would justify an
/// entry: not "this is cheap", but "this must not be async".
pub const SYNC_COMMAND_ALLOWLIST: &[&str] = &[];

#[cfg(test)]
mod tests {
    use super::SYNC_COMMAND_ALLOWLIST;
    use std::path::{Path, PathBuf};

    /// This file, which is excluded from its own scan.
    ///
    /// It is the only source in the crate that names the patterns the scans
    /// match on in **string literals**, so including it makes both guards report
    /// themselves. Not a hole: this module declares one `const` and a test
    /// module, so there is no command and no spawn here to miss. Discovered by
    /// the guards themselves on their first run, which is a reasonable first
    /// thing for them to catch.
    const SELF: &str = "arch_guards.rs";

    /// The command attribute, assembled rather than written.
    ///
    /// `lint:meta`'s `rust-command-placement` rule is itself a text scan, and it
    /// flags any file outside `commands/` that contains this literal — including
    /// this one, whose whole job is to search for it. Splitting the string keeps
    /// that rule **absolute**: the alternative is an exemption list in the shared
    /// tool, and an exemption list is a thing that grows.
    const COMMAND_ATTRIBUTE: &str = concat!("#[tauri", "::command");

    /// Every `.rs` file in this crate except [`SELF`], as `(path, source)`.
    fn sources() -> Vec<(PathBuf, String)> {
        let mut found = Vec::new();
        collect(
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src")),
            &mut found,
        );
        assert!(!found.is_empty(), "the source scan found no files at all");
        found
    }

    fn collect(dir: &Path, found: &mut Vec<(PathBuf, String)>) {
        let entries = std::fs::read_dir(dir).unwrap_or_else(|e| panic!("read {dir:?}: {e}"));
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect(&path, found);
            } else if path.extension().is_some_and(|ext| ext == "rs")
                && path.file_name().is_none_or(|name| name != SELF)
            {
                let source =
                    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path:?}: {e}"));
                found.push((path, source));
            }
        }
    }

    /// Strip `//` line comments and `/* */` blocks.
    ///
    /// Load-bearing, not tidiness: these very rules are *documented* in this
    /// crate, in prose that names `tokio::spawn` and the command attribute. A
    /// scan that did not strip comments would flag the documentation explaining
    /// why the thing is banned, which is the fastest way to get a guard deleted.
    fn without_comments(source: &str) -> String {
        let mut out = String::with_capacity(source.len());
        let mut rest = source;

        loop {
            // Whichever delimiter comes first wins, so `// /* */` is a line
            // comment and `/* // */` is a block one.
            let (at, is_block) = match (rest.find("/*"), rest.find("//")) {
                (None, None) => {
                    out.push_str(rest);
                    return out;
                }
                (Some(block), None) => (block, true),
                (None, Some(line)) => (line, false),
                (Some(block), Some(line)) if block < line => (block, true),
                (Some(_), Some(line)) => (line, false),
            };

            out.push_str(&rest[..at]);

            let closed = if is_block {
                rest[at..].find("*/").map(|end| at + end + 2)
            } else {
                // Keep the newline so the line-oriented scans below still see
                // the file's structure.
                rest[at..].find('\n').map(|end| {
                    out.push('\n');
                    at + end + 1
                })
            };

            match closed {
                Some(resume) => rest = &rest[resume..],
                None => return out,
            }
        }
    }

    /// R16. `tauri::async_runtime::spawn` contains the substring `spawn` but not
    /// `tokio::spawn`, so the two are distinguishable by text.
    #[test]
    fn no_bare_tokio_spawn_anywhere_in_the_shell() {
        let mut offenders = Vec::new();

        for (path, source) in sources() {
            let code = without_comments(&source);
            for (number, line) in code.lines().enumerate() {
                if line.contains("tokio::spawn(") || line.contains("tokio::task::spawn(") {
                    offenders.push(format!("{}:{}", path.display(), number + 1));
                }
            }
        }

        assert!(
            offenders.is_empty(),
            "bare `tokio::spawn` at {offenders:?} — use \
             `tauri::async_runtime::spawn`. From a thread Tauri entered through an \
             OS callback there is no reactor, so `tokio::spawn` panics across an \
             `extern \"C\"` boundary and the process aborts with no usable \
             backtrace. Nightcore shipped this to users."
        );
    }

    /// R15. Walks each command attribute forward to the `fn` it applies to,
    /// skipping the other attributes in between (`#[specta::specta]` always sits
    /// there), and requires `async`.
    #[test]
    fn every_command_is_async_unless_it_is_on_the_ratchet() {
        let mut offenders = Vec::new();

        for (path, source) in sources() {
            let code = without_comments(&source);
            let lines: Vec<&str> = code.lines().collect();

            for (index, line) in lines.iter().enumerate() {
                if !line.trim_start().starts_with(COMMAND_ATTRIBUTE) {
                    continue;
                }

                let Some(declaration) = lines[index + 1..]
                    .iter()
                    .find(|following| following.contains("fn "))
                else {
                    panic!(
                        "{}:{} — a command attribute with no function after it",
                        path.display(),
                        index + 1
                    );
                };

                let name = declaration
                    .split("fn ")
                    .nth(1)
                    .and_then(|rest| rest.split(['(', '<']).next())
                    .unwrap_or("<unparsed>")
                    .trim();

                if !declaration.contains("async fn") && !SYNC_COMMAND_ALLOWLIST.contains(&name) {
                    offenders.push(format!("{} ({}:{})", name, path.display(), index + 1));
                }
            }
        }

        assert!(
            offenders.is_empty(),
            "synchronous commands not on SYNC_COMMAND_ALLOWLIST: {offenders:?}. A \
             sync command runs on the webview's main thread, which on WKWebView \
             is also the thread painting the window."
        );
    }

    /// The scan must actually reach the commands, or both tests above pass by
    /// finding nothing — the vacuity that makes a guard worse than none.
    #[test]
    fn the_scan_reaches_the_commands_it_is_meant_to_guard() {
        let attributes: usize = sources()
            .iter()
            .map(|(_, source)| without_comments(source).matches(COMMAND_ATTRIBUTE).count())
            .sum();

        assert_eq!(
            attributes,
            crate::commands::registry::COMMAND_COUNT,
            "the source scan found {attributes} command attributes but the \
             registry states {} commands — the scan is missing files, so both \
             guards above are checking a subset",
            crate::commands::registry::COMMAND_COUNT
        );
    }

    /// …and the comment stripper does not eat code, which would make the scan
    /// silently narrower in a way the count above cannot see.
    #[test]
    fn the_comment_stripper_keeps_code_and_drops_prose() {
        let stripped = without_comments(
            "let a = 1; // tokio::spawn(x)\n/* tokio::spawn(y) */let b = 2;\nlet c = 3;",
        );

        assert!(stripped.contains("let a = 1;"));
        assert!(stripped.contains("let b = 2;"));
        assert!(stripped.contains("let c = 3;"));
        assert!(!stripped.contains("tokio::spawn"));
    }
}
