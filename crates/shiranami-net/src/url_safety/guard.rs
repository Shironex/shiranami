//! The SSRF guard itself: parse, gate the scheme, then classify the destination.
//!
//! Ported from `apps/desktop/src/main/shared/url-safety.ts`, whose design notes
//! are carried over because they are decisions, not commentary:
//!
//! - **No allowlist.** radio-browser is worldwide and yt-dlp's googlevideo URLs
//!   are generated per request; an allowlist cannot be written without breaking
//!   real listening.
//! - **No localhost or dev-mode escape hatch.** Any future opt-in has to be a
//!   build-time flag, not a runtime setting a malicious page could reach.
//! - **DNS rebinding is accepted, knowingly.** The name is resolved once here
//!   and again by the HTTP stack when the request actually goes out, so a
//!   low-TTL record can in principle answer publicly for the first and
//!   privately for the second. The alternative — resolving ourselves and
//!   rewriting the URL to the literal address — breaks TLS SNI and certificate
//!   validation, which trades a narrow race for a permanent hole.

use std::net::IpAddr;
use std::sync::Arc;

use url::{Host, Url};

use crate::url_safety::ranges;
use crate::url_safety::resolver::{Resolver, SystemResolver};

/// The two schemes anything may be requested over.
const ALLOWED_SCHEMES: [&str; 2] = ["http", "https"];

/// Why a URL was refused.
///
/// v1 kept this main-side only and answered the renderer with a bare `403
/// Forbidden`, so a caller could not probe internal topology by reading back
/// which rule it tripped. Phase 8 must keep that split: log the reason, return
/// the generic refusal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UrlGuardReason {
    /// Not a URL at all.
    Parse,
    /// A URL, but not `http:` or `https:`.
    Scheme,
    /// Resolves to an address we refuse to reach.
    PrivateIp,
    /// The hostname could not be resolved, so it could not be checked.
    Dns,
}

impl std::fmt::Display for UrlGuardReason {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The v1 literals, unchanged: they are what the ported log assertions
        // and Phase 8's `blocked URL (<reason>)` lines match on.
        let text = match self {
            Self::Parse => "parse",
            Self::Scheme => "scheme",
            Self::PrivateIp => "private-ip",
            Self::Dns => "dns",
        };
        formatter.write_str(text)
    }
}

/// Best-effort URL parse. `None` means "reject", never "try harder".
pub fn parse_stream_url(input: &str) -> Option<Url> {
    if input.is_empty() {
        return None;
    }
    Url::parse(input).ok()
}

/// Cheap synchronous `http(s)` check for a URL headed to a child process.
///
/// This guards a different threat from [`UrlGuard::check`]: **argument
/// injection**. yt-dlp, like most CLIs, reads any argument starting with `-` as
/// an option, so an extraction-derived `--exec=<command>` would run an
/// arbitrary program. Callers must also pass a literal `--` end-of-options
/// separator before the URL — the two guards are a pair, and Phase 11 owns the
/// second half.
///
/// It performs no DNS and no address classification on purpose: a spawn
/// argument is not an outbound request, and making the cheap check async would
/// have pushed a resolution onto a path that does not need one.
pub fn is_http_url(input: &str) -> bool {
    parse_stream_url(input).is_some_and(|url| is_allowed_scheme(&url))
}

fn is_allowed_scheme(url: &Url) -> bool {
    ALLOWED_SCHEMES.contains(&url.scheme())
}

/// Decides whether a URL may be requested at all.
///
/// Holds the DNS seam, so it is constructed once and shared; the HTTP client
/// owns one and Phase 8's radio proxy re-runs it on every redirect hop.
#[derive(Clone)]
pub struct UrlGuard {
    resolver: Arc<dyn Resolver>,
}

impl std::fmt::Debug for UrlGuard {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // `dyn Resolver` is not `Debug`, and requiring it would push the bound
        // onto every implementor for the sake of one line of output.
        formatter.debug_struct("UrlGuard").finish_non_exhaustive()
    }
}

impl Default for UrlGuard {
    fn default() -> Self {
        Self::system()
    }
}

impl UrlGuard {
    /// A guard resolving through the operating system.
    pub fn system() -> Self {
        Self::with_resolver(Arc::new(SystemResolver))
    }

    /// A guard resolving through `resolver`.
    pub fn with_resolver(resolver: Arc<dyn Resolver>) -> Self {
        Self { resolver }
    }

