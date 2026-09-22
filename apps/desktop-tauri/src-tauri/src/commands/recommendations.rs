//! `recommendations:*` — the two shelves, "more like this", and smart mixes.
//!
//! Six channels, ported from `apps/desktop/src/main/ipc/recommendations.ts`.
//! That file is six one-line delegations into a service, and so is this one:
//! the scoring is `shiranami_recommendation::core`, the storage adapter is
//! `shiranami_recommendation::service`, and what lives here is the connection,
//! the clock, the row ids, and v1's fallback behaviour.
//!
//! # Three of these six degrade instead of failing, and which three is a contract
//!
//! v1 registered exactly nine channels with `handleWithFallback`; three of them
//! are in this namespace, and the fallbacks are **not** interchangeable:
//!
//! | Channel | On failure | Why |
//! | ------- | ---------- | --- |
//! | `get` | two empty, stale shelves | the shelf is ambient furniture on a screen the user opened for something else; a toast for it would interrupt a task it has nothing to do with |
//! | `refresh` | whatever is currently cached | the user asked for *newer*, and the honest answer to "could not get newer" is the older one, still labelled with its real age |
//! | `smart-mixes` | **`null`**, not `[]` | see below |
//! | `similar`, `not-interested`, `undo-not-interested` | reject | each is a direct response to a click, and silence would look like the click did nothing |
//!
//! `smart-mixes` returning `null` rather than an empty list is the subtlest of
//! the four and v1's comment calls it out: `[]` is a real answer meaning "your
//! library has no five-track genre bucket", which the renderer draws as a quiet
//! "not enough music yet" state. `null` means "the generator failed", which it
//! draws as an error. Collapsing them would tell a user with a failing database
//! that their library is too small.
//!
//! # `now` is supplied here, not read down there
//!
//! The recency half-life and the 24-hour shelf TTL are both measured from an
//! instant the service takes as an argument. v1 read `Date.now()` inside the
//! scorer and `new Date().toISOString()` inside the cache writer, which is why
//! neither could be tested without mocking the clock. Reading it once, here,
//! also means a single `get` cannot score a shelf against one instant and stamp
//! it with another.
//!
//! # What is deferred, and what is not
//!
//! v1's `refresh` also rebuilt the **discover** shelf by spawning yt-dlp
//! against three seed tracks' RD mixes, and coalesced concurrent callers behind
//! one in-flight promise so two refreshes could not spawn six processes. Both
//! halves need pieces the composition root owns and Phase 16 boots — a process
//! runner and the binary manager — and §2.8 already assigns it the 30-second
//! coalesced background refresh that was this path's only other caller.
//!
//! So `refresh` recomputes the library shelf and serves the **cached** discover
//! shelf, reporting its real `generatedAt` and `stale`. Nothing is fabricated:
//! the shelf goes visibly stale rather than silently wrong, and the renderer's
//! "last updated" line stays true. The ordering decision the fetch half depends
//! on — seeds resolved strongest-first, so the best seed wins the dedupe — is
//! already ported in `service::discover_seed_youtube_ids`.
//!
//! The in-flight coalescing is deferred with it. It existed to stop concurrent
//! yt-dlp fan-out; what remains is one bounded SQL recompute, where two
//! overlapping calls cost a second aggregate rather than six subprocesses.

use shiranami_core::models::{
    DiscoverShelf, LibraryShelf, RecommendationKind, RecommendationShelves, SimilarTrackResult,
    SmartMixResult, SmartMixSignals, SmartMixWeather,
};
use shiranami_core::time::instant;
use shiranami_recommendation::service;
use tauri::State;

use crate::error::{CommandResult, WireResultExt as _, bad_request};
use crate::state::AppState;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::recommendations::recommendations_get,
                crate::commands::recommendations::recommendations_refresh,
                crate::commands::recommendations::recommendations_similar,
                crate::commands::recommendations::recommendations_not_interested,
                crate::commands::recommendations::recommendations_undo_not_interested,
                crate::commands::recommendations::recommendations_smart_mixes,
            ]
        }
    };
}
pub(crate) use commands;

/// The latest hour of the day v1's `z.number().int().min(0).max(23)` accepted.
const MAX_HOUR: u8 = 23;

