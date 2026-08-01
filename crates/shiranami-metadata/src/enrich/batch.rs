//! Running enrichment over a set of tracks.
//!
//! Ported from `apps/desktop/src/main/services/metadata-enrich-batch.ts`.
//!
//! Four tracks are in flight at once. That number is not a rate limit — the
//! real one is the 500 ms `itunes.apple.com` gate inside `shiranami-net`, which
//! serialises the lookups regardless. Four exists so a track's cover download
//! and tag write overlap the next track's gate wait.
//!
//! Two behaviours are worth reading the code for, because both are what makes a
//! long run survivable:
//!
//! - **One failure never aborts the batch.** Every track is caught
//!   individually and contributes a failed result. A library-wide run must not
//!   die on track 400 of 2,000.
//! - **Cancellation is prompt and reports once.** A queued track whose turn
//!   arrives after the cancel does no work at all, and exactly one `cancelled`
//!   progress event is emitted per run rather than one per abandoned track.

use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt;
use shiranami_net::HttpClient;
use tokio_util::sync::CancellationToken;

use crate::enrich::fields::{compute_updated_fields, needs_cover};
use crate::enrich::model::{
    EnrichOptions, EnrichProgress, EnrichStatus, EnrichTrackInput, EnrichTrackResult,
};
use crate::lookup::orchestrate::lookup_at;
use crate::lookup::{LookupFallback, LookupSource, MetadataLookupResult, download_cover};
use crate::write::{FieldEdit, WriteTagsOptions, write_tags};

/// How many tracks are enriched at once. v1's `ENRICH_CONCURRENCY`.
pub const ENRICH_CONCURRENCY: usize = 4;

/// Anything a run needs that is not per-track.
pub struct EnrichContext<'a> {
    /// The HTTP client, carrying the host gates.
    pub client: &'a HttpClient,
    /// App data directory, for the art cache. `None` skips cover caching.
    pub data_dir: Option<&'a Path>,
    /// Optional secondary lookup for covers.
    pub fallback: Option<&'a dyn LookupFallback>,
    /// The iTunes base URL. [`EnrichContext::new`] uses the real one; tests
    /// point it at a loopback server.
    pub itunes_endpoint: &'a str,
}

impl<'a> EnrichContext<'a> {
    /// A context against the real iTunes endpoint, with no fallback.
    pub fn new(client: &'a HttpClient, data_dir: Option<&'a Path>) -> Self {
        Self {
            client,
            data_dir,
            fallback: None,
            itunes_endpoint: crate::lookup::itunes::ENDPOINT,
        }
    }

    /// Attach a secondary lookup for covers.
    #[must_use]
    pub fn with_fallback(mut self, fallback: &'a dyn LookupFallback) -> Self {
        self.fallback = Some(fallback);
        self
    }
}

/// Progress sink. Called from several tasks, so it must be `Sync`.
pub type ProgressFn<'a> = &'a (dyn Fn(EnrichProgress) + Send + Sync);

/// Enrich every track, four at a time.
///
/// Results come back **in input order**, and a cancelled run returns a
/// *shorter* list than its input — abandoned tracks contribute nothing rather
/// than a synthetic failure, exactly as v1's `slots.filter(r => r !== undefined)`
/// did.
pub async fn enrich_tracks(
    context: &EnrichContext<'_>,
    tracks: &[EnrichTrackInput],
    options: EnrichOptions,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
) -> Vec<EnrichTrackResult> {
    let total = tracks.len();
    let state = RunState::new(total);

    // The stream carries **owned** inputs and the per-track body is a named
    // `async fn`. Neither is a style preference — see [`settle`].
    let results: Vec<Option<EnrichTrackResult>> = futures::stream::iter(tracks.to_vec())
        .map(|track| settle(context, track, options, cancel, progress, &state))
        .buffered(ENRICH_CONCURRENCY)
        .collect()
        .await;

    results.into_iter().flatten().collect()
}

