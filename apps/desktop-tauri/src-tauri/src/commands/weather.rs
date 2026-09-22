//! `weather:*` — the keyless Open-Meteo lookups behind the clock card.
//!
//! Two channels, ported from `apps/desktop/src/main/ipc/weather.ts`. The
//! smallest service-backed namespace, and the one that shows the whole error
//! story end to end, because it is the only place in v1 where a *failure* and an
//! *empty result* are deliberately different things.
//!
//! # The asymmetry is the contract
//!
//! | Outcome                                    | v1                                       | Here                     |
//! | ------------------------------------------ | ---------------------------------------- | ------------------------ |
//! | `weather:geocode` finds no city            | resolves `null`                          | `Ok(None)`               |
//! | `weather:geocode` cannot reach Open-Meteo  | rejects                                  | `Err(WEATHER_UNAVAILABLE)` |
//! | `weather:get-current` fails, any cause     | rejects `IpcError(WEATHER_UNAVAILABLE)`  | `Err(WEATHER_UNAVAILABLE)` |
//!
//! "No such city" is not an error and never was: the renderer shows a quiet "No
//! matches" hint rather than a toast, so collapsing it into a rejection would
//! turn a normal keystroke in a search box into an error state. Everything
//! else — a non-2xx, a transport failure, a timeout, a malformed payload —
//! collapses into one code, because the card's response to all four is identical
//! and there is nothing a user could do differently about any of them.
//!
//! # Neither channel uses a fallback
//!
//! v1 registered exactly nine channels with `handleWithFallback`, and neither of
//! these is one. The degraded state is expressed as a *rejection carrying a
//! discriminable code* that the renderer matches on with `isIpcError`, not as a
//! silently substituted value. Worth stating because "weather is unavailable"
//! sounds like a textbook fallback case and is deliberately not one — a fallback
//! would make a stale reading indistinguishable from a live one.
//!
//! # Validation
//!
//! `weatherGeocodeArgs` was `z.tuple([z.string().min(1).max(200)])` and
//! `weatherGetCurrentArgs` bounded latitude to ±90 and longitude to ±180. serde
//! gives the shape; the bounds are semantic and are re-raised here as
//! `BAD_REQUEST`, the same code v1's zod failure produced.

use shiranami_core::models::{GeocodeResult, WeatherCurrent};
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::weather::weather_geocode,
                crate::commands::weather::weather_get_current,
            ]
        }
    };
}
pub(crate) use commands;

/// The longest query v1 accepted. City names do not approach it; the bound is
/// there so a pathological string never reaches the URL builder.
const MAX_QUERY_LEN: usize = 200;

/// `weather:geocode` — resolve a free-text city to coordinates.
///
/// `Ok(None)` is "no such city", which is not an error. See the module docs.
#[tauri::command]
#[specta::specta]
pub async fn weather_geocode(
    state: State<'_, AppState>,
    query: String,
) -> CommandResult<Option<GeocodeResult>> {
    validate_query(&query)?;

    state.weather().geocode(&query).await.wire()
}

/// v1's `z.string().min(1).max(200)`.
///
/// The service short-circuits an all-whitespace query to `None` on its own,
/// matching v1, so only the two bounds live here. Extracted rather than inlined
/// so it is reachable from a test without a Tauri runtime — the alternative is a
/// copy of the guard in the test module, which is a guard that can silently stop
/// matching the one that runs.
fn validate_query(query: &str) -> CommandResult<()> {
    if query.is_empty() {
        return Err(bad_request("the geocode query must not be empty"));
    }
    // Characters, not bytes: a two-hundred-character Japanese city name is three
    // times that in UTF-8, and a byte bound would refuse it — a class of bug
    // that only ever shows up for non-Latin users.
    if query.chars().count() > MAX_QUERY_LEN {
        return Err(bad_request(format!(
            "the geocode query must be at most {MAX_QUERY_LEN} characters"
        )));
    }
    Ok(())
}

