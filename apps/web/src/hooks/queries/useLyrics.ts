import { useQuery } from '@tanstack/react-query';

export interface LyricLine {
  time: number;
  text: string;
}

interface LyricsResult {
  synced: LyricLine[] | null;
  plain: string | null;
  source: string | null;
}

export const lyricsKeys = {
  track: (trackId: string) => ['lyrics', trackId] as const,
};

export function useLyricsQuery(
  trackId: string | null,
  title: string,
  artist: string,
  album?: string,
  duration?: number,
) {
  return useQuery({
    queryKey: lyricsKeys.track(trackId!),
    queryFn: async (): Promise<LyricsResult> => {
      if (!window.electronAPI?.lyrics) {
        return { synced: null, plain: null, source: null };
      }
      return await window.electronAPI.lyrics.fetch(title, artist, album, duration);
    },
    enabled: !!trackId,
    staleTime: Infinity, // lyrics don't change
    retry: false,
  });
}
