//! The Spotify→YouTube matcher, against v1's own expectations.
//!
//! Every case below is ported from `spotify-match.test.ts`, including the four
//! regressions its comments call out by number — they are the cases that were
//! wrong in production once and must not become wrong again.

use shiranami_core::models::{MatchFlag, SearchResult};
use shiranami_downloader::extract::matcher::{
    duration_score, is_topic_channel, normalize_for_match, token_similarity,
};
use shiranami_downloader::extract::spotify::SpotifyTrack;
use shiranami_downloader::extract::{CONFIDENCE_THRESHOLD, pick_best_match, score_candidate};

/// A candidate with sane defaults, so each test sets only what matters.
fn candidate(id: &str, title: &str, uploader: &str, duration: f64) -> SearchResult {
    SearchResult {
        id: id.to_owned(),
        title: title.to_owned(),
        uploader: uploader.to_owned(),
        duration,
        thumbnail: String::new(),
        url: String::new(),
        webpage_url: String::new(),
        view_count: None,
        match_confidence: None,
        match_flag: None,
    }
}

/// A candidate with a view count, for the tie-break cases.
fn viewed(id: &str, title: &str, uploader: &str, duration: f64, views: i64) -> SearchResult {
    SearchResult {
        view_count: Some(views),
        ..candidate(id, title, uploader, duration)
    }
}

fn track(title: &str, artist: &str, duration_sec: Option<f64>) -> SpotifyTrack {
    SpotifyTrack {
        title: title.to_owned(),
        artist: artist.to_owned(),
        album: None,
        duration_sec,
        isrc: None,
    }
}

#[test]
fn normalization_lowercases_strips_brackets_and_drops_feat_credits() {
    assert_eq!(
        normalize_for_match("Söng Name (Official Video) feat. Someone"),
        "song name",
        "the diacritic strip needs NFKD decomposition to have happened first"
    );
}

#[test]
fn normalization_collapses_punctuation_and_whitespace() {
    assert_eq!(normalize_for_match("A.B - C!!  D"), "a b c d");
}

#[test]
fn normalization_keeps_with_in_song_titles() {
    // v1's V3 regression: "with" is a common preposition, not a credit marker.
    assert_eq!(normalize_for_match("Stay With Me"), "stay with me");
    assert_eq!(
        normalize_for_match("Walking with a Ghost"),
        "walking with a ghost"
    );
    assert_eq!(normalize_for_match("Live With Me"), "live with me");
}

#[test]
fn token_similarity_is_one_for_identical_sets_and_zero_for_disjoint_ones() {
    assert_eq!(token_similarity("hello world", "world hello"), 1.0);
    assert_eq!(token_similarity("aaa bbb", "ccc ddd"), 0.0);
}

#[test]
fn token_similarity_rewards_full_containment_of_the_smaller_side() {
    assert_eq!(
        token_similarity("song name", "song name official music video"),
        1.0,
        "a candidate carrying promo words must not be punished for them"
    );
}

#[test]
fn token_similarity_of_an_empty_side_is_zero() {
    assert_eq!(token_similarity("", "anything"), 0.0);
    assert_eq!(token_similarity("anything", ""), 0.0);
}

#[test]
fn duration_scores_one_inside_the_exact_window_and_decays_outside_it() {
    assert_eq!(duration_score(Some(200.0), 202.0), 1.0);

    let near = duration_score(Some(200.0), 210.0);
    let far = duration_score(Some(200.0), 260.0);
    assert!(near > far);
    assert!(far < 0.1, "an hour-mix must collapse, not merely dip");
}

#[test]
fn an_unknown_duration_scores_neutrally() {
    assert_eq!(
        duration_score(None, 200.0),
        0.5,
        "the regex fallbacks recover no duration — scoring it as a mismatch \
         would make every fallback-parsed track look wrong"
    );
    assert_eq!(duration_score(Some(200.0), 0.0), 0.5);
}

#[test]
fn detects_auto_generated_artist_channels() {
    assert!(is_topic_channel("Daft Punk - Topic"));
    assert!(is_topic_channel("Daft Punk -   topic  "));
    assert!(!is_topic_channel("Some VEVO"));
}

