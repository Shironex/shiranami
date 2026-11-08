import { create } from 'zustand';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { UNDO_WINDOW_MS } from '@/stores/useRemovalStore';

interface QueueToast {
  /** Changes with every toast, so a new one replays the fade in. */
  key: number;
  text: string;
  undo: () => void;
}

interface QueueToastState {
  toast: QueueToast | null;
}

interface QueueToastActions {
  /**
   * Puts a song right after the one playing, or plays it when nothing is,
   * and shows "Playing next · Undo" for a few seconds.
   */
  playNext: (track: Track) => void;
  undo: () => void;
  dismiss: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let nextKey = 1;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

const player = () => usePlayerStore.getState();

/**
 * Takes back a "play next": removes the first copy of the song still waiting
 * after the current one. If it already started playing, it stays.
 */
function removeUpcoming(trackId: string) {
  const { queue, queueIndex } = player();
  const index = queue.findIndex((t, i) => i > queueIndex && t.id === trackId);
  if (index >= 0) player().removeFromQueue(index);
}

export const useQueueToastStore = create<QueueToastState & QueueToastActions>((set, get) => ({
  toast: null,

  playNext: track => {
    const playing = !!player().currentTrack;
    if (playing) player().playNext(track);
    else player().playFromList([track], 0);
    get().dismiss();
    set({
      toast: {
        key: nextKey++,
        text: playing ? `Playing next: ${track.title}` : `Playing ${track.title}`,
        undo: playing ? () => removeUpcoming(track.id) : () => player().clearQueue(),
      },
    });
    timer = setTimeout(() => get().dismiss(), UNDO_WINDOW_MS);
  },

  undo: () => {
    const toast = get().toast;
    if (!toast) return;
    get().dismiss();
    toast.undo();
  },

  dismiss: () => {
    clearTimer();
    set({ toast: null });
  },
}));