/// `weather:get-current` — the current reading for already-resolved
/// coordinates.
#[tauri::command]
#[specta::specta]
pub async fn weather_get_current(
    state: State<'_, AppState>,
    coords: Coordinates,
) -> CommandResult<WeatherCurrent> {
    coords.validate()?;

    state.weather().current(coords.lat, coords.lon).await.wire()
}

/// The single object argument `weather:get-current` takes.
///
/// A struct rather than two parameters because v1's channel took **one**
/// argument, `{ lat, lon }`, and the shim calls these positionally. Splitting it
/// would change the call shape for no benefit.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, serde::Serialize, specta::Type)]
pub struct Coordinates {
    /// Degrees north, −90 to 90.
    pub lat: f64,
    /// Degrees east, −180 to 180.
    pub lon: f64,
}

impl Coordinates {
    /// v1's `z.number().min(-90).max(90)` / `.min(-180).max(180)`.
    ///
    /// A NaN fails both comparisons and is therefore rejected, which is what
    /// zod did too — `z.number()` refuses `NaN`. Worth being explicit about,
    /// because `!(x >= lo && x <= hi)` and `x < lo || x > hi` disagree exactly
    /// there, and the second spelling would let a NaN reach the URL builder.
    fn validate(&self) -> CommandResult<()> {
        if !(-90.0..=90.0).contains(&self.lat) {
            return Err(bad_request("latitude must be between -90 and 90"));
        }
        if !(-180.0..=180.0).contains(&self.lon) {
            return Err(bad_request("longitude must be between -180 and 180"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::codes;

    fn at(lat: f64, lon: f64) -> Coordinates {
        Coordinates { lat, lon }
    }

    #[test]
    fn coordinates_inside_the_bounds_pass() {
        for (lat, lon) in [(0.0, 0.0), (52.23, 21.01), (-90.0, -180.0), (90.0, 180.0)] {
            assert!(at(lat, lon).validate().is_ok(), "{lat},{lon} must pass");
        }
    }

    #[test]
    fn coordinates_outside_the_bounds_are_a_bad_request() {
        for (lat, lon) in [(90.1, 0.0), (-90.1, 0.0), (0.0, 180.1), (0.0, -180.1)] {
            let error = at(lat, lon)
                .validate()
                .expect_err("{lat},{lon} must be refused");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }
    }

    /// `z.number()` refuses `NaN`, and the inclusive-range spelling used above
    /// reproduces that. The obvious `lat < -90.0 || lat > 90.0` does not — both
    /// comparisons are false for a NaN, so it would sail through into the URL
    /// builder and Open-Meteo would answer something arbitrary.
    #[test]
    fn a_nan_coordinate_is_refused_the_way_zod_refused_it() {
        assert!(at(f64::NAN, 0.0).validate().is_err());
        assert!(at(0.0, f64::NAN).validate().is_err());
        assert!(at(f64::INFINITY, 0.0).validate().is_err());
    }

    /// The object shape v1's channel took. Pinned because the shim forwards the
    /// renderer's argument straight through, and a rename here is a silently
    /// undefined `lat` there.
    #[test]
    fn the_coordinate_argument_keeps_v1s_key_names() {
        let parsed: Coordinates =
            serde_json::from_str(r#"{"lat":52.23,"lon":21.01}"#).expect("v1's shape parses");

        assert_eq!(parsed, at(52.23, 21.01));
    }

    #[test]
    fn an_empty_query_is_a_bad_request() {
        assert_eq!(
            validate_query("").expect_err("empty is refused").code,
            codes::validation::BAD_REQUEST
        );
    }

    #[test]
    fn a_query_past_two_hundred_characters_is_refused() {
        assert!(validate_query(&"a".repeat(201)).is_err());
        assert!(validate_query(&"a".repeat(200)).is_ok());
    }

    /// The length bound counts characters, not bytes. A two-hundred-character
    /// Japanese city name is six hundred bytes, and a byte-counted bound would
    /// refuse it — the class of bug that only shows up for non-Latin users.
    #[test]
    fn the_length_bound_counts_characters_not_bytes() {
        let japanese = "東".repeat(200);
        assert!(japanese.len() > MAX_QUERY_LEN, "600 bytes, 200 characters");
        assert!(validate_query(&japanese).is_ok());
    }
}
