import { create } from 'zustand';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

const SKIPPED_IDS_STORE_KEY = 'metadata-enrich.skippedIds';

interface EnrichProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'searching' | 'downloading' | 'writing' | 'done' | 'error';
}

interface EnrichTrackResult {
  id: string;
  success: boolean;
  updatedFields: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
    year: number;
    trackNumber: number;
    albumArt: string;
  }>;
  source: string;
  error?: string;
}

interface MetadataEnrichState {
  isEnriching: boolean;
  progress: EnrichProgress | null;
  /** Track IDs that returned no results — persisted to electron-store */
  skippedIds: Set<string>;
  /** Whether skipped IDs have been loaded from disk */
  skippedLoaded: boolean;
}

interface MetadataEnrichActions {
  updateProgress: (progress: EnrichProgress) => void;
  loadSkipped: () => Promise<void>;
  clearSkipped: () => Promise<void>;
  startEnrichment: (options: {
    onlyMissing: boolean;
    writeToFile: boolean;
    includeSkipped: boolean;
  }) => Promise<void>;
}

async function persistSkipped(ids: Set<string>): Promise<void> {
  if (!IS_ELECTRON) return;
  await window.electronAPI.store.set(SKIPPED_IDS_STORE_KEY, [...ids]);
}

export const useMetadataEnrichStore = create<MetadataEnrichState & MetadataEnrichActions>(
  (set, get) => ({
    isEnriching: false,
    progress: null,
    skippedIds: new Set(),
    skippedLoaded: false,

    updateProgress: (progress) => set({ progress }),

    loadSkipped: async () => {
      if (!IS_ELECTRON || get().skippedLoaded) return;
      try {
        const stored = await window.electronAPI.store.get<string[]>(SKIPPED_IDS_STORE_KEY);
        if (Array.isArray(stored) && stored.length > 0) {
          // Prune IDs for tracks that no longer exist in the library
          const libraryIds = new Set(usePlayerStore.getState().library.map(t => t.id));
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

    clearSkipped: async () => {
      set({ skippedIds: new Set() });
      await persistSkipped(new Set());
    },

    startEnrichment: async ({ onlyMissing, writeToFile, includeSkipped }) => {
      if (!IS_ELECTRON || get().isEnriching) return;

      const library = usePlayerStore.getState().library;
      const { skippedIds } = get();

      let candidates = onlyMissing
        ? library.filter(
            t =>
              t.artist === 'Unknown Artist' ||
              t.album === 'Unknown Album' ||
              !t.albumArt ||
              !t.genre
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

      set({ isEnriching: true, progress: null });

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
        }));

        const results: EnrichTrackResult[] =
          await window.electronAPI.metadata.enrichTracks(input, {
            writeToFile,
            onlyMissing,
          });

        // Track which IDs returned no results so we skip them next time
        const noResultIds = results
          .filter(r => !r.success && r.source === 'none')
          .map(r => r.id);
        if (noResultIds.length > 0) {
          const prev = get().skippedIds;
          const next = new Set(prev);
          for (const id of noResultIds) next.add(id);
          set({ skippedIds: next });
          await persistSkipped(next);
        }

        // Update tracks in DB
        const successResults = results.filter(r => r.success);
        const failedCount = results.filter(r => !r.success).length;

        for (const result of successResults) {
          if (Object.keys(result.updatedFields).length > 0) {
            await window.electronAPI.db.tracks.update(result.id, result.updatedFields);
          }
        }

        // Refresh library from DB
        if (successResults.length > 0) {
          const allDbTracks = await window.electronAPI.db.tracks.getAll();
          const { mapDbTracksToTracks } = await import('@/lib/trackMapper');
          const refreshedTracks = mapDbTracksToTracks(
            allDbTracks as Record<string, unknown>[]
          );
          usePlayerStore.setState({ library: refreshedTracks });

          // Update current track and queue if affected
          const updatedIds = new Set(successResults.map(r => r.id));
          const { currentTrack, queue } = usePlayerStore.getState();

          if (currentTrack && updatedIds.has(currentTrack.id)) {
            const updated = refreshedTracks.find(t => t.id === currentTrack.id);
            if (updated) {
              usePlayerStore.setState({ currentTrack: updated });
            }
          }

          const newQueue = queue.map(t => {
            if (updatedIds.has(t.id)) {
              return refreshedTracks.find(rt => rt.id === t.id) ?? t;
            }
            return t;
          });
          usePlayerStore.setState({ queue: newQueue });
        }

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
        set({ isEnriching: false, progress: null });
      }
    },
  })
);

if (import.meta.hot?.data) {
  if (import.meta.hot.data.store) {
    useMetadataEnrichStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = useMetadataEnrichStore;
  import.meta.hot.accept();
}
