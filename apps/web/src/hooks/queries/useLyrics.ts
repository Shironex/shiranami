import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LyricsResult } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

export type { LyricLine, LyricsResult, LyricsSource } from '@shiranami/contracts';

export const lyricsKeys = {
  all: ['lyrics'] as const,
  track: (trackId: string, filePath?: string) => ['lyrics', trackId, filePath ?? ''] as const,
};

export function useLyricsQuery(
  trackId: string | null,
  title: string,
  artist: string,
  album?: string,
  duration?: number,
  filePath?: string
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
    // Refetch on mount/track change so newly added local lyric files are
    // picked up without a restart. Cheap: the main process re-checks disk and
    // serves network results from its session cache. Previous data is kept
    // while refetching, so there's no visible flicker.
    staleTime: 0,
    retry: false,
  });
}

/**
 * `lyrics.preferSyncedFromLrclib` lives as an electron-store key (not the
 * renderer settings blob) because the MAIN process consumes it during lyric
 * resolution. Query + optimistic mutation mirror the useSystemPrefs pattern.
 */

const PREFER_SYNCED_STORE_KEY = 'lyrics.preferSyncedFromLrclib';

/**
 * Both lyric-preference query keys, kept together here even though the
 * write-back pair's hooks live in `useLyricsSavePrefs` — they are one namespace
 * to invalidate, and splitting the keys along with the hooks would leave two
 * places to look for "what does a lyrics preference cache under?".
 */
export const lyricsPrefKeys = {
  preferSynced: ['lyrics-prefs', 'prefer-synced-from-lrclib'] as const,
  saveFetched: ['lyrics-prefs', 'save-fetched-lyrics'] as const,
};

export function usePreferSyncedFromLrclibQuery() {
  return useQuery({
    queryKey: lyricsPrefKeys.preferSynced,
    queryFn: async (): Promise<boolean> => {
      const value = await window.electronAPI.store.get<boolean>(PREFER_SYNCED_STORE_KEY);
      return value === true;
    },
    enabled: IS_ELECTRON,
    staleTime: Infinity,
  });
}

export function useUpdatePreferSyncedFromLrclibMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (value: boolean) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.store.set(PREFER_SYNCED_STORE_KEY, value);
    },
    // Optimistic flip so the switch tracks the click; on failure the previous
    // value is restored synchronously from the onMutate context, then the
    // invalidate re-syncs with the store as the source of truth.
    onMutate: async value => {
      await queryClient.cancelQueries({ queryKey: lyricsPrefKeys.preferSynced });
      const previous = queryClient.getQueryData<boolean>(lyricsPrefKeys.preferSynced);
      queryClient.setQueryData<boolean>(lyricsPrefKeys.preferSynced, value);
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context) {
        queryClient.setQueryData(lyricsPrefKeys.preferSynced, context.previous);
      }
      toast.error(i18n.t('failedSaveSettings', { ns: 'toast' }));
      queryClient.invalidateQueries({ queryKey: lyricsPrefKeys.preferSynced });
    },
    // Re-resolve the current track's lyrics under the new precedence.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lyricsKeys.all });
    },
  });
}
