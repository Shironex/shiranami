//! Weather contracts, ported from `packages/contracts/src/domain/weather.ts`.
//!
//! Keyless Open-Meteo, with its ~28 WMO interpretation codes collapsed to the
//! eight buckets in [`WeatherCondition`] so the renderer switches over a small
//! set when picking a glyph.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Coarse weather condition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum WeatherCondition {
    /// Clear sky.
    Clear,
    /// Partly cloudy.
    PartlyCloudy,
    /// Overcast.
    Cloudy,
    /// Rain of any intensity.
    Rain,
    /// Snow of any intensity.
    Snow,
    /// Thunderstorm.
    Thunderstorm,
    /// Fog or depositing rime fog.
    Fog,
    /// An interpretation code outside the mapped set.
    Unknown,
}

impl WeatherCondition {
    /// Every condition, in the order the TypeScript `WEATHER_CONDITIONS` tuple
    /// declares them. Exposed so callers can enumerate the buckets without
    /// re-listing them and drifting.
    pub const ALL: [Self; 8] = [
        Self::Clear,
        Self::PartlyCloudy,
        Self::Cloudy,
        Self::Rain,
        Self::Snow,
        Self::Thunderstorm,
        Self::Fog,
        Self::Unknown,
    ];
}

/// Current conditions at a location.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WeatherCurrent {
    /// Temperature in degrees Celsius, rounded to 0.1°.
    #[specta(type = Number)]
    pub temp_c: f64,
    /// Coarse condition bucket.
    pub condition: WeatherCondition,
    /// Short English label from the WMO table ("Clear sky", "Light rain", …).
    pub label: String,
}

/// A resolved place, as returned by the geocoding lookup.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GeocodeResult {
    /// Latitude in decimal degrees.
    #[specta(type = Number)]
    pub lat: f64,
    /// Longitude in decimal degrees.
    #[specta(type = Number)]
    pub lon: f64,
    /// Human label, formatted "City, Country".
    pub label: String,
}