#[test]
fn scores_a_clean_studio_match_high() {
    let daft_punk = SpotifyTrack {
        album: Some("Random Access Memories".to_owned()),
        isrc: Some("USQX91300108".to_owned()),
        ..track("Get Lucky", "Daft Punk", Some(248.0))
    };

    let score = score_candidate(
        &daft_punk,
        &candidate("a", "Daft Punk - Get Lucky", "Daft Punk - Topic", 249.0),
    );

    assert!(score > 0.8, "a clean studio match scored {score}");
}

#[test]
fn penalises_a_live_candidate_with_the_wrong_duration() {
    let daft_punk = track("Get Lucky", "Daft Punk", Some(248.0));

    let studio = score_candidate(
        &daft_punk,
        &candidate("s", "Daft Punk - Get Lucky", "Some Channel", 248.0),
    );
    let live = score_candidate(
        &daft_punk,
        &candidate("l", "Get Lucky (Live at Coachella)", "Some Channel", 320.0),
    );

    assert!(studio > live);
}

#[test]
fn does_not_penalise_a_forbidden_word_the_spotify_track_itself_carries() {
    let remix = track(
        "Around the World - Radio Edit Remix",
        "Daft Punk",
        Some(200.0),
    );

    let score = score_candidate(
        &remix,
        &candidate(
            "r",
            "Daft Punk - Around the World (Remix)",
            "Some Channel",
            200.0,
        ),
    );

    assert!(
        score > 0.7,
        "an official remix release must match its own remix upload; scored {score}"
    );
}

#[test]
fn penalises_a_live_candidate_even_when_the_track_is_titled_alive() {
    // v1's V5 regression: "Alive" contains "live" as a substring, and the
    // space-padded comparison is what stops it suppressing the penalty.
    let alive = track("Alive", "Pearl Jam", Some(220.0));

    let live = score_candidate(
        &alive,
        &candidate("l", "Band - Live at the Garden", "Some Channel", 340.0),
    );
    let studio = score_candidate(
        &alive,
        &candidate("s", "Pearl Jam - Alive", "Some Channel", 221.0),
    );

    assert!(studio > live);
}

#[test]
fn a_track_released_as_live_suppresses_the_live_penalty() {
    // v1's V5 regression, the other direction.
    let official_live = track("Something in the Way (Live)", "Nirvana", Some(230.0));

    let with_live = score_candidate(
        &official_live,
        &candidate(
            "a",
            "Nirvana - Something in the Way (Live)",
            "Some Channel",
            232.0,
        ),
    );
    let without_live = score_candidate(
        &official_live,
        &candidate("b", "Nirvana - Something in the Way", "Some Channel", 232.0),
    );

    assert!(
        with_live >= without_live - 0.01,
        "{with_live} must not be penalised against {without_live}"
    );
}

#[test]
fn penalises_a_remix_marked_with_adjacent_punctuation() {
    // v1's V5 regression: `-Remix-` has no spaces around the word, which the
    // punctuation collapse is what turns into a whole-word match.
    let get_lucky = track("Get Lucky", "Daft Punk", Some(248.0));

    let remix = score_candidate(
        &get_lucky,
        &candidate("r", "Get Lucky -Remix-", "Some Channel", 248.0),
    );
    let clean = score_candidate(
        &get_lucky,
        &candidate("c", "Daft Punk - Get Lucky", "Some Channel", 248.0),
    );

    assert!(clean > remix);
}

/// The track every `pick_best_match` case scores against.
fn bohemian() -> SpotifyTrack {
    SpotifyTrack {
        album: Some("A Night at the Opera".to_owned()),
        isrc: Some("GBUM71029604".to_owned()),
        ..track("Bohemian Rhapsody", "Queen", Some(354.0))
    }
}

#[test]
fn an_empty_candidate_list_resolves_to_nothing() {
    let matched = pick_best_match(&bohemian(), &[]);

    assert!(matched.result.is_none());
    assert_eq!(matched.flag, MatchFlag::Low);
    assert_eq!(matched.confidence, 0.0);
}

