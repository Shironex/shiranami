import { create } from 'zustand';
import type {
  EnrichProgress,
  EnrichTrackResult,
  EnrichUpdatedFields,
  EnrichResultSource,
} from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

const SKIPPED_IDS_STORE_KEY = 'metadata-enrich.skippedIds';

export type { EnrichUpdatedFields, EnrichTrackResult, EnrichResultSource } from '@shiranami/contracts';

/** Field-level old→new change for one track in the last-run report. */
export interface EnrichFieldDiff {
  field: keyof EnrichUpdatedFields;
  oldValue: string | number | null;
  newValue: string | number;
}

/** One track's entry in the in-memory post-run report. */
export interface EnrichLastRunEntry {
  id: string;
  trackName: string;
  source: EnrichResultSource;
  confidence?: number;
  success: boolean;
  error?: string;
  diffs: EnrichFieldDiff[];
}

const DIFF_FIELD_ORDER: Array<keyof EnrichUpdatedFields> = [
  'artist',
  'album',
  'genre',
  'year',
  'trackNumber',
  'albumArt',
];

interface MetadataEnrichState {
  /** Bulk run flag (Settings → Library card). */
  isEnriching: boolean;
  isCancelling: boolean;
  progress: EnrichProgress | null;
  /** Per-track preview/apply flag (TrackContextMenu → TrackEnrichDialog). */
  isSingleTrackEnriching: boolean;
  /** Track IDs that returned no results — persisted to electron-store */
  skippedIds: Set<string>;
  /** Whether skipped IDs have been loaded from disk */
  skippedLoaded: boolean;
  /**
   * Results of the most recent bulk run, kept in memory only (never persisted,
   * cleared when the next run starts). Powers the "View last run" report panel.
   */
  lastRunResults: EnrichLastRunEntry[];
}

interface MetadataEnrichActions {
  updateProgress: (progress: EnrichProgress) => void;
  loadSkipped: () => Promise<void>;
  cancelEnrichment: () => Promise<void>;
  startEnrichment: (options: {
    onlyMissing: boolean;
    writeToFile: boolean;
    includeSkipped: boolean;
  }) => Promise<void>;
  /**
   * Look up proposed metadata for a single track without writing anything.
   * Returns the preview result for the dialog to render. Throws on failure
   * (incl. when a bulk run is already in flight — the renderer must gate
   * the entry point, but the IPC also rejects defensively).
   */
  previewSingleTrack: (trackId: string) => Promise<EnrichTrackResult>;
  /**
   * Commit a previously-previewed result for a single track. Updates the DB
   * and (if `writeToFile`) the audio file via the bulk IPC. Patches library +
   * playback / queue exactly like the bulk path does.
   */
  applySingleTrack: (
    trackId: string,
    updatedFields: EnrichUpdatedFields,
    options: { writeToFile: boolean }
  ) => Promise<void>;
  /** Abort an in-flight single-track preview / apply (best-effort). */
  cancelSingleTrack: () => Promise<void>;
}

async function persistSkipped(ids: Set<string>): Promise<void> {
  if (!IS_ELECTRON) return;
  await window.electronAPI.store.set(SKIPPED_IDS_STORE_KEY, [...ids]);
}

/**
 * Shared apply-results pipeline used by both the bulk run and the per-track
 * apply action. Persists to DB, refreshes the library, and patches the
 * playback store's `currentTrack` + `queue` so the player UI updates
 * immediately when an in-progress track is enriched.
 */
async function applyEnrichResults(results: EnrichTrackResult[]): Promise<void> {
  const successResults = results.filter(r => r.success);
  const updates = successResults
    .filter(r => Object.keys(r.updatedFields).length > 0)
    .map(r => ({ id: r.id, data: r.updatedFields }));

  if (updates.length > 0) {
    await window.electronAPI.db.tracks.updateMany(updates);
  }

  if (successResults.length === 0) return;

  // Refresh library from DB so memoized selectors see the new fields.
  const allDbTracks = await window.electronAPI.db.tracks.getAll();
  const { mapDbTracksToTracks } = await import('@/lib/trackMapper');
  const refreshedTracks = mapDbTracksToTracks(allDbTracks as Record<string, unknown>[]);
  useLibraryStore.getState().setLibrary(refreshedTracks);

  // Patch playback store if the affected track is currently playing or queued —
  // otherwise the player bar / queue panel would render stale fields until the
  // user navigates away and back.
  const updatedIds = new Set(successResults.map(r => r.id));
  const { currentTrack, queue } = usePlaybackStore.getState();

  if (currentTrack && updatedIds.has(currentTrack.id)) {
    const updated = refreshedTracks.find(t => t.id === currentTrack.id);
    if (updated) {
      usePlaybackStore.setState({ currentTrack: updated });
    }
  }

  const newQueue = queue.map(t => {
    if (updatedIds.has(t.id)) {
      return refreshedTracks.find(rt => rt.id === t.id) ?? t;
    }
    return t;
  });
  usePlaybackStore.setState({ queue: newQueue });
}

