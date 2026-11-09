import { create } from 'zustand';
import type { SearchResult } from '@/lib/types';
import { trackErrorLine } from '@/lib/youtube-copy';
import { SaveCancelledError, saveYouTubeTrack, type SaveDeps } from '@/lib/youtube-save';

/** A save in progress, or one that failed and can be tried again. */
export type SaveJob = { status: 'saving'; progress: number } | { status: 'failed'; error: string };

interface YouTubeSaveState {
  /** By video id. A finished or cancelled save leaves no entry. */
  jobs: Record<string, SaveJob>;
  /**
   * Saves a result to the library. A second call for a video that is already
   * saving does nothing, so a double tap never downloads twice. `onSaved`
   * runs after the row is written (to reload the library).
   */
  save: (
    deps: SaveDeps,
    result: SearchResult,
    onSaved?: () => Promise<void> | void
  ) => Promise<void>;
  /** Stops a running save and drops its partial file. */
  cancel: (videoId: string) => void;
  /** Forgets a failed save's message. */
  dismiss: (videoId: string) => void;
}

/**
 * Runs the after-save callback. The song is already on the phone and in the
 * database by then, so a failure here (reloading the library) must not mark
 * the save as failed; the next library load shows it either way.
 */
async function reportSaved(onSaved: (() => Promise<void> | void) | undefined): Promise<void> {
  try {
    await onSaved?.();
  } catch {
    // Saved all the same: the row shows up on the next library load.
  }
}

/** Running saves, outside the state: an AbortController is not data to render. */
const running = new Map<string, AbortController>();

export const useYouTubeSaveStore = create<YouTubeSaveState>((set, get) => {
  const put = (videoId: string, job: SaveJob | null) =>
    set(s => {
      const jobs = { ...s.jobs };
      if (job) jobs[videoId] = job;
      else delete jobs[videoId];
      return { jobs };
    });

  return {
    jobs: {},

    save: async (deps, result, onSaved) => {
      const videoId = result.id;
      if (running.has(videoId)) return;
      const controller = new AbortController();
      running.set(videoId, controller);
      put(videoId, { status: 'saving', progress: 0 });
      let shown = 0;
      try {
        const outcome = await saveYouTubeTrack(deps, result, {
          signal: controller.signal,
          onProgress: ratio => {
            // One render per whole percent, not one per network chunk.
            const percent = Math.floor(ratio * 100);
            if (percent === shown) return;
            shown = percent;
            const job = get().jobs[videoId];
            if (job?.status === 'saving') put(videoId, { status: 'saving', progress: ratio });
          },
        });
        put(videoId, null);
        if (outcome === 'saved') await reportSaved(onSaved);
      } catch (error) {
        put(
          videoId,
          error instanceof SaveCancelledError || controller.signal.aborted
            ? null
            : { status: 'failed', error: trackErrorLine(error) }
        );
      } finally {
        running.delete(videoId);
      }
    },

    cancel: videoId => running.get(videoId)?.abort(),

    dismiss: videoId => {
      if (get().jobs[videoId]?.status === 'failed') put(videoId, null);
    },
  };
});
