//! The companion repository: hatching from history, accrual, and the small
//! mutations. Born in v2 — there is no v1 behaviour to port, so these pin the
//! spec in `docs/v2/companion/research-tech.md` §4 instead.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::companion::Species;
use shiranami_db::repo::companion;

use activity::{PlaySeed, exec, fresh, insert_play, with_one_track};

const NOW: &str = "2026-08-05T12:00:00.000Z";
const LATER: &str = "2026-08-06T09:30:00.000Z";

// ── get_or_hatch ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn a_fresh_library_hatches_a_stage_zero_shio_with_no_xp() {
    let mut fixture = fresh().await;

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("the companion must hatch");

    assert_eq!(state.name, None);
    assert_eq!(state.species, Species::Shio);
    assert_eq!(state.stage, 0);
    assert!((state.xp - 0.0).abs() < f64::EPSILON);
    assert_eq!(state.accessories, Vec::<String>::new());
    assert_eq!(state.hatched_at.as_deref(), Some(NOW));
    assert_eq!(state.last_seen_at, None, "nothing has seen it yet");
}

/// The delightful migration: an existing user's pet hatches honoring their
/// whole history — xp is the sum of every recorded second, and the stage is
/// derived from it at hatch time.
#[tokio::test]
async fn an_existing_history_seeds_the_hatch_with_its_whole_sum() {
    let mut fixture = with_one_track().await;

    // 26 hours of listening across two rows — past the 25-hour stage-1 line.
    for (id, seconds) in [("h1", 90_000.0), ("h2", 3_600.0)] {
        insert_play(
            fixture.conn(),
            &PlaySeed {
                id,
                played_seconds: seconds,
                ..PlaySeed::default()
            },
        )
        .await;
    }

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("the companion must hatch");

    assert!((state.xp - 93_600.0).abs() < f64::EPSILON);
    assert_eq!(
        state.stage, 1,
        "26 listened hours hatch straight into stage 1"
    );
    assert_eq!(state.hatched_at.as_deref(), Some(NOW));
}

/// The seed happens once. History arriving (or vanishing — the ON DELETE
/// CASCADE trap the accumulator exists for) after the hatch never rewrites xp
/// on read.
#[tokio::test]
async fn the_hatch_is_permanent_and_reads_never_reseed() {
    let mut fixture = with_one_track().await;
    insert_play(
        fixture.conn(),
        &PlaySeed {
            played_seconds: 90_000.0,
            ..PlaySeed::default()
        },
    )
    .await;

    let hatched = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("hatch");
    assert!((hatched.xp - 90_000.0).abs() < f64::EPSILON);

    // Deleting the track cascades its history away. The pet must not notice.
    exec(fixture.conn(), "DELETE FROM tracks WHERE id = 't1'").await;
    assert_eq!(
        activity::count_rows(fixture.conn(), "play_history").await,
        0
    );

    let read_back = companion::get_or_hatch(fixture.conn(), LATER)
        .await
        .expect("read");
    assert!(
        (read_back.xp - 90_000.0).abs() < f64::EPSILON,
        "xp is an accumulator; cascaded history must not demote the pet"
    );
    assert_eq!(
        read_back.hatched_at.as_deref(),
        Some(NOW),
        "the second read must not re-hatch"
    );
}

// ── accrue ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn accrual_adds_seconds_and_persists_them() {
    let mut fixture = fresh().await;

    let gain = companion::accrue(fixture.conn(), 200.0, NOW)
        .await
        .expect("accrue");
    assert!((gain.xp_gained - 200.0).abs() < f64::EPSILON);
    assert!((gain.total_xp - 200.0).abs() < f64::EPSILON);
    assert_eq!(gain.stage, 0);
    assert!(!gain.leveled_up);

    let second = companion::accrue(fixture.conn(), 100.0, NOW)
        .await
        .expect("accrue again");
    assert!((second.total_xp - 300.0).abs() < f64::EPSILON);

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("read");
    assert!(
        (state.xp - 300.0).abs() < f64::EPSILON,
        "the total persisted"
    );
}

/// Accruing on a virgin database hatches first, so the very first recorded
/// play cannot be lost to a missing row.
#[tokio::test]
async fn accrual_on_an_unhatched_database_hatches_first() {
    let mut fixture = fresh().await;

    companion::accrue(fixture.conn(), 42.0, NOW)
        .await
        .expect("accrue");

    let state = companion::get_or_hatch(fixture.conn(), LATER)
        .await
        .expect("read");
    assert_eq!(
        state.hatched_at.as_deref(),
        Some(NOW),
        "the accrual hatched"
    );
    assert!((state.xp - 42.0).abs() < f64::EPSILON);
}

