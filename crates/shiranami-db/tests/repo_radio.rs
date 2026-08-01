//! The radio-favorites repository, against real databases.
//!
//! Ported from the cases `apps/desktop/src/main/ipc/radio.test.ts` covers for
//! `radio:favorites:*`.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::models::RadioStationInput;
use shiranami_db::repo::radio;

use activity::{Fixture, count_rows, exec, fresh};

/// A station with only the required fields set.
fn station(uuid: &str, name: &str) -> RadioStationInput {
    RadioStationInput {
        station_uuid: uuid.to_owned(),
        name: name.to_owned(),
        url: format!("https://{uuid}.example/stream"),
        url_resolved: format!("https://{uuid}.example/stream.mp3"),
        ..RadioStationInput::default()
    }
}

async fn with_stations(stations: &[(&str, &str, &str)]) -> Fixture {
    let mut fixture = fresh().await;
    // Inserted directly so `created_at` can be set explicitly — `add` leaves it
    // to the column default, which would give every row in a test the same
    // whole second and make the ordering assertion meaningless.
    for (id, uuid, created_at) in stations {
        exec(
            fixture.conn(),
            &format!(
                "INSERT INTO radio_favorites \
                   (id, station_uuid, name, url, url_resolved, created_at) \
                 VALUES ('{id}', '{uuid}', 'Station {uuid}', \
                         'https://{uuid}.example/s', 'https://{uuid}.example/s.mp3', \
                         '{created_at}')"
            ),
        )
        .await;
    }
    fixture
}

#[tokio::test]
async fn saved_stations_come_back_newest_first() {
    let mut fixture = with_stations(&[
        ("r1", "uuid-1", "2026-06-01 10:00:00"),
        ("r2", "uuid-2", "2026-06-03 10:00:00"),
        ("r3", "uuid-3", "2026-06-02 10:00:00"),
    ])
    .await;

    let saved = radio::all(fixture.conn())
        .await
        .expect("the favourites must read");

    let ids: Vec<_> = saved.iter().map(|entry| entry.id.as_str()).collect();
    assert_eq!(ids, ["r2", "r3", "r1"]);
}

#[tokio::test]
async fn adding_a_station_returns_the_stored_row() {
    let mut fixture = fresh().await;

    let mut input = station("uuid-1", "Lofi Girl");
    input.homepage = Some("https://lofigirl.com".to_owned());
    input.country_code = Some("FR".to_owned());
    input.bitrate = Some(128);
    input.tags = Some("lofi,chill".to_owned());

    let saved = radio::add(fixture.conn(), "r1", &input)
        .await
        .expect("the station must save");

    assert_eq!(saved.id, "r1");
    assert_eq!(saved.station_uuid, "uuid-1");
    assert_eq!(saved.name, "Lofi Girl");
    assert_eq!(saved.homepage.as_deref(), Some("https://lofigirl.com"));
    assert_eq!(saved.bitrate, Some(128));
    assert_eq!(saved.tags.as_deref(), Some("lofi,chill"));
    // Untouched optional fields stay NULL rather than becoming empty strings.
    assert_eq!(saved.favicon, None);
    assert_eq!(saved.language, None);
}

#[tokio::test]
async fn a_saved_station_carries_sqlites_timestamp_format_not_javascripts() {
    let mut fixture = fresh().await;

    let saved = radio::add(fixture.conn(), "r1", &station("uuid-1", "Lofi Girl"))
        .await
        .expect("the station must save");

    // `add` leaves `created_at` to the column's `datetime('now')` default, as
    // v1 did, so the value has a space and no zone marker. This is *not*
    // interchangeable with the ISO-8601 the history table stores: `all` orders
    // by this column as text, and mixing the two formats would sort every new
    // favourite below every old one — `'T'` (0x54) is above `' '` (0x20).
    assert!(
        !saved.created_at.contains('T') && !saved.created_at.ends_with('Z'),
        "created_at must keep SQLite's format, got `{}`",
        saved.created_at
    );
    assert_eq!(
        saved.created_at.len(),
        "2026-06-01 10:00:00".len(),
        "got `{}`",
        saved.created_at
    );
}

#[tokio::test]
async fn saving_the_same_station_twice_is_refused() {
    let mut fixture = fresh().await;
    radio::add(fixture.conn(), "r1", &station("uuid-1", "Lofi Girl"))
        .await
        .expect("the first save must succeed");

    let again = radio::add(fixture.conn(), "r2", &station("uuid-1", "Lofi Girl")).await;

    // `station_uuid` is UNIQUE and v1 let the violation surface rather than
    // silently upserting — the renderer guards with `is_favorite` first.
    assert!(again.is_err(), "a duplicate station_uuid must be refused");
    assert_eq!(count_rows(fixture.conn(), "radio_favorites").await, 1);
}

#[tokio::test]
async fn is_favorite_answers_for_both_cases() {
    let mut fixture = with_stations(&[("r1", "uuid-1", "2026-06-01 10:00:00")]).await;

    assert!(
        radio::is_favorite(fixture.conn(), "uuid-1")
            .await
            .expect("the check must run")
    );
    assert!(
        !radio::is_favorite(fixture.conn(), "uuid-missing")
            .await
            .expect("the check must run")
    );
}

#[tokio::test]
async fn removing_a_station_is_keyed_on_the_directory_id() {
    let mut fixture = with_stations(&[
        ("r1", "uuid-1", "2026-06-01 10:00:00"),
        ("r2", "uuid-2", "2026-06-02 10:00:00"),
    ])
    .await;

    // Keyed on `station_uuid`, not the row id: that is the id the renderer
    // holds while browsing the directory.
    radio::remove(fixture.conn(), "uuid-1")
        .await
        .expect("the station must be removed");

    let saved = radio::all(fixture.conn())
        .await
        .expect("the favourites must read");
    let ids: Vec<_> = saved.iter().map(|entry| entry.id.as_str()).collect();
    assert_eq!(ids, ["r2"]);
}

#[tokio::test]
async fn removing_a_station_that_was_never_saved_is_not_an_error() {
    let mut fixture = with_stations(&[("r1", "uuid-1", "2026-06-01 10:00:00")]).await;

    radio::remove(fixture.conn(), "uuid-never-saved")
        .await
        .expect("removing nothing is a no-op, as it was in v1");

    assert_eq!(count_rows(fixture.conn(), "radio_favorites").await, 1);
}
