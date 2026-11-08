import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { attachTransport, usePlayerStore, type Track } from '@/stores/usePlayerStore';

/** How often the player reports position, in milliseconds. */
const STATUS_INTERVAL_MS = 500;

let player: AudioPlayer | null = null;
let teardown: (() => void) | null = null;

/** Mirrors one status report from the player into the store. */
export function applyStatus(status: AudioStatus): void {
  const store = usePlayerStore.getState();
  store._syncPlayback({
    isPlaying: status.playing,
    isBuffering: status.isBuffering || (!status.isLoaded && status.playing),
    currentTime: status.currentTime,
    duration: status.isLive ? 0 : status.duration,
  });
  if (status.error) store._setError(status.error);
  if (status.didJustFinish) store._onTrackEnd();
}

function trackSource(track: Track) {
  return { uri: track.filePath, name: track.title };
}

/**
 * Creates the app's single audio player and connects it to the player store:
 * store actions drive the player, player status flows back into the store.
 * Call once at app start; the returned function tears it down again.
 */
export function startPlaybackService(): () => void {
  if (player) return stopPlaybackService;

  // `doNotMix` takes audio focus, so other apps pause and a phone call pauses
  // us; it is also what lock screen controls require.
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(error => usePlayerStore.getState()._setError(String(error)));

  const audio = createAudioPlayer(null, { updateInterval: STATUS_INTERVAL_MS });
  player = audio;
  const subscription = audio.addListener('playbackStatusUpdate', applyStatus);

  const detach = attachTransport({
    load: track => audio.replace(trackSource(track)),
    play: () => audio.play(),
    pause: () => audio.pause(),
    seekTo: seconds => {
      audio.seekTo(seconds).catch(() => undefined);
    },
    stop: () => {
      audio.pause();
      audio.replace(null);
    },
  });

  teardown = () => {
    detach();
    subscription.remove();
    audio.remove();
  };
  return stopPlaybackService;
}

export function stopPlaybackService(): void {
  teardown?.();
  teardown = null;
  player = null;
}