    /// Check a URL, yielding the parsed form when it may be requested.
    ///
    /// The steps, in the order v1 ran them: parse, gate the scheme, classify a
    /// literal address directly, otherwise resolve the name and refuse if **any**
    /// returned address is denied.
    ///
    /// A literal address never triggers a resolution — there is nothing to
    /// resolve, and the TypeScript test asserted the lookup was not called, so
    /// the short-circuit is contract rather than an optimisation.
    pub async fn check(&self, input: &str) -> Result<Url, UrlGuardReason> {
        let url = parse_stream_url(input).ok_or(UrlGuardReason::Parse)?;

        if !is_allowed_scheme(&url) {
            return Err(UrlGuardReason::Scheme);
        }

        // Owned so the borrow on `url` ends here and the URL can be handed back.
        // The parser has already unbracketed IPv6 literals and canonicalised the
        // numeric IPv4 forms (`http://2130706433/` arrives as `127.0.0.1`),
        // which is the work v1 did by hand with `unbracket` plus `ipaddr.parse`.
        let host = url.host().ok_or(UrlGuardReason::Parse)?.to_owned();

        match host {
            Host::Ipv4(address) => self.judge_literal(url, IpAddr::V4(address)),
            Host::Ipv6(address) => self.judge_literal(url, IpAddr::V6(address)),
            Host::Domain(name) => self.judge_name(url, &name).await,
        }
    }

    fn judge_literal(&self, url: Url, address: IpAddr) -> Result<Url, UrlGuardReason> {
        if ranges::is_denied(address) {
            return Err(UrlGuardReason::PrivateIp);
        }
        Ok(url)
    }

