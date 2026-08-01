//! Redacting home-directory paths before anything leaves the machine.
//!
//! Architecture §2.2 #5 maps Sentry to `src-tauri` **plus `core::scrub`**, and
//! the split is the usual one: the plugin, the DSN and the consent gate are boot
//! decisions, while "what may not appear in a payload" is a rule with no I/O in
//! it, testable against fixed vectors and reused by anything that ever ships a
//! string off the machine.
//!
//! Stack frames, log lines and error messages all carry absolute paths, and an
//! absolute path on any desktop OS embeds the account name:
//! `/Users/<name>/…`, `C:\Users\<name>\…`, `/home/<name>/…`. A user who opts
//! into crash reporting is consenting to a stack trace, not to publishing their
//! own name — and on a music app the rest of the path is worse than the name,
//! since `~/Music/…` is a list of what they listen to.
//!
//! Ported from `packages/shared/src/sentry-scrub.ts` with its test vectors,
//! including the two behaviours that read like details and are not: a bare home
//! directory collapses to `~` with no trailing separator, and a **console**
//! breadcrumb containing a path is dropped outright rather than scrubbed.

use std::sync::LazyLock;

use regex::{Captures, Regex};
use serde_json::Value;

/// How deep [`scrub_deep`] walks before giving up.
///
/// v1's `MAX_SCRUB_DEPTH`. A cap rather than a full traversal because the input
/// is a free-form bag that arrives from a panic handler: a pathological payload
/// must not be able to turn the `before_send` hook into a hang, and eight levels
/// is far past anything Sentry's own contexts nest to.
pub const MAX_SCRUB_DEPTH: usize = 8;

/// A Unix or Windows home-directory prefix, capturing whatever follows it.
///
/// The username is the wildcard between the home root and the next separator,
/// and it is dropped entirely rather than masked — a fixed-width mask would
/// still leak the length, and nothing downstream needs to tell two users apart.
///
/// The trailing `[^\s'"]*` stops the match at whitespace or a quote, so a path
/// embedded in a sentence or a JSON fragment does not swallow the rest of it.
static HOME_DIR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:/Users/[^/\\]+|/home/[^/\\]+|[A-Za-z]:\\Users\\[^\\/]+)([/\\][^\s'"]*)?"#)
        .expect("the home-directory pattern is a compile-time constant")
});

/// Replace every home-directory path in `input` with a `~`-rooted one.
///
/// ```
/// # use shiranami_core::scrub::scrub_path;
/// assert_eq!(scrub_path("/Users/alice/Music/track.flac"), "~/Music/track.flac");
/// assert_eq!(scrub_path("/usr/local/bin/node"), "/usr/local/bin/node");
/// ```
pub fn scrub_path(input: &str) -> String {
    HOME_DIR
        .replace_all(input, |captures: &Captures<'_>| {
            // A bare home directory has no remainder, and v1 collapsed it to a
            // bare `~` rather than to `~/`. Preserved: the two render
            // differently in a stack frame and the difference is visible.
            captures
                .get(1)
                .map_or_else(|| "~".to_owned(), |rest| format!("~{}", rest.as_str()))
        })
        .into_owned()
}

/// Whether `input` contains an absolute home-directory path.
///
/// v1's version had to reset `lastIndex` before testing, because a `/g` regex in
/// JavaScript carries mutable state across calls and would otherwise answer
/// `false` every second time. Rust's `Regex` is stateless, so the hazard does
/// not exist here — but the *test* for it is ported anyway, since the behaviour
/// it pins ("asking twice gives the same answer") is what the caller relies on.
pub fn contains_home_path(input: &str) -> bool {
    HOME_DIR.is_match(input)
}

/// Recursively scrub every string nested inside `value`.
///
/// For the free-form bags — a breadcrumb's `data`, an event's `extra`,
/// `contexts`, `request` and `tags` — where a path can hide at any depth.
///
/// Depth-capped at [`MAX_SCRUB_DEPTH`]; a value deeper than that is returned
/// **unchanged** rather than dropped, matching v1. That is the conservative
/// choice for a hang and the unsafe one for a leak, so the cap is set far above
/// any real payload rather than tuned close to one.
///
/// Cycles need no guard here: `serde_json::Value` is a tree by construction,
/// where JavaScript's object graph is not. v1's `WeakSet` has no counterpart and
/// needs none — the test proving a cyclic payload terminated is ported as a deep
/// payload instead, since a cycle is unrepresentable.
pub fn scrub_deep(value: Value) -> Value {
    scrub_at(value, 0)
}

