import { create } from 'zustand';
import type { DownloadQueueItem, DownloadQueueSnapshot } from '@shiranami/contracts';

/**
 * Renderer mirror of the main-process download queue. Keyed canonically by
 * `item.id`, with two derived indices (`byUrl`, `byYoutubeId`) rebuilt on every
 * snapshot so per-row consumers can resolve "their" item by the key they
 * already hold (search → url, recommendations → youtubeId). Latest-enqueued
 * wins per key (re-download): items are iterated in insertion order so a newer
 * item overwrites an older terminal one.
 */
interface DownloadQueueState {
  items: DownloadQueueItem[];
  byUrl: Map<string, DownloadQueueItem>;
  byYoutubeId: Map<string, DownloadQueueItem>;
  maxConcurrency: number;
  activeCount: number;
  /** Whether the main-process queue is paused (no queued items promote). */
  paused: boolean;
  /**
   * False until the first snapshot lands from the main process. Lets the view
   * distinguish "not loaded yet" from "loaded and empty" so a persisted queue
   * doesn't flash the empty state on launch.
   */
  hydrated: boolean;
  /**
   * True when the initial queue fetch failed before any snapshot landed. Only
   * meaningful while `hydrated` is false — any successful snapshot (retry or
   * queue-state broadcast) clears it and the queue is live again.
   */
  hydrationFailed: boolean;
}

interface DownloadQueueActions {
  applySnapshot: (snapshot: DownloadQueueSnapshot) => void;
  markHydrationFailed: () => void;
  getById: (id: string) => DownloadQueueItem | undefined;
  getByUrl: (url: string) => DownloadQueueItem | undefined;
  getByYoutubeId: (youtubeId: string) => DownloadQueueItem | undefined;
}

function buildIndices(items: DownloadQueueItem[]): {
  byUrl: Map<string, DownloadQueueItem>;
  byYoutubeId: Map<string, DownloadQueueItem>;
} {
  const byUrl = new Map<string, DownloadQueueItem>();
  const byYoutubeId = new Map<string, DownloadQueueItem>();
  // Insertion order = enqueue order, so later items overwrite earlier ones.
  for (const item of items) {
    byUrl.set(item.url, item);
    if (item.youtubeId) byYoutubeId.set(item.youtubeId, item);
  }
  return { byUrl, byYoutubeId };
}

export const useDownloadQueueStore = create<DownloadQueueState & DownloadQueueActions>(
  (set, get) => ({
    items: [],
    byUrl: new Map(),
    byYoutubeId: new Map(),
    maxConcurrency: 0,
    activeCount: 0,
    paused: false,
    hydrated: false,
    hydrationFailed: false,

    applySnapshot: snapshot => {
      const { byUrl, byYoutubeId } = buildIndices(snapshot.items);
      set({
        items: snapshot.items,
        byUrl,
        byYoutubeId,
        maxConcurrency: snapshot.maxConcurrency,
        activeCount: snapshot.activeCount,
        paused: snapshot.paused,
        hydrated: true,
        hydrationFailed: false,
      });
    },

    markHydrationFailed: () => set({ hydrationFailed: true }),

    getById: id => get().items.find(item => item.id === id),
    getByUrl: url => get().byUrl.get(url),
    getByYoutubeId: youtubeId => get().byYoutubeId.get(youtubeId),
  })
);

if (import.meta.hot) {
  type HmrData = { store?: typeof useDownloadQueueStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useDownloadQueueStore.setState(data.store.getState());
  }
  data.store = useDownloadQueueStore;
  hot.accept();
}
