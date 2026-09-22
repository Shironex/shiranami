//! The `companion_state` singleton — hatch, accrual, and the small mutations.
//!
//! Born in v2 (no v1 channels to port): migration `0006_companion.sql`, spec
//! in `docs/v2/companion/research-tech.md` §4. The pure growth math lives in
//! [`shiranami_core::companion`]; this module owns the row.
//!
//! # Hatching seeds from history, once
//!
//! The first read creates the row with `xp = SUM(played_seconds)` over the
//! whole `play_history` — an existing user's pet hatches at a stage that
//! honors every hour they already listened. From that moment `xp` is an
//! accumulator and is **never derived from history again**: `play_history`
//! rows are `ON DELETE CASCADE` under their track, so a derived value would
//! demote the pet for tidying a library (§4's data-loss trap, and the whole
//! reason the column exists).
//!
//! # Borrow convention
//!
//! Every function takes `&mut SqliteConnection` and none acquires — the rule
//! [`crate::repo`] states. Public functions never call each other; the shared
//! "make sure the singleton exists" step is the private [`ensure_hatched`]
//! helper, which is also why every mutation can assume the row is there.

use shiranami_core::companion::{self, CompanionState, CompanionXpGain, Species};
use sqlx::{Connection, SqliteConnection};

use crate::error::{DbError, Result};

/// The `companion_state` row, as stored.
#[derive(Debug, sqlx::FromRow)]
struct CompanionRow {
    name: Option<String>,
    species: String,
    stage: i64,
    xp: f64,
    accessories: String,
    hatched_at: Option<String>,
    last_seen_at: Option<String>,
}

impl From<CompanionRow> for CompanionState {
    fn from(row: CompanionRow) -> Self {
        Self {
            name: row.name,
            species: Species::from_stored(&row.species),
            // A stored stage past `u8` could only come from a hand-edited row;
            // saturating keeps the ratchet's "never lower" promise even then.
            stage: u8::try_from(row.stage.max(0)).unwrap_or(u8::MAX),
            xp: row.xp,
            // Unreadable JSON degrades to "no accessories" rather than an
            // error: the accessories are Phase 3 delight, not ledger truth.
            accessories: serde_json::from_str(&row.accessories).unwrap_or_default(),
            hatched_at: row.hatched_at,
            last_seen_at: row.last_seen_at,
        }
    }
}

/// Read the singleton if it exists, hatch it from history if it does not.
///
/// The private half of every public function here. The hatch runs the
/// history scan and the insert in one transaction so the seeded value and the
/// row are one fact; `hatched_at` is the caller's `now`.
async fn ensure_hatched(conn: &mut SqliteConnection, now: &str) -> Result<CompanionState> {
    let existing: Option<CompanionRow> = sqlx::query_as(
        "SELECT name, species, stage, xp, accessories, hatched_at, last_seen_at \
           FROM companion_state WHERE id = 1",
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the companion state",
        source,
    })?;

    if let Some(row) = existing {
        return Ok(row.into());
    }

    let mut tx = conn.begin().await.map_err(|source| DbError::Query {
        operation: "begin the companion hatch transaction",
        source,
    })?;

    // The whole history, not a window: the hatch honors everything. NULL from
    // an empty table coalesces to 0.0 — the REAL literal matters, an integer 0
    // fails the f64 decode — and the max(0.0) guards a negative sum, which
    // only a hand-edited row could produce.
    let listened: f64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(played_seconds), 0.0) FROM play_history")
            .fetch_one(&mut *tx)
            .await
            .map_err(|source| DbError::Query {
                operation: "sum the listening history for the companion hatch",
                source,
            })?;

    let xp = listened.max(0.0);
    let stage = companion::stage_for_xp(xp);

    let row: CompanionRow = sqlx::query_as(
        "INSERT INTO companion_state (id, name, species, stage, xp, accessories, hatched_at) \
         VALUES (1, NULL, ?1, ?2, ?3, '[]', ?4) \
         RETURNING name, species, stage, xp, accessories, hatched_at, last_seen_at",
    )
    .bind(Species::default().as_str())
    .bind(i64::from(stage))
    .bind(xp)
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|source| DbError::Query {
        operation: "hatch the companion",
        source,
    })?;

    tx.commit().await.map_err(|source| DbError::Query {
        operation: "commit the companion hatch transaction",
        source,
    })?;

    Ok(row.into())
}

