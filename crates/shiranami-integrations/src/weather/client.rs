//! Keyless Open-Meteo: current conditions and free-text geocoding.
//!
//! Ported from `apps/desktop/src/main/services/weather-service.ts`. Nothing
//! here fires until the user has opted in and picked a city, which is why the
//! service can be keyless and unauthenticated.
//!
//! Two endpoints, both `GET`, both cached (see [`super::cache`]):
//!
//! | Call                          | Endpoint                                          |
//! | ----------------------------- | ------------------------------------------------- |
//! | [`WeatherService::current`]   | `api.open-meteo.com/v1/forecast`                  |
//! | [`WeatherService::geocode`]   | `geocoding-api.open-meteo.com/v1/search`          |
//!
//! # Geolocation
//!
//! There is none, deliberately: v1 never asked the OS where the user is and
//! neither does this. Coordinates come from [`WeatherService::geocode`], which
//! the user drives by typing a city name. That is the whole location story —
//! no platform location API, no IP lookup, and no coordinate the user did not
//! choose.

use std::time::Duration;

use reqwest::header::{ACCEPT, HeaderValue, USER_AGENT};
use serde::Deserialize;
use shiranami_core::models::weather::{GeocodeResult, WeatherCurrent};
use shiranami_net::{HttpClient, RequestOptions};

use crate::weather::cache::{
    GEOCODE_CACHE_MAX, GEOCODE_CACHE_TTL, TtlCache, WEATHER_CACHE_MAX, WEATHER_CACHE_TTL,
    coordinate_key,
};
use crate::weather::error::{Result, WeatherError};
use crate::weather::wmo::map_wmo_code;

/// Current-conditions endpoint.
pub const OPEN_METEO_FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";

/// Free-text geocoding endpoint.
pub const OPEN_METEO_GEOCODE_URL: &str = "https://geocoding-api.open-meteo.com/v1/search";

/// v1's per-request deadline, well under the default 30 s: a weather card that
/// has not answered in eight seconds should quietly say so, not keep a spinner
/// up for half a minute.
pub const WEATHER_TIMEOUT: Duration = Duration::from_secs(8);

