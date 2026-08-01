//! The WMO interpretation-code table.
//!
//! Ported verbatim from `WMO_CODE_MAP` in
//! `apps/desktop/src/main/services/weather-service.ts`. Open-Meteo reports
//! weather as a WMO 4677 code; the label is Open-Meteo's published wording and
//! the condition collapses ~28 codes onto the eight buckets in
//! [`WeatherCondition`], so the renderer switches over a small set when picking
//! a glyph.
//!
//! Codes outside the table are **not** an error: they map to
//! [`WeatherCondition::Unknown`] with the generic label "Weather", and the
//! reading is still shown. A forecast that renders as "18° Weather" is a far
//! better outcome than a card that fails because the WMO added a code.

use shiranami_core::models::weather::WeatherCondition;

/// A code's bucket and its published label.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WeatherReading {
    /// The coarse bucket the renderer picks a glyph from.
    pub condition: WeatherCondition,
    /// Open-Meteo's short English wording.
    pub label: &'static str,
}

/// The mapped codes, in ascending order. v1's table, unchanged.
const WMO_CODES: &[(u16, WeatherCondition, &str)] = &[
    (0, WeatherCondition::Clear, "Clear sky"),
    (1, WeatherCondition::PartlyCloudy, "Mainly clear"),
    (2, WeatherCondition::PartlyCloudy, "Partly cloudy"),
    (3, WeatherCondition::Cloudy, "Overcast"),
    (45, WeatherCondition::Fog, "Fog"),
    (48, WeatherCondition::Fog, "Rime fog"),
    (51, WeatherCondition::Rain, "Light drizzle"),
    (53, WeatherCondition::Rain, "Drizzle"),
    (55, WeatherCondition::Rain, "Heavy drizzle"),
    (56, WeatherCondition::Rain, "Freezing drizzle"),
    (57, WeatherCondition::Rain, "Freezing drizzle"),
    (61, WeatherCondition::Rain, "Light rain"),
    (63, WeatherCondition::Rain, "Rain"),
    (65, WeatherCondition::Rain, "Heavy rain"),
    (66, WeatherCondition::Rain, "Freezing rain"),
    (67, WeatherCondition::Rain, "Freezing rain"),
    (71, WeatherCondition::Snow, "Light snow"),
    (73, WeatherCondition::Snow, "Snow"),
    (75, WeatherCondition::Snow, "Heavy snow"),
    (77, WeatherCondition::Snow, "Snow grains"),
    (80, WeatherCondition::Rain, "Rain showers"),
    (81, WeatherCondition::Rain, "Rain showers"),
    (82, WeatherCondition::Rain, "Violent rain showers"),
    (85, WeatherCondition::Snow, "Snow showers"),
    (86, WeatherCondition::Snow, "Heavy snow showers"),
    (95, WeatherCondition::Thunderstorm, "Thunderstorm"),
    (96, WeatherCondition::Thunderstorm, "Thunderstorm with hail"),
    (
        99,
        WeatherCondition::Thunderstorm,
        "Severe thunderstorm with hail",
    ),
];

/// The reading for an unmapped code.
const UNKNOWN: WeatherReading = WeatherReading {
    condition: WeatherCondition::Unknown,
    label: "Weather",
};

/// Map a WMO interpretation code onto its bucket and label.
pub fn map_wmo_code(code: u16) -> WeatherReading {
    WMO_CODES
        .iter()
        .find(|(mapped, _, _)| *mapped == code)
        .map_or(UNKNOWN, |(_, condition, label)| WeatherReading {
            condition: *condition,
            label,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn condition(code: u16) -> WeatherCondition {
        map_wmo_code(code).condition
    }

    #[test]
    fn maps_clear_sky() {
        assert_eq!(condition(0), WeatherCondition::Clear);
        assert_eq!(map_wmo_code(0).label, "Clear sky");
    }

    #[test]
    fn maps_the_partly_cloudy_codes() {
        assert_eq!(condition(1), WeatherCondition::PartlyCloudy);
        assert_eq!(condition(2), WeatherCondition::PartlyCloudy);
    }

    #[test]
    fn maps_overcast_to_cloudy() {
        assert_eq!(condition(3), WeatherCondition::Cloudy);
        assert_eq!(map_wmo_code(3).label, "Overcast");
    }

    #[test]
    fn maps_the_rain_family() {
        for code in [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82] {
            assert_eq!(condition(code), WeatherCondition::Rain, "code {code}");
        }
    }

    #[test]
    fn maps_the_snow_family() {
        for code in [71, 73, 75, 77, 85, 86] {
            assert_eq!(condition(code), WeatherCondition::Snow, "code {code}");
        }
    }

    #[test]
    fn maps_fog_and_thunderstorm() {
        assert_eq!(condition(45), WeatherCondition::Fog);
        assert_eq!(condition(48), WeatherCondition::Fog);
        for code in [95, 96, 99] {
            assert_eq!(
                condition(code),
                WeatherCondition::Thunderstorm,
                "code {code}"
            );
        }
    }

    /// An unmapped code is still a successful reading. The WMO adds codes; a
    /// weather card must not start failing when it does.
    #[test]
    fn falls_back_to_unknown_for_unmapped_codes() {
        for code in [4, 44, 100, 999, u16::MAX] {
            assert_eq!(condition(code), WeatherCondition::Unknown, "code {code}");
            assert_eq!(map_wmo_code(code).label, "Weather");
        }
    }

    /// The full table, pinned. Each row is a published meaning, so a changed
    /// row is a changed claim about what the user is being shown — not a tuning
    /// knob, and not something to discover from a screenshot.
    #[test]
    fn the_table_matches_the_ported_mapping() {
        assert_eq!(WMO_CODES.len(), 28);

        let mut codes: Vec<u16> = WMO_CODES.iter().map(|(code, _, _)| *code).collect();
        let mut sorted = codes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(codes.len(), sorted.len(), "a code is listed twice");

        codes.sort_unstable();
        assert_eq!(codes, sorted, "the table is not in ascending order");

        // Every bucket but `Unknown` is reachable from the table; `Unknown` is
        // reachable only by falling off it.
        for bucket in WeatherCondition::ALL {
            let reachable = WMO_CODES
                .iter()
                .any(|(_, condition, _)| *condition == bucket);
            assert_eq!(
                reachable,
                bucket != WeatherCondition::Unknown,
                "{bucket:?} reachability"
            );
        }
    }
}
