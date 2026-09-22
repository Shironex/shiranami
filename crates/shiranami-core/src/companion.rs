//! The companion's growth curve, its wire types, and nothing else.
//!
//! Phase 1 of the v2 companion feature (`docs/v2/companion/research-tech.md`
//! §4.1): the XP curve, the stage function and the accrual arithmetic are pure
//! math with no I/O, so they live at rank 0 where every other crate can reach
//! them and where they are unit-testable without a database.
//!
//! # The unit is honest listened seconds
//!
//! XP is the renderer's session clock — seconds counted only while a deck is
//! actually playing with decoded audio ahead of it, delivered through
//! `db:history:record-play`. The accrual point *is* the anti-gaming mechanism
//! (`research-priorart.md` §3.3): leaving the app open accrues nothing because
//! the clock does not tick, and a renderer that lies over the wire is cheating
//! its own pet under the exact trust model play counts and scrobbles already
//! live under.
//!
//! # The stage ratchets and never regresses
//!
//! [`stage_for_xp`] is pure, but the *stored* stage is not derived on read:
//! evolutions are one-way events the user witnessed. [`accrue`] therefore
//! computes `max(stored, stage_for_xp(new_xp))` — even an xp total lower than
//! the stored stage's threshold (impossible through this module, conceivable
//! through a hand-edited database) never demotes the companion.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Seconds per listening hour, the unit the thresholds are written in.
const SECONDS_PER_HOUR: f64 = 3_600.0;

/// The stage thresholds, in **listening hours** of accumulated XP.
///
/// Index is the stage: stage 0 begins at hatch, stage 4 after seven hundred
/// hours of genuine listening. The shape follows `research-priorart.md` §3.4 —
/// early stages land within a listener's first weeks, the final one is
/// asymptotic, reached by everyone eventually and rushed by no one.
pub const STAGE_THRESHOLD_HOURS: [f64; 5] = [0.0, 25.0, 100.0, 300.0, 700.0];

/// How many stages exist. The highest reachable stage is `STAGE_COUNT - 1`.
pub const STAGE_COUNT: u8 = STAGE_THRESHOLD_HOURS.len() as u8;

/// Which companion lives with the listener.
///
/// A preference, not a collection (`docs/v2/companion/decision.md`): one active
/// companion, switchable at any time, and growth belongs to the listener — the
/// stage survives a species change untouched.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Species {
    /// 潮 — the tide-cat; the wave lives in its tail. The default.
    #[default]
    Shio,
    /// 蛍 — the star jelly, filling with glow-motes as it grows.
    Hotaru,
}

impl Species {
    /// The string stored in `companion_state.species` and sent over the wire.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Shio => "shio",
            Self::Hotaru => "hotaru",
        }
    }

    /// Parse the stored column value. Unknown strings fall back to the
    /// default rather than failing the read: a database written by a newer
    /// build that added a species must not brick the pet on rollback.
    pub fn from_stored(value: &str) -> Self {
        match value {
            "hotaru" => Self::Hotaru,
            _ => Self::Shio,
        }
    }
}

/// The companion's persistent self — the `companion_state` singleton, on the
/// wire.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionState {
    /// User-chosen name; `null` until the naming ceremony.
    pub name: Option<String>,
    /// Which companion is active.
    pub species: Species,
    /// Evolution stage reached — monotonic, ratcheted by [`accrue`].
    pub stage: u8,
    /// Lifetime XP in honest listened seconds.
    #[specta(type = Number)]
    pub xp: f64,
    /// Unlocked accessory ids (Phase 3's surface; empty until then).
    pub accessories: Vec<String>,
    /// ISO-8601 instant of the hatch, set when the row is first seeded.
    pub hatched_at: Option<String>,
    /// ISO-8601 instant of the previous sighting, for return-after-absence
    /// moods. `null` on the very first read.
    pub last_seen_at: Option<String>,
}

