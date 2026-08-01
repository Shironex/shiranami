//! Open-Meteo against a real socket: request shape, payload mapping, caching,
//! and the miss-versus-failure distinction in the geocoder.

mod support;

use shiranami_core::models::weather::WeatherCondition;
use shiranami_integrations::weather::WeatherService;
use shiranami_net::HttpClient;
use support::request::request_line;
use support::test_server::{Reply, TestServer};

fn service(server: &TestServer) -> WeatherService {
    WeatherService::with_endpoints(
        HttpClient::new().expect("the shared client builds"),
        server.url("/v1/forecast"),
        server.url("/v1/search"),
    )
}

fn forecast(temperature: f64, code: u16) -> String {
    serde_json::json!({
        "latitude": 52.23,
        "current": { "time": "2026-08-01T12:00", "temperature_2m": temperature, "weather_code": code },
    })
    .to_string()
}

#[tokio::test]
async fn a_reading_maps_onto_the_shared_model() {
    let server = TestServer::start(vec![Reply::ok(&forecast(18.34, 61))]).await;

    let reading = service(&server)
        .current(52.2297, 21.0122)
        .await
        .expect("a reading");

    assert_eq!(reading.temp_c, 18.3, "rounded to one decimal");
    assert_eq!(reading.condition, WeatherCondition::Rain);
    assert_eq!(reading.label, "Light rain");
}

/// The exact query v1 sent: both coordinates, the two-field `current` list, and
/// an explicit unit so the answer never depends on the server's default.
#[tokio::test]
async fn the_forecast_request_carries_the_ported_parameters() {
    let server = TestServer::start(vec![Reply::ok(&forecast(18.0, 0))]).await;

    service(&server)
        .current(52.2297, 21.0122)
        .await
        .expect("a reading");

    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /v1/forecast?latitude=52.2297&longitude=21.0122\
&current=temperature_2m%2Cweather_code&temperature_unit=celsius HTTP/1.1"
    );
}

/// Open-Meteo asks keyless callers to identify themselves, and this is the
/// string registered with them — not the shared client's default.
#[tokio::test]
async fn the_forecast_request_sends_the_fair_use_user_agent() {
    let server = TestServer::start(vec![Reply::ok(&forecast(18.0, 0))]).await;

    service(&server)
        .current(52.0, 21.0)
        .await
        .expect("a reading");

    let raw = server.requests()[0].to_lowercase();
    assert!(
        raw.contains("user-agent: shiranami-app/"),
        "request was {raw}"
    );
    assert!(raw.contains("accept: application/json"));
}

#[tokio::test]
async fn an_unmapped_code_is_still_a_successful_reading() {
    let server = TestServer::start(vec![Reply::ok(&forecast(4.0, 4))]).await;

    let reading = service(&server)
        .current(52.0, 21.0)
        .await
        .expect("a reading");

    assert_eq!(reading.condition, WeatherCondition::Unknown);
    assert_eq!(reading.label, "Weather");
    assert_eq!(reading.temp_c, 4.0);
}

#[tokio::test]
async fn a_reading_is_cached_per_tile() {
    let server = TestServer::start(vec![Reply::ok(&forecast(18.0, 0))]).await;
    let service = service(&server);

    service.current(52.2297, 21.0122).await.expect("a reading");
    // Within the same ~110 m bucket, so the cache answers.
    service
        .current(52.22971, 21.01221)
        .await
        .expect("a reading");

    assert_eq!(server.received(), 1);
}

#[tokio::test]
async fn a_distant_coordinate_is_a_separate_request() {
    let server = TestServer::start(vec![
        Reply::ok(&forecast(18.0, 0)),
        Reply::ok(&forecast(9.0, 3)),
    ])
    .await;
    let service = service(&server);

    let first = service.current(52.2297, 21.0122).await.expect("a reading");
    let second = service.current(50.06, 19.94).await.expect("a reading");

    assert_eq!(first.temp_c, 18.0);
    assert_eq!(second.temp_c, 9.0);
    assert_eq!(server.received(), 2);
}

/// A card showing a condition with no temperature is broken either way, so a
/// payload missing either field is a failure rather than a partial reading.
#[tokio::test]
async fn a_payload_missing_either_field_is_a_failure() {
    for body in [
        r#"{"current":{"temperature_2m":18.0}}"#,
        r#"{"current":{"weather_code":0}}"#,
        r#"{}"#,
        r#"{"current":null}"#,
    ] {
        let server = TestServer::start(vec![Reply::ok(body)]).await;
        let error = service(&server)
            .current(52.0, 21.0)
            .await
            .expect_err("a malformed payload must fail");

        assert_eq!(
            shiranami_core::error::ErrorPayload::of(&error).code,
            "WEATHER_UNAVAILABLE"
        );
    }
}

