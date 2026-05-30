import {
  createPersistedStore,
  acceptStoreHmr,
  migrateLegacyKeys,
} from '@/lib/createPersistedStore';
import type { Track, RepeatMode } from '@/stores/types';

export const DEFAULT_CROSSFADE_DURATION = 5;

export const DEFAULT_SLEEP_FADE_DURATION = 8;
export const SLEEP_FADE_MIN_SECONDS = 2;
export const SLEEP_FADE_MAX_SECONDS = 30;

// Loudness leveling (ReplayGain / EBU R128). The target is the perceived
// loudness every track is normalised toward; -14 LUFS matches the de-facto
// streaming standard (Spotify/YouTube). The playback gain for a track is
// `target − measuredLufs`, clamped to ±LOUDNESS_MAX_GAIN_DB to avoid extreme
// boosts on very quiet sources.
export const DEFAULT_LOUDNESS_TARGET_LUFS = -14;
export const LOUDNESS_TARGET_MIN_LUFS = -23;
export const LOUDNESS_TARGET_MAX_LUFS = -9;
export const LOUDNESS_MAX_GAIN_DB = 12;

const STORE_KEY = 'shiranami.player-store';

const LEGACY_KEYS = {
  crossfadeEnabled: 'shiranami.crossfade-enabled',
  crossfadeDuration: 'shiranami.crossfade-duration',
} as const;

type PersistedPlaybackState = {
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
  sleepFadeDuration: number;
  loudnessEnabled: boolean;
  loudnessTargetLufs: number;
};

function sanitizeLoudnessTarget(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return DEFAULT_LOUDNESS_TARGET_LUFS;
  return Math.round(Math.min(LOUDNESS_TARGET_MAX_LUFS, Math.max(LOUDNESS_TARGET_MIN_LUFS, parsed)));
}

function sanitizeCrossfadeDuration(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return DEFAULT_CROSSFADE_DURATION;
  return Math.round(Math.min(12, Math.max(1, parsed)));
}

function sanitizeSleepFadeDuration(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return DEFAULT_SLEEP_FADE_DURATION;
  return Math.round(Math.min(SLEEP_FADE_MAX_SECONDS, Math.max(SLEEP_FADE_MIN_SECONDS, parsed)));
}

function sanitize(
  persisted: Partial<PersistedPlaybackState> | undefined
): Partial<PersistedPlaybackState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedPlaybackState> = {};
  if (typeof persisted.crossfadeEnabled === 'boolean')
    out.crossfadeEnabled = persisted.crossfadeEnabled;
  if (persisted.crossfadeDuration !== undefined)
    out.crossfadeDuration = sanitizeCrossfadeDuration(persisted.crossfadeDuration);
  if (persisted.sleepFadeDuration !== undefined)
    out.sleepFadeDuration = sanitizeSleepFadeDuration(persisted.sleepFadeDuration);
  if (typeof persisted.loudnessEnabled === 'boolean')
    out.loudnessEnabled = persisted.loudnessEnabled;
  if (persisted.loudnessTargetLufs !== undefined)
    out.loudnessTargetLufs = sanitizeLoudnessTarget(persisted.loudnessTargetLufs);
  return out;
}

