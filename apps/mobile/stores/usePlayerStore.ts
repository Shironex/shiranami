import { create } from 'zustand';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  filePath: string;
  albumArt?: string;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  isFavorite?: boolean;
  playCount?: number;
  /** A live stream (internet radio): no duration and no seeking. */
  isLive?: boolean;
  /** When the file was imported, as SQLite `datetime('now')` text. */
  addedAt?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * What the store needs from the audio engine. The playback service attaches
 * the real player at app start; tests attach a fake. Without one the store
 * still tracks the queue, it just has nothing to drive.
 */
export interface PlayerTransport {
  load: (track: Track) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  stop: () => void;
  /** Output level, 0 to 1 (user volume times the sleep fade). */
  setVolume: (level: number) => void;
}

/** Player state as the audio engine reports it. */
export interface PlaybackSnapshot {
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
}

/** Going back within this many seconds of a track's start goes to the previous track. */
export const RESTART_THRESHOLD_SECONDS = 3;

interface PlayerState {
  library: Track[];
  currentTrack: Track | null;
  queue: Track[];
  /** The queue in the order it was given, so turning shuffle off restores it. */
  originalQueue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  isLoading: boolean;
  error: string | null;
  /** Where the queue came from, for "Playing from Library". */
  queueSource: string;
  /** Sleep timer fade, multiplied into the output level. 1 means no fade. */
  fade: number;
  /** Pause when the current track ends instead of moving on (sleep timer). */
  stopAfterCurrent: boolean;
}

interface PlayerActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  /** Seeks relative to the current position, clamped to the start and the duration. */
  seekBy: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setLibrary: (tracks: Track[]) => void;
  addToLibrary: (tracks: Track[]) => void;
  removeFromLibrary: (trackIds: string[]) => void;
  /** Plays `tracks[startIndex]` and queues the rest of the list after it. */
  playFromList: (tracks: Track[], startIndex?: number, source?: string) => void;
  /** Turns shuffle on and plays the list from a random track. */
  playShuffled: (tracks: Track[], source?: string, random?: () => number) => void;
  /** Jumps to a track already in the queue. */
  playIndex: (index: number) => void;
  setFade: (level: number) => void;
  setStopAfterCurrent: (stop: boolean) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  /** Drops everything after the current track; the current one keeps playing. */
  clearUpNext: () => void;
  toggleFavorite: (trackId: string) => void;
  incrementTrackPlayCount: (trackId: string) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  _syncPlayback: (snapshot: PlaybackSnapshot) => void;
  _setError: (error: string | null) => void;
  _onTrackEnd: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

let transport: PlayerTransport | null = null;

/** Output level the engine should play at: the user volume times the sleep fade. */
function outputLevel(state: Pick<PlayerState, 'volume' | 'fade'>): number {
  return state.volume * state.fade;
}

/**
 * Connects the audio engine. Returns a function that disconnects it. The
 * engine starts at its own default level, so the store's level is applied
 * right away and the two agree from the first sample.
 */
export function attachTransport(next: PlayerTransport): () => void {
  transport = next;
  next.setVolume(outputLevel(usePlayerStore.getState()));
  return () => {
    if (transport === next) transport = null;
  };
}

export function shuffleArray<T>(arr: T[], random: () => number = Math.random): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** The current track first, the rest of the queue shuffled after it. */
function shuffledAround(queue: Track[], current: Track | null): Track[] {
  if (!current) return shuffleArray(queue);
  return [current, ...shuffleArray(queue.filter(t => t.id !== current.id))];
}

/**
 * Order of the live queue to restore when shuffle turns off, as positions in
 * `queue`. Tracks follow their order in `original`; each `original` entry
 * takes the next unclaimed live copy with the same id, so tracks removed
 * while shuffled stay gone and the live copies (with fresh favorite and play
 * count) are kept. Live tracks `original` never had (added with play next)
 * go at the end, in queue order.
 */
