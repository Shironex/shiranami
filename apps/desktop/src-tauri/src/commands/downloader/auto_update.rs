//! `downloader:get-auto-update-status`: what automatic tool updating has done.
//!
//! v2-only; v1 had no automatic tool updates. One read-only channel, because
//! the rest of the feature needs none:
//!
//! - **The opt-in** is a field in the renderer `settings` blob, written by the
//!   existing `store:set`, so there is no setter here. See
//!   `crate::downloads::auto_update` for why it lives there.
//! - **The bookkeeping** (last check, last installed version) is under the
//!   main-only `downloads.autoUpdate` key, which the renderer cannot read
//!   through `store:get` by construction. This channel is how the Downloads
//!   card shows "updated automatically to X" and when it last checked.
//!
//! It answers even when the downloader was never built (E2E), because the
//! record is just a settings read and an empty one is a true answer.

use shiranami_core::models::ToolAutoUpdateState;
use tauri::State;

use crate::error::CommandResult;
use crate::state::AppState;

/// `downloader:get-auto-update-status`: the persisted automatic-update record.
#[tauri::command]
#[specta::specta]
pub async fn downloader_get_auto_update_status(
    state: State<'_, AppState>,
) -> CommandResult<ToolAutoUpdateState> {
    Ok(crate::downloads::auto_update::load_state(state.settings()))
}
