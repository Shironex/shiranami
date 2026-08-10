//! The radio-diary repository, against real databases.
//!
//! No v1 counterpart to port: v1 declined ICY metadata, so there was never a
//! title to keep. The cases below pin what the feature promises instead — a row
//! per distinct title, consecutive repeats collapsed, and a table that stays
//! bounded however long a station is left playing.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::models::RadioNowPlaying;
use shiranami_db::repo::radio_log;

use activity::{Fixture, count_rows, exec, fresh};

const STATION: &str = "11111111-1111-4111-8111-111111111111";
const OTHER: &str = "22222222-2222-4222-8222-222222222222";

/// A title as the de-framer would report it, split included where it applies.
fn playing(raw: &str) -> RadioNowPlaying {
    RadioNowPlaying::new("https://station.example/live", raw)
}

/// Seed a row directly, so `heard_at` can be set explicitly — `record` leaves
/// it to SQLite's clock, which would give every row in a test the same
/// millisecond and make an ordering assertion meaningless.
async fn seed(fixture: &mut Fixture, station_uuid: &str, raw: &str, heard_at: &str) {
    exec(
        fixture.conn(),
        &format!(
            "INSERT INTO radio_log (station_uuid, raw_title, artist, title, heard_at) \
             VALUES ('{station_uuid}', '{raw}', NULL, NULL, '{heard_at}')"
        ),
    )
    .await;
}

#[tokio::test]
async fn a_title_is_recorded_with_its_best_effort_split() {
    let mut fixture = fresh().await;

    let entry = radio_log::record(fixture.conn(), STATION, &playing("Cornelius - Drop"))
        .await
        .expect("the title must record")
        .expect("a first title is never a repeat");

    assert_eq!(entry.station_uuid, STATION);
    assert_eq!(entry.raw, "Cornelius - Drop");
    assert_eq!(entry.artist.as_deref(), Some("Cornelius"));
    assert_eq!(entry.title.as_deref(), Some("Drop"));
    assert!(
        entry.heard_at.contains('T') && entry.heard_at.ends_with('Z'),
        "`{}` is not the ISO-8601 spelling the renderer reads",
        entry.heard_at
    );
}

/// A station ident carries no separator, and is not malformed. It has to be
/// storable, because the user may well want to know one was on air.
#[tokio::test]
async fn a_title_with_no_separator_keeps_only_its_raw_form() {
    let mut fixture = fresh().await;

    let entry = radio_log::record(fixture.conn(), STATION, &playing("SomaFM Groove Salad"))
        .await
        .expect("the title must record")
        .expect("a first title is never a repeat");

    assert_eq!(entry.raw, "SomaFM Groove Salad");
    assert_eq!(entry.artist, None);
    assert_eq!(entry.title, None);
}

/// The de-framer debounces per connection; a reconnect starts a fresh one whose
/// first title is new to it and is not new to the log.
#[tokio::test]
async fn a_consecutive_repeat_is_not_recorded_twice() {
    let mut fixture = fresh().await;

    radio_log::record(fixture.conn(), STATION, &playing("Cornelius - Drop"))
        .await
        .expect("the first must record")
        .expect("a first title is never a repeat");

    let again = radio_log::record(fixture.conn(), STATION, &playing("Cornelius - Drop"))
        .await
        .expect("the repeat must not fail");

    assert!(again.is_none(), "a consecutive repeat writes no row");
    assert_eq!(count_rows(fixture.conn(), "radio_log").await, 1);
}

/// Only *consecutive* repeats collapse. A station that comes back to a song an
/// hour later genuinely played it again, and the diary says so.
#[tokio::test]
async fn the_same_title_after_another_one_is_recorded_again() {
    let mut fixture = fresh().await;

    for raw in [
        "Cornelius - Drop",
        "Boards of Canada - Roygbiv",
        "Cornelius - Drop",
    ] {
        radio_log::record(fixture.conn(), STATION, &playing(raw))
            .await
            .expect("the title must record")
            .expect("none of these is a consecutive repeat");
    }

    assert_eq!(count_rows(fixture.conn(), "radio_log").await, 3);
}

/// The repeat check is per station: two stations playing the same song at the
/// same time are two entries, one in each diary.
#[tokio::test]
async fn the_repeat_check_does_not_reach_across_stations() {
    let mut fixture = fresh().await;

    radio_log::record(fixture.conn(), STATION, &playing("Cornelius - Drop"))
        .await
        .expect("record")
        .expect("first");
    let other = radio_log::record(fixture.conn(), OTHER, &playing("Cornelius - Drop"))
        .await
        .expect("record");

    assert!(
        other.is_some(),
        "another station's identical title is that station's first"
    );
}