/// Fair-use identification, per Open-Meteo's terms.
///
/// Overrides the shared client's `shiranami/<version>`. Open-Meteo asks
/// keyless users to identify themselves so it can contact an abusive caller
/// instead of blocking the whole product, and `shiranami-app/<version>` is the
/// string v1 registered with them.
const WEATHER_USER_AGENT: &str = concat!("shiranami-app/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Deserialize)]
struct ForecastResponse {
    current: Option<CurrentBlock>,
}

#[derive(Debug, Deserialize)]
struct CurrentBlock {
    temperature_2m: Option<f64>,
    weather_code: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct GeocodeResponse {
    results: Option<Vec<GeocodePlace>>,
}

#[derive(Debug, Deserialize)]
struct GeocodePlace {
    latitude: f64,
    longitude: f64,
    name: String,
    country: Option<String>,
}

/// Open-Meteo, with v1's caches in front of it.
pub struct WeatherService {
    http: HttpClient,
    forecast_url: String,
    geocode_url: String,
    current: TtlCache<WeatherCurrent>,
    places: TtlCache<GeocodeResult>,
}

impl WeatherService {
    /// A service against the public endpoints.
    pub fn new(http: HttpClient) -> Self {
        Self::with_endpoints(http, OPEN_METEO_FORECAST_URL, OPEN_METEO_GEOCODE_URL)
    }

    /// A service against explicit endpoints, so tests can drive a loopback
    /// server rather than the real API.
    pub fn with_endpoints(
        http: HttpClient,
        forecast_url: impl Into<String>,
        geocode_url: impl Into<String>,
    ) -> Self {
        Self {
            http,
            forecast_url: forecast_url.into(),
            geocode_url: geocode_url.into(),
            current: TtlCache::new(WEATHER_CACHE_TTL, WEATHER_CACHE_MAX),
            places: TtlCache::new(GEOCODE_CACHE_TTL, GEOCODE_CACHE_MAX),
        }
    }

    /// Current conditions at a coordinate, cached for 15 minutes per tile.
    ///
    /// # Errors
    ///
    /// [`WeatherError::Unavailable`] when the request fails or the payload is
    /// missing either field the card needs.
    pub async fn current(&self, lat: f64, lon: f64) -> Result<WeatherCurrent> {
        let key = coordinate_key(lat, lon);
        if let Some(cached) = self.current.get(&key) {
            return Ok(cached);
        }

        let url = format!(
            "{}?{}",
            self.forecast_url,
            encode_query(&[
                ("latitude", &format_coordinate(lat)),
                ("longitude", &format_coordinate(lon)),
                ("current", "temperature_2m,weather_code"),
                ("temperature_unit", "celsius"),
            ])
        );

        let response: ForecastResponse = self.get(&url).await?;
        let block = response.current.unwrap_or(CurrentBlock {
            temperature_2m: None,
            weather_code: None,
        });

        // Both fields or nothing: a card showing a condition with no
        // temperature, or the reverse, is a broken card either way.
        let (Some(temperature), Some(code)) = (block.temperature_2m, block.weather_code) else {
            tracing::warn!(lat, lon, "malformed forecast payload");
            return Err(WeatherError::unavailable("malformed forecast payload"));
        };

        let reading = map_wmo_code(code);
        let value = WeatherCurrent {
            // One decimal place. The extra precision Open-Meteo sends is not
            // meaningful at a city scale and would make the card jitter.
            temp_c: (temperature * 10.0).round() / 10.0,
            condition: reading.condition,
            label: reading.label.to_owned(),
        };

        self.current.set(&key, value.clone());
        Ok(value)
    }

    /// Resolve a free-text city to a single place, cached for 24 hours.
    ///
    /// `Ok(None)` means the lookup succeeded and matched nothing — the renderer
    /// shows a "No matches" hint rather than an error toast. That distinction is
    /// the reason this returns `Result<Option<_>>` and not `Result<_>`.
    ///
    /// # Errors
    ///
    /// [`WeatherError::Unavailable`] when the request itself fails.
    pub async fn geocode(&self, query: &str) -> Result<Option<GeocodeResult>> {
        let normalized = query.trim().to_lowercase();
        if normalized.is_empty() {
            return Ok(None);
        }

        if let Some(cached) = self.places.get(&normalized) {
            return Ok(Some(cached));
        }

        let url = format!(
            "{}?{}",
            self.geocode_url,
            encode_query(&[
                // The user's original spelling, not the folded cache key —
                // folding is for lookup identity, not for the request.
                ("name", query),
                ("count", "1"),
                ("language", "en"),
                ("format", "json"),
            ])
        );

        let response: GeocodeResponse = self.get(&url).await?;
        let Some(top) = response.results.unwrap_or_default().into_iter().next() else {
            // Deliberately not cached. A miss is usually a half-typed city, and
            // caching it for 24 hours would keep answering "no" after the user
            // finished typing. v1 did the same.
            return Ok(None);
        };

        let mut label = top.name;
        if let Some(country) = top.country.filter(|country| !country.is_empty()) {
            label.push_str(", ");
            label.push_str(&country);
        }

        let result = GeocodeResult {
            lat: top.latitude,
            lon: top.longitude,
            label,
        };
        self.places.set(&normalized, result.clone());
        Ok(Some(result))
    }

    /// Drop both caches.
    pub fn clear_caches(&self) {
        self.current.clear();
        self.places.clear();
    }

    /// One JSON `GET` under the weather deadline, with the fair-use header.
    ///
    /// Every failure — transport, non-2xx, timeout, unparseable body — becomes
    /// the same [`WeatherError::Unavailable`], because the card's response to
    /// all four is identical.
    async fn get<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T> {
        let options = RequestOptions::default()
            .with_timeout(WEATHER_TIMEOUT)
            .with_header(ACCEPT, HeaderValue::from_static("application/json"))
            .with_header(USER_AGENT, HeaderValue::from_static(WEATHER_USER_AGENT));

        self.http.json(url, options).await.map_err(|error| {
            // `debug`, not `warn`. The Phase 3 amendment records the rule —
            // v1 warned on every non-2xx, which in the dormant case logged
            // daily forever. The caller decides whether this is worth a notice.
            tracing::debug!(%error, "open-meteo request failed");
            WeatherError::unavailable(error.to_string())
        })
    }
}

/// Serialise query parameters the way `URLSearchParams` does.
///
/// Note this is **not** the encoder the LRCLIB client uses: `URLSearchParams`
/// is `application/x-www-form-urlencoded`, so a space is `+` and a comma is
/// `%2C`, whereas `encodeURIComponent` writes `%20` and leaves other characters
/// alone. v1 built these two URLs with different tools, so v2 reproduces both
/// rather than unifying them onto whichever happens to be nearby.
fn encode_query(params: &[(&str, &str)]) -> String {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    for (name, value) in params {
        serializer.append_pair(name, value);
    }
    serializer.finish()
}

/// A coordinate as JavaScript's `String(Number)` would render it.
fn format_coordinate(value: f64) -> String {
    format!("{value}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `URLSearchParams` semantics: `+` for a space, `%2C` for the comma in the
    /// `current` field list. A server that took `+` literally would be asked
    /// for a field called `temperature_2m,weather_code` verbatim either way, so
    /// the comma escape is the load-bearing half.
    #[test]
    fn query_parameters_use_form_urlencoded_semantics() {
        assert_eq!(
            encode_query(&[("current", "temperature_2m,weather_code")]),
            "current=temperature_2m%2Cweather_code"
        );
        assert_eq!(encode_query(&[("name", "New York")]), "name=New+York");
    }

    #[test]
    fn query_parameters_keep_their_order() {
        assert_eq!(
            encode_query(&[("a", "1"), ("b", "2"), ("c", "3")]),
            "a=1&b=2&c=3"
        );
    }

    #[test]
    fn non_ascii_city_names_survive_encoding() {
        assert_eq!(encode_query(&[("name", "Kraków")]), "name=Krak%C3%B3w");
    }

    #[test]
    fn coordinates_render_without_a_trailing_zero() {
        assert_eq!(format_coordinate(52.0), "52");
        assert_eq!(format_coordinate(52.2297), "52.2297");
        assert_eq!(format_coordinate(-33.8688), "-33.8688");
    }
}