/// v1's `EMPTY_SHELVES` — what `get` resolves to when the cache cannot be read.
///
/// Both shelves are `stale` with a `null` `generatedAt`, which is the same
/// shape a genuinely never-generated cache produces. That is deliberate: the
/// renderer's "last updated" line has nothing to show in either case, and
/// inventing a timestamp to distinguish them would put a lie on the screen.
fn empty_shelves() -> RecommendationShelves {
    RecommendationShelves {
        library: LibraryShelf {
            kind: RecommendationKind::Library,
            items: Vec::new(),
            generated_at: None,
            stale: true,
        },
        discover: DiscoverShelf {
            kind: RecommendationKind::Discover,
            items: Vec::new(),
            generated_at: None,
            stale: true,
        },
    }
}

/// `recommendations:get` — both shelves, recomputing the library one if stale.
///
/// Never rejects; see the module docs for why this one degrades.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_get(
    state: State<'_, AppState>,
) -> CommandResult<RecommendationShelves> {
    let mut conn = state.conn().await?;

    Ok(service::shelves(&mut conn, instant::now_ms())
        .await
        .unwrap_or_else(|error| {
            tracing::warn!(%error, "reading the shelves failed; serving empty ones");
            empty_shelves()
        }))
}

/// `recommendations:refresh` — rebuild both shelves, then return them.
///
/// The library half is one SQL recompute. The discover half spawns yt-dlp
/// against three seeds' RD mixes, so it runs through [`crate::discover`] with
/// **no connection held** — the pool has one and the fan-out takes seconds —
/// and behind the latch that stops it overlapping the background refresh.
/// Absent under the E2E harness, where the shelf is served from its cache.
///
/// On failure this falls back to *reading* the shelves rather than to an empty
/// pair, exactly as v1's `() => getRecommendationShelves()` did — the user
/// asked for newer, and the older answer is better than no answer. If that read
/// fails too the rejection surfaces, as it did in v1: a fallback that throws is
/// not caught again.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_refresh(
    state: State<'_, AppState>,
) -> CommandResult<RecommendationShelves> {
    let now_ms = instant::now_ms();

    if let Some(discover) = state.deferred().discover.clone() {
        // Before the library recompute rather than after it, so the shelves
        // read at the end include the shelf this just wrote — v1 returned both
        // halves from one refresh and the renderer compares `generatedAt`
        // across the call to decide whether it degraded to the cache.
        discover.run(&state, now_ms).await;
    }

    let mut conn = state.conn().await?;

    match service::refresh(&mut conn, now_ms).await {
        Ok(shelves) => Ok(shelves),
        Err(error) => {
            tracing::warn!(%error, "refresh failed; serving the cached shelves");
            service::shelves(&mut conn, now_ms).await.wire()
        }
    }
}

/// `recommendations:similar` — tracks like this one, most similar first.
///
/// Rejects on failure, unlike the two shelf channels: this answers a click.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_similar(
    state: State<'_, AppState>,
    seed_track_id: String,
) -> CommandResult<Vec<SimilarTrackResult>> {
    validate_track_id(&seed_track_id)?;

    let mut conn = state.conn().await?;
    service::similar_tracks(&mut conn, &seed_track_id)
        .await
        .wire()
}

/// `recommendations:not-interested` — hide a track from the library shelf.
///
/// A track that is no longer in the library is a silent no-op, as in v1: the
/// context menu can outlive the row it was opened on.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_not_interested(
    state: State<'_, AppState>,
    track_id: String,
) -> CommandResult<()> {
    validate_track_id(&track_id)?;
    let id = uuid::Uuid::new_v4().to_string();

    let mut conn = state.conn().await?;
    service::mark_not_interested(&mut conn, &id, &track_id)
        .await
        .wire()
}

/// `recommendations:undo-not-interested` — un-hide a track.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_undo_not_interested(
    state: State<'_, AppState>,
    track_id: String,
) -> CommandResult<()> {
    validate_track_id(&track_id)?;

    let mut conn = state.conn().await?;
    service::undo_not_interested(&mut conn, &track_id)
        .await
        .wire()
}

/// `recommendations:smart-mixes` — the mood, weather and decade mixes for now.
///
/// `None` is "the generator failed" and an empty list is "your library has no
/// mix worth showing". The two are different states on screen; see the module
/// docs.
#[tauri::command]
#[specta::specta]
pub async fn recommendations_smart_mixes(
    state: State<'_, AppState>,
    signals: SmartMixContext,
) -> CommandResult<Option<Vec<SmartMixResult>>> {
    signals.validate()?;

    let mut conn = state.conn().await?;

    Ok(service::smart_mixes(&mut conn, &signals.into())
        .await
        .map_or_else(
            |error| {
                tracing::warn!(%error, "building the smart mixes failed");
                None
            },
            Some,
        ))
}

