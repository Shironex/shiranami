import { create } from 'zustand';

/** One completed download in a batch, recorded as it reaches `done`. */
export interface BatchDoneEntry {
  itemId: string;
  filePath: string;
  batchIndex: number;
  youtubeId?: string;
}

/**
 * Metadata for an in-flight playlist-import batch. Lives at the app level (not
 * in the view-scoped `usePlaylistImport` hook) so the batch coordinator — which
 * imports the downloaded tracks in source order and recreates the playlist once
 * the batch drains — survives navigating away from the import view while the
 * downloads run in the background.
 *
 * Membership and results are tracked here (not re-derived from the mutable queue
 * snapshot) so the coordinator is robust against (a) an enqueue that rejects
 * before the item ever enters the queue, and (b) the user clicking
 * "Clear completed" mid-batch, which would otherwise erase done tracks from the
 * queue before the coordinator imported them.
 */
export interface DownloadBatch {
  batchId: string;
  sourceTitle: string | null;
  createPlaylist: boolean;
  /** Item ids actually enqueued (resolves the reject-deadlock). */
  enqueuedIds: Set<string>;
  /** Whether every track has been enqueued (no more ids will be added). */
  sealed: boolean;
  /** Done downloads recorded as they complete (survives clear-completed). */
  done: BatchDoneEntry[];
  /** Count of items that reached a terminal error/canceled state. */
  failedCount: number;
  /** Ids already recorded as terminal (so each is counted once). */
  recordedTerminalIds: Set<string>;
  /** Set once the coordinator has imported + (optionally) created the playlist. */
  resolved: boolean;
}

interface DownloadBatchState {
  batches: Record<string, DownloadBatch>;
}

interface DownloadBatchActions {
  registerBatch: (batch: {
    batchId: string;
    sourceTitle: string | null;
    createPlaylist: boolean;
  }) => void;
  addEnqueuedId: (batchId: string, itemId: string) => void;
  /** Mark that all enqueue calls have settled (membership is final). */
  sealBatch: (batchId: string) => void;
  recordDone: (batchId: string, entry: BatchDoneEntry) => void;
  recordFailure: (batchId: string, itemId: string) => void;
  markResolved: (batchId: string) => void;
  removeBatch: (batchId: string) => void;
}

function patch(
  batches: Record<string, DownloadBatch>,
  batchId: string,
  fn: (b: DownloadBatch) => DownloadBatch
): Record<string, DownloadBatch> {
  const existing = batches[batchId];
  if (!existing) return batches;
  return { ...batches, [batchId]: fn(existing) };
}

export const useDownloadBatchStore = create<DownloadBatchState & DownloadBatchActions>(set => ({
  batches: {},

  registerBatch: ({ batchId, sourceTitle, createPlaylist }) =>
    set(s => ({
      batches: {
        ...s.batches,
        [batchId]: {
          batchId,
          sourceTitle,
          createPlaylist,
          enqueuedIds: new Set(),
          sealed: false,
          done: [],
          failedCount: 0,
          recordedTerminalIds: new Set(),
          resolved: false,
        },
      },
    })),

  addEnqueuedId: (batchId, itemId) =>
    set(s => ({
      batches: patch(s.batches, batchId, b => ({
        ...b,
        enqueuedIds: new Set(b.enqueuedIds).add(itemId),
      })),
    })),

  sealBatch: batchId =>
    set(s => ({ batches: patch(s.batches, batchId, b => ({ ...b, sealed: true })) })),

  recordDone: (batchId, entry) =>
    set(s => ({
      batches: patch(s.batches, batchId, b => {
        if (b.recordedTerminalIds.has(entry.itemId)) return b;
        return {
          ...b,
          done: [...b.done, entry],
          recordedTerminalIds: new Set(b.recordedTerminalIds).add(entry.itemId),
        };
      }),
    })),

  recordFailure: (batchId, itemId) =>
    set(s => ({
      batches: patch(s.batches, batchId, b => {
        if (b.recordedTerminalIds.has(itemId)) return b;
        return {
          ...b,
          failedCount: b.failedCount + 1,
          recordedTerminalIds: new Set(b.recordedTerminalIds).add(itemId),
        };
      }),
    })),

  markResolved: batchId =>
    set(s => ({ batches: patch(s.batches, batchId, b => ({ ...b, resolved: true })) })),

  removeBatch: batchId =>
    set(s => {
      if (!(batchId in s.batches)) return s;
      const next = { ...s.batches };
      delete next[batchId];
      return { batches: next };
    }),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useDownloadBatchStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useDownloadBatchStore.setState(data.store.getState());
  }
  data.store = useDownloadBatchStore;
  hot.accept();
}