    async fn judge_name(&self, url: Url, name: &str) -> Result<Url, UrlGuardReason> {
        if name.is_empty() {
            return Err(UrlGuardReason::Parse);
        }

        let addresses = self
            .resolver
            .resolve(name)
            .await
            .map_err(|_| UrlGuardReason::Dns)?;

        // No answer is not "no objection" — an unresolvable name is one we
        // could not check, which fails closed.
        if addresses.is_empty() {
            return Err(UrlGuardReason::Dns);
        }

        if addresses.iter().copied().any(ranges::is_denied) {
            return Err(UrlGuardReason::PrivateIp);
        }

        Ok(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::url_safety::resolver::testing::StaticResolver;

    const STREAM_URL: &str = "http://stream.example.com/live";

    fn guard_resolving(host: &str, addresses: &[&str]) -> UrlGuard {
        UrlGuard::with_resolver(Arc::new(StaticResolver::new().answering(host, addresses)))
    }

    /// A guard whose resolver knows no names at all, so consulting it yields
    /// `Dns` rather than the expected reason. That difference is what makes the
    /// literal-address short-circuit asserted rather than assumed — it is the
    /// ported `expect(mockedLookup).not.toHaveBeenCalled()`.
    fn guard_that_must_not_resolve() -> UrlGuard {
        UrlGuard::with_resolver(Arc::new(StaticResolver::new()))
    }

    #[test]
    fn parse_stream_url_rejects_non_urls() {
        assert!(parse_stream_url("").is_none());
        assert!(parse_stream_url("not a url").is_none());
        let parsed = parse_stream_url(STREAM_URL).expect("a well-formed URL parses");
        assert_eq!(parsed.host_str(), Some("stream.example.com"));
    }

    #[test]
    fn is_http_url_accepts_only_http_and_https() {
        for input in [
            "http://example.com/",
            "https://www.youtube.com/watch?v=abc123",
            "https://youtube.com/playlist?list=PL123",
        ] {
            assert!(is_http_url(input), "{input} must be accepted");
        }

        for input in [
            "file:///etc/passwd",
            "ftp://example.com/",
            "javascript:alert(1)",
            "data:text/plain,hi",
            "",
            "not a url",
        ] {
            assert!(!is_http_url(input), "{input} must be rejected");
        }
    }

    /// The argument-injection payloads. None of them parses as a URL, which is
    /// exactly why the scheme check doubles as the injection guard.
    #[test]
    fn is_http_url_rejects_yt_dlp_option_payloads() {
        for input in [
            "--exec=calc.exe",
            "--exec-before-download=rm -rf ~",
            "--downloader=/bin/sh",
            "-x",
            "--paths=/tmp",
        ] {
            assert!(!is_http_url(input), "{input} must be rejected");
        }
    }

    #[tokio::test]
    async fn refuses_unparseable_input_and_foreign_schemes() {
        let guard = guard_that_must_not_resolve();

        for (input, expected) in [
            ("", UrlGuardReason::Parse),
            ("not a url", UrlGuardReason::Parse),
            ("data:text/plain,hello", UrlGuardReason::Scheme),
            ("file:///etc/passwd", UrlGuardReason::Scheme),
            ("javascript:alert(1)", UrlGuardReason::Scheme),
            ("ftp://example.com/", UrlGuardReason::Scheme),
        ] {
            assert_eq!(guard.check(input).await, Err(expected), "for {input}");
        }
    }

    /// Literal addresses are judged without a lookup — `guard_that_must_not_resolve`
    /// has no canned answers, so any resolution would surface as a `Dns` reason
    /// instead of the expected `PrivateIp`.
    #[tokio::test]
    async fn refuses_literal_private_addresses_without_resolving() {
        let guard = guard_that_must_not_resolve();

        for input in [
            "http://127.0.0.1/",
            "http://10.0.0.5/stream",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://224.0.0.1/",
            "http://0.0.0.0/",
            "http://[::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::127.0.0.1]/",
            "http://[::169.254.169.254]/latest/meta-data/",
            "http://[fe80::1]/",
            "http://[fc00::1]/",
            "http://[ff00::1]/",
        ] {
            assert_eq!(
                guard.check(input).await,
                Err(UrlGuardReason::PrivateIp),
                "for {input}"
            );
        }
    }

    /// `http://2130706433/` is `127.0.0.1` spelled as a 32-bit integer. WHATWG
    /// URL parsing canonicalises it before the guard sees it, which is why no
    /// decimal-form handling appears in the guard itself — but the bypass is
    /// worth a test of its own, because the day the parser stops normalising is
    /// the day loopback becomes reachable again.
    #[tokio::test]
    async fn refuses_the_decimal_spelling_of_loopback() {
        let guard = guard_that_must_not_resolve();
        assert_eq!(
            guard.check("http://2130706433/").await,
            Err(UrlGuardReason::PrivateIp)
        );
    }

    #[tokio::test]
    async fn allows_a_name_resolving_to_a_public_address() {
        let guard = guard_resolving("stream.example.com", &["8.8.8.8"]);
        let allowed = guard.check(STREAM_URL).await.expect("a public name passes");
        assert_eq!(allowed.host_str(), Some("stream.example.com"));
    }

    /// The URL comes back untouched, because the caller requests *this* URL —
    /// rewriting it to the resolved address is the approach the file header
    /// rejects.
    #[tokio::test]
    async fn returns_the_url_with_its_port_path_and_query_intact() {
        let guard = guard_resolving("stream.example.com", &["8.8.8.8"]);
        let allowed = guard
            .check("http://stream.example.com:8000/path?q=1")
            .await
            .expect("a public name passes");
        assert_eq!(allowed.port(), Some(8000));
        assert_eq!(allowed.path(), "/path");
        assert_eq!(allowed.query(), Some("q=1"));
    }

    #[tokio::test]
    async fn refuses_a_name_that_resolves_into_the_local_network() {
        let guard = guard_resolving("stream.example.com", &["127.0.0.1"]);
        assert_eq!(
            guard.check(STREAM_URL).await,
            Err(UrlGuardReason::PrivateIp)
        );
    }

    /// Any denied address in the answer set refuses the whole name. A public
    /// address listed first must not launder the private one behind it, which
    /// is what a "check the first result" implementation would do.
    #[tokio::test]
    async fn refuses_when_only_one_of_several_addresses_is_denied() {
        let guard = guard_resolving("stream.example.com", &["8.8.8.8", "10.0.0.1"]);
        assert_eq!(
            guard.check(STREAM_URL).await,
            Err(UrlGuardReason::PrivateIp)
        );
    }

    #[tokio::test]
    async fn refuses_a_name_that_does_not_resolve() {
        let guard = UrlGuard::with_resolver(Arc::new(
            StaticResolver::new().failing("nope.example.invalid"),
        ));
        assert_eq!(
            guard.check("http://nope.example.invalid/").await,
            Err(UrlGuardReason::Dns)
        );
    }

    /// An empty answer is not an absence of objection. A resolver that returns
    /// `[]` has told us nothing about the destination, so the request cannot go.
    #[tokio::test]
    async fn refuses_a_name_that_resolves_to_nothing() {
        let guard = guard_resolving("stream.example.com", &[]);
        assert_eq!(guard.check(STREAM_URL).await, Err(UrlGuardReason::Dns));
    }

    /// The reason strings reach log lines that Phase 8's tests match on.
    #[test]
    fn reasons_render_as_the_v1_literals() {
        assert_eq!(UrlGuardReason::Parse.to_string(), "parse");
        assert_eq!(UrlGuardReason::Scheme.to_string(), "scheme");
        assert_eq!(UrlGuardReason::PrivateIp.to_string(), "private-ip");
        assert_eq!(UrlGuardReason::Dns.to_string(), "dns");
    }
}