/// The single object argument `recommendations:smart-mixes` takes.
///
/// # Why this is not [`SmartMixSignals`] itself
///
/// v1's zod for `weather` was `z.enum([...]).catch('unknown')`, and `.catch` is
/// a **coercion**, not a validation: an unrecognised string became `'unknown'`
/// and the call proceeded to build time and decade mixes. serde's derived
/// enum rejects an unrecognised variant instead, which would turn a stale
/// cached weather string in the renderer into a failed channel and — through
/// this channel's `null` fallback — into an error state on a screen that should
/// have shown mixes.
///
/// So the field is deserialized leniently and exported as
/// [`SmartMixWeather`] regardless, which keeps the emitted TypeScript identical
/// to the model's while restoring v1's runtime behaviour.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SmartMixContext {
    /// Local hour of day, 0–23.
    pub hour: u8,
    /// Current weather; absent when the user has not opted in, in which case
    /// the generator degrades to time and decade mixes.
    #[specta(optional)]
    pub weather: Option<SmartMixWeather>,
}

/// Hand-written so the **wire type stays exactly the model's**.
///
/// The obvious spelling is `#[serde(deserialize_with = …)]` on `weather`, and
/// `specta-serde` refuses it: a `deserialize_with` may change the wire type, so
/// it demands a `#[specta(type = …)]` declaration and then emits the field's
/// serialize and deserialize views as two separate TypeScript aliases —
/// `SmartMixContext_Serialize` and `SmartMixContext_Deserialize`, identical in
/// content, plus a union of the two. Three generated types for one argument, in
/// a file whose whole purpose is to be the single description of the contract.
///
/// That guard is right in general and does not apply here: this accepts exactly
/// the values the derived impl would — the eight bucket strings, absent, or
/// `null` — and differs only in what it does with a *ninth*. So the leniency
/// lives in an impl specta does not inspect, and the emitted type is one
/// struct that says what the renderer may send.
impl<'de> serde::Deserialize<'de> for SmartMixContext {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        /// The wire shape, with `weather` left as text so an unrecognised
        /// bucket is not an error before it can be coerced.
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Wire {
            hour: u8,
            #[serde(default)]
            weather: Option<String>,
        }

        let wire = Wire::deserialize(deserializer)?;

        Ok(Self {
            hour: wire.hour,
            // An explicit `null` stays `None` — "the user has not opted in" is
            // a different state from `Unknown`, and the generator skips weather
            // mixes entirely for it rather than falling into the default arm.
            weather: wire.weather.map(|bucket| {
                serde_json::from_value(serde_json::Value::String(bucket))
                    .unwrap_or(SmartMixWeather::Unknown)
            }),
        })
    }
}

impl SmartMixContext {
    /// v1's `z.number().int().min(0).max(23)`.
    ///
    /// The lower bound needs no check: `u8` cannot be negative, and serde
    /// rejects a fractional or negative JSON number for it, which is the rest of
    /// `z.number().int()`. Only the upper bound survives as a runtime check.
    fn validate(&self) -> CommandResult<()> {
        if self.hour > MAX_HOUR {
            return Err(bad_request("the hour must be between 0 and 23"));
        }
        Ok(())
    }
}

impl From<SmartMixContext> for SmartMixSignals {
    fn from(context: SmartMixContext) -> Self {
        Self {
            hour: context.hour,
            weather: context.weather,
        }
    }
}

