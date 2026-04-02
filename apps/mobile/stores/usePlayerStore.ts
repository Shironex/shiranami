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
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  library: Track[];
  currentTrack: Track | null;
  queue: Track[];
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
}

interface PlayerActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setLibrary: (tracks: Track[]) => void;
  addToLibrary: (tracks: Track[]) => void;
  removeFromLibrary: (trackIds: string[]) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  toggleFavorite: (trackId: string) => void;
  incrementTrackPlayCount: (trackId: string) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  _setCurrentTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setIsPlaying: (playing: boolean) => void;
  _setIsLoading: (loading: boolean) => void;
  _setError: (error: string | null) => void;
  _onTrackEnd: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  library: [],
  currentTrack: null,
  queue: [],
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

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
  stop: () => set({ isPlaying: false, currentTime: 0 }),

  next: () => {
    const { queue, queueIndex, repeatMode } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        set({ isPlaying: false });
        return;
      }
    }

    set({
      queueIndex: nextIndex,
      currentTrack: queue[nextIndex],
      currentTime: 0,
      isPlaying: true,
      error: null,
    });
  },

  previous: () => {
    const { queue, queueIndex, currentTime } = get();
    if (queue.length === 0) return;

    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) prevIndex = queue.length - 1;

    set({
      queueIndex: prevIndex,
      currentTrack: queue[prevIndex],
      currentTime: 0,
      isPlaying: true,
      error: null,
    });
  },

  seek: (time: number) => {
    if (isFinite(time) && time >= 0) {
      set({ currentTime: time });
    }
  },

  setVolume: (volume: number) => {
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: false });
  },
  toggleMute: () => set(s => ({ isMuted: !s.isMuted })),

  setLibrary: (tracks: Track[]) => set({ library: tracks }),
  addToLibrary: (tracks: Track[]) => set(s => ({ library: [...s.library, ...tracks] })),
  removeFromLibrary: (trackIds: string[]) => {
    const ids = new Set(trackIds);
    set(s => ({ library: s.library.filter(t => !ids.has(t.id)) }));
  },

  setQueue: (tracks: Track[], startIndex = 0) => {
    set({
      queue: tracks,
      queueIndex: startIndex,
      currentTrack: tracks[startIndex] ?? null,
      currentTime: 0,
      isPlaying: true,
      error: null,
    });
  },

  addToQueue: (tracks: Track[]) => set(s => ({ queue: [...s.queue, ...tracks] })),

  playNext: (track: Track) => {
    const { queue, queueIndex } = get();
    const insertAt = queueIndex + 1;
    set({ queue: [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)] });
  },

  removeFromQueue: (index: number) => {
    const { queue, queueIndex } = get();
    const newQueue = queue.filter((_, i) => i !== index);
    let newIndex = queueIndex;
    if (index < queueIndex) newIndex--;

    if (index === queueIndex) {
      const next = newQueue[newIndex] ?? newQueue[0] ?? null;
      set({
        queue: newQueue,
        queueIndex: Math.min(newIndex, newQueue.length - 1),
        currentTrack: next,
      });
      return;
    }

    set({ queue: newQueue, queueIndex: newIndex });
  },

  reorderQueue: (fromIndex: number, toIndex: number) => {
    const { queue, queueIndex } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 || fromIndex >= queue.length ||
      toIndex < 0 || toIndex >= queue.length
    ) return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);

    const currentId = queue[queueIndex]?.id;
    const newIndex = currentId != null
      ? newQueue.findIndex((t, i) => t.id === currentId && (i === queueIndex || newQueue.indexOf(t) === i))
      : queueIndex;

    set({ queue: newQueue, queueIndex: newIndex === -1 ? queueIndex : newIndex });
  },

  clearQueue: () =>
    set({
      queue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }),

  toggleFavorite: (trackId: string) => {
    const { library, queue, currentTrack } = get();
    const toggle = (t: Track) =>
      t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t;

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
    const { isShuffled, queue, currentTrack } = get();
    if (!isShuffled) {
      const others = queue.filter(t => t.id !== currentTrack?.id);
      const shuffled = currentTrack
        ? [currentTrack, ...shuffleArray(others)]
        : shuffleArray(queue);
      set({ queue: shuffled, queueIndex: 0, isShuffled: true });
    } else {
      set({ isShuffled: false });
    }
  },

  cycleRepeatMode: () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const { repeatMode } = get();
    set({ repeatMode: modes[(modes.indexOf(repeatMode) + 1) % modes.length] });
  },

  _setCurrentTime: (currentTime) => set({ currentTime }),
  _setDuration: (duration) => set({ duration }),
  _setIsPlaying: (isPlaying) => set({ isPlaying }),
  _setIsLoading: (loading) => set({ isLoading: loading }),
  _setError: (error) => set({ error }),
  _onTrackEnd: () => {
    const { repeatMode } = get();
    if (repeatMode === 'one') {
      set({ currentTime: 0 });
    } else {
      get().next();
    }
  },
}));