/// What one XP accrual did — the payload of the `companion:xp` event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionXpGain {
    /// Seconds of honest listening this accrual added.
    #[specta(type = Number)]
    pub xp_gained: f64,
    /// Lifetime XP after the accrual, in seconds.
    #[specta(type = Number)]
    pub total_xp: f64,
    /// The (possibly freshly ratcheted) stage after the accrual.
    pub stage: u8,
    /// True when this accrual crossed a stage threshold.
    pub leveled_up: bool,
}

/// The stage a given lifetime XP earns, ignoring any stored ratchet.
///
/// Pure: the highest index whose threshold the XP meets. Negative or NaN XP
/// (conceivable only from a hand-edited row) is stage 0.
pub fn stage_for_xp(xp_seconds: f64) -> u8 {
    let mut stage = 0u8;
    for (index, hours) in STAGE_THRESHOLD_HOURS.iter().enumerate().skip(1) {
        if xp_seconds >= hours * SECONDS_PER_HOUR {
            // The array has five entries, so the cast cannot truncate.
            stage = index as u8;
        }
    }
    stage
}

/// The accrual arithmetic: add a delta, ratchet the stage, report a crossing.
///
/// `delta_seconds` is clamped at zero — a negative delta must never demote,
/// and NaN is treated as nothing heard. The returned stage is
/// `max(stored_stage, stage_for_xp(new_xp))`, the ratchet described in the
/// module docs; `leveled_up` is true only when the stage actually moved.
pub fn accrue(current_xp: f64, stored_stage: u8, delta_seconds: f64) -> CompanionXpGain {
    let gained = if delta_seconds.is_finite() {
        delta_seconds.max(0.0)
    } else {
        0.0
    };
    let total = current_xp.max(0.0) + gained;
    let stage = stage_for_xp(total).max(stored_stage);

    CompanionXpGain {
        xp_gained: gained,
        total_xp: total,
        stage,
        leveled_up: stage > stored_stage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A threshold expressed the way the tests reason about it: hours → seconds.
    fn hours(h: f64) -> f64 {
        h * 3_600.0
    }

    #[test]
    fn the_stage_thresholds_are_the_documented_hours() {
        assert_eq!(STAGE_THRESHOLD_HOURS, [0.0, 25.0, 100.0, 300.0, 700.0]);
        assert_eq!(STAGE_COUNT, 5);
    }

    /// Every boundary, from both sides: a second under a threshold stays on
    /// the lower stage, the threshold itself crosses.
    #[test]
    fn stage_for_xp_lands_each_boundary_exactly() {
        assert_eq!(stage_for_xp(0.0), 0);
        assert_eq!(stage_for_xp(hours(25.0) - 1.0), 0);
        assert_eq!(stage_for_xp(hours(25.0)), 1);
        assert_eq!(stage_for_xp(hours(100.0) - 1.0), 1);
        assert_eq!(stage_for_xp(hours(100.0)), 2);
        assert_eq!(stage_for_xp(hours(300.0) - 1.0), 2);
        assert_eq!(stage_for_xp(hours(300.0)), 3);
        assert_eq!(stage_for_xp(hours(700.0) - 1.0), 3);
        assert_eq!(stage_for_xp(hours(700.0)), 4);
    }

    #[test]
    fn stage_for_xp_saturates_at_the_final_stage() {
        assert_eq!(stage_for_xp(hours(700.0) * 100.0), 4);
        assert_eq!(stage_for_xp(f64::MAX), 4);
    }

    #[test]
    fn garbage_xp_is_stage_zero_not_a_panic() {
        assert_eq!(stage_for_xp(-1.0), 0);
        assert_eq!(stage_for_xp(f64::NAN), 0);
        assert_eq!(stage_for_xp(f64::NEG_INFINITY), 0);
    }

    /// The function is monotonic over its whole range: more listening never
    /// means a lower stage.
    #[test]
    fn stage_for_xp_is_monotonic() {
        let mut previous = 0u8;
        for step in 0..=8_000 {
            let xp = f64::from(step) * hours(0.1);
            let stage = stage_for_xp(xp);
            assert!(
                stage >= previous,
                "stage regressed from {previous} to {stage} at {xp} seconds"
            );
            previous = stage;
        }
    }

    #[test]
    fn an_ordinary_accrual_adds_and_reports_no_level() {
        let gain = accrue(hours(1.0), 0, 200.0);

        assert!((gain.xp_gained - 200.0).abs() < f64::EPSILON);
        assert!((gain.total_xp - (hours(1.0) + 200.0)).abs() < f64::EPSILON);
        assert_eq!(gain.stage, 0);
        assert!(!gain.leveled_up);
    }

    #[test]
    fn crossing_a_threshold_levels_up_exactly_once() {
        // One second short of stage 1, plus two seconds of listening.
        let gain = accrue(hours(25.0) - 1.0, 0, 2.0);
        assert_eq!(gain.stage, 1);
        assert!(gain.leveled_up);

        // The next accrual is inside stage 1 and reports no crossing.
        let next = accrue(gain.total_xp, gain.stage, 2.0);
        assert_eq!(next.stage, 1);
        assert!(!next.leveled_up);
    }

    /// A single enormous accrual (the hatch-seed path re-run, say) may skip
    /// stages; the crossing flag still fires once for the whole jump.
    #[test]
    fn a_jump_across_several_thresholds_is_one_level_up() {
        let gain = accrue(0.0, 0, hours(350.0));

        assert_eq!(gain.stage, 3);
        assert!(gain.leveled_up);
    }

    /// The ratchet: a stored stage above what the XP earns is kept, and the
    /// kept stage is not reported as a fresh level-up.
    #[test]
    fn the_stored_stage_never_regresses_even_when_xp_says_lower() {
        let gain = accrue(hours(1.0), 3, 10.0);

        assert_eq!(gain.stage, 3, "the witnessed evolution is permanent");
        assert!(
            !gain.leveled_up,
            "keeping a ratcheted stage is not an event"
        );
    }

    #[test]
    fn a_negative_or_nan_delta_accrues_nothing_and_demotes_nothing() {
        for delta in [-500.0, f64::NAN, f64::NEG_INFINITY] {
            let gain = accrue(hours(30.0), 1, delta);

            assert!((gain.xp_gained - 0.0).abs() < f64::EPSILON);
            assert!((gain.total_xp - hours(30.0)).abs() < f64::EPSILON);
            assert_eq!(gain.stage, 1);
            assert!(!gain.leveled_up);
        }
    }

    #[test]
    fn species_round_trips_through_its_stored_string() {
        assert_eq!(Species::Shio.as_str(), "shio");
        assert_eq!(Species::Hotaru.as_str(), "hotaru");
        assert_eq!(Species::from_stored("shio"), Species::Shio);
        assert_eq!(Species::from_stored("hotaru"), Species::Hotaru);
    }

    /// A species this build does not know falls back to the default rather
    /// than failing the read — the rollback-safety direction.
    #[test]
    fn an_unknown_stored_species_falls_back_to_shio() {
        assert_eq!(Species::from_stored("kurage"), Species::Shio);
        assert_eq!(Species::from_stored(""), Species::Shio);
    }

    /// The wire casing the renderer will read: camelCase keys, lowercase
    /// species literals — the same convention every model in
    /// [`crate::models`] carries.
    #[test]
    fn the_wire_shapes_serialize_in_renderer_casing() {
        let state = CompanionState {
            name: None,
            species: Species::Hotaru,
            stage: 2,
            xp: 12.5,
            accessories: vec![],
            hatched_at: Some("2026-08-05T12:00:00.000Z".to_owned()),
            last_seen_at: None,
        };
        let json = serde_json::to_value(&state).expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "name": null,
                "species": "hotaru",
                "stage": 2,
                "xp": 12.5,
                "accessories": [],
                "hatchedAt": "2026-08-05T12:00:00.000Z",
                "lastSeenAt": null,
            })
        );

        let gain = accrue(0.0, 0, 90_000.0);
        let json = serde_json::to_value(&gain).expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "xpGained": 90_000.0,
                "totalXp": 90_000.0,
                "stage": 1,
                "leveledUp": true,
            })
        );
    }
}
