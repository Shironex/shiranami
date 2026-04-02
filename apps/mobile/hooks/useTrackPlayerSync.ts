import { useEffect, useRef } from 'react';
import TrackPlayer, { usePlaybackState, useProgress, Event, State } from 'react-native-track-player';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/**
 * Syncs react-native-track-player state to the Zustand player store.
 * Mount once in the root layout.
 */
export function useTrackPlayerSync() {
  const { state: playbackState } = usePlaybackState();
  const { position, duration } = useProgress(1000);
  const store = usePlayerStore();
  const prevTrackRef = useRef<Track | null>(null);

  // Sync playback state
  useEffect(() => {
    if (playbackState === State.Playing) {
      store._setIsPlaying(true);
      store._setIsLoading(false);
    } else if (playbackState === State.Paused || playbackState === State.Stopped) {
      store._setIsPlaying(false);
      store._setIsLoading(false);
    } else if (playbackState === State.Buffering || playbackState === State.Loading) {
      store._setIsLoading(true);
    }
  }, [playbackState]);

  // Sync progress
  useEffect(() => {
    store._setCurrentTime(position);
    if (duration > 0) {
      store._setDuration(duration);
    }
  }, [position, duration]);

  // When currentTrack changes in the store, load it into the player
  useEffect(() => {
    const { currentTrack, isPlaying } = store;
    if (!currentTrack || currentTrack.id === prevTrackRef.current?.id) return;
    prevTrackRef.current = currentTrack;

    (async () => {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: currentTrack.id,
        url: currentTrack.filePath,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: currentTrack.albumArt,
        duration: currentTrack.duration,
      });
      if (isPlaying) {
        await TrackPlayer.play();
      }
    })();
  }, [store.currentTrack?.id]);

  // Sync play/pause from store to player
  useEffect(() => {
    if (store.isPlaying && playbackState !== State.Playing) {
      TrackPlayer.play();
    } else if (!store.isPlaying && playbackState === State.Playing) {
      TrackPlayer.pause();
    }
  }, [store.isPlaying]);

  // Listen for track ended
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      store._onTrackEnd();
    });
    return () => sub.remove();
  }, []);

  // Sync seek from store
  useEffect(() => {
    const { currentTime } = store;
    if (Math.abs(currentTime - position) > 2) {
      TrackPlayer.seekTo(currentTime);
    }
  }, [store.currentTime]);
}
