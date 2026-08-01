//! `metadata:*` — the iTunes lookup, the enrich batch, and the tag editor.
//!
//! Five channels, ported from `apps/desktop/src/main/ipc/metadata-enrich.ts`.
//! The lookup, the batch and the tag writer all live in `shiranami-metadata`;
//! what this module owns is the single-run slot, the progress channel, and one
//! wire contract the crate deliberately refused to preserve.
//!
//! # `metadata:write-tags` answers `{ success: true }` for "the request was
//! processed"
//!
//! This is the load-bearing decision in the namespace, and it is a **downgrade**
//! of what the crate now knows.
//!
//! v1's `writeMetadataToFile` wrapped its whole body in a `catch` whose comment
//! read *"Don't throw — the DB update and album art save still succeed"*. It
//! never threw. So the handler's `catch → { success: false }` branch was
//! unreachable, and `metadata:write-tags` answered `{ success: true }` for a
//! `.wav` it could not write, for a missing ffmpeg, and for a genuine I/O error
//! alike — then committed the database row regardless.
//!
//! `shiranami-metadata` fixes that at the crate level: deviation 4 in its module
//! docs returns a real `Result`, and architecture §Phase 9 assigns the wire
//! contract to Phase 14 explicitly — *"`metadata:write-tags` must keep answering
//! `{ success: true }` for 'the request was processed', because the renderer
//! commits the database row on it."*
//!
//! So [`metadata_write_tags`] logs a write failure and carries on: the row is
//! still updated and the answer is still `{ success: true }`. Two reasons this is
//! the right call rather than a shrug:
//!
//! - `EditTagsDialog.hooks.ts` reads `result.success` and, on `false`, toasts
//!   and leaves its local store untouched — while the row v1's handler had
//!   *already written* would say otherwise on the next load. Reporting the
//!   failure without also moving the database write would make the renderer and
//!   the database disagree in a new way, which is worse than the old agreement.
//! - The failure that produced this in v1 was `.wav`, and the crate now writes
//!   `.wav`. The main thing the swallow was hiding is gone.
//!
//! The `error` field stays on the wire because v1's type declares it, and
//! [`the_success_flag_survives_a_write_failure`] pins the behaviour so a later
//! reader cannot "fix" it without deleting a test that explains why.
//!
//! [`the_success_flag_survives_a_write_failure`]: tests::the_success_flag_survives_a_write_failure
//!
//! # One slot for the whole namespace
//!
//! v1 kept a single module-level `activeEnrichAbort`. A bulk run and a preview
//! both claim it, so they are mutually exclusive and `metadata:enrich:cancel`
//! aborts whichever holds it. That bluntness is deliberate: the renderer has one
//! cancel button and one progress bar, and a second concurrent run would have
//! nowhere to report. [`shiranami_metadata::enrich::EnrichSlot`] is that slot,
//! including the identity check that stops a late-finishing run from clearing a
//! newer one's claim.
//!
//! Unlike `library`'s scan slot, a second claim is **refused** —
//! `metadata.enrich_busy`, which `apps/web`'s enrich store matches on to show
//! "another run is already going" instead of a failure toast.

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use shiranami_core::models::{Patch, TrackUpdateInput, double_option};
use shiranami_db::repo::tracks;
use shiranami_metadata::enrich::{
    EnrichContext, EnrichMode, EnrichOptions, EnrichProgress, EnrichSlot, EnrichTrackInput,
    EnrichTrackResult, EnrichUpdatedFields, enrich_tracks,
};
use shiranami_metadata::lookup::{LookupSource, MetadataLookupResult, lookup};
use shiranami_metadata::write::{FieldEdit, WriteTagsOptions, write_tags};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event as _;

use crate::commands::library::{data_dir, off_thread, require_path};
use crate::error::{CommandResult, WireResultExt as _};
use crate::events::MetadataEnrichProgress;
use crate::state::AppState;
use crate::wire::Json;

/// Register this namespace's commands with [`crate::commands::registry`].
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::metadata::metadata_lookup,
                crate::commands::metadata::metadata_enrich_tracks,
                crate::commands::metadata::metadata_enrich_preview,
                crate::commands::metadata::metadata_enrich_cancel,
                crate::commands::metadata::metadata_write_tags,
            ]
        }
    };
}
pub(crate) use commands;

