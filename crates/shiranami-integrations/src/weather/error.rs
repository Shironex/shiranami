//! The weather failure taxonomy — one code, deliberately.

use std::borrow::Cow;

use shiranami_core::error::WireError;

/// Convenience alias for fallible weather operations.
pub type Result<T, E = WeatherError> = std::result::Result<T, E>;

/// The renderer-visible code for every weather failure.
///
/// Declared in [`shiranami_core::error::codes`] with the rest of the frozen
/// vocabulary and re-exported here, where the producer lives. Phase 12 lane A
/// had to declare it locally because that lane had no core-edit rights; Phase 14
/// moved it, and the TypeScript-mirror test that reads
/// `packages/contracts/src/domain/weather.ts` moved with it.
pub use shiranami_core::error::codes::WEATHER_UNAVAILABLE;

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

    /// The re-export must resolve to core's constant, not to a local copy that
    /// happens to spell the same thing. Core is where the mirror test lives, so
    /// a redeclaration here would be a literal the TypeScript check never sees.
    #[test]
    fn the_code_is_cores_constant_not_a_local_redeclaration() {
        assert!(std::ptr::eq(
            WEATHER_UNAVAILABLE,
            shiranami_core::error::codes::WEATHER_UNAVAILABLE
        ));
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
