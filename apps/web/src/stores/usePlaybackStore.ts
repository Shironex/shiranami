import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track, RepeatMode } from '@/stores/types';

export const DEFAULT_CROSSFADE_DURATION = 5;

const NEW_KEY = 'shiranami.player-store';

const LEGACY_KEYS = {
  crossfadeEnabled: 'shiranami.crossfade-enabled',
  crossfadeDuration: 'shiranami.crossfade-duration',
} as const;

interface PersistedPlaybackState {
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
}

function sanitizeCrossfadeDuration(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return DEFAULT_CROSSFADE_DURATION;
  return Math.round(Math.min(12, Math.max(1, parsed)));
}

function sanitize(persisted: Partial<PersistedPlaybackState> | undefined): Partial<PersistedPlaybackState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedPlaybackState> = {};
  if (typeof persisted.crossfadeEnabled === 'boolean') out.crossfadeEnabled = persisted.crossfadeEnabled;
  if (persisted.crossfadeDuration !== undefined) out.crossfadeDuration = sanitizeCrossfadeDuration(persisted.crossfadeDuration);
  return out;
}

function importLegacyPlayerStore() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(NEW_KEY)) return;
  const hasAny = Object.values(LEGACY_KEYS).some((k) => ls.getItem(k) !== null);
  if (!hasAny) return;

  const state: Partial<PersistedPlaybackState> = {};

  const crossfadeEnabled = ls.getItem(LEGACY_KEYS.crossfadeEnabled);
  if (crossfadeEnabled !== null) state.crossfadeEnabled = crossfadeEnabled === 'true';

  const crossfadeDurationRaw = ls.getItem(LEGACY_KEYS.crossfadeDuration);
  if (crossfadeDurationRaw !== null) {
    const parsed = Number(crossfadeDurationRaw);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 12) {
      state.crossfadeDuration = parsed;
    }
  }

  ls.setItem(NEW_KEY, JSON.stringify({ state, version: 1 }));
  Object.values(LEGACY_KEYS).forEach((k) => ls.removeItem(k));
}

importLegacyPlayerStore();

interface PlaybackState {
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

  // Crossfade
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // seconds

  // Engine-internal signal: target time for a pending seek that
  // `useAudioEngine` applies on its next RAF tick. Lives here (not in the
  // UI store) because it's part of the playback pipeline.
  _seekTarget: number | null;
}

interface PlaybackActions {
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

  // Queue
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;

  // Modes
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;

  // Crossfade
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;

  // Internal (called by audio hook)
  _clearSeekTarget: () => void;
  _setCurrentTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setIsPlaying: (playing: boolean) => void;
  _setIsLoading: (loading: boolean) => void;
  _setError: (error: string | null) => void;
  _onTrackEnd: () => void;
}

export type PlaybackStore = PlaybackState & PlaybackActions;

/**
 * Mutable ref holding the latest currentTime at ~60fps.
 * Used by the SeekBar for smooth RAF-driven DOM updates without triggering
 * React re-renders. The Zustand store's `currentTime` is only updated at ~4Hz.
 */
export const currentTimeRef = { current: 0 };

/** Fisher-Yates shuffle (returns a new array). */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const usePlaybackStore = create<PlaybackStore>()(
  persist(
    (set, get) => ({
      // Initial state
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
      crossfadeEnabled: false,
      crossfadeDuration: DEFAULT_CROSSFADE_DURATION,
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
          set({ currentTime: 0, _seekTarget: 0 });
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
          set({ currentTime: time, _seekTarget: time });
        }
      },

      setCrossfadeEnabled: (enabled) => {
        set({ crossfadeEnabled: enabled });
      },
      setCrossfadeDuration: (duration) => {
        const clamped = Math.round(Math.max(1, Math.min(12, duration)));
        set({ crossfadeDuration: clamped });
      },

      // Volume
      setVolume: (volume: number) => {
        const clamped = Math.max(0, Math.min(1, volume));
        set({ volume: clamped, isMuted: false });
      },
      toggleMute: () => {
        const muted = !get().isMuted;
        set({ isMuted: muted });
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

        // Find where the currently-playing track ended up
        const currentId = queue[queueIndex]?.id;
        const newIndex = currentId != null
          ? newQueue.findIndex((t, i) => t.id === currentId && (
              // Handle duplicate IDs: prefer the index closest to the old queueIndex
              i === queueIndex || newQueue.indexOf(t) === i
            ))
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
      _setCurrentTime: (currentTime) => {
        currentTimeRef.current = currentTime;
        set({ currentTime });
      },
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
    }),
    {
      name: NEW_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        crossfadeEnabled: s.crossfadeEnabled,
        crossfadeDuration: s.crossfadeDuration,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitize(persisted as Partial<PersistedPlaybackState>),
      }),
    }
  )
);

// Preserve store state across Vite HMR (dev only, tree-shaken in production)
if (import.meta.hot) {
  type HmrData = { store?: typeof usePlaybackStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    usePlaybackStore.setState({
      ...data.store.getState(),
      isLoading: false,
      error: null,
      _seekTarget: null,
    });
  }
  data.store = usePlaybackStore;
  hot.accept();
}