/// v1's `error: 'cancelled'` on a cancelled preview. The renderer matches the
/// literal to render a cancelled state rather than a failure.
const CANCELLED: &str = "cancelled";

/// The namespace's one enrich slot, as managed state.
///
/// A newtype over the crate's slot rather than the bare `Arc` so the managed
/// type says what it is at every `State<'_, …>` site. Phase 16 `manage`s it
/// alongside [`AppState`]; until then these commands answer "state not managed",
/// the same honest intermediate every stateful command in this crate is in.
#[derive(Debug, Default)]
pub struct EnrichRuns(Arc<EnrichSlot>);

impl EnrichRuns {
    /// Take the slot, or fail with `metadata.enrich_busy`.
    fn claim(&self) -> CommandResult<shiranami_metadata::enrich::EnrichGuard> {
        self.0.claim().wire()
    }
}

// ── wire types the crate deliberately does not own ───────────────────────────

/// `metadata:enrich:tracks`' second argument.
///
/// `shiranami_metadata::enrich::EnrichOptions` is not a wire type — it carries
/// [`EnrichMode`], which is a decision this layer makes rather than one the
/// renderer sends. v1's zod was `z.object({ writeToFile, onlyMissing })` and
/// that is exactly these two fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichRunOptions {
    /// Whether to write the proposed tags back to each file.
    pub write_to_file: bool,
    /// Fill only the fields that are missing, rather than overwriting.
    pub only_missing: bool,
}

/// `metadata:enrich:preview`' second argument.
///
/// One field, not two: a preview never writes, so v1 gave the channel its own
/// narrower schema (`enrichPreviewOptionsSchema`) rather than accepting a
/// `writeToFile` it would ignore.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnrichPreviewOptions {
    /// Fill only the fields that are missing.
    pub only_missing: bool,
}

/// The tag editor's submission. v1's `WriteTagsInput`.
///
/// The track is addressed by `id` (the row to update) **and** `file_path` (the
/// file to write), because the two writes are independent and v1 performed both.
///
/// Every editable field is three-state, and the distinction is what the editor
/// depends on: absent means "leave unchanged", `null` on a numeric means "the
/// user cleared this box, remove the frame", and a value means "write it". The
/// string fields are only ever absent or present in v1 — the editor sends `''`
/// for a cleared text box, which [`FieldEdit::normalized`] turns into a clear.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WriteTagsInput {
    /// The row to update.
    pub id: String,
    /// The file to write.
    pub file_path: PathBuf,
    /// Track title.
    #[specta(optional)]
    pub title: Option<String>,
    /// Track artist.
    #[specta(optional)]
    pub artist: Option<String>,
    /// Album artist, for grouping.
    #[specta(optional)]
    pub album_artist: Option<String>,
    /// Album title.
    #[specta(optional)]
    pub album: Option<String>,
    /// Genre.
    #[specta(optional)]
    pub genre: Option<String>,
    /// Release year. An explicit `null` clears it.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional, type = Option<i32>)]
    pub year: Patch<i32>,
    /// Position within the album. An explicit `null` clears it.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional, type = Option<i32>)]
    pub track_number: Patch<i32>,
    /// Disc number. An explicit `null` clears it.
    #[serde(default, deserialize_with = "double_option")]
    #[specta(optional, type = Option<i32>)]
    pub disc_number: Patch<i32>,
}

/// What `metadata:write-tags` answers.
///
/// `success` means **the request was processed**, not that every byte hit disk.
/// See the module docs; `error` is declared because v1 declared it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WriteTagsResult {
    /// Whether the request was processed.
    pub success: bool,
    /// Why it was not, when it was not.
    #[specta(optional)]
    pub error: Option<String>,
}

// ── the commands ─────────────────────────────────────────────────────────────

/// `metadata:lookup` — find candidate tags for one track.
///
/// Two positional strings, as v1's channel took them. No fallback backend is
/// supplied: yt-dlp lives in `shiranami-downloader`, above `shiranami-metadata`
/// on the spine, and iTunes-only is the complete configuration Phase 9 scopes.
/// The fallback only ever contributed cover art.
///
/// No connection is acquired: this awaits the network, and holding the pool's
/// one connection across an HTTP timeout would stall every query in the app.
#[tauri::command]
#[specta::specta]
pub async fn metadata_lookup(
    state: State<'_, AppState>,
    title: String,
    artist: String,
) -> CommandResult<MetadataLookupResult> {
    lookup(state.http(), &title, &artist, None).await.wire()
}

