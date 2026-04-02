import { useCallback, useState } from 'react';
import { getStreamUrl } from '@/lib/api';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import type { SearchResult } from '@/lib/types';

export function useYouTubeStream() {
  const [streaming, setStreaming] = useState<string | null>(null);
  const setQueue = usePlayerStore(s => s.setQueue);

  const streamResult = useCallback(
    async (result: SearchResult) => {
      setStreaming(result.id);
      try {
        const url = await getStreamUrl(result.id);
        const track: Track = {
          id: `yt-${result.id}`,
          title: result.title,
          artist: result.uploader,
          album: 'YouTube',
          duration: result.duration,
          filePath: url,
          albumArt: result.thumbnail,
        };
        setQueue([track], 0);
      } finally {
        setStreaming(null);
      }
    },
    [setQueue],
  );

  return { streamResult, streaming };
}
