import { useQuery } from '@tanstack/react-query';

export interface LyricLine {
  time: number;
  text: string;
}

export type LyricsSource = 'lrclib' | 'cache' | 'local-lrc' | 'local-txt' | 'embedded' | null;

interface LyricsResult {
  synced: LyricLine[] | null;
  plain: string | null;
  source: LyricsSource;
}

export const lyricsKeys = {
  track: (trackId: string, filePath?: string) =>
    ['lyrics', trackId, filePath ?? ''] as const,
};

export function useLyricsQuery(
  trackId: string | null,
  title: string,
  artist: string,
  album?: string,
  duration?: number,
  filePath?: string,
) {
  return useQuery({
    queryKey: lyricsKeys.track(trackId!, filePath),
    queryFn: async (): Promise<LyricsResult> => {
      if (!window.electronAPI?.lyrics) {
        return { synced: null, plain: null, source: null };
      }
      return await window.electronAPI.lyrics.fetch(title, artist, album, duration, filePath);
    },
    enabled: !!trackId,
    staleTime: Infinity, // lyrics don't change
    retry: false,
  });
}
