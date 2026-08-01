//! Compact mode, as values — every decision `window:set-compact-mode` takes,
//! with no window in sight.
//!
//! The mini-player locks the window to a fixed size, so leaving it has to put
//! something back, and what it puts back depends on where it came from. v1 kept
//! the three facts that answer that (`isCompactMode`, `normalBounds`,
//! `wasMaximizedBeforeCompact`) in a closure over the `BrowserWindow`, which
//! made them unreachable from a test. §2.3 forbids the global that would be the
//! obvious replacement, so they live in a managed [`CompactModeState`] and the
//! rules over them are [`plan`] and [`valid_compact_position`] — free functions
//! over plain data.
//!
//! This is `shiranami-media-controls`' split, applied one rank up: the module
//! with the decisions in it is exhaustively tested, and
//! `crate::commands::window` — which is field copies and `match` arms over a
//! `tauri::Window` no test can construct — has almost nothing left to get wrong.
//!
//! Everything here is in **logical** pixels, because that is what v1 stored:
//! Electron's bounds are device-independent, and a saved corner written by v1
//! is on disk in every install that has ever used compact mode.

use serde::{Deserialize, Serialize};
use specta::Type;

use shiranami_core::sync::lock_or_recover;

/// The minimum size a non-compact window may take.
///
/// Must agree with `minWidth`/`minHeight` in `tauri.conf.json`: compact mode
/// overwrites the constraint on the way in, and these are what it restores. A
/// disagreement is invisible until a user leaves compact mode and finds the
/// window will not shrink back to where it was.
pub const DEFAULT_MIN_WIDTH: u32 = 800;
pub const DEFAULT_MIN_HEIGHT: u32 = 600;

/// The mini-player's size when the renderer names none.
const COMPACT_DEFAULT_WIDTH: u32 = 500;
const COMPACT_DEFAULT_HEIGHT: u32 = 214;

/// How much of the window must land inside a display's work area for a saved
/// position to be reused, on each axis.
///
/// v1's tolerance, unchanged: enough that a slightly off-edge window is still
/// restored, little enough that one saved on a monitor since unplugged is not.
const VISIBLE_PX: i32 = 80;

/// A window position in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

/// A window rectangle in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bounds {
    pub position: Position,
    pub width: u32,
    pub height: u32,
}

/// A display's usable region — the monitor minus taskbar and menu bar
/// reservations, in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// The compact size the renderer asked for.
///
/// v1's zod bounds were `width: int 200..=1200`, `height: int 120..=800`. serde
/// gives the integer half for free — a fractional or negative value fails to
/// deserialize into `u32` before the command body runs — so only the ranges are
/// re-raised in [`Self::validate`], under the same `BAD_REQUEST` code zod's
/// failure produced.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CompactDimensions {
    pub width: u32,
    pub height: u32,
}

impl Default for CompactDimensions {
    fn default() -> Self {
        Self {
            width: COMPACT_DEFAULT_WIDTH,
            height: COMPACT_DEFAULT_HEIGHT,
        }
    }
}

impl CompactDimensions {
    /// # Errors
    ///
    /// `BAD_REQUEST` when either dimension is outside v1's zod range.
    pub fn validate(self) -> crate::error::CommandResult<Self> {
        if !(200..=1200).contains(&self.width) {
            return Err(crate::error::bad_request(
                "the compact width must be between 200 and 1200",
            ));
        }
        if !(120..=800).contains(&self.height) {
            return Err(crate::error::bad_request(
                "the compact height must be between 120 and 800",
            ));
        }
        Ok(self)
    }
}

/// What the window is right now, read once before planning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowFacts {
    pub is_maximized: bool,
    /// The current rectangle, or `None` while maximized.
    ///
    /// Tauri has no `getNormalBounds`: Electron reports a maximized window's
    /// *restored* rectangle, Tauri reports what is on screen. It does not
    /// matter, and the reason is worth stating — v1 only ever used
    /// `normalBounds` on the path where the window was **not** maximized, since
    /// a maximized one is restored by re-maximizing. So the bounds are captured
    /// only when there is something real to capture, and this is `None` rather
    /// than a lie.
    pub bounds: Option<Bounds>,
}

/// The three facts v1 kept in a closure.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Compact {
    pub active: bool,
    pub was_maximized: bool,
    pub normal_bounds: Option<Bounds>,
}