/// Settle one track: skip it if the run is cancelled, enrich it otherwise, and
/// project a failure onto a failed result rather than letting it abort the
/// batch.
///
/// # Why the track arrives owned, and why this is not an `async move` block
///
/// Written the obvious way — `stream::iter(tracks.iter())` and an `async move`
/// block inside the closure — the closure returns a future that borrows its
/// `&EnrichTrackInput` argument, and rustc infers the closure at **one**
/// concrete lifetime rather than making it higher-ranked. Any caller that needs
/// the resulting future to be `Send` then cannot prove it, and the error is
/// *"implementation of `FnOnce` is not general enough"* reported against the
/// **caller**, naming neither this closure nor this crate.
///
/// That caller is every `#[tauri::command]`, which boxes its body as
/// `Send + 'static`. Phase 14's `metadata:enrich:tracks` and
/// `metadata:enrich:preview` hit it, and from the command's side the message
/// points at an attribute macro and is close to undiagnosable.
///
/// Taking the input by value removes the higher-ranked borrow altogether, and a
/// closure that merely *calls* an `async fn` returns that function's future
/// type rather than an opaque block holding a reference. The clone is one
/// `EnrichTrackInput` — a handful of `String`s — per track, against an HTTP
/// lookup and a tag write each; it does not register.
///
/// The body below is the inline one unchanged, so results are still in input
/// order and one failure still contributes a failed result rather than aborting
/// the batch.
async fn settle(
    context: &EnrichContext<'_>,
    track: EnrichTrackInput,
    options: EnrichOptions,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
    state: &RunState,
) -> Option<EnrichTrackResult> {
    // A queued task whose turn arrives after the cancel does no work at all —
    // no lookup, no request, nothing.
    if cancel.is_cancelled() {
        state.report_cancelled_once(progress, &track.title);
        return None;
    }

    match enrich_one(context, &track, options, cancel, progress, state).await {
        Ok(result) => Some(result),
        Err(error) if error.is_cancelled() || cancel.is_cancelled() => {
            state.report_cancelled_once(progress, &track.title);
            None
        }
        Err(error) => {
            let completed = state.complete();
            progress(EnrichProgress {
                current: completed,
                total: state.total,
                track_name: track.title.clone(),
                status: EnrichStatus::Error,
                confidence: None,
                source: None,
            });
            Some(EnrichTrackResult::failed(&track.id, error))
        }
    }
}

/// Enrich one track: look it up, fetch a cover, write the tags.
async fn enrich_one(
    context: &EnrichContext<'_>,
    track: &EnrichTrackInput,
    options: EnrichOptions,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
    state: &RunState,
) -> crate::Result<EnrichTrackResult> {
    state.report(progress, track, EnrichStatus::Searching, None);

    let found = cancellable(
        cancel,
        lookup_at(
            context.client,
            &track.title,
            &track.artist,
            context.fallback,
            context.itunes_endpoint,
        ),
    )
    .await?;

    if !found.is_match() {
        let completed = state.complete();
        state.report_at(progress, completed, track, EnrichStatus::Error, None);
        return Ok(EnrichTrackResult::no_match(&track.id));
    }

    let mut updated = compute_updated_fields(track, &found, options.only_missing);

    let cover = fetch_cover(context, track, &found, options, cancel, progress).await;

    if options.mode == crate::enrich::model::EnrichMode::Apply && options.write_to_file {
        state.report(progress, track, EnrichStatus::Writing, None);
        let outcome = write_tags(
            &track.file_path,
            &tag_edits(&updated, cover.clone()),
            context.data_dir,
        )?;
        updated.album_art = outcome.album_art_url;
    } else if let Some(cover) = cover {
        // Preview, or apply-without-file-write: the cover still lands in the
        // cache so the renderer can show it. v1 does the same, and notes that
        // an entry the user then rejects is a harmless orphan the prune pass
        // will reclaim.
        if let Some(data_dir) = context.data_dir {
            updated.album_art = crate::art::save_cover(data_dir, &cover)?;
        }
    }

    let completed = state.complete();
    progress(EnrichProgress {
        current: completed,
        total: state.total,
        track_name: track.title.clone(),
        status: EnrichStatus::Done,
        // v1 populates these two on `done` and on nothing else.
        confidence: Some(found.confidence),
        source: Some(found.source),
    });

    Ok(EnrichTrackResult {
        id: track.id.clone(),
        success: true,
        updated_fields: updated,
        source: if options.mode == crate::enrich::model::EnrichMode::Preview {
            LookupSource::Preview
        } else {
            found.source
        },
        confidence: Some(found.confidence),
        error: None,
    })
}