#[tokio::test]
async fn a_stations_diary_comes_back_newest_first_and_only_its_own() {
    let mut fixture = fresh().await;
    seed(&mut fixture, STATION, "First", "2026-08-01T10:00:00.000Z").await;
    seed(&mut fixture, STATION, "Third", "2026-08-01T12:00:00.000Z").await;
    seed(&mut fixture, STATION, "Second", "2026-08-01T11:00:00.000Z").await;
    seed(&mut fixture, OTHER, "Elsewhere", "2026-08-01T13:00:00.000Z").await;

    let diary = radio_log::for_station(fixture.conn(), STATION, 10)
        .await
        .expect("the diary must read");

    let titles: Vec<_> = diary.iter().map(|entry| entry.raw.as_str()).collect();
    assert_eq!(titles, ["Third", "Second", "First"]);
}

/// Two titles inside the same millisecond come back in arrival order reversed,
/// which is what the migration's rowid-alias primary key is for.
#[tokio::test]
async fn titles_sharing_an_instant_keep_their_arrival_order() {
    let mut fixture = fresh().await;
    seed(&mut fixture, STATION, "Earlier", "2026-08-01T10:00:00.000Z").await;
    seed(&mut fixture, STATION, "Later", "2026-08-01T10:00:00.000Z").await;

    let diary = radio_log::for_station(fixture.conn(), STATION, 10)
        .await
        .expect("the diary must read");

    let titles: Vec<_> = diary.iter().map(|entry| entry.raw.as_str()).collect();
    assert_eq!(titles, ["Later", "Earlier"]);
}

#[tokio::test]
async fn the_page_size_is_clamped_and_a_non_positive_one_reads_nothing() {
    let mut fixture = fresh().await;
    for index in 0..5 {
        seed(
            &mut fixture,
            STATION,
            &format!("Title {index}"),
            &format!("2026-08-01T10:0{index}:00.000Z"),
        )
        .await;
    }

    let asked_for_three = radio_log::for_station(fixture.conn(), STATION, 3)
        .await
        .expect("read");
    assert_eq!(asked_for_three.len(), 3);

    let asked_for_everything = radio_log::for_station(fixture.conn(), STATION, i64::MAX)
        .await
        .expect("read");
    assert_eq!(
        asked_for_everything.len(),
        5,
        "the clamp is a ceiling, not a floor — five rows is five rows"
    );

    for limit in [0, -1] {
        let nothing = radio_log::for_station(fixture.conn(), STATION, limit)
            .await
            .expect("read");
        assert!(nothing.is_empty(), "limit {limit} must read nothing");
    }
}

/// The bound the whole feature rests on: a station left playing overnight
/// cannot grow the table past the cap.
#[tokio::test]
async fn the_table_is_trimmed_to_its_row_cap_on_insert() {
    let mut fixture = fresh().await;

    // Seeded past the cap directly, then one real `record` to trigger the trim:
    // driving five thousand inserts through the repository would test SQLite's
    // throughput rather than the eviction.
    let overflow = radio_log::MAX_ROWS + 10;
    exec(
        fixture.conn(),
        &format!(
            "WITH RECURSIVE `series`(`n`) AS ( \
                 SELECT 1 UNION ALL SELECT `n` + 1 FROM `series` WHERE `n` < {overflow} \
             ) \
             INSERT INTO radio_log (station_uuid, raw_title, artist, title, heard_at) \
             SELECT '{STATION}', 'Title ' || `n`, NULL, NULL, \
                    strftime('%Y-%m-%dT%H:%M:%fZ', '2020-01-01', '+' || `n` || ' seconds') \
               FROM `series`"
        ),
    )
    .await;
    assert_eq!(count_rows(fixture.conn(), "radio_log").await, overflow);

    radio_log::record(fixture.conn(), STATION, &playing("The newest thing"))
        .await
        .expect("record")
        .expect("a new title");

    assert_eq!(
        count_rows(fixture.conn(), "radio_log").await,
        radio_log::MAX_ROWS,
        "the insert must leave the table at its cap, not above it"
    );

    let newest = radio_log::for_station(fixture.conn(), STATION, 1)
        .await
        .expect("read");
    assert_eq!(
        newest.first().map(|entry| entry.raw.as_str()),
        Some("The newest thing"),
        "eviction takes the oldest rows, never the one just written"
    );
}
