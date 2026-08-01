//! Scrobbling contracts, ported from
//! `packages/contracts/src/domain/scrobble.ts`.
//!
//! The renderer never sees the raw Last.fm session key or ListenBrainz token —
//! those stay main-only, in [`crate::store`]. It reads back only the connection
//! status here and writes credentials in through dedicated commands.
//!
//! `LastfmConnectResult` / `ListenBrainzConnectResult` are deliberately **not**
//! ported here. Both are `{ ok: true; … } | { ok: false; error }` unions
//! discriminated on a boolean literal, which neither `serde`'s tagged-enum
//! representations nor `specta` 2.0.0-rc.25 (whose literal datatypes are written
//! but unshipped) can express. They are single-command response shapes with no
//! second consumer, so they belong to `shiranami-integrations` in Phase 12,
//! which can pick a representation alongside the command that returns them.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The scrobbling connection status the Settings UI renders.
///
/// Carries booleans and the display username only — never the secrets behind
/// them.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleStatus {
    /// Master opt-in switch. When false, nothing is submitted.
    pub enabled: bool,
    /// True when a Last.fm session key is stored.
    pub lastfm_connected: bool,
    /// Last.fm display name, when connected.
    pub lastfm_username: Option<String>,
    /// True when a ListenBrainz user token is stored.
    pub listen_brainz_connected: bool,
    /// Plays parked in the retry queue after a failed submission.
    pub pending_count: u32,
}