/// Download the cover, if there is one and it is wanted.
///
/// A failure here is logged and dropped rather than failing the track: v1
/// catches it inside `enrichSingleTrack`, so the text fields still land. Losing
/// artwork is not worth losing a correct artist over.
async fn fetch_cover(
    context: &EnrichContext<'_>,
    track: &EnrichTrackInput,
    found: &MetadataLookupResult,
    options: EnrichOptions,
    cancel: &CancellationToken,
    progress: ProgressFn<'_>,
) -> Option<Vec<u8>> {
    let url = found.cover_image_url.as_deref()?;
    if !needs_cover(track, options.only_missing) {
        return None;
    }

    // v1 emits `downloading` only when it is really about to download.
    progress(EnrichProgress {
        current: 0,
        total: 0,
        track_name: track.title.clone(),
        status: EnrichStatus::Downloading,
        confidence: None,
        source: None,
    });

    match cancellable(cancel, download_cover(context.client, url)).await {
        Ok(bytes) => Some(bytes),
        Err(error) => {
            tracing::warn!(%error, url, "cover download failed; keeping the text fields");
            None
        }
    }
}

/// Project the proposed fields onto a tag write.
fn tag_edits(
    updated: &crate::enrich::model::EnrichUpdatedFields,
    cover: Option<Vec<u8>>,
) -> WriteTagsOptions {
    /// A proposal is a `Set`; an absent one is a `Keep`. Enrichment never
    /// clears, so `FieldEdit::Clear` is unreachable from here by construction.
    fn edit<T: Clone>(value: Option<&T>) -> FieldEdit<T> {
        value.map_or(FieldEdit::Keep, |value| FieldEdit::Set(value.clone()))
    }

    WriteTagsOptions {
        title: FieldEdit::Keep,
        artist: edit(updated.artist.as_ref()),
        album_artist: FieldEdit::Keep,
        album: edit(updated.album.as_ref()),
        genre: edit(updated.genre.as_ref()),
        year: edit(updated.year.as_ref()),
        track_number: edit(updated.track_number.as_ref()),
        disc_number: FieldEdit::Keep,
        cover,
    }
}

/// Race a future against the cancellation token.
async fn cancellable<T>(
    cancel: &CancellationToken,
    future: impl Future<Output = crate::Result<T>>,
) -> crate::Result<T> {
    tokio::select! {
        biased;
        () = cancel.cancelled() => Err(crate::MetadataError::Cancelled),
        result = future => result,
    }
}

/// Counters shared by every task in a run.
struct RunState {
    total: usize,
    completed: Mutex<usize>,
    /// v1's `let cancelled = false` guard: the `cancelled` event is emitted
    /// once per run, not once per abandoned track.
    cancel_reported: AtomicBool,
}

impl RunState {
    fn new(total: usize) -> Self {
        Self {
            total,
            completed: Mutex::new(0),
            cancel_reported: AtomicBool::new(false),
        }
    }

    /// Increment and return the completed count.
    fn complete(&self) -> usize {
        let mut completed = self
            .completed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *completed += 1;
        *completed
    }

    /// The in-flight `current`: `min(completed + 1, total)`.
    fn in_flight(&self) -> usize {
        let completed = *self
            .completed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        (completed + 1).min(self.total)
    }

    fn report(
        &self,
        progress: ProgressFn<'_>,
        track: &EnrichTrackInput,
        status: EnrichStatus,
        confidence: Option<f64>,
    ) {
        self.report_at(progress, self.in_flight(), track, status, confidence);
    }

    fn report_at(
        &self,
        progress: ProgressFn<'_>,
        current: usize,
        track: &EnrichTrackInput,
        status: EnrichStatus,
        confidence: Option<f64>,
    ) {
        progress(EnrichProgress {
            current,
            total: self.total,
            track_name: track.title.clone(),
            status,
            confidence,
            source: None,
        });
    }

    fn report_cancelled_once(&self, progress: ProgressFn<'_>, track_name: &str) {
        if self.cancel_reported.swap(true, Ordering::SeqCst) {
            return;
        }

        progress(EnrichProgress {
            current: self.in_flight(),
            total: self.total,
            track_name: track_name.to_owned(),
            status: EnrichStatus::Cancelled,
            confidence: None,
            source: None,
        });
    }
}
