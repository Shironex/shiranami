//! Third-party services, each isolated behind its own module.
//!
//! `shiranami-integrations` owns lyrics (local file, embedded tag and LRCLIB
//! lookup, with an LRU and request coalescing), weather, scrobbling to Last.fm
//! (md5 request signing) and ListenBrainz with a retry queue that — unlike
//! v1's memory-only one — is persisted, Discord Rich Presence with its
//! throttle/backoff/dedup state machine, and share-link creation against
//! `apps/server`. Its share DTOs stay hand-written zod on the TypeScript side
//! because the NestJS server and the paused Expo app both depend on them.
//!
//! Ported in Phase 12. Scrobble secrets must never cross the command boundary.
//! See `docs/v2/architecture.md` §2.2 (#22, #23, #25, #26).

// lane A
pub mod lyrics;
pub mod share;
pub mod weather;
