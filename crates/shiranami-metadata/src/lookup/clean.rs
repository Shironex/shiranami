//! Turning a messy track title into something worth searching for.
//!
//! A direct port of `cleanTitleForSearch` in
//! `apps/desktop/src/main/services/metadata-lookup.ts`. Order matters — the
//! rules are not commutative, e.g. the pipe rule must run before the whitespace
//! collapse, and the artist-prefix strip must run before anything else because
//! it matches on the raw string.
//!
//! The library this exists for is largely YouTube rips, so the noise is
//! specific and hard-won: `(Official Video)`, `[NMV]`, `【Emotional】`,
//! `「」` quotes, `Nightcore - ` prefixes, everything after a full-width pipe.
//! Every rule below is pinned by a test lifted from v1's own suite, so the
//! thirty cases that shaped these patterns survive the port.

use regex::Regex;
use shiranami_core::UNKNOWN_ARTIST;
use std::sync::LazyLock;

/// Parenthesised noise. The long one.
///
/// Verbatim from v1, including `Prod\.?\s*[^)]*` (which swallows the whole
/// producer credit) and `MOURN\s*\d*` (an artist-specific tag that earned its
/// place). `(feat. …)` is deliberately **absent**: v1 keeps parenthesised
/// features and strips only trailing bare ones, via [`FEAT`].
///
/// `\d` is written `(?-u:\d)` because JavaScript's `\d` is ASCII-only, and a
/// Unicode one would also match e.g. Devanagari digits.
static PARENTHETICAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\s*\((?:Official\s*(?:Video|Audio|Lyric\s*Video|Visualizer|Music\s*Video)|Lyrics?|MV|Audio|Visualizer|AMV|Prod\.?\s*[^)]*|MOURN\s*(?-u:\d)*|Male\s*Version|Female\s*Version|Rock\s*(?:Version|Cover)|Cover|Remix|Extended|80s\s*Remix)\)",
    )
    .expect("the parenthetical pattern is a valid regex")
});

/// Square-bracketed anything: `[NMV]`, `[Official Audio]`, `[Looped/Extended]`.
static BRACKETED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s*\[[^\]]*\]").expect("valid"));

/// CJK corner quotes, replaced with a space so words stay separated.
static CJK_QUOTES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[「」『』]").expect("valid"));

/// CJK lenticular brackets and their contents: `【Emotional】`.
static CJK_LENTICULAR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"【[^】]*】").expect("valid"));

/// Everything from the first pipe onward — usually a channel name.
static PIPE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s*[|｜]\s*.*").expect("valid"));

/// Underscores used as word separators.
static UNDERSCORES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s*_\s*").expect("valid"));

/// A leading `Nightcore - ` / `Nightcore – `.
static NIGHTCORE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^Nightcore\s*[-–]\s*").expect("valid"));

/// A trailing bare `ft.` / `feat.` credit.
static FEAT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s*(?:ft\.?|feat\.?)\s+.+$").expect("valid"));

/// Runs of whitespace.
static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").expect("valid"));

/// Left-hand sides of a `Artist - Title` split that are not artist names.
///
/// Used by [`split_artist_and_title`], not by [`clean_title_for_search`].
/// `\b` is ASCII (`(?-u:\b)`) to match JavaScript's, which treats every CJK
/// character as a non-word character — so `Nightcore歌` still splits after
/// `Nightcore`, as it does in v1.
static NON_ARTIST_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)^(nightcore|amv|mv|lyrics?|official|hd|hq|full|extended|remix|cover|male|female)(?-u:\b)",
    )
    .expect("valid")
});

/// Strip search noise from a title.
///
/// If cleaning empties the string, the **original** title is returned — v1 ends
/// with `return cleaned || title`, and a test pins that `"(Official Video)"`
/// cleans to itself rather than to nothing. Searching for a bad title beats
/// searching for an empty one.
pub fn clean_title_for_search(title: &str, artist: &str) -> String {
    let mut cleaned = strip_artist_prefix(title, artist);

    cleaned = PARENTHETICAL.replace_all(&cleaned, "").into_owned();
    cleaned = BRACKETED.replace_all(&cleaned, "").into_owned();
    cleaned = CJK_QUOTES.replace_all(&cleaned, " ").into_owned();
    cleaned = CJK_LENTICULAR.replace_all(&cleaned, "").into_owned();
    cleaned = PIPE_SUFFIX.replace_all(&cleaned, "").into_owned();
    cleaned = UNDERSCORES.replace_all(&cleaned, " ").into_owned();
    cleaned = NIGHTCORE.replace_all(&cleaned, "").into_owned();
    cleaned = FEAT.replace_all(&cleaned, "").into_owned();
    cleaned = WHITESPACE.replace_all(&cleaned, " ").trim().to_owned();

    if cleaned.is_empty() {
        return title.to_owned();
    }
    cleaned
}

