import { useCallback, useState } from 'react';
import { getAudioLink } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import { trackErrorLine } from '@/lib/youtube-copy';
import { youtubeTrackId } from '@/lib/youtube-save';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/**
 * Plays a search result: from the phone when it is saved, otherwise streamed
 * through the server's audio route (the player cannot send headers, so the
 * link is signed by the server instead).
 */
export function useYouTubeStream() {
  const [streaming, setStreaming] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const playFromList = usePlayerStore(s => s.playFromList);

  const streamResult = useCallback(
    async (result: SearchResult) => {
      const id = youtubeTrackId(result.id);
      setFailed(null);
      const saved = usePlayerStore.getState().library.find(track => track.id === id);
      if (saved) {
        playFromList([saved], 0, 'YouTube');
        return;
      }
      setStreaming(result.id);
      try {
        const link = await getAudioLink(result.id);
        const track: Track = {
          id,
          title: result.title,
          artist: result.uploader,
          album: 'YouTube',
          duration: result.duration,
          filePath: link.url,
          albumArt: result.thumbnail || undefined,
        };
        playFromList([track], 0, 'YouTube');
      } catch (error) {
        setFailed({ id: result.id, message: trackErrorLine(error) });
      } finally {
        setStreaming(null);
      }
    },
    [playFromList]
  );

  return { streamResult, streaming, failed };
}