migrateLegacyKeys<PersistedPlaybackState>(STORE_KEY, {
  crossfadeEnabled: {
    legacyKey: LEGACY_KEYS.crossfadeEnabled,
    parse: raw => raw === 'true',
  },
  crossfadeDuration: {
    legacyKey: LEGACY_KEYS.crossfadeDuration,
    parse: raw => {
      const parsed = Number(raw);
      return !Number.isNaN(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
    },
  },
});

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

  // Loudness leveling (ReplayGain / EBU R128)
  loudnessEnabled: boolean;
  loudnessTargetLufs: number;

  // Sleep timer
  sleepFadeDuration: number; // seconds — fade-out window before the sleep timer pauses

  // Engine-internal signal: true while the sleep timer is performing its
  // gentle fade-out to silence. The audio engine watches this and ramps the
  // active deck's gain down over `sleepFadeDuration` seconds before the store
  // pauses playback. Lives here (not the sleep-timer store) because the engine
  // already reads this store every RAF tick and owns the deck GainNodes.
  _sleepFading: boolean;

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
  enqueueTracks: (tracks: Track[], startIfIdleAt: 'first' | 'last') => void;
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

  // Loudness leveling
  setLoudnessEnabled: (enabled: boolean) => void;
  setLoudnessTargetLufs: (lufs: number) => void;

  // Sleep timer
  setSleepFadeDuration: (duration: number) => void;
  _setSleepFading: (fading: boolean) => void;

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

export const usePlaybackStore = createPersistedStore<PlaybackStore>(
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
    loudnessEnabled: false,
    loudnessTargetLufs: DEFAULT_LOUDNESS_TARGET_LUFS,
    sleepFadeDuration: DEFAULT_SLEEP_FADE_DURATION,
    _sleepFading: false,
    _seekTarget: null,

    // Playback controls
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

    setCrossfadeEnabled: enabled => {
      set({ crossfadeEnabled: enabled });
    },
    setCrossfadeDuration: duration => {
      const clamped = Math.round(Math.max(1, Math.min(12, duration)));
      set({ crossfadeDuration: clamped });
    },

    setLoudnessEnabled: enabled => {
      set({ loudnessEnabled: enabled });
    },
    setLoudnessTargetLufs: lufs => {
      set({ loudnessTargetLufs: sanitizeLoudnessTarget(lufs) });
    },

    setSleepFadeDuration: duration => {
      set({ sleepFadeDuration: sanitizeSleepFadeDuration(duration) });
    },
    _setSleepFading: fading => set({ _sleepFading: fading }),

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

    enqueueTracks: (tracks, startIfIdleAt) => {
      const { queue, currentTrack, setQueue } = get();
      const combined = [...queue, ...tracks];
      if (!currentTrack) {
        const startIndex = startIfIdleAt === 'last' ? combined.length - tracks.length : 0;
        setQueue(combined, startIndex);
      } else {
        set({ queue: combined });
      }
    },

    addToQueue: (tracks: Track[]) => set(s => ({ queue: [...s.queue, ...tracks] })),

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
        fromIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex < 0 ||
        toIndex >= queue.length
      )
        return;

      const newQueue = [...queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);

      // Find where the currently-playing track ended up
      const currentId = queue[queueIndex]?.id;
      const newIndex =
        currentId != null
          ? newQueue.findIndex(
              (t, i) =>
                t.id === currentId &&
                // Handle duplicate IDs: prefer the index closest to the old queueIndex
                (i === queueIndex || newQueue.indexOf(t) === i)
            )
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
      const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
      set({ repeatMode: modes[nextIndex] });
    },

    // Internal setters (called by the audio engine hook)
    _clearSeekTarget: () => set({ _seekTarget: null }),
    _setCurrentTime: currentTime => {
      currentTimeRef.current = currentTime;
      set({ currentTime });
    },
    _setDuration: duration => set({ duration }),
    _setIsPlaying: isPlaying => set({ isPlaying }),
    _setIsLoading: loading => set({ isLoading: loading }),
    _setError: error => set({ error }),
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
    name: STORE_KEY,
    version: 1,
    partialize: s => ({
      crossfadeEnabled: s.crossfadeEnabled,
      crossfadeDuration: s.crossfadeDuration,
      sleepFadeDuration: s.sleepFadeDuration,
      loudnessEnabled: s.loudnessEnabled,
      loudnessTargetLufs: s.loudnessTargetLufs,
    }),
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedPlaybackState>),
    }),
  }
);

// Preserve store state across Vite HMR (dev only, tree-shaken in production).
// Reset the transient runtime fields so a hot edit doesn't restore a stale
// loading/error/seek state.
acceptStoreHmr(usePlaybackStore, import.meta.hot, () => {
  usePlaybackStore.setState({ isLoading: false, error: null, _seekTarget: null });
});
