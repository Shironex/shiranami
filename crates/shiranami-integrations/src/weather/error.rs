//! The weather failure taxonomy — one code, deliberately.

use std::borrow::Cow;

use shiranami_core::error::WireError;

/// Convenience alias for fallible weather operations.
pub type Result<T, E = WeatherError> = std::result::Result<T, E>;

/// The renderer-visible code for every weather failure.
///
/// Ported from `packages/contracts/src/domain/weather.ts`, where it is declared
/// alongside the domain types rather than in the IPC error-code registry. The
/// renderer matches on it to show a quiet "Weather unavailable" mini-state
/// instead of failing the card, so it is a frozen contract like the four
/// registries in [`shiranami_core::error::codes`].
///
/// **Note for the coordinator:** it arguably belongs *in* that module — core's
/// own docs say "the crate that produces a code does not have to be the crate
/// that declares it", and the registry test there reads the TypeScript sources
/// to prove the literals still match. It is declared here only because Phase 12
/// lane A must not edit `shiranami-core`. Moving it is a one-line change plus a
/// row in that test.
pub const WEATHER_UNAVAILABLE: &str = "WEATHER_UNAVAILABLE";

/// Everything a weather lookup can fail with.
///
/// One variant, matching v1: the service collapsed a non-2xx, a transport
/// failure, a timeout and a malformed payload into one thrown
/// `WEATHER_UNAVAILABLE`, because the card's response to all four is identical
/// and there is nothing a user could do differently about any of them. The
/// distinction that *does* matter — "no such city" — is not an error at all and
/// is carried by `Ok(None)` from the geocoder.
#[derive(Debug, thiserror::Error)]
pub enum WeatherError {
    /// Open-Meteo could not be reached, refused the request, or answered with
    /// something unreadable.
    #[error("weather lookup failed: {reason}")]
    Unavailable {
        /// What actually went wrong, for logs.
        reason: String,
    },
}

impl WeatherError {
    /// An unavailable-weather failure describing `reason`.
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self::Unavailable {
            reason: reason.into(),
        }
    }
}

impl WireError for WeatherError {
    fn code(&self) -> Cow<'static, str> {
        Cow::Borrowed(WEATHER_UNAVAILABLE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shiranami_core::error::ErrorPayload;

    #[test]
    fn every_failure_carries_the_frozen_renderer_code() {
        let payload = ErrorPayload::of(&WeatherError::unavailable("HTTP 503"));
        assert_eq!(payload.code, WEATHER_UNAVAILABLE);
        assert_eq!(payload.details, None);
    }

    /// The literal the renderer matches on. Pinned so a rename here has to be a
    /// deliberate act rather than a refactor's side effect.
    #[test]
    fn the_code_literal_matches_the_typescript_contract() {
        assert_eq!(WEATHER_UNAVAILABLE, "WEATHER_UNAVAILABLE");
    }

    #[test]
    fn the_reason_survives_into_the_message_for_logs() {
        assert!(
            WeatherError::unavailable("malformed forecast payload")
                .to_string()
                .contains("malformed forecast payload")
        );
    }
}