/// Remove a leading `<artist> - ` or `<artist> – `, case-insensitively.
///
/// v1 sliced by `artist.length + 3` after a lowercase `startsWith`, so the
/// match is on the *original* casing's length. Reproduced by comparing
/// lowercased prefixes and cutting the original at the same character count —
/// which matters for non-ASCII artists, where lowercasing can change byte
/// length.
fn strip_artist_prefix(title: &str, artist: &str) -> String {
    if artist.is_empty() || artist == UNKNOWN_ARTIST {
        return title.to_owned();
    }

    let artist_lower = artist.to_lowercase();
    let title_lower = title.to_lowercase();

    for dash in ["-", "–"] {
        let prefix = format!("{artist_lower} {dash} ");
        if title_lower.starts_with(&prefix) {
            // Count characters, not bytes: the lowercase prefix and the
            // original may differ in length in either unit, and v1 counted
            // UTF-16 units of the *original* artist.
            let skip = artist.chars().count() + 3;
            return title.chars().skip(skip).collect();
        }
    }

    title.to_owned()
}

/// Split a `Artist - Title` style name when the track's own artist is useless.
///
/// Ported from the head of `lookupMetadata`. Only applied when the artist is
/// the unknown sentinel or the title does not already start with it, and the
/// left-hand side is discarded rather than believed when it is one of the
/// [`NON_ARTIST_PREFIX`] words — `Nightcore - Sorry` must not search for an
/// artist called "Nightcore".
///
/// Returns `(artist, title)`.
pub fn split_artist_and_title(title: &str, artist: &str) -> (String, String) {
    let already_prefixed = !artist.is_empty()
        && artist != UNKNOWN_ARTIST
        && title.to_lowercase().starts_with(&artist.to_lowercase());

    if already_prefixed {
        return (artist.to_owned(), title.to_owned());
    }

    let Some((left, right)) = split_on_dash(title) else {
        return (artist.to_owned(), title.to_owned());
    };

    if NON_ARTIST_PREFIX.is_match(&left) {
        return (UNKNOWN_ARTIST.to_owned(), right);
    }
    (left, right)
}