/// `metadata:enrich:cancel` — cancel the run holding the slot.
///
/// Cancels a bulk run and a preview alike, because they share one slot.
/// Cancelling while idle is a no-op rather than an error: v1's comment says why,
/// and a stale flag left set by a mistimed cancel would poison the next run.
#[tauri::command]
#[specta::specta]
pub async fn metadata_enrich_cancel(runs: State<'_, EnrichRuns>) -> CommandResult<()> {
    runs.0.cancel();
    Ok(())
}

/// `metadata:enrich:preview` — propose tags for one track without writing.
///
/// Never touches the audio file and never updates the database. A downloaded
/// cover still lands in the art cache so the renderer can show the diff; v1 does
/// the same and notes that an entry the user then rejects is a harmless orphan
/// the prune pass reclaims.
///
/// Emits no progress: v1 wired the sink only on the batch channel, and a
/// single-track preview reporting into the bulk progress bar would move it for
/// an operation the bar is not describing.
#[tauri::command]
#[specta::specta]
pub async fn metadata_enrich_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    runs: State<'_, EnrichRuns>,
    track: EnrichTrackInput,
    options: EnrichPreviewOptions,
) -> CommandResult<EnrichTrackResult> {
    let guard = runs.claim()?;
    let data_dir = data_dir(&app);
    let context = EnrichContext::new(state.http(), data_dir.as_deref());

    let mut results = enrich_tracks(
        &context,
        std::slice::from_ref(&track),
        EnrichOptions {
            mode: EnrichMode::Preview,
            write_to_file: false,
            only_missing: options.only_missing,
        },
        guard.token(),
        &discard_progress,
    )
    .await;

    // A cancelled run returns a *shorter* list — an abandoned track contributes
    // nothing rather than a synthetic failure. For a batch that is the contract;
    // for a single track it means an empty result, and v1 answered a cancelled
    // preview with a no-match-shaped result carrying `error: 'cancelled'` so the
    // renderer could render a cancelled state without a thrown error.
    Ok(results.pop().unwrap_or_else(|| cancelled(&track.id)))
}

/// `metadata:enrich:tracks` — enrich a batch, four at a time.
///
/// Results come back in input order and a cancelled run returns a **shorter**
/// list than its input, exactly as v1's `slots.filter(r => r !== undefined)`
/// did. One track's failure never aborts the batch: it contributes a failed
/// result and the run continues, which is what makes a two-thousand-track run
/// survivable.
///
/// This command does not write database rows. v1's handler did not either — the
/// file writes happen inside the batch when `writeToFile` is set, and the
/// renderer commits the proposed fields through `db:tracks:update-many`.
#[tauri::command]
#[specta::specta]
pub async fn metadata_enrich_tracks(
    app: AppHandle,
    state: State<'_, AppState>,
    runs: State<'_, EnrichRuns>,
    tracks_input: Vec<EnrichTrackInput>,
    options: EnrichRunOptions,
) -> CommandResult<Vec<EnrichTrackResult>> {
    let guard = runs.claim()?;
    let data_dir = data_dir(&app);
    let context = EnrichContext::new(state.http(), data_dir.as_deref());
    let progress = progress_sink(app);

    Ok(enrich_tracks(
        &context,
        &tracks_input,
        EnrichOptions {
            mode: EnrichMode::Apply,
            write_to_file: options.write_to_file,
            only_missing: options.only_missing,
        },
        guard.token(),
        &progress,
    )
    .await)
}

