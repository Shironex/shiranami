import { create } from 'zustand';
import { IS_ELECTRON } from '@/lib/platform';

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
  createdAt?: string;
  updatedAt?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Library (persistent collection of all tracks)
  library: Track[];

  // Current track
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;

  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;

  // Loading
  isLoading: boolean;
  error: string | null;

  // UI state (not persisted)
  scrubTime: number | null;
  _seekTarget: number | null;
}

interface PlayerActions {
  // Playback controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;

  // Volume
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // Library
  setLibrary: (tracks: Track[]) => void;
  addToLibrary: (tracks: Track[]) => void;
  removeFromLibrary: (trackIds: string[]) => void;

  // Queue
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;

  // Favorites
  toggleFavorite: (trackId: string) => void;

  // Modes
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;

  // Scrub
  setScrubTime: (time: number | null) => void;

  // Internal (called by audio hook)
  _clearSeekTarget: () => void;
  _setCurrentTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setIsPlaying: (playing: boolean) => void;
  _setIsLoading: (loading: boolean) => void;
  _setError: (error: string | null) => void;
  _onTrackEnd: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

/** Fisher-Yates shuffle (returns a new array). */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  // Initial state
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
  scrubTime: null,
  _seekTarget: null,

  // Playback controls
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
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

    // If more than 3 seconds in, restart the current track
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
      set({ currentTime: time, scrubTime: null, _seekTarget: time });
    }
  },

  setScrubTime: (time) => set({ scrubTime: time }),

  // Volume
  setVolume: (volume: number) =>
    set({ volume: Math.max(0, Math.min(1, volume)), isMuted: false }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

  // Library management
  setLibrary: (tracks: Track[]) => set({ library: tracks }),

  addToLibrary: (tracks: Track[]) =>
    set((s) => ({ library: [...s.library, ...tracks] })),

  removeFromLibrary: (trackIds: string[]) => {
    const ids = new Set(trackIds);
    set((s) => ({ library: s.library.filter((t) => !ids.has(t.id)) }));
  },

  // Queue management
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

  addToQueue: (tracks: Track[]) => set((s) => ({ queue: [...s.queue, ...tracks] })),

  playNext: (track: Track) => {
    const { queue, queueIndex } = get();
    const insertAt = queueIndex + 1;
    const newQueue = [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)];
    set({ queue: newQueue });
  },

  removeFromQueue: (index: number) => {
    const { queue, queueIndex } = get();
    const newQueue = queue.filter((_, i) => i !== index);

    let newIndex = queueIndex;
    if (index < queueIndex) {
      newIndex--;
    }

    if (index === queueIndex) {
      // Current track was removed
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

  clearQueue: () =>
    set({
      queue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }),

  // Favorites — update track in both library and queue
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

    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.toggleFavorite(trackId).catch(() => {});
    }
  },

  // Modes
  toggleShuffle: () => {
    const { isShuffled, queue, currentTrack } = get();
    if (!isShuffled) {
      // Shuffle the queue, keeping the current track at index 0
      const others = queue.filter((t) => t.id !== currentTrack?.id);
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
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
    set({ repeatMode: modes[nextIndex] });
  },

  // Internal setters (called by the audio engine hook)
  _clearSeekTarget: () => set({ _seekTarget: null }),
  _setCurrentTime: (currentTime) => set({ currentTime }),
  _setDuration: (duration) => set({ duration }),
  _setIsPlaying: (isPlaying) => set({ isPlaying }),
  _setIsLoading: (loading) => set({ isLoading: loading }),
  _setError: (error) => set({ error }),
  _onTrackEnd: () => {
    const { repeatMode } = get();
    if (repeatMode === 'one') {
      // Keep isPlaying true; the audio hook will restart playback
      set({ currentTime: 0 });
    } else {
      get().next();
    }
  },
}));

// Preserve store state across Vite HMR (dev only, tree-shaken in production)
if (import.meta.hot) {
  if (import.meta.hot.data.store) {
    usePlayerStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = usePlayerStore;
  import.meta.hot.accept();
}
