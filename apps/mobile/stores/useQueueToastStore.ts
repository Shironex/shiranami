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
let unwatch: (() => void) | null = null;
let nextKey = 1;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
  unwatch?.();
  unwatch = null;
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
    get().dismiss();
    const playing = !!player().currentTrack;
    if (playing) player().playNext(track);
    else player().playFromList([track], 0);

    // Undo only makes sense against the queue this swipe left behind. Once the
    // queue is replaced or edited, or (when the swipe started playback) another
    // song is on, the toast goes away instead of undoing something newer.
    const created = player().queue;
    const stillOurs = () =>
      player().queue === created && (playing || player().currentTrack?.id === track.id);

    set({
      toast: {
        key: nextKey++,
        text: playing ? `Playing next: ${track.title}` : `Playing ${track.title}`,
        undo: () => {
          if (!stillOurs()) return;
          if (playing) removeUpcoming(track.id);
          else player().clearQueue();
        },
      },
    });
    timer = setTimeout(() => get().dismiss(), UNDO_WINDOW_MS);
    unwatch = usePlayerStore.subscribe(() => {
      if (!stillOurs()) get().dismiss();
    });
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