#[test]
fn the_studio_version_beats_every_derivative_upload() {
    let candidates = vec![
        viewed(
            "live",
            "Bohemian Rhapsody (Live Aid 1985)",
            "Live Vids",
            360.0,
            50_000_000,
        ),
        viewed(
            "cover",
            "Bohemian Rhapsody - Cover by SomeBand",
            "SomeBand",
            350.0,
            9_000_000,
        ),
        viewed(
            "remix",
            "Bohemian Rhapsody (EDM Remix)",
            "RemixHub",
            240.0,
            4_000_000,
        ),
        viewed(
            "nightcore",
            "Nightcore - Bohemian Rhapsody",
            "NightcoreWorld",
            300.0,
            3_000_000,
        ),
        viewed(
            "spedup",
            "Bohemian Rhapsody (Sped Up)",
            "SpedUpSongs",
            300.0,
            2_000_000,
        ),
        viewed(
            "hourmix",
            "Bohemian Rhapsody 1 Hour Loop",
            "LoopChannel",
            3600.0,
            8_000_000,
        ),
        viewed(
            "album",
            "Queen - A Night at the Opera (Full Album)",
            "AlbumRips",
            2580.0,
            1_500_000,
        ),
        viewed(
            "original",
            "Queen - Bohemian Rhapsody (Official Video)",
            "Queen Official",
            355.0,
            1_000_000,
        ),
    ];

    let matched = pick_best_match(&bohemian(), &candidates);

    assert_eq!(
        matched.result.map(|result| result.id),
        Some("original".to_owned()),
        "the live upload has fifty times the views and still must lose"
    );
    assert_eq!(matched.flag, MatchFlag::Ok);
    assert!(matched.confidence >= CONFIDENCE_THRESHOLD);
}

#[test]
fn a_wrong_only_candidate_set_still_returns_a_winner_but_flags_it() {
    let candidates = vec![
        candidate(
            "live",
            "Bohemian Rhapsody (Live Aid 1985)",
            "Live Vids",
            480.0,
        ),
        candidate(
            "hourmix",
            "Bohemian Rhapsody 1 Hour Loop",
            "LoopChannel",
            3600.0,
        ),
        candidate(
            "album",
            "Queen - A Night at the Opera (Full Album)",
            "AlbumRips",
            2580.0,
        ),
    ];

    let matched = pick_best_match(&bohemian(), &candidates);

    assert!(
        matched.result.is_some(),
        "import with a warning, never silently skip — a quietly short \
         playlist gives the user nothing to act on"
    );
    assert_eq!(matched.flag, MatchFlag::Low);
    assert!(matched.confidence < CONFIDENCE_THRESHOLD);
}

#[test]
fn ties_break_toward_the_higher_view_count() {
    let candidates = vec![
        viewed(
            "low-views",
            "Queen - Bohemian Rhapsody",
            "Queen - Topic",
            354.0,
            100,
        ),
        viewed(
            "high-views",
            "Queen - Bohemian Rhapsody",
            "Queen - Topic",
            354.0,
            5_000_000,
        ),
    ];

    assert_eq!(
        pick_best_match(&bohemian(), &candidates)
            .result
            .map(|result| result.id),
        Some("high-views".to_owned())
    );
}

#[test]
fn ties_on_views_break_toward_the_topic_channel() {
    let candidates = vec![
        viewed(
            "reupload",
            "Queen - Bohemian Rhapsody",
            "Some Reuploader",
            354.0,
            42,
        ),
        viewed(
            "official",
            "Queen - Bohemian Rhapsody",
            "Queen - Topic",
            354.0,
            42,
        ),
    ];

    assert_eq!(
        pick_best_match(&bohemian(), &candidates)
            .result
            .map(|result| result.id),
        Some("official".to_owned()),
        "a Topic channel carries the official audio"
    );
}

#[test]
fn a_usable_match_still_resolves_when_the_duration_is_unknown() {
    let no_duration = track("Bohemian Rhapsody", "Queen", None);

    let matched = pick_best_match(
        &no_duration,
        &[candidate(
            "studio",
            "Queen - Bohemian Rhapsody (Official Video)",
            "Queen Official",
            355.0,
        )],
    );

    assert_eq!(
        matched.result.map(|result| result.id),
        Some("studio".to_owned()),
        "the embed fallback supplies no duration and must still import"
    );
}
