import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import type { Track } from '@/stores/usePlayerStore';
import { useQueueToastStore } from '@/stores/useQueueToastStore';

/** What a swipe on a song row does: right plays it next, left picks a playlist. */
export function useSwipeQueue() {
  const router = useRouter();
  const playNext = useQueueToastStore(s => s.playNext);
  return useMemo(
    () => ({
      playNext,
      addToPlaylist: (track: Track) =>
        router.push({ pathname: '/add-to-playlist', params: { trackId: track.id } }),
    }),
    [playNext, router]
  );
}