export const useMetadataEnrichStore = create<MetadataEnrichState & MetadataEnrichActions>(
  (set, get) => ({
    isEnriching: false,
    isCancelling: false,
    progress: null,
    isSingleTrackEnriching: false,
    skippedIds: new Set(),
    skippedLoaded: false,
    lastRunResults: [],

    updateProgress: progress => set({ progress }),

    loadSkipped: async () => {
      if (!IS_ELECTRON || get().skippedLoaded) return;
      try {
        const stored = await window.electronAPI.store.get<string[]>(SKIPPED_IDS_STORE_KEY);
        if (Array.isArray(stored) && stored.length > 0) {
          // Prune IDs for tracks that no longer exist in the library
          const libraryIds = new Set(useLibraryStore.getState().library.map(t => t.id));
          const pruned = stored.filter(id => libraryIds.has(id));
          const prunedSet = new Set(pruned);
          set({ skippedIds: prunedSet, skippedLoaded: true });
          // Persist pruned list if anything was removed
          if (pruned.length < stored.length) {
            await persistSkipped(prunedSet);
          }
        } else {
          set({ skippedLoaded: true });
        }
      } catch {
        set({ skippedLoaded: true });
      }
    },

    cancelEnrichment: async () => {
      if (!IS_ELECTRON || !get().isEnriching || get().isCancelling) return;
      set({ isCancelling: true });
      try {
        await window.electronAPI.metadata.cancelEnrichment();
      } catch (err) {
        console.warn('Failed to cancel metadata enrichment', err);
      }
    },

    startEnrichment: async ({ onlyMissing, writeToFile, includeSkipped }) => {
      if (!IS_ELECTRON || get().isEnriching) return;

      const library = useLibraryStore.getState().library;
      const { skippedIds } = get();

      // DB stores the English literals 'Unknown Artist' / 'Unknown Album' (scan-utility.ts,
      // metadata-service.ts). Compare against the literals so the filter is consistent
      // with what the main-process onlyMissing gate checks at metadata-enrich.ts.
      let candidates = onlyMissing
        ? library.filter(
            t =>
              t.artist === 'Unknown Artist' ||
              t.album === 'Unknown Album' ||
              !t.albumArt ||
              !t.genre ||
              !t.year
          )
        : library;

      if (!includeSkipped) {
        candidates = candidates.filter(t => !skippedIds.has(t.id));
      }

      if (candidates.length === 0) {
        toast.info(i18n.t('lib.noTracksToEnrich', { ns: 'settings' }));
        return;
      }

      // If retrying all including skipped, clear the skip list first
      if (includeSkipped && skippedIds.size > 0) {
        set({ skippedIds: new Set() });
        await persistSkipped(new Set());
      }

      // Snapshot pre-run values so the post-run report can show old→new diffs
      // before applyEnrichResults overwrites the library reference.
      const beforeById = new Map<string, (typeof candidates)[number]>(
        candidates.map(t => [t.id, t])
      );

      // New run starts: drop the previous run's report.
      set({ isEnriching: true, progress: null, lastRunResults: [] });

      try {
        const input = candidates.map(track => ({
          id: track.id,
          filePath: track.filePath,
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumArt: track.albumArt ?? null,
          genre: track.genre ?? '',
          year: track.year ?? null,
          trackNumber: track.trackNumber ?? null,
        }));

        const results: EnrichTrackResult[] = await window.electronAPI.metadata.enrichTracks(input, {
          writeToFile,
          onlyMissing,
        });

        // Track which IDs returned no results so we skip them next time
        const noResultIds = results.filter(r => !r.success && r.source === 'none').map(r => r.id);
        if (noResultIds.length > 0) {
          const prev = get().skippedIds;
          const next = new Set(prev);
          for (const id of noResultIds) next.add(id);
          set({ skippedIds: next });
          await persistSkipped(next);
        }

        const successResults = results.filter(r => r.success);
        const failedCount = results.filter(r => !r.success).length;

        await applyEnrichResults(results);

        // Build the in-memory post-run report. Only tracks that actually
        // changed something carry diffs; failed / no-match tracks still appear
        // so the user sees the full picture.
        const lastRunResults: EnrichLastRunEntry[] = results
          .map(r => {
            const before = beforeById.get(r.id);
            const diffs: EnrichFieldDiff[] = DIFF_FIELD_ORDER.flatMap(field => {
              const newValue = r.updatedFields[field];
              if (newValue === undefined) return [];
              const oldRaw = before ? before[field] : undefined;
              const oldValue =
                oldRaw === undefined || oldRaw === '' ? null : (oldRaw as string | number);
              return newValue === oldValue ? [] : [{ field, oldValue, newValue }];
            });
            return {
              id: r.id,
              trackName: before?.title ?? r.id,
              source: r.source,
              confidence: r.confidence,
              success: r.success,
              error: r.error,
              diffs,
            };
          })
          // Skipped (filtered-out) tracks never made it into `results`, so the
          // report mirrors exactly what the run touched.
          .filter(entry => entry.success || entry.error);
        set({ lastRunResults });

        // Show toast
        const tToast = (key: string, opts?: Record<string, unknown>) =>
          i18n.t(key, { ns: 'toast', ...opts });

        if (successResults.length > 0 && failedCount === 0) {
          toast.success(tToast('enrichComplete', { count: successResults.length }));
        } else if (successResults.length > 0 && failedCount > 0) {
          toast.info(
            tToast('enrichPartial', {
              success: successResults.length,
              total: results.length,
              failed: failedCount,
            })
          );
        } else {
          toast.info(tToast('enrichNoneFound'));
        }
      } catch (err) {
        console.error('Metadata enrichment failed:', err);
        toast.error(i18n.t('enrichFailed', { ns: 'toast' }));
      } finally {
        set({ isEnriching: false, isCancelling: false, progress: null });
      }
    },

    previewSingleTrack: async trackId => {
      if (!IS_ELECTRON) {
        throw new Error('Single-track preview requires Electron');
      }
      // Look up the track at call time so the dialog never operates on a
      // stale reference (e.g. after a library refresh between right-click
      // and the dialog opening).
      const track = useLibraryStore.getState().library.find(t => t.id === trackId);
      if (!track) {
        throw new Error(`Track ${trackId} not found in library`);
      }

      set({ isSingleTrackEnriching: true });
      try {
        const input = {
          id: track.id,
          filePath: track.filePath,
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumArt: track.albumArt ?? null,
          genre: track.genre ?? '',
          year: track.year ?? null,
          trackNumber: track.trackNumber ?? null,
        };
        // v1 hardcodes onlyMissing: true to match bulk behavior — overwrite-all
        // would risk clobbering hand-curated fields without a confirm step.
        const result = await window.electronAPI.metadata.previewEnrich(input, {
          onlyMissing: true,
        });
        return result;
      } finally {
        set({ isSingleTrackEnriching: false });
      }
    },

    applySingleTrack: async (trackId, updatedFields, { writeToFile }) => {
      if (!IS_ELECTRON) return;
      const track = useLibraryStore.getState().library.find(t => t.id === trackId);
      if (!track) {
        throw new Error(`Track ${trackId} not found in library`);
      }

      // For writeToFile=true we route through the bulk IPC with a single-element
      // array so the file-tag write path stays in one place. For writeToFile=false
      // we skip the IPC and apply the precomputed result directly — the cover art
      // is already cached by the preview call, so DB-only update is sufficient.
      if (writeToFile) {
        const input = [
          {
            id: track.id,
            filePath: track.filePath,
            title: track.title,
            artist: track.artist,
            album: track.album,
            albumArt: track.albumArt ?? null,
            genre: track.genre ?? '',
            year: track.year ?? null,
            trackNumber: track.trackNumber ?? null,
          },
        ];
        const results = await window.electronAPI.metadata.enrichTracks(input, {
          writeToFile: true,
          onlyMissing: true,
        });
        const [result] = results;
        if (!result?.success) {
          throw new Error(result?.error ?? 'Metadata file write failed');
        }
        await applyEnrichResults(results);
      } else {
        await applyEnrichResults([
          { id: trackId, success: true, updatedFields, source: 'preview' },
        ]);
      }
    },

    cancelSingleTrack: async () => {
      if (!IS_ELECTRON || !get().isSingleTrackEnriching) return;
      try {
        await window.electronAPI.metadata.cancelEnrichment();
      } catch (err) {
        console.warn('Failed to cancel single-track enrichment', err);
      }
    },
  })
);

if (import.meta.hot?.data) {
  if (import.meta.hot.data.store) {
    // Omit runtime-only fields — replaying isEnriching/isCancelling/progress
    // during HMR while a run is idle would leave the UI stuck in a busy state.
    const {
      isEnriching: _ie,
      isCancelling: _ic,
      progress: _p,
      isSingleTrackEnriching: _is,
      ...rest
    } = import.meta.hot.data.store.getState();
    useMetadataEnrichStore.setState(rest);
  }
  import.meta.hot.data.store = useMetadataEnrichStore;
  import.meta.hot.accept();
}
