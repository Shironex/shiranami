//! The per-session path token, and the reason there is one at all.
//!
//! v1 served audio over a custom URI scheme, which only the app's own renderer
//! could ever address. Loopback HTTP is not like that: every process on the
//! machine can reach `127.0.0.1:<port>`, and so can any web page the user has
//! open, which makes the port alone a capability to read every file the
//! containment guard would allow. The extension allowlist and `is_path_allowed`
//! are still necessary, and they are no longer sufficient.
//!
//! So the port is not the credential — the first path segment is. Thirty-two
//! bytes from the OS CSPRNG, minted at boot, handed to the webview by a command,
//! never written to disk and never logged. An attacker who knows the port still
//! has to guess 256 bits before the process restarts.
//!
//! Two details make it hold:
//!
//! - **Constant-time comparison.** A local attacker can time the loopback
//!   round-trip precisely enough for a byte-at-a-time compare to leak the token,
//!   which would turn 256 bits into 64 guesses of 16.
//! - **The refusal is a 404**, not a 403. A 403 confirms both that the server is
//!   ours and that the route exists; a 404 for every wrong token tells a prober
//!   nothing it did not already know.

use std::fmt;

use subtle::ConstantTimeEq;

/// How many random bytes back a token. The value the architecture fixes.
const TOKEN_BYTES: usize = 32;

/// A per-session capability, carried as the first path segment.
///
/// Deliberately not `Display`, not `Debug`-printable and not `Serialize`: the
/// only way to read it out is [`SessionToken::as_str`], so a token cannot reach
/// a log line by being interpolated into a struct dump.
#[derive(Clone)]
pub struct SessionToken(String);

impl SessionToken {
    /// Mint a token from the operating system's CSPRNG.
    ///
    /// # Panics
    ///
    /// If the OS cannot produce randomness. There is no safe degraded mode: a
    /// predictable token is an open server, so failing to boot is the correct
    /// outcome and the only one that cannot be mistaken for working.
    pub fn generate() -> Self {
        let mut bytes = [0_u8; TOKEN_BYTES];
        getrandom::fill(&mut bytes)
            .expect("the OS CSPRNG must answer; a predictable token is an open server");
        Self(to_hex(&bytes))
    }

    /// The token as it appears in a URL.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether `candidate` is this token, compared in constant time.
    ///
    /// The length check short-circuits, which leaks the token's length. That is
    /// public information — it is a fixed 64 characters for every session.
    pub fn matches(&self, candidate: &str) -> bool {
        let expected = self.0.as_bytes();
        let actual = candidate.as_bytes();
        if expected.len() != actual.len() {
            return false;
        }
        expected.ct_eq(actual).into()
    }
}

impl fmt::Debug for SessionToken {
    /// Redacted. A token in a panic message or a `tracing` field is a token in
    /// a bug report.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SessionToken(<redacted>)")
    }
}

/// Lowercase hex, so the token is URL-safe without percent-encoding.
fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[usize::from(byte >> 4)] as char);
        out.push(DIGITS[usize::from(byte & 0x0f)] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn a_token_is_thirty_two_bytes_of_url_safe_hex() {
        let token = SessionToken::generate();
        assert_eq!(token.as_str().len(), TOKEN_BYTES * 2);
        assert!(
            token
                .as_str()
                .chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)),
            "a token that needs percent-encoding would not survive the URL builder"
        );
    }

    #[test]
    fn tokens_do_not_repeat() {
        let minted: HashSet<String> = (0..64)
            .map(|_| SessionToken::generate().as_str().to_owned())
            .collect();
        assert_eq!(minted.len(), 64, "the CSPRNG is returning a constant");
    }

    #[test]
    fn a_token_matches_itself_and_nothing_else() {
        let token = SessionToken::generate();
        let mint = token.as_str().to_owned();

        assert!(token.matches(&mint));
        assert!(!token.matches(""));
        assert!(
            !token.matches(&mint[..mint.len() - 1]),
            "a prefix is not a match"
        );
        assert!(
            !token.matches(&format!("{mint}x")),
            "a token with a suffix is not a match"
        );

        let mut wrong_last_byte = mint.clone();
        wrong_last_byte.pop();
        wrong_last_byte.push(if mint.ends_with('a') { 'b' } else { 'a' });
        assert!(!token.matches(&wrong_last_byte));

        assert!(!token.matches(SessionToken::generate().as_str()));
    }

    /// The redaction is the point: `tracing::debug!(?state)` anywhere in this
    /// crate must not be able to print the credential.
    #[test]
    fn a_token_never_prints_itself() {
        let token = SessionToken::generate();
        let printed = format!("{token:?}");
        assert!(!printed.contains(token.as_str()));
        assert_eq!(printed, "SessionToken(<redacted>)");
    }

    #[test]
    fn hex_encodes_every_nibble() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xf0, 0xff]), "000ff0ff");
    }
}
