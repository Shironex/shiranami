//! Turning one ICY metadata block into a `StreamTitle`, defensively.
//!
//! A block is a NUL-padded run of `Key='value';` pairs, of which exactly one
//! matters here. Everything in this module is written on the assumption that
//! the bytes are hostile-by-accident rather than well-formed, because they are:
//! the block is composed by whatever software the station runs, from a tag in
//! whatever encoding the station's library happens to use.
//!
//! # The two rules
//!
//! 1. **Never fail.** Every function here returns a value or `None`; none can
//!    panic and none can error. A block that makes no sense costs one skipped
//!    title, never the connection — the audio is still playing, and dropping a
//!    listener because a song name did not decode would be absurd.
//! 2. **Never re-encode.** What comes out is what came in, decoded. No case
//!    folding, no ad filtering, no "cleaning". The caller decides what a title
//!    means; this decides only what its bytes said.

/// The key whose value is the now-playing string.
const STREAM_TITLE_KEY: &str = "StreamTitle=";

/// The `StreamTitle` in `block`, or `None` when it carries none worth showing.
///
/// `None` covers all of: no `StreamTitle` key, an empty value, and a value that
/// is nothing but whitespace — the three ways a station says "I have nothing to
/// tell you", which the caller must not render over the station name.
pub fn stream_title(block: &[u8]) -> Option<String> {
    let text = decode_lenient(trim_padding(block));
    let start = text.find(STREAM_TITLE_KEY)? + STREAM_TITLE_KEY.len();

    // `find` returns a char boundary and `STREAM_TITLE_KEY` is ASCII, so the
    // sum is a boundary too — this slice cannot panic on a multi-byte value.
    let value = unquote(&text[start..]).trim();

    (!value.is_empty()).then(|| value.to_owned())
}

/// Decode metadata bytes to a `String` without ever failing.
///
/// # Why the fallback is Latin-1 and not lossy UTF-8
///
/// ICY has no encoding field. In practice a block is UTF-8, Latin-1, CP1251 or
/// Shift-JIS depending on where the station is, and there is no way to know
/// which — the byte sequences overlap and the strings are far too short for
/// statistical detection to be anything but a coin flip.
///
/// So: valid UTF-8 is taken as UTF-8, which is the overwhelmingly common case
/// and the only one that can be identified for free. Anything else is read as
/// Latin-1, where every byte is a codepoint and decoding therefore *cannot*
/// fail. A CP1251 or Shift-JIS title comes out as mojibake rather than as its
/// intended glyphs — but it comes out, in full, and the bytes are recoverable
/// from it. `String::from_utf8_lossy` would instead replace each undecodable
/// run with a single `U+FFFD`, destroying the content permanently in exchange
/// for looking tidier. Preserving a title we rendered wrongly beats deleting
/// one we could not render.
fn decode_lenient(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => bytes.iter().map(|&byte| char::from(byte)).collect(),
    }
}

/// Drop the NUL padding a block is rounded up with, and any surrounding space.
fn trim_padding(block: &[u8]) -> &[u8] {
    let is_padding = |byte: &u8| *byte == 0 || byte.is_ascii_whitespace();

    let start = block.iter().position(|byte| !is_padding(byte));
    let Some(start) = start else { return &[] };
    let end = block
        .iter()
        .rposition(|byte| !is_padding(byte))
        .unwrap_or(start);

    &block[start..=end]
}