/// The `/^(.+?)\s*[-–]\s*(.+)$/` split: first dash, non-greedy left side.
fn split_on_dash(title: &str) -> Option<(String, String)> {
    static DASH: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^(.+?)\s*[-–]\s*(.+)$").expect("valid"));

    let captures = DASH.captures(title)?;
    Some((
        captures.get(1)?.as_str().to_owned(),
        captures.get(2)?.as_str().to_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every case below is lifted from `metadata-lookup.test.ts`.
    #[track_caller]
    fn assert_cleans(title: &str, artist: &str, expected: &str) {
        assert_eq!(clean_title_for_search(title, artist), expected);
    }

    #[test]
    fn the_artist_prefix_is_stripped_in_both_dash_forms() {
        assert_cleans("Lil Peep - Belgium (Official Video)", "Lil Peep", "Belgium");
        assert_cleans("Lil Peep – Belgium", "Lil Peep", "Belgium");
        assert_cleans("LIL PEEP - Belgium", "Lil Peep", "Belgium");
    }

    #[test]
    fn an_artist_name_that_is_not_a_prefix_is_left_alone() {
        assert_cleans(
            "Best of Lil Peep - Belgium",
            "Lil Peep",
            "Best of Lil Peep - Belgium",
        );
    }

    #[test]
    fn parenthesised_noise_is_removed() {
        for noise in [
            "(Official Video)",
            "(Official Audio)",
            "(Official Music Video)",
            "(Visualizer)",
            "(Lyrics)",
            "(Official Lyric Video)",
            "(Prod. Someone)",
            "(Male Version)",
            "(Rock Cover)",
        ] {
            assert_cleans(&format!("Belgium {noise}"), "", "Belgium");
        }
    }

    #[test]
    fn square_brackets_are_removed_whatever_they_hold() {
        assert_cleans("Sorry [NMV]", "", "Sorry");
        assert_cleans("Sorry [Official Audio]", "", "Sorry");
        assert_cleans("Sorry [Looped/Extended]", "", "Sorry");
    }

    #[test]
    fn cjk_quotes_become_spaces_so_words_stay_separated() {
        assert_cleans("In The End「Linkin Park」", "", "In The End Linkin Park");
    }

    #[test]
    fn cjk_lenticular_brackets_are_removed_with_their_contents() {
        assert_cleans("【Emotional】Kokoronashi", "", "Kokoronashi");
    }

    #[test]
    fn everything_after_a_pipe_is_dropped() {
        assert_cleans("Sorry | Some Channel", "", "Sorry");
        assert_cleans("Sorry ｜ Some Channel", "", "Sorry");
    }

    #[test]
    fn a_nightcore_prefix_is_stripped_case_insensitively() {
        assert_cleans("Nightcore - Sorry", "", "Sorry");
        assert_cleans("Nightcore – Sorry", "", "Sorry");
        assert_cleans("NIGHTCORE - Sorry", "", "Sorry");
    }

    #[test]
    fn a_trailing_feature_credit_is_stripped() {
        assert_cleans("Belgium ft. Someone", "", "Belgium");
        assert_cleans("Belgium feat. Someone Else", "", "Belgium");
    }

    #[test]
    fn underscores_become_spaces() {
        assert_cleans("Lost_Umbrella", "", "Lost Umbrella");
    }

    #[test]
    fn the_rules_compose() {
        assert_cleans(
            "Lil Peep - Belgium (Official Video) ft. Someone",
            "Lil Peep",
            "Belgium",
        );
        assert_cleans("Nightcore - Sorry (Lyrics) [HD]", "Some Channel", "Sorry");
        assert_cleans("【Emotional】Song_Name (Official Video)", "", "Song Name");
    }

    #[test]
    fn cleaning_to_nothing_returns_the_original() {
        // v1's `return cleaned || title`. Searching for a bad title beats
        // searching for an empty one.
        assert_cleans("(Official Video)", "", "(Official Video)");
    }

    #[test]
    fn the_unknown_sentinel_is_not_treated_as_an_artist_prefix() {
        assert_cleans(
            "Unknown Artist - Belgium",
            UNKNOWN_ARTIST,
            "Unknown Artist - Belgium",
        );
    }

    #[test]
    fn a_dash_split_believes_a_plausible_artist() {
        let (artist, title) = split_artist_and_title("Lil Peep - Belgium", UNKNOWN_ARTIST);
        assert_eq!(artist, "Lil Peep");
        assert_eq!(title, "Belgium");
    }

    #[test]
    fn a_dash_split_discards_a_non_artist_prefix() {
        // "Nightcore" is a genre tag, not a band.
        let (artist, title) = split_artist_and_title("Nightcore - Sorry", UNKNOWN_ARTIST);
        assert_eq!(artist, UNKNOWN_ARTIST);
        assert_eq!(title, "Sorry");
    }

    #[test]
    fn a_title_already_starting_with_its_artist_is_not_split() {
        let (artist, title) = split_artist_and_title("Lil Peep - Belgium", "Lil Peep");
        assert_eq!(artist, "Lil Peep");
        assert_eq!(title, "Lil Peep - Belgium");
    }

    #[test]
    fn a_title_with_no_dash_is_not_split() {
        let (artist, title) = split_artist_and_title("Belgium", UNKNOWN_ARTIST);
        assert_eq!(artist, UNKNOWN_ARTIST);
        assert_eq!(title, "Belgium");
    }

    #[test]
    fn a_non_ascii_artist_prefix_is_cut_at_the_right_place() {
        // v1 sliced by `artist.length + 3`, counting UTF-16 units. Cutting by
        // bytes here would corrupt the remainder.
        assert_cleans("ヨルシカ - 花に亡霊", "ヨルシカ", "花に亡霊");
    }
}