/// The singleton, hatching it on first read.
///
/// `now` is the ISO-8601 instant recorded as `hatched_at` when this call is
/// the hatch; on any later call it is unused. Reading never touches
/// `last_seen_at` — the caller decides when a read counts as a sighting, via
/// [`touch_last_seen`].
pub async fn get_or_hatch(conn: &mut SqliteConnection, now: &str) -> Result<CompanionState> {
    ensure_hatched(conn, now).await
}

/// Add honest listened seconds to the ledger, ratcheting the stage.
///
/// Returns what changed — the delta, the new lifetime total, the (possibly
/// freshly ratcheted) stage and whether a threshold was crossed — which is
/// exactly the `companion:xp` event payload. The arithmetic, including the
/// clamp on a negative delta and the never-regress ratchet, is
/// [`shiranami_core::companion::accrue`]; this function is the read, the
/// write and nothing else.
pub async fn accrue(
    conn: &mut SqliteConnection,
    xp_delta: f64,
    now: &str,
) -> Result<CompanionXpGain> {
    let current = ensure_hatched(&mut *conn, now).await?;
    let gain = companion::accrue(current.xp, current.stage, xp_delta);

    sqlx::query("UPDATE companion_state SET xp = ?1, stage = ?2 WHERE id = 1")
        .bind(gain.total_xp)
        .bind(i64::from(gain.stage))
        .execute(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "accrue companion xp",
            source,
        })?;

    Ok(gain)
}

/// Set the user-chosen name, returning the updated state.
pub async fn set_name(
    conn: &mut SqliteConnection,
    name: &str,
    now: &str,
) -> Result<CompanionState> {
    ensure_hatched(&mut *conn, now).await?;

    let row: CompanionRow = sqlx::query_as(
        "UPDATE companion_state SET name = ?1 WHERE id = 1 \
         RETURNING name, species, stage, xp, accessories, hatched_at, last_seen_at",
    )
    .bind(name)
    .fetch_one(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "name the companion",
        source,
    })?;

    Ok(row.into())
}

/// Switch the active species, returning the updated state.
///
/// Stage, xp, name and accessories are untouched — growth belongs to the
/// listener, so trying the other companion costs nothing
/// (`docs/v2/companion/decision.md`).
pub async fn set_species(
    conn: &mut SqliteConnection,
    species: Species,
    now: &str,
) -> Result<CompanionState> {
    ensure_hatched(&mut *conn, now).await?;

    let row: CompanionRow = sqlx::query_as(
        "UPDATE companion_state SET species = ?1 WHERE id = 1 \
         RETURNING name, species, stage, xp, accessories, hatched_at, last_seen_at",
    )
    .bind(species.as_str())
    .fetch_one(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "switch the companion species",
        source,
    })?;

    Ok(row.into())
}

/// Replace the worn accessory set, returning the updated state.
///
/// Stored as a JSON array in the `accessories` column. The repo stores what
/// it is given — which ids exist and which stages unlock them is renderer
/// vocabulary (the accessories are delight, not ledger truth), deliberately
/// not restated here where it would drift.
pub async fn set_accessories(
    conn: &mut SqliteConnection,
    accessories: &[String],
    now: &str,
) -> Result<CompanionState> {
    ensure_hatched(&mut *conn, now).await?;

    // Serializing a slice of strings cannot fail; the fallback only exists so
    // this path can never panic the caller over a delight feature.
    let stored = serde_json::to_string(accessories).unwrap_or_else(|_| "[]".to_owned());

    let row: CompanionRow = sqlx::query_as(
        "UPDATE companion_state SET accessories = ?1 WHERE id = 1 \
         RETURNING name, species, stage, xp, accessories, hatched_at, last_seen_at",
    )
    .bind(stored)
    .fetch_one(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "dress the companion",
        source,
    })?;

    Ok(row.into())
}

/// Record a sighting: stamp `last_seen_at` with the caller's instant.
///
/// The read that precedes it deliberately returns the *previous* value, which
/// is what makes return-after-absence moods computable from a single
/// `get-state` round trip.
pub async fn touch_last_seen(conn: &mut SqliteConnection, now: &str) -> Result<()> {
    ensure_hatched(&mut *conn, now).await?;

    sqlx::query("UPDATE companion_state SET last_seen_at = ?1 WHERE id = 1")
        .bind(now)
        .execute(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "stamp the companion's last sighting",
            source,
        })?;

    Ok(())
}