function unshuffledOrder(original: Track[], queue: Track[]): number[] {
  const unclaimed = new Map<string, number[]>();
  queue.forEach((t, i) => {
    const positions = unclaimed.get(t.id);
    if (positions) positions.push(i);
    else unclaimed.set(t.id, [i]);
  });

  const order: number[] = [];
  const claimed = new Set<number>();
  for (const t of original) {
    const position = unclaimed.get(t.id)?.shift();
    if (position === undefined) continue;
    order.push(position);
    claimed.add(position);
  }
  queue.forEach((_, i) => {
    if (!claimed.has(i)) order.push(i);
  });
  return order;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /** Makes `queue[index]` the current track and starts it. */
  const startAt = (queue: Track[], index: number, extra: Partial<PlayerState> = {}) => {
    const track = queue[index] ?? null;
    set({
      ...extra,
      queue,
      queueIndex: track ? index : -1,
      currentTrack: track,
      currentTime: 0,
      duration: track && !track.isLive ? track.duration : 0,
      isPlaying: track !== null,
      isLoading: track !== null,
      error: null,
    });
    if (track) {
      transport?.load(track);
      transport?.setVolume(outputLevel(get()));
      transport?.play();
    } else {
      transport?.stop();
    }
  };

  /** Moves to `index` when the user skips or a track ends; `null` means the queue is done. */
  const advanceTo = (index: number | null) => {
    const { queue } = get();
    if (index === null) {
      transport?.pause();
      transport?.seekTo(0);
      set({ isPlaying: false, currentTime: 0 });
      return;
    }
    startAt(queue, index);
  };

  const nextIndex = (): number | null => {
    const { queue, queueIndex, repeatMode } = get();
    if (queue.length === 0) return null;
    if (queueIndex + 1 < queue.length) return queueIndex + 1;
    return repeatMode === 'all' ? 0 : null;
  };

  return {
    library: [],
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    isShuffled: false,
    repeatMode: 'off',
    isLoading: false,
    error: null,
    queueSource: 'Library',
    fade: 1,
    stopAfterCurrent: false,

    play: () => {
      if (!get().currentTrack) return;
      set({ isPlaying: true });
      transport?.play();
    },
    pause: () => {
      set({ isPlaying: false });
      transport?.pause();
    },
    togglePlay: () => (get().isPlaying ? get().pause() : get().play()),
    stop: () => {
      set({ isPlaying: false, currentTime: 0 });
      transport?.stop();
    },

    next: () => {
      if (get().queue.length === 0) return;
      advanceTo(nextIndex());
    },

    previous: () => {
      const { queue, queueIndex, currentTime, currentTrack, repeatMode } = get();
      if (queue.length === 0) return;

      const atStart = queueIndex === 0 && repeatMode !== 'all';
      if (currentTime > RESTART_THRESHOLD_SECONDS || currentTrack?.isLive || atStart) {
        get().seek(0);
        return;
      }
      startAt(queue, queueIndex > 0 ? queueIndex - 1 : queue.length - 1);
    },

    seek: (time: number) => {
      const { currentTrack, duration } = get();
      if (!currentTrack || currentTrack.isLive || !isFinite(time) || time < 0) return;
      const target = duration > 0 ? Math.min(time, duration) : time;
      set({ currentTime: target });
      transport?.seekTo(target);
    },

    seekBy: (seconds: number) => {
      const { currentTime } = get();
      get().seek(Math.max(0, currentTime + seconds));
    },

    setVolume: (volume: number) => {
      const next = Math.max(0, Math.min(1, volume));
      set({ volume: next, isMuted: false });
      transport?.setVolume(outputLevel(get()));
    },
    setFade: (level: number) => {
      const fade = Math.max(0, Math.min(1, level));
      if (fade === get().fade) return;
      set({ fade });
      transport?.setVolume(outputLevel(get()));
    },
    setStopAfterCurrent: stopAfterCurrent => set({ stopAfterCurrent }),
    toggleMute: () => set(s => ({ isMuted: !s.isMuted })),

    setLibrary: (tracks: Track[]) => set({ library: tracks }),
    addToLibrary: (tracks: Track[]) => set(s => ({ library: [...s.library, ...tracks] })),
    removeFromLibrary: (trackIds: string[]) => {
      const ids = new Set(trackIds);
      set(s => ({ library: s.library.filter(t => !ids.has(t.id)) }));
    },

    playFromList: (tracks: Track[], startIndex = 0, source = 'Library') => {
      const start = tracks[startIndex] ?? null;
      if (get().isShuffled && start) {
        startAt(shuffledAround(tracks, start), 0, { originalQueue: tracks, queueSource: source });
        return;
      }
      startAt(tracks, startIndex, { originalQueue: tracks, queueSource: source });
    },
    playShuffled: (tracks: Track[], source = 'Library', random = Math.random) => {
      if (tracks.length === 0) return;
      set({ isShuffled: true });
      get().playFromList(tracks, Math.floor(random() * tracks.length), source);
    },
    playIndex: (index: number) => {
      const { queue } = get();
      if (index < 0 || index >= queue.length) return;
      startAt(queue, index);
    },
    setQueue: (tracks: Track[], startIndex = 0) => get().playFromList(tracks, startIndex),

    addToQueue: (tracks: Track[]) =>
      set(s => ({
        queue: [...s.queue, ...tracks],
        originalQueue: [...s.originalQueue, ...tracks],
      })),

    playNext: (track: Track) => {
      const { queue, queueIndex } = get();
      const insertAt = queueIndex + 1;
      set({ queue: [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)] });
    },

    removeFromQueue: (index: number) => {
      const { queue, queueIndex } = get();
      if (index < 0 || index >= queue.length) return;
      const newQueue = queue.filter((_, i) => i !== index);

      if (index === queueIndex) {
        if (newQueue.length === 0) {
          get().clearQueue();
          return;
        }
        const wasPlaying = get().isPlaying;
        startAt(newQueue, Math.min(index, newQueue.length - 1));
        if (!wasPlaying) get().pause();
        return;
      }

      set({ queue: newQueue, queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex });
    },

    reorderQueue: (fromIndex: number, toIndex: number) => {
      const { queue, queueIndex } = get();
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex < 0 ||
        toIndex >= queue.length
      )
        return;

      const newQueue = [...queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);

      let newIndex = queueIndex;
      if (fromIndex === queueIndex) newIndex = toIndex;
      else if (fromIndex < queueIndex && toIndex >= queueIndex) newIndex = queueIndex - 1;
      else if (fromIndex > queueIndex && toIndex <= queueIndex) newIndex = queueIndex + 1;

      set({ queue: newQueue, queueIndex: newIndex });
    },

    clearUpNext: () => {
      const { queue, queueIndex, currentTrack } = get();
      const kept = queue.slice(0, queueIndex + 1);
      set({ queue: kept, originalQueue: currentTrack ? kept : [] });
    },

    clearQueue: () => {
      set({
        queue: [],
        originalQueue: [],
        queueIndex: -1,
        currentTrack: null,
        isPlaying: false,
        isLoading: false,
        currentTime: 0,
        duration: 0,
      });
      transport?.stop();
    },

    toggleFavorite: (trackId: string) => {
      const { library, queue, currentTrack } = get();
      const toggle = (t: Track) => (t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t);

      const updates: Partial<PlayerState> = {
        library: library.map(toggle),
        queue: queue.map(toggle),
      };
      if (currentTrack?.id === trackId) {
        updates.currentTrack = { ...currentTrack, isFavorite: !currentTrack.isFavorite };
      }
      set(updates);
    },

    incrementTrackPlayCount: (trackId: string) => {
      const { library, queue, currentTrack } = get();
      const increment = (t: Track) =>
        t.id === trackId ? { ...t, playCount: (t.playCount ?? 0) + 1 } : t;

      const updates: Partial<PlayerState> = {
        library: library.map(increment),
        queue: queue.map(increment),
      };
      if (currentTrack?.id === trackId) {
        updates.currentTrack = { ...currentTrack, playCount: (currentTrack.playCount ?? 0) + 1 };
      }
      set(updates);
    },

    toggleShuffle: () => {
      const { isShuffled, queue, queueIndex, originalQueue, currentTrack } = get();
      if (!isShuffled) {
        set({
          originalQueue: queue,
          queue: shuffledAround(queue, currentTrack),
          queueIndex: currentTrack ? 0 : -1,
          isShuffled: true,
        });
        return;
      }
      const order = unshuffledOrder(originalQueue, queue);
      set({
        queue: order.map(i => queue[i]),
        queueIndex: currentTrack ? order.indexOf(queueIndex) : -1,
        isShuffled: false,
      });
    },

    cycleRepeatMode: () => {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const { repeatMode } = get();
      set({ repeatMode: modes[(modes.indexOf(repeatMode) + 1) % modes.length] });
    },

    _syncPlayback: ({ isPlaying, isBuffering, currentTime, duration }) => {
      const live = get().currentTrack?.isLive ?? false;
      set({
        isPlaying,
        isLoading: isBuffering,
        currentTime: live ? 0 : currentTime,
        duration: live || !isFinite(duration) ? 0 : duration,
      });
    },
    _setError: error => set({ error, isLoading: false }),

    _onTrackEnd: () => {
      const { repeatMode, currentTrack, stopAfterCurrent } = get();
      if (!currentTrack || currentTrack.isLive) return;
      if (stopAfterCurrent) {
        transport?.pause();
        transport?.seekTo(0);
        set({ isPlaying: false, currentTime: 0, stopAfterCurrent: false });
        return;
      }
      if (repeatMode === 'one') {
        set({ currentTime: 0, isPlaying: true });
        transport?.seekTo(0);
        transport?.play();
        return;
      }
      advanceTo(nextIndex());
    },
  };
});
