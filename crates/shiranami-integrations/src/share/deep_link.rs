//! `shiranami://` deep-link parsing.
//!
//! Ported from `parseDeepLink` / `handleDeepLink` in
//! `apps/desktop/src/main/index.ts`. A share preview page links to
//! `shiranami://import/<code>` (see `apps/server`'s `renderPreview`), and the OS
//! hands that URL to the app — on Windows and Linux as an `argv` entry to the
//! second instance, on macOS through the `open-url` event.
//!
//! # The seam
//!
//! Everything here is pure: a string in, a [`DeepLink`] out. Registering the
//! scheme, claiming the single-instance lock and forwarding the parsed link to
//! the webview all belong to `src-tauri` in Phase 16 — so this module is
//! deliberately the half that can be tested without an OS, an app handle or a
//! window, which is where the hostile-input cases below actually get exercised.

/// A recognised deep link.
///
/// An enum with one variant today. Modelling the *action* rather than returning
/// a bare code is what keeps a second scheme path — a playlist, a settings
/// deep link — from becoming a second parser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeepLink {
    /// `shiranami://import/<code>` — open the share-import flow for `code`.
    Import {
        /// The share code.
        code: String,
    },
}

/// The scheme the app registers.
pub const DEEP_LINK_SCHEME: &str = "shiranami://";

/// The `import` action's prefix.
const IMPORT_PREFIX: &str = "shiranami://import/";

/// Parse a deep-link URL, or `None` when it is not one we act on.
///
/// The code is the **leading run** of `[A-Za-z0-9_-]`, which is v1's regex
/// exactly — it was unanchored at the end, so anything after the code (a query
/// string, a second path segment, a fragment) is ignored rather than making the
/// link invalid. Since the server mints codes with `nanoid(8)`, whose alphabet
/// is precisely that set, a code that needs more characters than this accepts
/// is not a code we issued.
///
/// That character set is also what makes the result safe to interpolate into
/// the import URL: no `/`, no `.`, no `%`, so a crafted link cannot walk the
/// API path.
pub fn parse_deep_link(url: &str) -> Option<DeepLink> {
    // Case-sensitive, matching v1. URI schemes are case-insensitive per RFC
    // 3986, so `SHIRANAMI://import/x` is technically the same link — but v1
    // shipped this comparison, both OSes normalise the scheme to the case it
    // was registered in before dispatching, and loosening it is a behaviour
    // change that belongs with the Phase 16 registration work rather than here.
    let rest = url.strip_prefix(IMPORT_PREFIX)?;

    let code: String = rest
        .chars()
        .take_while(|character| {
            character.is_ascii_alphanumeric() || *character == '_' || *character == '-'
        })
        .collect();

    if code.is_empty() {
        return None;
    }

    Some(DeepLink::Import { code })
}