#[tokio::test]
async fn crossing_a_threshold_ratchets_the_stored_stage() {
    let mut fixture = fresh().await;

    // One second short of stage 1 (25 h = 90 000 s), then two more seconds.
    companion::accrue(fixture.conn(), 89_999.0, NOW)
        .await
        .expect("accrue");
    let gain = companion::accrue(fixture.conn(), 2.0, NOW)
        .await
        .expect("accrue across the line");

    assert_eq!(gain.stage, 1);
    assert!(gain.leveled_up);

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("read");
    assert_eq!(state.stage, 1, "the crossing persisted");
}

/// The ratchet, exercised against the storage: a stage written high stays
/// high even when the row's xp says lower.
#[tokio::test]
async fn a_stored_stage_above_the_xp_never_regresses() {
    let mut fixture = fresh().await;
    companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("hatch");
    exec(
        fixture.conn(),
        "UPDATE companion_state SET stage = 3, xp = 10 WHERE id = 1",
    )
    .await;

    let gain = companion::accrue(fixture.conn(), 5.0, NOW)
        .await
        .expect("accrue");

    assert_eq!(gain.stage, 3, "the witnessed evolution is permanent");
    assert!(!gain.leveled_up);

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("read");
    assert_eq!(state.stage, 3);
}

// ── set_name / set_species / touch_last_seen ─────────────────────────────────

#[tokio::test]
async fn naming_the_companion_persists_and_touches_nothing_else() {
    let mut fixture = fresh().await;
    companion::accrue(fixture.conn(), 500.0, NOW)
        .await
        .expect("accrue");

    let named = companion::set_name(fixture.conn(), "Puddle", LATER)
        .await
        .expect("name");

    assert_eq!(named.name.as_deref(), Some("Puddle"));
    assert!((named.xp - 500.0).abs() < f64::EPSILON, "xp untouched");
    assert_eq!(
        named.hatched_at.as_deref(),
        Some(NOW),
        "naming must not re-hatch"
    );
}

/// Switching species keeps the stage and the xp — growth belongs to the
/// listener, so trying the other companion costs nothing.
#[tokio::test]
async fn switching_species_keeps_the_growth() {
    let mut fixture = fresh().await;
    companion::accrue(fixture.conn(), 95_000.0, NOW)
        .await
        .expect("accrue past stage 1");

    let switched = companion::set_species(fixture.conn(), Species::Hotaru, LATER)
        .await
        .expect("switch");

    assert_eq!(switched.species, Species::Hotaru);
    assert_eq!(switched.stage, 1, "the stage survives the switch");
    assert!((switched.xp - 95_000.0).abs() < f64::EPSILON);

    let back = companion::set_species(fixture.conn(), Species::Shio, LATER)
        .await
        .expect("switch back");
    assert_eq!(back.species, Species::Shio);
    assert_eq!(back.stage, 1);
}

/// `get_or_hatch` returns the *previous* sighting; the touch stamps the new
/// one afterwards. That order is what makes return-after-absence moods
/// computable from one read.
#[tokio::test]
async fn touch_last_seen_stamps_after_the_read_not_during_it() {
    let mut fixture = fresh().await;

    let first = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("hatch");
    assert_eq!(first.last_seen_at, None);

    companion::touch_last_seen(fixture.conn(), NOW)
        .await
        .expect("touch");

    let second = companion::get_or_hatch(fixture.conn(), LATER)
        .await
        .expect("read");
    assert_eq!(
        second.last_seen_at.as_deref(),
        Some(NOW),
        "the read reports the previous sighting"
    );
}

/// The singleton CHECK: a second row is unstorable, so the repository can
/// never fork the pet.
#[tokio::test]
async fn a_second_companion_row_is_unstorable() {
    let mut fixture = fresh().await;
    companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("hatch");

    let forked = sqlx::query("INSERT INTO companion_state (id) VALUES (2)")
        .execute(fixture.conn())
        .await;

    assert!(forked.is_err(), "CHECK (id = 1) must reject a second row");
    assert_eq!(
        activity::count_rows(fixture.conn(), "companion_state").await,
        1
    );
}

/// An unknown species string in the column — a rollback from a future build
/// that added one — reads as the default rather than an error.
#[tokio::test]
async fn an_unknown_stored_species_reads_as_the_default() {
    let mut fixture = fresh().await;
    companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("hatch");
    exec(
        fixture.conn(),
        "UPDATE companion_state SET species = 'kurage' WHERE id = 1",
    )
    .await;

    let state = companion::get_or_hatch(fixture.conn(), NOW)
        .await
        .expect("read");
    assert_eq!(state.species, Species::Shio);
}
