//! Keyless Open-Meteo weather.
//!
//! Ported from `apps/desktop/src/main/services/weather-service.ts`, which was
//! itself lifted from lunofi-studio. Three pieces: the [`wmo`] interpretation
//! table, the [`cache`] pair that stands in for a rate gate, and the [`client`]
//! that talks to the two endpoints.
//!
//! No API key, no account, and no geolocation — the user types a city name and
//! [`WeatherService::geocode`] turns it into the coordinate
//! [`WeatherService::current`] then reads.
#![warn(missing_docs)]

pub mod cache;
pub mod client;
pub mod error;
pub mod wmo;

pub use cache::{GEOCODE_CACHE_TTL, WEATHER_CACHE_TTL};
pub use client::{
    OPEN_METEO_FORECAST_URL, OPEN_METEO_GEOCODE_URL, WEATHER_TIMEOUT, WeatherService,
};
pub use error::{Result, WEATHER_UNAVAILABLE, WeatherError};
pub use wmo::{WeatherReading, map_wmo_code};