/// The first `shiranami://` argument in a process argument list.
///
/// Ported from the `second-instance` handler, which searched `argv` because
/// Windows delivers the link as a command-line argument to the new instance
/// rather than as an event. Returns the raw string: the caller logs it and then
/// parses it, and a `shiranami://` argument that fails to parse is still the
/// reason the second instance was launched.
pub fn find_deep_link_argument<'a>(
    arguments: impl IntoIterator<Item = &'a str>,
) -> Option<&'a str> {
    arguments
        .into_iter()
        .find(|argument| argument.starts_with(DEEP_LINK_SCHEME))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code_of(url: &str) -> Option<String> {
        parse_deep_link(url).map(|DeepLink::Import { code }| code)
    }

    #[test]
    fn parses_an_import_link() {
        assert_eq!(
            code_of("shiranami://import/AbC12345"),
            Some("AbC12345".into())
        );
    }

    /// `nanoid(8)`'s alphabet is exactly this set, so every code the server
    /// mints must survive the parse.
    #[test]
    fn accepts_the_whole_nanoid_alphabet() {
        assert_eq!(
            code_of("shiranami://import/aZ0-_9zZ"),
            Some("aZ0-_9zZ".into())
        );
    }

    /// v1's regex was unanchored at the end, so trailing junk is ignored rather
    /// than fatal. A preview page that ever appends a query parameter must keep
    /// working.
    #[test]
    fn ignores_anything_after_the_code() {
        assert_eq!(code_of("shiranami://import/abc?utm=x"), Some("abc".into()));
        assert_eq!(code_of("shiranami://import/abc#frag"), Some("abc".into()));
        assert_eq!(code_of("shiranami://import/abc/extra"), Some("abc".into()));
        assert_eq!(code_of("shiranami://import/abc extra"), Some("abc".into()));
    }

    #[test]
    fn rejects_a_link_with_no_code() {
        assert_eq!(parse_deep_link("shiranami://import/"), None);
        assert_eq!(parse_deep_link("shiranami://import"), None);
        assert_eq!(parse_deep_link("shiranami://import/?x=1"), None);
    }

    #[test]
    fn rejects_other_actions_and_other_schemes() {
        assert_eq!(parse_deep_link("shiranami://play/abc"), None);
        assert_eq!(parse_deep_link("https://shiranami.app/import/abc"), None);
        assert_eq!(parse_deep_link("file:///etc/passwd"), None);
        assert_eq!(parse_deep_link(""), None);
    }

    /// Case-sensitive, as v1 was. Pinned so the behaviour is a decision rather
    /// than an accident, and so Phase 16 can revisit it deliberately.
    #[test]
    fn scheme_matching_is_case_sensitive() {
        assert_eq!(parse_deep_link("SHIRANAMI://import/abc"), None);
        assert_eq!(parse_deep_link("Shiranami://Import/abc"), None);
    }

    /// The whole point of the character allowlist: nothing that could escape the
    /// path when the code is interpolated into the import URL survives it.
    #[test]
    fn hostile_payloads_cannot_escape_the_code() {
        assert_eq!(code_of("shiranami://import/../../admin"), None);
        assert_eq!(code_of("shiranami://import/%2e%2e%2fadmin"), None);
        assert_eq!(
            code_of("shiranami://import/abc/../admin"),
            Some("abc".into())
        );
        assert_eq!(
            code_of("shiranami://import/abc%2f..%2fadmin"),
            Some("abc".into())
        );
        assert_eq!(code_of("shiranami://import/<script>"), None);
        assert_eq!(code_of("shiranami://import/abc'or'1"), Some("abc".into()));
    }

    /// A very long argument must not produce a very long code — the run stops
    /// at the first disallowed character regardless of what follows.
    #[test]
    fn a_long_hostile_argument_truncates_at_the_first_bad_character() {
        let url = format!("shiranami://import/abc{}", "/x".repeat(10_000));
        assert_eq!(code_of(&url), Some("abc".into()));
    }

    #[test]
    fn non_ascii_is_not_part_of_a_code() {
        assert_eq!(code_of("shiranami://import/日本語"), None);
        assert_eq!(code_of("shiranami://import/ab日本"), Some("ab".into()));
    }

    #[test]
    fn finds_the_deep_link_among_process_arguments() {
        let argv = [
            "C:\\Program Files\\Shiranami\\Shiranami.exe",
            "--some-flag",
            "shiranami://import/abc",
        ];
        assert_eq!(
            find_deep_link_argument(argv),
            Some("shiranami://import/abc")
        );
    }

    #[test]
    fn reports_no_deep_link_when_the_arguments_hold_none() {
        assert_eq!(find_deep_link_argument(["app.exe", "--flag"]), None);
        assert_eq!(find_deep_link_argument([]), None);
    }

    /// A `shiranami://` argument that does not parse is still returned, because
    /// its presence is why the second instance exists — the caller logs it and
    /// then focuses the window.
    #[test]
    fn an_unparseable_deep_link_argument_is_still_found() {
        let found = find_deep_link_argument(["app.exe", "shiranami://play/abc"]);
        assert_eq!(found, Some("shiranami://play/abc"));
        assert_eq!(parse_deep_link(found.expect("found")), None);
    }
}
