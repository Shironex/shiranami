//! `last_played` evaluated against real play history.
//!
//! Split from `repo_smart_playlist_eval.rs` under the module-size cap, along
//! the seam the field already has: every other rule compiles to a comparison
//! against a `tracks` column, while this one is a scoped `EXISTS` over
//! `play_history` and turns on two things nothing else does — which rows count
//! as a play, and whether a stored timestamp and a computed cutoff are spelled
//! the same way. The compiler's side of it is `smart_rules_analysis.rs`.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    SmartPlaylistField as Field, SmartPlaylistMatchType as Match, SmartPlaylistOperator as Op,
};

use library::{definition, fresh, played, played_ago, preview, rule, tagged};

#[tokio::test]
async fn last_played_in_last_days_matches_only_plays_inside_the_window() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let stale = tagged(library.conn(), "Stale", "Lofi", None).await;
    tagged(library.conn(), "Never", "Lofi", None).await;
    played(library.conn(), &recent, 3, "library").await;
    played(library.conn(), &stale, 120, "library").await;

    let matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LastPlayed, Op::InLastDays, "90")],
        ),
    )
    .await;

    assert_eq!(matched, vec!["Recent"]);
}

/// The single most-requested rule, and the one easiest to get wrong: a track
/// with no play history at all has not been played in the last 90 days.
#[tokio::test]
async fn last_played_not_in_last_days_includes_a_never_played_track() {
    let mut library = fresh().await;
    let recent = tagged(library.conn(), "Recent", "Lofi", None).await;
    let stale = tagged(library.conn(), "Stale", "Lofi", None).await;
    tagged(library.conn(), "Never", "Lofi", None).await;
    played(library.conn(), &recent, 3, "library").await;
    played(library.conn(), &stale, 120, "library").await;

    let mut matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LastPlayed, Op::NotInLastDays, "90")],
        ),
    )
    .await;
    matched.sort();

    assert_eq!(matched, vec!["Never", "Stale"]);
}

#[tokio::test]
async fn last_played_reads_the_newest_play_not_the_oldest() {
    let mut library = fresh().await;
    let revisited = tagged(library.conn(), "Revisited", "Lofi", None).await;
    played(library.conn(), &revisited, 400, "library").await;
    played(library.conn(), &revisited, 2, "library").await;

    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::InLastDays, "30")],
            ),
        )
        .await,
        vec!["Revisited"]
    );
    assert!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::NotInLastDays, "30")],
            ),
        )
        .await
        .is_empty()
    );
}

/// The window ends where the cutoff is, not where the cutoff's day starts.
///
/// `played_at` holds `2026-07-12T05:00:00.000Z` and is compared as text. A
/// cutoff spelled `datetime('now', '-30 days')` renders `2026-07-12 10:15:00`,
/// and the comparison decides at byte 10 — `'T'` (0x54) against `' '` (0x20) —
/// so *every* play on the cutoff day read as inside the window. These two
/// tracks were played before the cutoff and were still excluded from "not
/// played in the last 30 days"; the effect ran to a full extra day at the far
/// end of every day-count rule on this field.
#[tokio::test]
async fn last_played_compares_against_a_cutoff_in_the_stored_timestamp_format() {
    let mut library = fresh().await;
    let hours = tagged(library.conn(), "Hours Past", "Lofi", None).await;
    let seconds = tagged(library.conn(), "Seconds Past", "Lofi", None).await;
    let inside = tagged(library.conn(), "Inside", "Lofi", None).await;
    // Both are older than the cutoff, so both belong in the negated rule. The
    // one-second case is the sharp end: it lands on the cutoff's own day for
    // all but one second of the day, which is when the old comparison was
    // wrong.
    played_ago(library.conn(), &hours, &["-30 days", "-5 hours"], "library").await;
    played_ago(
        library.conn(),
        &seconds,
        &["-30 days", "-1 second"],
        "library",
    )
    .await;
    played_ago(library.conn(), &inside, &["-29 days"], "library").await;

    let mut matched = preview(
        library.conn(),
        &definition(
            Match::All,
            vec![rule(Field::LastPlayed, Op::NotInLastDays, "30")],
        ),
    )
    .await;
    matched.sort();

    assert_eq!(matched, vec!["Hours Past", "Seconds Past"]);

    // …and the same boundary read from the other direction.
    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::InLastDays, "30")],
            ),
        )
        .await,
        vec!["Inside"]
    );
}

/// A radio row in `play_history` is not a play of the track it is keyed to, so
/// it must neither satisfy "played recently" nor stop the track satisfying
/// "not played recently".
#[tokio::test]
async fn a_radio_play_never_counts_as_playing_the_track() {
    let mut library = fresh().await;
    let track = tagged(library.conn(), "Radio only", "Lofi", None).await;
    played(library.conn(), &track, 1, "radio").await;

    assert!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::InLastDays, "30")],
            ),
        )
        .await
        .is_empty(),
        "a radio row is not a play of this track"
    );
    assert_eq!(
        preview(
            library.conn(),
            &definition(
                Match::All,
                vec![rule(Field::LastPlayed, Op::NotInLastDays, "30")],
            ),
        )
        .await,
        vec!["Radio only"],
        "and it must not hide the track from the negated rule either"
    );
}