/// The value that follows `StreamTitle=`, with its quoting removed.
///
/// # Why the terminator is `';` and not `'` or `;`
///
/// Both characters occur inside real titles — `Guns N' Roses`, and any station
/// that formats a title as `Artist; Album`. Ending on either alone truncates
/// those. The pair is what the format actually delimits with, and it is rare
/// enough inside a title to be the right bet.
///
/// The two fallbacks cover the shapes that are common anyway: a station that
/// omits the trailing `;` on the last pair (end at the final quote), and one
/// that omits the quotes entirely (end at the first `;`, or at the end).
fn unquote(rest: &str) -> &str {
    let Some(quoted) = rest.strip_prefix('\'') else {
        // Unquoted, which the format does not permit and stations emit anyway.
        return match rest.find(';') {
            Some(end) => &rest[..end],
            None => rest,
        };
    };

    if let Some(end) = quoted.find("';") {
        return &quoted[..end];
    }
    match quoted.rfind('\'') {
        Some(end) => &quoted[..end],
        // An unterminated quote: take the rest rather than dropping the title.
        None => quoted,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a block the way a station does: the pairs, then NUL padding out to
    /// a multiple of sixteen.
    fn block(body: &str) -> Vec<u8> {
        let mut bytes = body.as_bytes().to_vec();
        while !bytes.len().is_multiple_of(16) {
            bytes.push(0);
        }
        bytes
    }

    #[test]
    fn the_ordinary_shape_parses() {
        let parsed = stream_title(&block("StreamTitle='Cornelius - Drop';"));
        assert_eq!(parsed.as_deref(), Some("Cornelius - Drop"));
    }

    #[test]
    fn a_second_pair_after_the_title_is_ignored() {
        let parsed = stream_title(&block(
            "StreamTitle='Cornelius - Drop';StreamUrl='http://example.com';",
        ));
        assert_eq!(parsed.as_deref(), Some("Cornelius - Drop"));
    }

    /// `StreamUrl` first is a real ordering, and a scan that assumed the title
    /// came first would return the URL.
    #[test]
    fn the_title_is_found_wherever_it_sits() {
        let parsed = stream_title(&block("StreamUrl='http://example.com';StreamTitle='Drop';"));
        assert_eq!(parsed.as_deref(), Some("Drop"));
    }

    #[test]
    fn a_quote_inside_the_title_survives() {
        let parsed = stream_title(&block("StreamTitle='Guns N' Roses - Patience';"));
        assert_eq!(parsed.as_deref(), Some("Guns N' Roses - Patience"));
    }

    #[test]
    fn a_semicolon_inside_the_title_survives() {
        let parsed = stream_title(&block("StreamTitle='Artist; Album - Track';"));
        assert_eq!(parsed.as_deref(), Some("Artist; Album - Track"));
    }

    #[test]
    fn a_missing_trailing_semicolon_still_parses() {
        let parsed = stream_title(&block("StreamTitle='Drop'"));
        assert_eq!(parsed.as_deref(), Some("Drop"));
    }

    #[test]
    fn an_unquoted_value_still_parses() {
        assert_eq!(
            stream_title(&block("StreamTitle=Drop;")).as_deref(),
            Some("Drop")
        );
        assert_eq!(
            stream_title(&block("StreamTitle=Drop")).as_deref(),
            Some("Drop")
        );
    }

    #[test]
    fn an_unterminated_quote_keeps_what_there_is() {
        let parsed = stream_title(&block("StreamTitle='Drop"));
        assert_eq!(parsed.as_deref(), Some("Drop"));
    }

    /// The three ways a station says "nothing", all of which must leave the
    /// station name on screen rather than blanking it.
    #[test]
    fn an_empty_title_is_no_title() {
        assert_eq!(stream_title(&block("StreamTitle='';")), None);
        assert_eq!(stream_title(&block("StreamTitle='   ';")), None);
        assert_eq!(stream_title(&block("StreamUrl='http://x';")), None);
    }

    #[test]
    fn an_empty_block_is_no_title() {
        assert_eq!(stream_title(&[]), None);
        assert_eq!(stream_title(&[0; 16]), None);
    }

    #[test]
    fn utf8_is_decoded_as_utf8() {
        let parsed = stream_title(&block("StreamTitle='サカナクション - 新宝島';"));
        assert_eq!(parsed.as_deref(), Some("サカナクション - 新宝島"));
    }

    /// A Latin-1 block is not valid UTF-8, and must come back whole rather than
    /// as replacement characters.
    #[test]
    fn latin1_bytes_decode_to_their_codepoints() {
        let mut bytes = b"StreamTitle='Bj".to_vec();
        bytes.push(0xF6); // 'ö' in Latin-1: a lone continuation-looking byte.
        bytes.extend_from_slice(b"rk - Joga';");
        assert!(
            std::str::from_utf8(&bytes).is_err(),
            "the fixture must be non-UTF-8"
        );

        let parsed = stream_title(&bytes);
        assert_eq!(parsed.as_deref(), Some("Björk - Joga"));
    }

    /// CP1251 comes out as mojibake, and that is the recorded behaviour rather
    /// than an oversight: it is intact, and `U+FFFD` would not be.
    #[test]
    fn an_undetectable_encoding_survives_as_mojibake_rather_than_replacement() {
        let mut bytes = b"StreamTitle='".to_vec();
        bytes.extend_from_slice(&[0xCC, 0xF3, 0xE7, 0xFB, 0xEA, 0xE0]); // "Музыка"
        bytes.extend_from_slice(b"';");

        let parsed = stream_title(&bytes).expect("a title");
        assert!(!parsed.contains('\u{FFFD}'), "nothing was replaced away");
        assert_eq!(
            parsed.chars().count(),
            6,
            "one char per byte, all preserved"
        );
    }

    /// Every byte sequence is a legal input, so the parser is walked over a
    /// corpus of deliberately broken ones purely to prove none can panic.
    #[test]
    fn no_byte_sequence_panics() {
        let corpus: [&[u8]; 8] = [
            b"StreamTitle=",
            b"StreamTitle='",
            b"StreamTitle=';",
            b"';';';",
            b"StreamTitle",
            &[0xFF; 32],
            &[0x00; 4080],
            &[0xC3], // a truncated UTF-8 lead byte
        ];
        for bytes in corpus {
            let _ = stream_title(bytes);
        }
    }
}