fn scrub_at(value: Value, depth: usize) -> Value {
    match value {
        Value::String(text) => Value::String(scrub_path(&text)),
        _ if depth >= MAX_SCRUB_DEPTH => value,
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| scrub_at(item, depth + 1))
                .collect(),
        ),
        Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(key, field)| (key, scrub_at(field, depth + 1)))
                .collect(),
        ),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// v1's fixture username, so the "must not appear anywhere" assertions are
    /// the same assertions.
    const USERNAME: &str = "alice";

    #[test]
    fn a_macos_home_prefix_loses_the_username() {
        let out = scrub_path(&format!("/Users/{USERNAME}/Music/track.flac"));

        assert_eq!(out, "~/Music/track.flac");
        assert!(!out.contains(USERNAME));
    }

    #[test]
    fn a_linux_home_prefix_loses_the_username() {
        let out = scrub_path(&format!("/home/{USERNAME}/code/app.js"));

        assert_eq!(out, "~/code/app.js");
        assert!(!out.contains(USERNAME));
    }

    #[test]
    fn a_windows_home_prefix_loses_the_username() {
        let out = scrub_path(&format!(r"C:\Users\{USERNAME}\AppData\Local\app.exe"));

        assert_eq!(out, r"~\AppData\Local\app.exe");
        assert!(!out.contains(USERNAME));
    }

    /// A bare home directory becomes `~`, not `~/`. The two render differently
    /// in a stack frame, and v1 shipped the first.
    #[test]
    fn a_bare_home_directory_collapses_to_a_tilde() {
        assert_eq!(scrub_path(&format!("/Users/{USERNAME}")), "~");
    }

    #[test]
    fn every_path_in_one_string_is_scrubbed() {
        let out = scrub_path(&format!(
            "from /Users/{USERNAME}/a.js to /Users/{USERNAME}/b.js"
        ));

        assert_eq!(out, "from ~/a.js to ~/b.js");
        assert!(!out.contains(USERNAME));
    }

    /// The half that keeps the scrubber useful: a path that carries no account
    /// name is left alone, so a stack trace through the app bundle stays
    /// readable.
    #[test]
    fn paths_outside_a_home_directory_are_untouched() {
        assert_eq!(scrub_path("/usr/local/bin/node"), "/usr/local/bin/node");
        assert_eq!(
            scrub_path("/Applications/Shiranami.app"),
            "/Applications/Shiranami.app"
        );
    }

    /// Ported from v1's `lastIndex` regression test. The stateful-regex hazard
    /// it guarded does not exist in Rust, but the property the caller depends on
    /// does, and it is one line to keep.
    #[test]
    fn asking_twice_gives_the_same_answer() {
        let sample = format!("/Users/{USERNAME}/x");

        assert!(contains_home_path(&sample));
        assert!(contains_home_path(&sample));
    }

    #[test]
    fn a_path_with_no_home_directory_is_not_detected() {
        assert!(!contains_home_path("/var/log/system.log"));
    }

    /// v1's nested-bag vector, whole: paths hide in arrays, in objects inside
    /// arrays, and in values that are not obviously paths at all.
    #[test]
    fn nested_bags_are_scrubbed_at_every_depth() {
        let scrubbed = scrub_deep(json!({
            "files": [
                format!("/Users/{USERNAME}/a.flac"),
                { "nested": format!("/Users/{USERNAME}/b.js") },
            ],
            "app": { "app_cwd": format!("/Users/{USERNAME}/app") },
            "config": format!(r"C:\Users\{USERNAME}\cfg.json"),
            "url": format!("file:///Users/{USERNAME}/index.html"),
        }));

        let serialized = scrubbed.to_string();
        assert!(
            !serialized.contains(USERNAME),
            "the username survived somewhere in {serialized}"
        );

        assert_eq!(scrubbed["files"][0], json!("~/a.flac"));
        assert_eq!(scrubbed["files"][1]["nested"], json!("~/b.js"));
        assert_eq!(scrubbed["app"]["app_cwd"], json!("~/app"));
        assert_eq!(scrubbed["config"], json!(r"~\cfg.json"));
        assert_eq!(scrubbed["url"], json!("file://~/index.html"));
    }

    /// Non-string leaves survive intact. A scrubber that stringified numbers
    /// would quietly change every payload it touched.
    #[test]
    fn non_strings_are_left_alone() {
        let scrubbed = scrub_deep(json!({ "count": 3, "ok": true, "missing": null }));

        assert_eq!(scrubbed, json!({ "count": 3, "ok": true, "missing": null }));
    }

    /// v1 guarded a cyclic payload with a `WeakSet`; a `serde_json::Value` is a
    /// tree and cannot cycle, so the property under test becomes the depth cap —
    /// which is the other half of what that guard was for.
    #[test]
    fn a_payload_deeper_than_the_cap_terminates_and_is_returned_intact() {
        let mut deep = json!(format!("/Users/{USERNAME}/x"));
        for _ in 0..(MAX_SCRUB_DEPTH + 4) {
            deep = json!({ "next": deep });
        }

        let scrubbed = scrub_deep(deep);

        // It returns, which is the claim. The buried string is past the cap and
        // therefore still there — deliberately conservative about hanging
        // rather than about leaking, which is why the cap sits far above any
        // real Sentry payload.
        assert!(scrubbed.is_object());
    }

    /// …and everything inside the cap is genuinely reached, or the test above
    /// would pass for a scrubber that did nothing.
    #[test]
    fn a_payload_inside_the_cap_is_fully_scrubbed() {
        let mut nested = json!(format!("/Users/{USERNAME}/x"));
        for _ in 0..(MAX_SCRUB_DEPTH - 2) {
            nested = json!({ "next": nested });
        }

        assert!(!scrub_deep(nested).to_string().contains(USERNAME));
    }
}