/// Compact mode's runtime state, as Tauri-managed state.
#[derive(Default)]
pub struct CompactModeState {
    inner: std::sync::Mutex<Compact>,
}

impl CompactModeState {
    /// The current state, copied out rather than borrowed so no lock is held
    /// across the window calls that follow.
    pub fn get(&self) -> Compact {
        *lock_or_recover(&self.inner)
    }

    pub fn set(&self, compact: Compact) {
        *lock_or_recover(&self.inner) = compact;
    }
}

/// What a `window:set-compact-mode` call asks the window to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactPlan {
    /// The request matches the current state; v1's
    /// `if (compactMode === isCompactMode) return;`.
    Nothing,
    /// Already compact and asked for compact again: relock at the new size.
    Resize(CompactDimensions),
    /// Enter compact mode.
    Enter {
        dimensions: CompactDimensions,
        /// The window is maximized and must be restored before being resized.
        unmaximize: bool,
    },
    /// Leave compact mode, putting back what was there before.
    Leave(Restore),
}

/// What leaving compact mode restores.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Restore {
    /// It was maximized on the way in.
    Maximize,
    /// It was a plain window at these bounds.
    Bounds(Bounds),
    /// Neither is known, so leave the window wherever unlocking put it. Only
    /// reachable if compact mode was entered before the state was recorded.
    AsIs,
}

/// v1's `setCompactMode` body, as a decision over values.
///
/// Returns the plan and the state that follows it. The resize branch
/// deliberately does **not** re-record `normal_bounds`: it would capture the
/// *compact* bounds and the original size would be lost, which is the bug the
/// early return in v1 exists to avoid.
pub fn plan(
    current: Compact,
    requested: bool,
    dimensions: CompactDimensions,
    facts: WindowFacts,
) -> (CompactPlan, Compact) {
    if requested && current.active {
        return (CompactPlan::Resize(dimensions), current);
    }

    if requested == current.active {
        return (CompactPlan::Nothing, current);
    }

    if requested {
        return (
            CompactPlan::Enter {
                dimensions,
                unmaximize: facts.is_maximized,
            },
            Compact {
                active: true,
                was_maximized: facts.is_maximized,
                normal_bounds: facts.bounds,
            },
        );
    }

    let restore = if current.was_maximized {
        Restore::Maximize
    } else {
        current.normal_bounds.map_or(Restore::AsIs, Restore::Bounds)
    };

    (CompactPlan::Leave(restore), Compact::default())
}