#[tokio::test]
async fn a_non_2xx_is_a_failure_and_is_not_cached() {
    let server =
        TestServer::start(vec![Reply::failing(503, ""), Reply::ok(&forecast(18.0, 0))]).await;
    let service = service(&server);

    assert!(service.current(52.0, 21.0).await.is_err());
    let reading = service.current(52.0, 21.0).await.expect("the retry worked");

    assert_eq!(reading.temp_c, 18.0);
    assert_eq!(server.received(), 2, "the failure was not cached");
}

#[tokio::test]
async fn a_geocode_resolves_to_a_labelled_coordinate() {
    let body = serde_json::json!({
        "results": [{
            "latitude": 52.2297, "longitude": 21.0122,
            "name": "Warsaw", "country": "Poland", "admin1": "Mazovia",
        }]
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(&body)]).await;

    let place = service(&server)
        .geocode("Warsaw")
        .await
        .expect("a lookup")
        .expect("a match");

    assert_eq!(place.lat, 52.2297);
    assert_eq!(place.lon, 21.0122);
    assert_eq!(
        place.label, "Warsaw, Poland",
        "the label is name and country, not the admin region"
    );
}

/// Form encoding, not `encodeURIComponent` — v1 built this URL with
/// `URLSearchParams`, so a space is `+`. The LRCLIB client next door differs.
#[tokio::test]
async fn the_geocode_request_carries_the_ported_parameters() {
    let server = TestServer::start(vec![Reply::ok(r#"{"results":[]}"#)]).await;

    service(&server)
        .geocode("New York")
        .await
        .expect("a lookup");

    assert_eq!(
        request_line(&server.requests()[0]),
        "GET /v1/search?name=New+York&count=1&language=en&format=json HTTP/1.1"
    );
}

/// The request carries the user's original spelling; only the cache key is
/// folded.
#[tokio::test]
async fn the_geocode_request_keeps_the_users_spelling() {
    let server = TestServer::start(vec![Reply::ok(r#"{"results":[]}"#)]).await;

    service(&server).geocode("KRAKÓW").await.expect("a lookup");

    let requests = server.requests();
    assert!(
        request_line(&requests[0]).contains("name=KRAK%C3%93W"),
        "line was {}",
        request_line(&requests[0])
    );
}

/// No match is not an error — the renderer shows a quiet "No matches" hint
/// rather than a toast, which is why this is `Ok(None)`.
#[tokio::test]
async fn no_match_is_a_successful_lookup_with_no_result() {
    for body in [r#"{"results":[]}"#, r#"{}"#, r#"{"results":null}"#] {
        let server = TestServer::start(vec![Reply::ok(body)]).await;
        assert_eq!(service(&server).geocode("Nowhere").await.expect("ok"), None);
    }
}

/// A half-typed city is the usual reason for a miss, so caching it for 24 hours
/// would keep answering "no" after the user finished typing.
#[tokio::test]
async fn a_geocode_miss_is_not_cached() {
    let body = serde_json::json!({
        "results": [{ "latitude": 1.0, "longitude": 2.0, "name": "Warsaw" }]
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(r#"{"results":[]}"#), Reply::ok(&body)]).await;
    let service = service(&server);

    assert_eq!(service.geocode("Warsaw").await.expect("ok"), None);
    assert!(service.geocode("Warsaw").await.expect("ok").is_some());
    assert_eq!(server.received(), 2);
}

#[tokio::test]
async fn a_geocode_hit_is_cached_case_insensitively() {
    let body = serde_json::json!({
        "results": [{ "latitude": 1.0, "longitude": 2.0, "name": "Warsaw", "country": "Poland" }]
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(&body)]).await;
    let service = service(&server);

    service.geocode("Warsaw").await.expect("a lookup");
    service.geocode("  wArSaW ").await.expect("a lookup");

    assert_eq!(server.received(), 1);
}

/// An empty query is answered without a request at all.
#[tokio::test]
async fn an_empty_query_never_reaches_the_network() {
    let server = TestServer::start(Vec::new()).await;
    let service = service(&server);

    for query in ["", "   ", "\t\n"] {
        assert_eq!(service.geocode(query).await.expect("ok"), None);
    }
    assert_eq!(server.received(), 0);
}

/// A place with no country keeps a bare name rather than a trailing comma.
#[tokio::test]
async fn a_place_without_a_country_has_a_bare_label() {
    let body = serde_json::json!({
        "results": [{ "latitude": 1.0, "longitude": 2.0, "name": "Atlantis" }]
    })
    .to_string();
    let server = TestServer::start(vec![Reply::ok(&body)]).await;

    let place = service(&server)
        .geocode("Atlantis")
        .await
        .expect("a lookup")
        .expect("a match");

    assert_eq!(place.label, "Atlantis");
}

/// A transport-level failure *is* an error, unlike a miss.
#[tokio::test]
async fn a_failing_geocode_request_is_an_error_not_a_miss() {
    let server = TestServer::start(vec![Reply::failing(500, "")]).await;

    let error = service(&server)
        .geocode("Warsaw")
        .await
        .expect_err("a 500 is not a miss");

    assert_eq!(
        shiranami_core::error::ErrorPayload::of(&error).code,
        "WEATHER_UNAVAILABLE"
    );
}