/// v1's `z.string().min(1)`.
///
/// Deliberately **not** `.uuid()`, unlike the radio channels: v1 used
/// `z.string().min(1)` for every track id in this namespace, and its own tests
/// pass ids like `'seed'`. Tightening it here would reject fixtures and any
/// legacy row whose id predates UUID generation.
fn validate_track_id(track_id: &str) -> CommandResult<()> {
    if track_id.is_empty() {
        return Err(bad_request("the track id must not be empty"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::tests::state_over;
    use shiranami_core::error::codes;
    use std::time::Duration;

    /// The six channels back to back over one `AppState`. A leaked connection
    /// would hang rather than fail, so the body runs under a timeout.
    #[tokio::test]
    async fn every_command_releases_the_connection_it_acquired() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = state_over(dir.path()).await;
        let now_ms = instant::now_ms();

        let exercise = async {
            {
                let mut conn = state.conn().await.expect("acquire");
                service::shelves(&mut conn, now_ms).await.expect("get");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                service::refresh(&mut conn, now_ms).await.expect("refresh");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                service::similar_tracks(&mut conn, "nobody")
                    .await
                    .expect("similar");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                service::mark_not_interested(&mut conn, "n1", "nobody")
                    .await
                    .expect("mark");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                service::undo_not_interested(&mut conn, "nobody")
                    .await
                    .expect("undo");
            }
            {
                let mut conn = state.conn().await.expect("acquire");
                service::smart_mixes(
                    &mut conn,
                    &SmartMixSignals {
                        hour: 12,
                        weather: None,
                    },
                )
                .await
                .expect("mixes");
            }
        };

        tokio::time::timeout(Duration::from_secs(10), exercise)
            .await
            .expect(
                "a command held the pool's only connection past its return — with \
                 max_connections = 1 that is a self-deadlock, not contention",
            );
    }

    /// The shape `get` degrades to. Both shelves stale with no timestamp, which
    /// is what a never-generated cache also looks like — inventing a timestamp
    /// to tell them apart would put a lie on the screen.
    #[test]
    fn the_empty_shelves_fallback_keeps_v1s_shape() {
        let shelves = empty_shelves();

        assert_eq!(shelves.library.kind, RecommendationKind::Library);
        assert_eq!(shelves.discover.kind, RecommendationKind::Discover);
        assert!(shelves.library.items.is_empty());
        assert!(shelves.discover.items.is_empty());
        assert_eq!(shelves.library.generated_at, None);
        assert!(shelves.library.stale && shelves.discover.stale);
    }

    /// `null` is "the generator failed" and `[]` is "no mix qualifies". The
    /// renderer draws them differently, so the serialization must too.
    #[test]
    fn a_failed_mix_build_serializes_as_null_and_not_as_an_empty_list() {
        let failed: Option<Vec<SmartMixResult>> = None;
        let empty: Option<Vec<SmartMixResult>> = Some(Vec::new());

        assert_eq!(serde_json::to_string(&failed).expect("serialize"), "null");
        assert_eq!(serde_json::to_string(&empty).expect("serialize"), "[]");
    }

    #[test]
    fn the_hour_bounds_match_v1s_zod() {
        for hour in [0, 12, 23] {
            assert!(
                SmartMixContext {
                    hour,
                    weather: None
                }
                .validate()
                .is_ok(),
                "{hour} must pass"
            );
        }

        let error = SmartMixContext {
            hour: 24,
            weather: None,
        }
        .validate()
        .expect_err("24 must be refused");
        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }

    /// A negative or fractional hour is rejected by serde before the command
    /// body runs, which is the other half of `z.number().int()`.
    #[test]
    fn a_negative_or_fractional_hour_is_rejected_by_the_deserializer() {
        assert!(serde_json::from_str::<SmartMixContext>(r#"{"hour":-1}"#).is_err());
        assert!(serde_json::from_str::<SmartMixContext>(r#"{"hour":12.5}"#).is_err());
    }

    /// v1's `.catch('unknown')` is a coercion, not a validation. Without it a
    /// stale cached weather string in the renderer would fail the channel and,
    /// through the `null` fallback, show an error where mixes belong.
    #[test]
    fn an_unrecognised_weather_bucket_becomes_unknown_rather_than_a_rejection() {
        let parsed: SmartMixContext =
            serde_json::from_str(r#"{"hour":12,"weather":"drizzle"}"#).expect("v1 coerced this");

        assert_eq!(parsed.weather, Some(SmartMixWeather::Unknown));
    }

    #[test]
    fn a_recognised_weather_bucket_survives_and_an_absent_one_stays_absent() {
        let rain: SmartMixContext =
            serde_json::from_str(r#"{"hour":12,"weather":"rain"}"#).expect("parses");
        assert_eq!(rain.weather, Some(SmartMixWeather::Rain));

        // Absent and explicit-null are both "the user has not opted in", which
        // is a different state from `Unknown` — the generator skips weather
        // mixes entirely rather than falling into the default arm.
        let absent: SmartMixContext = serde_json::from_str(r#"{"hour":12}"#).expect("parses");
        assert_eq!(absent.weather, None);

        let nulled: SmartMixContext =
            serde_json::from_str(r#"{"hour":12,"weather":null}"#).expect("parses");
        assert_eq!(nulled.weather, None);
    }

    /// v1 validated these with `z.string().min(1)`, not `.uuid()` — its own
    /// tests pass ids like `'seed'`, and a legacy row's id may predate UUID
    /// generation.
    #[test]
    fn a_track_id_need_not_be_a_uuid() {
        assert!(validate_track_id("seed").is_ok());
        assert!(validate_track_id("11111111-1111-4111-8111-111111111111").is_ok());

        let error = validate_track_id("").expect_err("empty is refused");
        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }
}