/// The saved corner, if it still lands on a connected display.
///
/// Guards against a position saved on a monitor that has since been unplugged
/// pulling the mini-player offscreen, where it cannot be dragged back. Ported
/// arithmetic-for-arithmetic from v1, including the asymmetry: the *far* edge
/// test adds the window's extent and the *near* edge test does not.
pub fn valid_compact_position(
    saved: Option<Position>,
    dimensions: CompactDimensions,
    work_areas: &[WorkArea],
) -> Option<Position> {
    let saved = saved?;
    let width = i32::try_from(dimensions.width).unwrap_or(i32::MAX);
    let height = i32::try_from(dimensions.height).unwrap_or(i32::MAX);

    let visible = work_areas.iter().any(|area| {
        let x_visible = saved.x.saturating_add(width) >= area.x + VISIBLE_PX
            && saved.x <= area.x + area.width - VISIBLE_PX;
        let y_visible = saved.y.saturating_add(height) >= area.y + VISIBLE_PX
            && saved.y <= area.y + area.height - VISIBLE_PX;
        x_visible && y_visible
    });

    visible.then_some(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIZE: CompactDimensions = CompactDimensions {
        width: 500,
        height: 214,
    };

    fn at(x: i32, y: i32) -> Bounds {
        Bounds {
            position: Position { x, y },
            width: 1200,
            height: 800,
        }
    }

    fn windowed(bounds: Bounds) -> WindowFacts {
        WindowFacts {
            is_maximized: false,
            bounds: Some(bounds),
        }
    }

    const MAXIMIZED: WindowFacts = WindowFacts {
        is_maximized: true,
        bounds: None,
    };

    #[test]
    fn the_default_dimensions_are_v1s() {
        assert_eq!(CompactDimensions::default(), SIZE);
    }

    #[test]
    fn dimensions_inside_v1s_bounds_pass() {
        for (width, height) in [(200, 120), (500, 214), (1200, 800)] {
            assert!(CompactDimensions { width, height }.validate().is_ok());
        }
    }

    #[test]
    fn dimensions_outside_v1s_bounds_are_a_bad_request() {
        use shiranami_core::error::codes;

        for (width, height) in [(199, 214), (1201, 214), (500, 119), (500, 801)] {
            let error = CompactDimensions { width, height }
                .validate()
                .expect_err("out of range is refused");
            assert_eq!(error.code, codes::validation::BAD_REQUEST);
        }
    }

    #[test]
    fn entering_from_a_plain_window_records_the_bounds_to_come_back_to() {
        let (plan, next) = plan(Compact::default(), true, SIZE, windowed(at(100, 60)));

        assert_eq!(
            plan,
            CompactPlan::Enter {
                dimensions: SIZE,
                unmaximize: false
            }
        );
        assert_eq!(
            next,
            Compact {
                active: true,
                was_maximized: false,
                normal_bounds: Some(at(100, 60)),
            }
        );
    }

    /// A maximized window is restored by re-maximizing, so it is unmaximized on
    /// the way in and no bounds are needed. Locking a maximized window to
    /// 500×214 without unmaximizing first leaves the OS believing it is still
    /// maximized, and the restore button then does nothing.
    #[test]
    fn entering_from_a_maximized_window_unmaximizes_and_remembers_that() {
        let (plan, next) = plan(Compact::default(), true, SIZE, MAXIMIZED);

        assert_eq!(
            plan,
            CompactPlan::Enter {
                dimensions: SIZE,
                unmaximize: true
            }
        );
        assert!(next.was_maximized);
        assert_eq!(next.normal_bounds, None);
    }

    #[test]
    fn leaving_after_entering_from_a_plain_window_restores_its_bounds() {
        let entered = Compact {
            active: true,
            was_maximized: false,
            normal_bounds: Some(at(100, 60)),
        };

        let (plan, next) = plan(entered, false, SIZE, windowed(at(0, 0)));

        assert_eq!(plan, CompactPlan::Leave(Restore::Bounds(at(100, 60))));
        assert_eq!(next, Compact::default(), "the state resets on the way out");
    }

    #[test]
    fn leaving_after_entering_from_a_maximized_window_re_maximizes() {
        let entered = Compact {
            active: true,
            was_maximized: true,
            normal_bounds: None,
        };

        let (plan, _) = plan(entered, false, SIZE, windowed(at(0, 0)));

        assert_eq!(plan, CompactPlan::Leave(Restore::Maximize));
    }

    /// Nothing was recorded, so there is nothing to put back. Unlocking the size
    /// constraints and stopping is better than guessing a rectangle.
    #[test]
    fn leaving_with_nothing_recorded_only_unlocks() {
        let entered = Compact {
            active: true,
            was_maximized: false,
            normal_bounds: None,
        };

        let (plan, _) = plan(entered, false, SIZE, windowed(at(0, 0)));

        assert_eq!(plan, CompactPlan::Leave(Restore::AsIs));
    }

    /// The branch v1 wrote an early return for, and the bug it prevents: the
    /// renderer resizes the mini-player by calling `setCompactMode(true, …)`
    /// again, and re-recording `normal_bounds` there would capture the *compact*
    /// rectangle — so leaving compact mode would restore a 500×214 window.
    #[test]
    fn resizing_while_compact_keeps_the_bounds_it_will_restore_to() {
        let entered = Compact {
            active: true,
            was_maximized: false,
            normal_bounds: Some(at(100, 60)),
        };
        let taller = CompactDimensions {
            width: 500,
            height: 320,
        };

        let (plan, next) = plan(entered, true, taller, windowed(at(0, 0)));

        assert_eq!(plan, CompactPlan::Resize(taller));
        assert_eq!(next, entered, "the recorded state survives a resize");
    }

    #[test]
    fn asking_for_the_state_the_window_is_already_in_does_nothing() {
        let (plan, next) = plan(Compact::default(), false, SIZE, windowed(at(0, 0)));

        assert_eq!(plan, CompactPlan::Nothing);
        assert_eq!(next, Compact::default());
    }

    fn primary() -> WorkArea {
        WorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }
    }

    #[test]
    fn a_position_well_inside_a_display_is_reused() {
        let saved = Some(Position { x: 400, y: 300 });

        assert_eq!(
            valid_compact_position(saved, SIZE, &[primary()]),
            Some(Position { x: 400, y: 300 })
        );
    }

    /// The case the guard exists for: a corner on a monitor that is no longer
    /// connected. Without it the mini-player opens where nothing can reach it.
    #[test]
    fn a_position_on_a_disconnected_display_is_discarded() {
        let saved = Some(Position { x: 2400, y: 300 });

        assert_eq!(valid_compact_position(saved, SIZE, &[primary()]), None);
    }

    /// …and is kept when that monitor is back, which is what makes it a
    /// containment check rather than a clamp to the primary display.
    #[test]
    fn a_position_on_a_second_display_is_reused_when_that_display_is_present() {
        let secondary = WorkArea {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let saved = Some(Position { x: 2400, y: 300 });

        assert_eq!(
            valid_compact_position(saved, SIZE, &[primary(), secondary]),
            Some(Position { x: 2400, y: 300 })
        );
    }

    /// The tolerance, at its exact edges. A window whose right edge is 80px
    /// inside the work area is still reachable; one pixel less is not.
    #[test]
    fn the_eighty_pixel_tolerance_is_inclusive_at_both_edges() {
        let just_on = Some(Position {
            x: -(500 - VISIBLE_PX),
            y: 300,
        });
        let just_off = Some(Position {
            x: -(500 - VISIBLE_PX) - 1,
            y: 300,
        });

        assert!(valid_compact_position(just_on, SIZE, &[primary()]).is_some());
        assert!(valid_compact_position(just_off, SIZE, &[primary()]).is_none());
    }

    /// Both axes must pass. A window that is horizontally on screen but below
    /// the taskbar is as unreachable as one on a dead monitor.
    #[test]
    fn a_position_off_only_one_axis_is_still_discarded() {
        let below = Some(Position { x: 400, y: 1080 });

        assert_eq!(valid_compact_position(below, SIZE, &[primary()]), None);
    }

    /// Nothing saved, and no display at all: both are "let the window manager
    /// place it", never a crash and never a guess at (0, 0).
    #[test]
    fn an_absent_position_or_an_empty_display_list_yields_nothing() {
        assert_eq!(valid_compact_position(None, SIZE, &[primary()]), None);
        assert_eq!(
            valid_compact_position(Some(Position { x: 0, y: 0 }), SIZE, &[]),
            None
        );
    }

    /// v1 stored `{ x, y }` and read it back with a `typeof === 'number'`
    /// guard. The shape is pinned because it is on disk in every install that
    /// has ever used compact mode.
    #[test]
    fn the_saved_position_keeps_v1s_stored_shape() {
        let parsed: Position =
            serde_json::from_str(r#"{"x":1200,"y":40}"#).expect("v1's shape parses");

        assert_eq!(parsed, Position { x: 1200, y: 40 });
    }

    /// A blob that is not a position — a partially written file, an older
    /// format — reads as "no saved corner" rather than failing the call.
    #[test]
    fn a_malformed_saved_position_is_ignored_rather_than_fatal() {
        assert!(serde_json::from_str::<Position>(r#"{"x":1200}"#).is_err());
        assert!(serde_json::from_str::<Position>("null").is_err());
    }

    #[test]
    fn the_compact_state_round_trips_through_the_managed_holder() {
        let holder = CompactModeState::default();
        assert_eq!(holder.get(), Compact::default());

        let entered = Compact {
            active: true,
            was_maximized: true,
            normal_bounds: Some(at(10, 20)),
        };
        holder.set(entered);

        assert_eq!(holder.get(), entered);
    }

    /// The restored minimum must be the one `tauri.conf.json` declares, or a
    /// window that has been in compact mode comes back with a different floor
    /// than one that never has.
    #[test]
    fn the_restored_minimum_size_matches_the_shipped_window_config() {
        let config = include_str!("../tauri.conf.json");

        assert!(config.contains(&format!("\"minWidth\": {DEFAULT_MIN_WIDTH}")));
        assert!(config.contains(&format!("\"minHeight\": {DEFAULT_MIN_HEIGHT}")));
    }
}