/// `metadata:write-tags` — the manual tag editor's save.
///
/// Writes the user's tags to the file, then updates the database row to match,
/// then answers `{ success: true }`. **A file-write failure is logged and does
/// not change that answer** — see the module docs for why that downgrade is the
/// contract rather than an oversight.
#[tauri::command]
#[specta::specta]
pub async fn metadata_write_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    input: WriteTagsInput,
) -> CommandResult<WriteTagsResult> {
    require_path(&input.file_path)?;

    let data_dir = data_dir(&app);
    let edits = tag_edits(&input);
    let file_path = input.file_path.clone();

    // The file write first, off the webview's thread: it copies the whole file
    // to a sibling temp, tags the copy and renames, which is real disk I/O for
    // the length of the track.
    off_thread("write the file's tags", move || {
        if let Err(error) = write_tags(&file_path, &edits, data_dir.as_deref()) {
            // v1's `writeMetadataToFile` caught exactly here and carried on.
            tracing::error!(%error, path = %file_path.display(), "the tag write failed");
        }
        Ok(())
    })
    .await?;

    // Then the row — acquired late and released on return, never held across
    // the write above.
    let patch = row_patch(&input);
    if patch != TrackUpdateInput::default() {
        let mut conn = state.conn().await?;
        tracks::update(&mut conn, &input.id, &patch).await.wire()?;
    }

    Ok(WriteTagsResult {
        success: true,
        error: None,
    })
}

/// The progress sink for a preview, which emits nothing.
///
/// v1 wired `sendToRenderer` only on the batch channel. A single-track preview
/// reporting into the bulk progress bar would move a bar that is not describing
/// it.
fn discard_progress(_: EnrichProgress) {}

// ── mapping ──────────────────────────────────────────────────────────────────

/// Project the editor's submission onto the crate's tag edits.
///
/// `cover` is `None`: v1's `WriteTagsInput` carries no image, because the tag
/// editor edits text and artwork arrives through the enrich flow instead.
fn tag_edits(input: &WriteTagsInput) -> WriteTagsOptions {
    /// An absent string is `Keep`; a present one is `Set`, which
    /// `FieldEdit::normalized` turns into `Clear` when it is empty — the user
    /// emptied the box, which means remove the frame.
    fn text(value: Option<&String>) -> FieldEdit<String> {
        value.map_or(FieldEdit::Keep, |value| FieldEdit::Set(value.clone()))
    }

    WriteTagsOptions {
        title: text(input.title.as_ref()),
        artist: text(input.artist.as_ref()),
        album_artist: text(input.album_artist.as_ref()),
        album: text(input.album.as_ref()),
        genre: text(input.genre.as_ref()),
        year: FieldEdit::from_nullable(input.year),
        track_number: FieldEdit::from_nullable(input.track_number),
        disc_number: FieldEdit::from_nullable(input.disc_number),
        cover: None,
    }
}

/// Project the editor's submission onto the database patch.
///
/// v1 built this key by key with `if (input.x !== undefined)`, so an omitted
/// field is not clobbered and an empty string **is** written — the user
/// deliberately cleared the tag. `Patch` says the same thing in the type, which
/// is why the numerics pass straight through: an explicit `null` clears the
/// column exactly as it clears the frame, and v1 was careful to keep those two
/// in step so a rescan could not restore a stale tag.
fn row_patch(input: &WriteTagsInput) -> TrackUpdateInput {
    TrackUpdateInput {
        title: input.title.clone(),
        artist: input.artist.clone().map(Some),
        album_artist: input.album_artist.clone().map(Some),
        album: input.album.clone().map(Some),
        genre: input.genre.clone().map(Some),
        year: input.year,
        track_number: input.track_number,
        disc_number: input.disc_number,
        ..TrackUpdateInput::default()
    }
}

/// v1's cancelled-preview result: a no-match shape carrying `error: 'cancelled'`.
fn cancelled(id: &str) -> EnrichTrackResult {
    EnrichTrackResult {
        id: id.to_owned(),
        success: false,
        updated_fields: EnrichUpdatedFields::default(),
        source: LookupSource::None,
        confidence: None,
        error: Some(CANCELLED.to_owned()),
    }
}

/// A progress sink that emits `metadata:enrich:progress` for every tick.
///
/// Called from up to four concurrent tasks, so it must be `Sync`. A failed emit
/// is dropped: v1's `sendToRenderer` returns `false` for a destroyed window and
/// the batch carries on, and failing a two-thousand-track run because the window
/// closed would be a new behaviour and a worse one.
fn progress_sink(app: AppHandle) -> impl Fn(EnrichProgress) + Send + Sync + 'static {
    move |tick| {
        let Ok(payload) = serde_json::to_value(&tick) else {
            tracing::warn!("an enrich progress tick could not be serialized");
            return;
        };

        let _ = MetadataEnrichProgress(Json(payload)).emit(&app);
    }
}

#[cfg(test)]
#[path = "tests/metadata.rs"]
mod tests;
